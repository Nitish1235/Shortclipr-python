// BrainrotAdminPanel.jsx — admin controls for the Brainrot library.
// Rendered as a tab inside the main Admin panel (pages/Admin.jsx). Clean admin
// aesthetic (not the studio's doodle theme).
//
// Three sections, each backed by real /brainrot/admin/* endpoints:
//   1. Voices  — generate a preview sample for every catalog voice (unblocks
//                the studio's voice previews) + live progress.
//   2. Music / SFX — upload tracks into the shared audio library.
//   3. Gameplay — upload a raw recording; backend trims/splits/reframes it into
//                selectable ≤120s clips.

import { useState, useEffect, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const tk = () => localStorage.getItem('sc_token')

async function getJSON(path) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tk()}` } })
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.json()
}
async function send(path, { method = 'POST', form, json } = {}) {
  const headers = { Authorization: `Bearer ${tk()}` }
  let body
  if (form) body = form
  else if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
  const r = await fetch(`${API}${path}`, { method, headers, body })
  if (!r.ok) {
    let d = `Failed (${r.status})`; try { d = (await r.json()).detail || d } catch { /* */ }
    throw new Error(d)
  }
  return r.json().catch(() => ({}))
}

const C = { red: '#cf1322', ink: '#111', line: '#e5e7eb', mute: '#6b7280', green: '#16a34a', amber: '#ca8a04' }
const cardS = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }
const btnRed = { background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }
const btnGhost = { background: '#fff', color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: '.8rem', cursor: 'pointer' }
const inputS = { border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 11px', fontSize: '.82rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const labelS = { fontSize: '.68rem', fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4, display: 'block' }

export default function BrainrotAdminPanel({ showToast }) {
  const notify = showToast || (() => {})
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: C.ink, margin: 0 }}>Brainrot Library</h2>
        <p style={{ fontSize: '.78rem', color: C.mute, marginTop: 2 }}>
          Voice previews, music/SFX, and gameplay backgrounds that power the Brainrot Studio.
        </p>
      </div>
      <VoicesSection notify={notify} />
      <AudioSection notify={notify} />
      <GameplaySection notify={notify} />
      <ClipsSection notify={notify} />
    </div>
  )
}

// ── Voices ────────────────────────────────────────────────────────
function VoicesSection({ notify }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  const load = useCallback(async () => {
    try { setStatus(await getJSON('/brainrot/admin/voices/status')) } catch { /* */ }
  }, [])

  useEffect(() => { load(); return () => clearInterval(timer.current) }, [load])

  // poll while a generation run is active
  useEffect(() => {
    const running = status?.generating?.running
    if (running && !timer.current) timer.current = setInterval(load, 2000)
    if (!running && timer.current) { clearInterval(timer.current); timer.current = null; load() }
  }, [status, load])

  const generate = async () => {
    setBusy(true)
    try {
      await send('/brainrot/admin/voices/generate')
      notify('Voice sample generation started', 'success')
      setTimeout(load, 800)
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }

  const gen = status?.generating
  const pct = gen?.total ? Math.round(((gen.done + gen.failed) / gen.total) * 100) : 0
  const have = status ? `${status.with_samples}/${status.total_voices}` : '…'

  return (
    <div style={cardS}>
      <SectionHead icon="🔊" title="Voice previews" sub="One tap generates a sample clip for every voice so users can hear them in the picker." />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.82rem', fontWeight: 700 }}>
          {have} voices have samples
        </span>
        <button style={{ ...btnRed, opacity: busy || gen?.running ? .6 : 1 }} disabled={busy || gen?.running} onClick={generate}>
          {gen?.running ? 'Generating…' : '⚡ Generate all voice samples'}
        </button>
        <button style={btnGhost} onClick={load}>🔄 Refresh</button>
      </div>
      {gen?.running && (
        <div style={{ marginTop: 14 }}>
          <Bar pct={pct} />
          <div style={{ fontSize: '.72rem', color: C.mute, marginTop: 5 }}>
            {gen.done + gen.failed}/{gen.total} done{gen.failed ? ` · ${gen.failed} failed` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Audio (music / SFX) ───────────────────────────────────────────
function AudioSection({ notify }) {
  const [assets, setAssets] = useState([])
  const [type, setType] = useState('music')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try { setAssets((await getJSON('/brainrot/audio-assets')).assets || []) } catch { /* */ }
  }, [])
  useEffect(() => { load() }, [load])

  const upload = async (e) => {
    e.preventDefault()
    if (!file) return notify('Choose an audio file', 'error')
    if (!name.trim()) return notify('Give it a name', 'error')
    setBusy(true)
    const form = new FormData()
    form.append('file', file); form.append('asset_type', type)
    form.append('name', name.trim()); if (category.trim()) form.append('category', category.trim())
    try {
      await send('/brainrot/admin/audio-assets', { form })
      notify(`Uploaded ${type}: ${name}`, 'success')
      setName(''); setCategory(''); setFile(null); if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }

  const del = async (id) => {
    try { await send(`/brainrot/admin/audio-assets/${id}`, { method: 'DELETE' }); load() }
    catch (e) { notify(e.message, 'error') }
  }

  return (
    <div style={cardS}>
      <SectionHead icon="🎵" title="Music & SFX" sub="Background music (ducked under dialogue) and one-shot sound effects." />
      <form onSubmit={upload} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 10, marginTop: 12, alignItems: 'end' }}>
        <div>
          <label style={labelS}>Type</label>
          <select value={type} onChange={e => setType(e.target.value)} style={inputS}>
            <option value="music">Music</option>
            <option value="sfx">SFX</option>
          </select>
        </div>
        <div>
          <label style={labelS}>Name</label>
          <input style={inputS} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lofi Chill / Vine Boom" />
        </div>
        <div>
          <label style={labelS}>Category (optional)</label>
          <input style={inputS} value={category} onChange={e => setCategory(e.target.value)} placeholder={type === 'sfx' ? 'vine_boom, death…' : 'chill, hype…'} />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: '.8rem' }} />
          <button type="submit" style={{ ...btnRed, opacity: busy ? .6 : 1 }} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>

      {assets.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {assets.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 8 }}>
              <span style={{ fontSize: '.64rem', fontWeight: 800, color: a.asset_type === 'music' ? C.red : C.amber, textTransform: 'uppercase', width: 42 }}>{a.asset_type}</span>
              <span style={{ flex: 1, fontSize: '.82rem', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.name}{a.category ? ` · ${a.category}` : ''}{a.duration_seconds ? ` · ${a.duration_seconds.toFixed(1)}s` : ''}
              </span>
              {a.gcs_path && <audio src={a.gcs_path} controls style={{ height: 30 }} />}
              <button style={{ ...btnGhost, color: C.red, padding: '5px 10px' }} onClick={() => del(a.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Gameplay ──────────────────────────────────────────────────────
function GameplaySection({ notify }) {
  const [sources, setSources] = useState([])
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState(null)
  const [tab, setTab] = useState('youtube') // 'youtube' | 'file'
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try { setSources((await getJSON('/brainrot/admin/gameplay/sources')).sources || []) } catch { /* */ }
  }, [])
  useEffect(() => { load() }, [load])

  // poll while anything is processing
  useEffect(() => {
    const active = sources.some(s => s.status === 'processing')
    if (active && !timer.current) timer.current = setInterval(load, 3000)
    if (!active && timer.current) { clearInterval(timer.current); timer.current = null }
    return () => { if (timer.current && !active) { clearInterval(timer.current); timer.current = null } }
  }, [sources, load])

  const upload = async (e) => {
    e.preventDefault()
    if (!category.trim()) return notify('Category is required', 'error')
    
    const form = new FormData()
    form.append('category', category.trim())
    if (title.trim()) form.append('title', title.trim())
    
    if (tab === 'youtube') {
      if (!youtubeUrl.trim()) return notify('Enter a YouTube URL', 'error')
      form.append('youtube_url', youtubeUrl.trim())
    } else {
      if (!file) return notify('Choose a video file', 'error')
      form.append('file', file)
    }

    setBusy(true)
    try {
      await send('/brainrot/admin/gameplay', { form })
      notify(tab === 'youtube' ? 'YouTube video received — processing in background' : 'File uploaded — processing in background', 'success')
      setTitle(''); setYoutubeUrl(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(load, 800)
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }

  const statusColor = (s) => s === 'ready' ? C.green : s === 'failed' ? C.red : C.amber

  return (
    <div style={cardS}>
      <SectionHead icon="🎮" title="Gameplay backgrounds" sub="Upload a raw recording — the first 30s is dropped, then it's split into ≤120s clips and reframed to 9:16." />
      <form onSubmit={upload} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelS}>Category</label>
            <input style={inputS} value={category} onChange={e => setCategory(e.target.value)} placeholder="minecraft, subway_surfers, gta…" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelS}>Title (optional)</label>
            <input style={inputS} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Parkour pack #1" />
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 10, marginTop: 6, marginBottom: -4 }}>
          <button type="button" onClick={() => setTab('youtube')} style={{ ...btnGhost, fontWeight: tab === 'youtube' ? 800 : 500, color: tab === 'youtube' ? C.text : C.mute }}>YouTube URL</button>
          <button type="button" onClick={() => setTab('file')} style={{ ...btnGhost, fontWeight: tab === 'file' ? 800 : 500, color: tab === 'file' ? C.text : C.mute }}>Upload File</button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {tab === 'youtube' ? (
             <input type="url" placeholder="https://youtube.com/watch?v=..." value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} style={{ ...inputS, flex: 1 }} />
          ) : (
             <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ flex: 1, fontSize: '.8rem', color: C.text }} />
          )}
          <button type="submit" style={{ ...btnRed, opacity: busy ? .6 : 1 }} disabled={busy}>{busy ? 'Processing…' : (tab === 'youtube' ? 'Process YouTube' : 'Upload & Process')}</button>
          <button type="button" style={btnGhost} onClick={load}>🔄 Refresh</button>
        </div>
      </form>

      {sources.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sources.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 8 }}>
              <span style={{ fontSize: '.82rem', fontWeight: 700, textTransform: 'capitalize' }}>{s.category.replace(/_/g, ' ')}</span>
              {s.title && <span style={{ fontSize: '.74rem', color: C.mute }}>{s.title}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '.74rem', color: C.mute }}>{s.clip_count} clip{s.clip_count === 1 ? '' : 's'}</span>
              {s.status === 'processing' && s.progress && (
                <span style={{ fontSize: '.72rem', color: C.amber, fontWeight: 700 }}>{s.progress.done}/{s.progress.total}</span>
              )}
              <span style={{ fontSize: '.66rem', fontWeight: 800, color: statusColor(s.status), textTransform: 'uppercase' }}>{s.status}</span>
              {s.status === 'failed' && s.error_message && (
                <span title={s.error_message} style={{ fontSize: '.66rem', color: C.red, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚠ {s.error_message}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Brainrot Clips Curation ───────────────────────────────────────
function ClipsSection({ notify }) {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all') // all | pending | selected | rejected
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [busy, setBusy] = useState({})
  const [preview, setPreview] = useState(null) // clip being previewed in modal

  const load = useCallback(async () => {
    setLoading(true)
    try { setClips((await getJSON('/brainrot/admin/gameplay-clips')).clips || []) }
    catch { /* */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const setStatus = async (clipId, status) => {
    setBusy(prev => ({ ...prev, [clipId]: true }))
    try {
      await send(`/brainrot/admin/gameplay-clips/${clipId}`, { method: 'PATCH', json: { status } })
      setClips(prev => prev.map(c => c.id === clipId ? { ...c, status } : c))
      notify(`Clip marked as ${status}`, 'success')
    } catch (e) { notify(e.message, 'error') }
    finally { setBusy(prev => ({ ...prev, [clipId]: false })) }
  }

  // Derive categories from loaded clips
  const categories = ['all', ...Array.from(new Set(clips.map(c => c.category).filter(Boolean))).sort()]

  const visible = clips.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false
    return true
  })

  const counts = {
    total: clips.length,
    selected: clips.filter(c => c.status === 'selected').length,
    pending: clips.filter(c => c.status === 'pending').length,
    rejected: clips.filter(c => c.status === 'rejected').length,
  }

  const statusColor = (s) => s === 'selected' ? C.green : s === 'rejected' ? C.red : C.amber
  const statusIcon  = (s) => s === 'selected' ? '✅' : s === 'rejected' ? '❌' : '⏳'

  return (
    <div style={cardS}>
      <SectionHead icon="🎬" title="Brainrot Clips" sub="Review all generated clips and select the ones that should appear in the studio for users." />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {[['Total', counts.total, C.mute], ['Selected', counts.selected, C.green], ['Pending', counts.pending, C.amber], ['Rejected', counts.rejected, C.red]].map(([label, count, color]) => (
          <div key={label} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fafafa', minWidth: 70, textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{count}</div>
            <div style={{ fontSize: '.62rem', fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
          </div>
        ))}
        <button style={{ ...btnGhost, marginLeft: 'auto' }} onClick={load}>🔄 {loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '.68rem', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>Status:</span>
        {['all', 'pending', 'selected', 'rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...btnGhost, background: filter === f ? C.ink : '#fff', color: filter === f ? '#fff' : C.ink,
              padding: '5px 12px', fontSize: '.76rem', textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
        {categories.length > 1 && (
          <>
            <span style={{ fontSize: '.68rem', fontWeight: 700, color: C.mute, textTransform: 'uppercase', marginLeft: 8 }}>Category:</span>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              style={{ ...inputS, width: 'auto', padding: '5px 10px', fontSize: '.78rem' }}>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat === 'all' ? 'All categories' : cat.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Clips grid */}
      {visible.length === 0 ? (
        <div style={{ marginTop: 20, textAlign: 'center', padding: '32px 0', color: C.mute, fontSize: '.82rem', fontWeight: 600 }}>
          {loading ? 'Loading clips…' : 'No clips match this filter.'}
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 14 }}>
          {visible.map(clip => (
            <div key={clip.id} style={{ border: `2px solid ${statusColor(clip.status)}`, borderRadius: 12, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
              {/* Video preview — plays inline on hover, opens modal on click */}
              <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', background: '#000', cursor: 'pointer' }}
                onClick={() => setPreview(clip)}
                onMouseEnter={e => { const v = e.currentTarget.querySelector('video'); if (v) v.play().catch(() => {}) }}
                onMouseLeave={e => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0 } }}>
                {clip.gcs_path
                  ? <video
                      src={clip.gcs_path}
                      muted
                      playsInline
                      preload="metadata"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '.7rem', fontWeight: 700 }}>
                      🎮 {clip.category}
                    </div>}
                {/* Expand-to-modal overlay (shows on non-hover state) */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,.18)', opacity: 1, transition: 'opacity .15s', pointerEvents: 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem' }}>⛶</div>
                </div>
                {/* Status badge */}
                <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.65)', borderRadius: 6, padding: '2px 7px', fontSize: '.6rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {statusIcon(clip.status)} {clip.status}
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.6rem', fontWeight: 800, background: '#f0f4ff', color: '#3b5bdb', borderRadius: 4, padding: '1px 6px', textTransform: 'capitalize' }}>
                    {clip.category.replace(/_/g, ' ')}
                  </span>
                  {clip.duration_seconds && (
                    <span style={{ fontSize: '.6rem', fontWeight: 700, background: C.line, color: C.mute, borderRadius: 4, padding: '1px 6px' }}>
                      {clip.duration_seconds.toFixed(0)}s
                    </span>
                  )}
                </div>
                {clip.source_title && (
                  <div style={{ fontSize: '.68rem', fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {clip.source_title}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `1px solid ${C.line}` }}>
                <button
                  disabled={busy[clip.id] || clip.status === 'selected'}
                  onClick={() => setStatus(clip.id, 'selected')}
                  style={{ padding: '8px 4px', border: 'none', borderRight: `1px solid ${C.line}`, cursor: clip.status === 'selected' ? 'default' : 'pointer',
                    background: clip.status === 'selected' ? '#f0fff4' : '#fff', color: C.green,
                    fontSize: '.72rem', fontWeight: 800, opacity: busy[clip.id] ? .5 : 1 }}>
                  ✅ Select
                </button>
                <button
                  disabled={busy[clip.id] || clip.status === 'rejected'}
                  onClick={() => setStatus(clip.id, 'rejected')}
                  style={{ padding: '8px 4px', border: 'none', cursor: clip.status === 'rejected' ? 'default' : 'pointer',
                    background: clip.status === 'rejected' ? '#fff4f4' : '#fff', color: C.red,
                    fontSize: '.72rem', fontWeight: 800, opacity: busy[clip.id] ? .5 : 1 }}>
                  ❌ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video preview modal */}
      {preview && (
        <div onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', maxWidth: 360, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,.4)' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.line}` }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{preview.source_title || preview.category}</div>
                <div style={{ fontSize: '.68rem', color: C.mute }}>{preview.category.replace(/_/g, ' ')} · {(preview.duration_seconds || 0).toFixed(0)}s</div>
              </div>
              <button onClick={() => setPreview(null)} style={{ ...btnGhost, padding: '4px 10px' }}>✕</button>
            </div>
            <video src={preview.gcs_path} controls autoPlay playsInline
              style={{ width: '100%', aspectRatio: '9/16', display: 'block', background: '#000' }} />
            <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
              <button disabled={busy[preview.id] || preview.status === 'selected'} onClick={() => { setStatus(preview.id, 'selected'); setPreview(p => ({ ...p, status: 'selected' })) }}
                style={{ flex: 1, ...btnGhost, color: C.green, fontWeight: 800, opacity: preview.status === 'selected' ? .5 : 1 }}>✅ Select</button>
              <button disabled={busy[preview.id] || preview.status === 'rejected'} onClick={() => { setStatus(preview.id, 'rejected'); setPreview(p => ({ ...p, status: 'rejected' })) }}
                style={{ flex: 1, ...btnGhost, color: C.red, fontWeight: 800, opacity: preview.status === 'rejected' ? .5 : 1 }}>❌ Reject</button>
              {preview.status !== 'pending' && (
                <button onClick={() => { setStatus(preview.id, 'pending'); setPreview(p => ({ ...p, status: 'pending' })) }}
                  style={{ ...btnGhost, color: C.amber, fontWeight: 800 }}>↩ Reset</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── shared bits ───────────────────────────────────────────────────
function SectionHead({ icon, title, sub }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1.15rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '.92rem', fontWeight: 700, color: C.ink }}>{title}</div>
        <div style={{ fontSize: '.74rem', color: C.mute, marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  )
}
function Bar({ pct }) {
  return (
    <div style={{ height: 8, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: C.red, transition: 'width .4s' }} />
    </div>
  )
}
