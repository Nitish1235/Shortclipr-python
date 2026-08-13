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
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

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
    if (!youtubeUrl.trim()) return notify('Enter a YouTube URL', 'error')
    if (!category.trim()) return notify('Category is required', 'error')
    setBusy(true)
    const form = new FormData()
    form.append('youtube_url', youtubeUrl.trim()); form.append('category', category.trim())
    if (title.trim()) form.append('title', title.trim())
    try {
      await send('/brainrot/admin/gameplay', { form })
      notify('YouTube video received — processing in background', 'success')
      setTitle(''); setYoutubeUrl('')
      setTimeout(load, 800)
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }

  const statusColor = (s) => s === 'ready' ? C.green : s === 'failed' ? C.red : C.amber

  return (
    <div style={cardS}>
      <SectionHead icon="🎮" title="Gameplay backgrounds" sub="Upload a raw recording — the first 30s is dropped, then it's split into ≤120s clips and reframed to 9:16." />
      <form onSubmit={upload} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, alignItems: 'end' }}>
        <div>
          <label style={labelS}>Category</label>
          <input style={inputS} value={category} onChange={e => setCategory(e.target.value)} placeholder="minecraft, subway_surfers, gta…" />
        </div>
        <div>
          <label style={labelS}>Title (optional)</label>
          <input style={inputS} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Parkour pack #1" />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="url" placeholder="https://youtube.com/watch?v=..." value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} style={{ ...inputS, flex: 1 }} />
          <button type="submit" style={{ ...btnRed, opacity: busy ? .6 : 1 }} disabled={busy}>{busy ? 'Processing…' : 'Process YouTube Video'}</button>
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
