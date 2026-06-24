import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const token = () => localStorage.getItem('sc_token')
const authFetch = (url, opts = {}) =>
  fetch(`${API}${url}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...opts.headers } })

let _uid = 0
const uid = () => `u${++_uid}_${Date.now()}`

// ── Shared option lists — mirror backend title_box.py / captions.py ────
const TITLE_TEXT_COLORS = [
  { val: 'white', hex: '#FFFFFF' }, { val: 'black', hex: '#000000' },
  { val: 'yellow', hex: '#FFE600' }, { val: 'gold', hex: '#FFD700' },
  { val: 'red', hex: '#FF3B30' }, { val: 'ice_blue', hex: '#C8E5FF' }, { val: 'hot_pink', hex: '#FF1493' },
]
const TITLE_BG_COLORS = [
  { val: 'none', hex: null }, { val: 'dark_gray', hex: '#1A1A1A' }, { val: 'light_gray', hex: '#E5E5E5' },
  { val: 'black', hex: '#000000' }, { val: 'white', hex: '#FFFFFF' }, { val: 'brand_red', hex: '#CF1322' },
]
const FONT_OPTIONS = [
  { val: 'default', label: 'Default' }, { val: 'montserrat', label: 'Montserrat' },
  { val: 'archivo_black', label: 'Archivo Black' }, { val: 'anton', label: 'Anton' },
  { val: 'bebas_neue', label: 'Bebas Neue' }, { val: 'poppins', label: 'Poppins' }, { val: 'jakarta', label: 'Plus Jakarta' },
]
const TRANSITIONS = ['cut', 'fade', 'slideleft', 'slideright', 'wiperight', 'circleopen']
const SWATCH_COLORS = ['#FFFFFF', '#000000', '#FF0000', '#FFE600', '#00C853', '#2196F3', '#FF1493', '#FFD700']

// ── Styles ───────────────────────────────────────────────────────
const card = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '18px' }
const sectionTitle = { fontWeight: 800, fontSize: '0.92rem', color: '#111', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }
const btnRed = { background: '#cf1322', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }
const btnOutline = { background: '#fff', color: '#cf1322', border: '1.5px solid #cf1322', borderRadius: '8px', padding: '7px 12px', fontWeight: 600, fontSize: '0.76rem', cursor: 'pointer' }
const smallBtn = { background: '#f4f4f4', border: '1px solid #e5e5e5', borderRadius: '6px', padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer' }
const labelStyle = { fontSize: '0.7rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }
const input = { width: '100%', border: '1.5px solid #e5e5e5', borderRadius: '7px', padding: '7px 10px', fontSize: '0.82rem', outline: 'none' }

function Toast({ msg, type }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 999,
      background: type === 'error' ? '#fef2f2' : '#f0fdf4',
      border: `1.5px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`,
      color: type === 'error' ? '#cf1322' : '#16a34a',
      borderRadius: 10, padding: '10px 16px', fontSize: '0.82rem', fontWeight: 600,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>{msg}</div>
  )
}

function ColorDot({ hex, active, onClick, fallbackPattern }) {
  return (
    <button onClick={onClick} style={{
      width: 26, height: 26, borderRadius: '50%',
      background: hex || (fallbackPattern ?? 'repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0 3px,#fff 3px,#fff 6px)'),
      border: active ? '3px solid #cf1322' : '2px solid #ddd', cursor: 'pointer', flexShrink: 0,
    }}/>
  )
}

export default function AdminMarketingEditor() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [toast, setToast] = useState({ msg: '', type: 'success' })
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast({ msg: '', type: 'success' }), 3500) }

  // ── Asset library ──────────────────────────────────────────────
  const [assets, setAssets] = useState([])
  const [uploading, setUploading] = useState(false)

  const fetchAssets = useCallback(async () => {
    const r = await authFetch('/admin/marketing/assets')
    if (r.ok) { const d = await r.json(); setAssets(d.assets || []) }
  }, [])
  useEffect(() => { fetchAssets() }, [fetchAssets])

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const r = await fetch(`${API}/admin/marketing/assets`, {
          method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd,
        })
        if (!r.ok) throw new Error()
      } catch { showToast(`Failed to upload ${file.name}`, 'error') }
    }
    await fetchAssets()
    setUploading(false)
    e.target.value = ''
  }

  const handleDeleteAsset = async (assetId) => {
    const r = await authFetch(`/admin/marketing/assets/${assetId}`, { method: 'DELETE' })
    if (r.ok) { showToast('Asset deleted'); fetchAssets() }
  }

  // ── Timeline: segments (images/videos) ─────────────────────────
  const [segments, setSegments] = useState([])

  const addSegmentFromAsset = (asset) => {
    setSegments(prev => [...prev, {
      id: uid(), type: asset.kind, assetId: asset.asset_id, url: asset.url,
      duration: asset.kind === 'image' ? 4 : 5,
      transition: 'fade', transitionDuration: 0.5,
    }])
  }
  const removeSegment = (id) => setSegments(prev => prev.filter(s => s.id !== id))
  const moveSegment = (id, dir) => setSegments(prev => {
    const idx = prev.findIndex(s => s.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= prev.length) return prev
    const next = [...prev]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    return next
  })
  const updateSegment = (id, patch) => setSegments(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))

  // ── Audio tracks ────────────────────────────────────────────────
  const [audioTracks, setAudioTracks] = useState([])
  const addAudioFromAsset = (asset) => setAudioTracks(prev => [...prev, { id: uid(), assetId: asset.asset_id, url: asset.url, mode: 'sequence', name: asset.filename || asset.asset_id }])
  const removeAudio = (id) => setAudioTracks(prev => prev.filter(t => t.id !== id))
  const moveAudio = (id, dir) => setAudioTracks(prev => {
    const idx = prev.findIndex(t => t.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= prev.length) return prev
    const next = [...prev]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    return next
  })
  const updateAudio = (id, patch) => setAudioTracks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  // ── Subtitles (manual, multi-colour word groups) ────────────────
  const [subtitles, setSubtitles] = useState([])
  const addSubtitleLine = () => setSubtitles(prev => [...prev, {
    id: uid(), start: 0, end: 2, groups: [{ id: uid(), text: '', color: '#FFFFFF' }],
  }])
  const removeSubtitleLine = (id) => setSubtitles(prev => prev.filter(s => s.id !== id))
  const updateSubtitleLine = (id, patch) => setSubtitles(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  const addGroup = (lineId) => setSubtitles(prev => prev.map(s => s.id === lineId
    ? { ...s, groups: [...s.groups, { id: uid(), text: '', color: '#FFFFFF' }] } : s))
  const removeGroup = (lineId, groupId) => setSubtitles(prev => prev.map(s => s.id === lineId
    ? { ...s, groups: s.groups.filter(g => g.id !== groupId) } : s))
  const updateGroup = (lineId, groupId, patch) => setSubtitles(prev => prev.map(s => s.id === lineId
    ? { ...s, groups: s.groups.map(g => g.id === groupId ? { ...g, ...patch } : g) } : s))

  // ── Auto-transcribe helper ───────────────────────────────────────
  const [transcribing, setTranscribing] = useState(false)
  const handleTranscribe = async (audioUrl) => {
    setTranscribing(true)
    try {
      const r = await authFetch('/admin/marketing/transcribe', { method: 'POST', body: JSON.stringify({ audio_url: audioUrl }) })
      const d = await r.json()
      if (r.ok) {
        setSubtitles(prev => [...prev, ...d.subtitles.map(s => ({
          id: uid(), start: s.start, end: s.end,
          groups: s.groups.map(g => ({ id: uid(), ...g })),
        }))])
        showToast(`Transcribed ${d.subtitles.length} lines — edit colours/timing as needed`)
      } else { showToast(d.detail || 'Transcription failed', 'error') }
    } catch { showToast('Transcription failed', 'error') }
    setTranscribing(false)
  }

  // ── Hook title / font / logo / end card ──────────────────────────
  const [titleEnabled, setTitleEnabled] = useState(false)
  const [titleText, setTitleText] = useState('')
  const [titlePermanent, setTitlePermanent] = useState(false)
  const [titleColor, setTitleColor] = useState('white')
  const [titleBg, setTitleBg] = useState('none')
  const [titleBgOpacity, setTitleBgOpacity] = useState(0.55)
  const [font, setFont] = useState('default')
  const [hAlign, setHAlign] = useState('center')
  const [vAlign, setVAlign] = useState('bottom')

  const [logoAsset, setLogoAsset] = useState(null)
  const [logoPosition, setLogoPosition] = useState('bottom_right')

  const [endCardEnabled, setEndCardEnabled] = useState(false)
  const [endCardHeadline, setEndCardHeadline] = useState('Try ShortClipr Free')
  const [endCardSubText, setEndCardSubText] = useState('shortclipr.com')
  const [endCardDuration, setEndCardDuration] = useState(3)

  // ── Aspect ratios + A/B variants ─────────────────────────────────
  const [aspects, setAspects] = useState(['9:16'])
  const toggleAspect = (a) => setAspects(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])

  const [variants, setVariants] = useState([{ id: uid(), label: 'Base', titleColor: null, font: null }])
  const addVariant = () => setVariants(prev => [...prev, { id: uid(), label: `Variant ${prev.length + 1}`, titleColor: null, font: null }])
  const removeVariant = (id) => setVariants(prev => prev.filter(v => v.id !== id))
  const updateVariant = (id, patch) => setVariants(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v))

  // ── Render submit + poll ──────────────────────────────────────────
  const [rendering, setRendering] = useState(false)
  const [jobProgress, setJobProgress] = useState(0)
  const [jobStep, setJobStep] = useState('')
  const [outputs, setOutputs] = useState([])

  const handleRender = async () => {
    if (!segments.length) { showToast('Add at least one image or video segment', 'error'); return }
    setRendering(true)
    setOutputs([])
    setJobProgress(0)

    const body = {
      segments: segments.map(s => ({ type: s.type, url: s.url, duration: s.duration, transition: s.transition, transition_duration: s.transitionDuration })),
      audio_tracks: audioTracks.map(t => ({ url: t.url, mode: t.mode })),
      subtitles: subtitles.map(s => ({ start: s.start, end: s.end, groups: s.groups.map(g => ({ text: g.text, color: g.color })) })),
      hook_title: titleEnabled ? titleText : null,
      title_permanent: titlePermanent,
      title_color: titleColor,
      title_bg: titleBg,
      title_bg_opacity: titleBgOpacity,
      font, h_align: hAlign, v_align: vAlign,
      logo_url: logoAsset?.url || null,
      logo_position: logoPosition,
      end_card: endCardEnabled ? { headline: endCardHeadline, sub_text: endCardSubText, duration: endCardDuration } : null,
      aspects,
      variants: variants.map(v => {
        const overrides = {}
        if (v.titleColor) overrides.title_color = v.titleColor
        if (v.font) overrides.font = v.font
        return overrides
      }),
    }

    try {
      const r = await authFetch('/admin/marketing/render', { method: 'POST', body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { showToast(d.detail || 'Render failed to start', 'error'); setRendering(false); return }
      pollJob(d.job_id)
    } catch { showToast('Render failed to start', 'error'); setRendering(false) }
  }

  const pollJob = (jobId) => {
    const iv = setInterval(async () => {
      try {
        const r = await authFetch(`/admin/marketing/jobs/${jobId}`)
        const d = await r.json()
        setJobProgress(d.progress || 0)
        setJobStep(d.current_step || '')
        if (d.status === 'completed') {
          clearInterval(iv)
          setOutputs(d.outputs || [])
          setRendering(false)
          showToast('Marketing video rendered!')
        } else if (d.status === 'failed') {
          clearInterval(iv)
          setRendering(false)
          showToast(d.error || 'Render failed', 'error')
        }
      } catch { clearInterval(iv); setRendering(false) }
    }, 2500)
  }

  // ── Asset library picker (shared by segments + audio) ────────────
  const AssetPicker = ({ kinds, onPick }) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 160, overflowY: 'auto', padding: 4 }}>
      {assets.filter(a => kinds.includes(a.kind)).map(a => (
        <div key={a.asset_id} style={{ position: 'relative' }}>
          <button onClick={() => onPick(a)} title={a.asset_id} style={{
            width: 64, height: 64, borderRadius: 8, border: '1.5px solid #e5e5e5',
            background: a.kind === 'image' ? `url(${a.url}) center/cover` : '#111',
            color: '#fff', fontSize: '1.3rem', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>{a.kind === 'video' ? '🎬' : a.kind === 'audio' ? '🎵' : ''}</button>
          <button onClick={() => handleDeleteAsset(a.asset_id)} title="Delete asset" style={{
            position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
            background: '#cf1322', color: '#fff', border: 'none', fontSize: '0.6rem', cursor: 'pointer',
          }}>✕</button>
        </div>
      ))}
      {!assets.filter(a => kinds.includes(a.kind)).length && (
        <span style={{ fontSize: '0.74rem', color: '#bbb', padding: 8 }}>No assets yet — upload below.</span>
      )}
    </div>
  )

  return (
    <div style={{ background: '#f9f9f9', minHeight: '100vh' }}>
      <Toast {...toast} />

      <div style={{ background: '#fff', borderBottom: '1px solid #e5e5e5', padding: '0 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo size={28} />
          <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>ShortClipr</span>
          <span style={{ background: '#fef2f2', color: '#cf1322', border: '1px solid #fecaca', borderRadius: 100, padding: '3px 10px', fontSize: '0.68rem', fontWeight: 700 }}>🎞️ Marketing Editor</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: '0.8rem', color: '#999', alignSelf: 'center' }}>{user?.email}</span>
          <button onClick={() => navigate('/admin')} style={btnOutline}>← Admin</button>
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 5% 100px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* ── Asset Library ── */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={sectionTitle}>📁 Asset Library
            <label style={{ ...btnOutline, marginLeft: 'auto', cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : '+ Upload images / video / audio'}
              <input type="file" multiple accept="image/*,video/*,audio/*" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          </div>
          <AssetPicker kinds={['image', 'video', 'audio']} onPick={() => {}} />
        </div>

        {/* ── Timeline: Segments ── */}
        <div style={card}>
          <div style={sectionTitle}>🎞️ Timeline (images + video)</div>
          <p style={{ fontSize: '0.74rem', color: '#999', marginBottom: 10 }}>Click an asset below to append it to the timeline, then set duration/transition.</p>
          <AssetPicker kinds={['image', 'video']} onPick={addSegmentFromAsset} />
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {segments.map((seg, i) => (
              <div key={seg.id} style={{ border: '1.5px solid #e5e5e5', borderRadius: 9, padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 6, flexShrink: 0, background: seg.type === 'image' ? `url(${seg.url}) center/cover` : '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {seg.type === 'video' ? '🎬' : ''}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#666' }}>#{i + 1} {seg.type}</span>
                    {seg.type === 'image' && (
                      <>
                        <span style={{ fontSize: '0.7rem', color: '#999' }}>Duration</span>
                        <input type="number" min={0.5} step={0.5} value={seg.duration}
                          onChange={e => updateSegment(seg.id, { duration: Number(e.target.value) })}
                          style={{ ...input, width: 60, padding: '4px 6px' }} />
                        <span style={{ fontSize: '0.7rem', color: '#999' }}>s</span>
                      </>
                    )}
                  </div>
                  {i > 0 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#999' }}>Transition in</span>
                      <select value={seg.transition} onChange={e => updateSegment(seg.id, { transition: e.target.value })} style={{ ...input, width: 'auto', padding: '4px 6px', fontSize: '0.72rem' }}>
                        {TRANSITIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {seg.transition !== 'cut' && (
                        <input type="number" min={0.1} max={2} step={0.1} value={seg.transitionDuration}
                          onChange={e => updateSegment(seg.id, { transitionDuration: Number(e.target.value) })}
                          style={{ ...input, width: 50, padding: '4px 6px' }} title="Transition duration (s)" />
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <button onClick={() => moveSegment(seg.id, -1)} disabled={i === 0} style={smallBtn}>↑</button>
                  <button onClick={() => moveSegment(seg.id, 1)} disabled={i === segments.length - 1} style={smallBtn}>↓</button>
                </div>
                <button onClick={() => removeSegment(seg.id)} style={{ ...smallBtn, color: '#cf1322' }}>✕</button>
              </div>
            ))}
            {!segments.length && <p style={{ fontSize: '0.78rem', color: '#bbb', textAlign: 'center', padding: 14 }}>No segments yet.</p>}
          </div>
        </div>

        {/* ── Audio ── */}
        <div style={card}>
          <div style={sectionTitle}>🔊 Audio</div>
          <p style={{ fontSize: '0.74rem', color: '#999', marginBottom: 10 }}>Sequenced tracks play back-to-back (e.g. voiceover takes). One "background" track loops underneath with auto-ducking.</p>
          <AssetPicker kinds={['audio']} onPick={addAudioFromAsset} />
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {audioTracks.map((t, i) => (
              <div key={t.id} style={{ border: '1.5px solid #e5e5e5', borderRadius: 9, padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: '1.1rem' }}>🎵</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
                  <select value={t.mode} onChange={e => updateAudio(t.id, { mode: e.target.value })} style={{ ...input, width: 'auto', fontSize: '0.72rem', padding: '4px 8px' }}>
                    <option value="sequence">Sequence (plays in order)</option>
                    <option value="background">Background bed (loops + ducks)</option>
                  </select>
                  {' '}
                  <button onClick={() => handleTranscribe(t.url)} disabled={transcribing} style={{ ...smallBtn, marginLeft: 6 }}>
                    {transcribing ? 'Transcribing…' : '✨ Auto-transcribe → subtitles'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <button onClick={() => moveAudio(t.id, -1)} disabled={i === 0} style={smallBtn}>↑</button>
                  <button onClick={() => moveAudio(t.id, 1)} disabled={i === audioTracks.length - 1} style={smallBtn}>↓</button>
                </div>
                <button onClick={() => removeAudio(t.id)} style={{ ...smallBtn, color: '#cf1322' }}>✕</button>
              </div>
            ))}
            {!audioTracks.length && <p style={{ fontSize: '0.78rem', color: '#bbb', textAlign: 'center', padding: 14 }}>No audio tracks yet.</p>}
          </div>
        </div>

        {/* ── Subtitles — multi-colour word groups ── */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={sectionTitle}>💬 Subtitles — multi-colour word groups
            <button onClick={addSubtitleLine} style={{ ...btnOutline, marginLeft: 'auto' }}>+ Add line</button>
          </div>
          <p style={{ fontSize: '0.74rem', color: '#999', marginBottom: 10 }}>
            Each line can mix colours per word-group — e.g. "BUY" in red, "NOW" in white, shown together. Use the auto-transcribe button above to pre-fill from a voice track.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subtitles.map(line => (
              <div key={line.id} style={{ border: '1.5px solid #e5e5e5', borderRadius: 9, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.7rem', color: '#999' }}>Start</span>
                  <input type="number" min={0} step={0.1} value={line.start} onChange={e => updateSubtitleLine(line.id, { start: Number(e.target.value) })} style={{ ...input, width: 60, padding: '4px 6px' }} />
                  <span style={{ fontSize: '0.7rem', color: '#999' }}>End</span>
                  <input type="number" min={0} step={0.1} value={line.end} onChange={e => updateSubtitleLine(line.id, { end: Number(e.target.value) })} style={{ ...input, width: 60, padding: '4px 6px' }} />
                  <button onClick={() => addGroup(line.id)} style={{ ...smallBtn, marginLeft: 'auto' }}>+ Colour group</button>
                  <button onClick={() => removeSubtitleLine(line.id)} style={{ ...smallBtn, color: '#cf1322' }}>✕ line</button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {line.groups.map(g => (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9f9f9', borderRadius: 8, padding: '4px 6px' }}>
                      <input value={g.text} onChange={e => updateGroup(line.id, g.id, { text: e.target.value })} placeholder="words…" style={{ ...input, width: 110, padding: '4px 6px' }} />
                      {SWATCH_COLORS.map(hex => (
                        <ColorDot key={hex} hex={hex} active={g.color === hex} onClick={() => updateGroup(line.id, g.id, { color: hex })} />
                      ))}
                      {line.groups.length > 1 && <button onClick={() => removeGroup(line.id, g.id)} style={{ ...smallBtn, padding: '2px 6px' }}>✕</button>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!subtitles.length && <p style={{ fontSize: '0.78rem', color: '#bbb', textAlign: 'center', padding: 14 }}>No subtitle lines yet.</p>}
          </div>
        </div>

        {/* ── Hook Title ── */}
        <div style={card}>
          <div style={sectionTitle}>🏷️ Hook Title (showcase)
            <button onClick={() => setTitleEnabled(p => !p)} style={{
              marginLeft: 'auto', background: titleEnabled ? '#cf1322' : '#e5e5e5', border: 'none',
              borderRadius: 100, width: 40, height: 22, cursor: 'pointer', position: 'relative',
            }}>
              <span style={{ position: 'absolute', top: 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', left: titleEnabled ? '21px' : '3px', transition: 'left .15s' }} />
            </button>
          </div>
          {titleEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={titleText} onChange={e => setTitleText(e.target.value)} placeholder="e.g. THE FASTEST WAY TO REPURPOSE VIDEO" style={input} />
              <div>
                <span style={labelStyle}>Text colour</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {TITLE_TEXT_COLORS.map(c => <ColorDot key={c.val} hex={c.hex} active={titleColor === c.val} onClick={() => setTitleColor(c.val)} />)}
                </div>
              </div>
              <div>
                <span style={labelStyle}>Background</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {TITLE_BG_COLORS.map(c => <ColorDot key={c.val} hex={c.hex} active={titleBg === c.val} onClick={() => setTitleBg(c.val)} />)}
                </div>
              </div>
              {titleBg !== 'none' && (
                <div>
                  <span style={labelStyle}>Opacity: {Math.round(titleBgOpacity * 100)}%</span>
                  <input type="range" min={0} max={100} value={Math.round(titleBgOpacity * 100)} onChange={e => setTitleBgOpacity(Number(e.target.value) / 100)} style={{ width: '100%', accentColor: '#cf1322' }} />
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                <input type="checkbox" checked={titlePermanent} onChange={e => setTitlePermanent(e.target.checked)} /> Show for entire video
              </label>
            </div>
          )}
        </div>

        {/* ── Style: font / position / logo / end card ── */}
        <div style={card}>
          <div style={sectionTitle}>🎨 Style & Branding</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <span style={labelStyle}>Font</span>
              <select value={font} onChange={e => setFont(e.target.value)} style={input}>
                {FONT_OPTIONS.map(f => <option key={f.val} value={f.val}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={labelStyle}>Caption H</span>
                <select value={hAlign} onChange={e => setHAlign(e.target.value)} style={input}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <span style={labelStyle}>Caption V</span>
                <select value={vAlign} onChange={e => setVAlign(e.target.value)} style={input}>
                  <option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option>
                </select>
              </div>
            </div>
            <div>
              <span style={labelStyle}>Logo / Watermark</span>
              <AssetPicker kinds={['image']} onPick={setLogoAsset} />
              {logoAsset && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: '0.74rem', color: '#16a34a' }}>✓ {logoAsset.asset_id} selected</span>
                  <select value={logoPosition} onChange={e => setLogoPosition(e.target.value)} style={{ ...input, width: 'auto', fontSize: '0.74rem' }}>
                    <option value="bottom_right">Bottom right</option><option value="bottom_left">Bottom left</option>
                    <option value="top_right">Top right</option><option value="top_left">Top left</option>
                  </select>
                  <button onClick={() => setLogoAsset(null)} style={smallBtn}>Clear</button>
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, marginBottom: 8 }}>
                <input type="checkbox" checked={endCardEnabled} onChange={e => setEndCardEnabled(e.target.checked)} /> Append CTA end card
              </label>
              {endCardEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={endCardHeadline} onChange={e => setEndCardHeadline(e.target.value)} placeholder="Headline" style={input} />
                  <input value={endCardSubText} onChange={e => setEndCardSubText(e.target.value)} placeholder="Sub text / URL" style={input} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: '#999' }}>Duration (s)</span>
                    <input type="number" min={1} step={0.5} value={endCardDuration} onChange={e => setEndCardDuration(Number(e.target.value))} style={{ ...input, width: 60 }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Output: aspect ratios + A/B variants ── */}
        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={sectionTitle}>📤 Output</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={labelStyle}>Aspect ratios (renders one file per ratio)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {['9:16', '1:1', '16:9'].map(a => (
                  <button key={a} onClick={() => toggleAspect(a)} style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                    background: aspects.includes(a) ? '#cf1322' : '#f9f9f9',
                    color: aspects.includes(a) ? '#fff' : '#666',
                    border: aspects.includes(a) ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                  }}>{a}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <span style={labelStyle}>A/B variants (each renders the full timeline with these overrides)</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {variants.map((v, i) => (
                  <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, width: 70 }}>{v.label}</span>
                    <select value={v.titleColor || ''} onChange={e => updateVariant(v.id, { titleColor: e.target.value || null })} style={{ ...input, width: 'auto', fontSize: '0.72rem' }}>
                      <option value="">Title colour: base</option>
                      {TITLE_TEXT_COLORS.map(c => <option key={c.val} value={c.val}>{c.val}</option>)}
                    </select>
                    <select value={v.font || ''} onChange={e => updateVariant(v.id, { font: e.target.value || null })} style={{ ...input, width: 'auto', fontSize: '0.72rem' }}>
                      <option value="">Font: base</option>
                      {FONT_OPTIONS.map(f => <option key={f.val} value={f.val}>{f.label}</option>)}
                    </select>
                    {i > 0 && <button onClick={() => removeVariant(v.id)} style={{ ...smallBtn, color: '#cf1322' }}>✕</button>}
                  </div>
                ))}
                <button onClick={addVariant} style={{ ...btnOutline, width: 'fit-content' }}>+ Add variant</button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Sticky render bar ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,.98)', borderTop: '1.5px solid #e5e5e5', padding: '14px 5%', backdropFilter: 'blur(10px)', zIndex: 200 }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={handleRender} disabled={rendering} style={{ ...btnRed, opacity: rendering ? 0.6 : 1, cursor: rendering ? 'wait' : 'pointer' }}>
            {rendering ? `Rendering… ${jobProgress}%` : '🎬 Render Marketing Video'}
          </button>
          {rendering && <span style={{ fontSize: '0.78rem', color: '#666' }}>{jobStep}</span>}
          <div style={{ flex: 1, display: 'flex', gap: 10, overflowX: 'auto' }}>
            {outputs.map((o, i) => (
              <a key={i} href={o.url} target="_blank" rel="noreferrer" style={{ ...btnOutline, whiteSpace: 'nowrap' }}>
                ⬇ Variant {o.variant} · {o.aspect}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
