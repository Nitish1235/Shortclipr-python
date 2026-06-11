import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ── Helpers ────────────────────────────────────────────────────
const token = () => localStorage.getItem('sc_token')

const authFetch = (url, opts = {}) =>
  fetch(`${API}${url}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...opts.headers },
  })

// ── Styles ─────────────────────────────────────────────────────
const card  = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px' }
const badge = (color = '#cf1322', bg = '#fef2f2') => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  background: bg, border: `1px solid ${color}40`, borderRadius: '100px',
  padding: '3px 10px', fontSize: '0.68rem', fontWeight: 700, color,
})
const btnRed = {
  background: '#cf1322', color: '#fff',
  border: '2px solid #111', borderRadius: '8px',
  padding: '9px 18px', fontWeight: 700, fontSize: '0.82rem',
  cursor: 'pointer', boxShadow: '2px 2px 0 #111',
  transition: 'transform 0.1s, box-shadow 0.1s',
}
const btnOutline = {
  background: 'transparent', color: '#cf1322',
  border: '1.5px solid #cf1322', borderRadius: '8px',
  padding: '7px 14px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
  transition: 'background 0.15s',
}

// ── Sub-components ─────────────────────────────────────────────

function Toast({ msg, type }) {
  if (!msg) return null
  const color = type === 'error' ? '#dc2626' : '#16a34a'
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: '#fff', border: `2px solid ${color}`,
      borderRadius: '10px', padding: '12px 20px',
      boxShadow: `3px 3px 0 ${color}`,
      fontSize: '0.85rem', fontWeight: 600, color,
      maxWidth: '360px', animation: 'fadeUp 0.3s ease',
    }}>{type === 'error' ? '❌ ' : '✅ '}{msg}</div>
  )
}

function ShowcaseManager({ showcaseVideos, onDelete, onRefresh }) {
  const [deleting, setDeleting] = useState(null)
  const [editId,   setEditId]   = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editScore, setEditScore] = useState(0)

  const handleDelete = async (v) => {
    setDeleting(v.id)
    const r = await authFetch(`/admin/showcase/${v.id}?blob_name=${encodeURIComponent(v.blob_name)}`, { method: 'DELETE' })
    setDeleting(null)
    if (r.ok) onRefresh()
  }

  const handleSaveMeta = async (v) => {
    await authFetch('/admin/showcase/meta', {
      method: 'PATCH',
      body: JSON.stringify({ blob_name: v.blob_name, title: editTitle, viral_score: editScore }),
    })
    setEditId(null)
    onRefresh()
  }

  if (!showcaseVideos.length) return (
    <div style={{ textAlign: 'center', padding: '32px', color: '#aaa' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
      <p>No showcase videos yet. Add clips from the job list below.</p>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
      {showcaseVideos.map(v => (
        <div key={v.id} style={{ ...card, padding: '0', overflow: 'hidden', position: 'relative' }}>
          {/* Video preview */}
          <div style={{ position: 'relative', background: '#111' }}>
            <video
              src={v.video_url} muted autoPlay loop playsInline
              poster={v.thumbnail_url}
              style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }}
            />
            <div style={{ position: 'absolute', top: '8px', left: '8px', ...badge('#f59e0b', '#fff') }}>
              🔥 {v.viral_score}/100
            </div>
          </div>

          {/* Info & actions */}
          <div style={{ padding: '10px 12px' }}>
            {editId === v.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '6px 8px', fontSize: '0.78rem', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor='#cf1322'} onBlur={e => e.target.style.borderColor='#e5e5e5'}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => handleSaveMeta(v)} style={{ ...btnRed, padding: '5px 10px', fontSize: '0.72rem', flex: 1, boxShadow: '1px 1px 0 #111' }}>Save</button>
                  <button onClick={() => setEditId(null)} style={{ ...btnOutline, padding: '5px 10px', fontSize: '0.72rem' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.title || 'Untitled clip'}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { setEditId(v.id); setEditTitle(v.title); setEditScore(v.viral_score) }}
                    style={{ ...btnOutline, padding: '5px 10px', fontSize: '0.72rem', flex: 1 }}>✏ Edit</button>
                  <button onClick={() => handleDelete(v)} disabled={deleting === v.id}
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#cf1322', cursor: 'pointer' }}>
                    {deleting === v.id ? '…' : '🗑'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function JobClips({ jobId, onAddToShowcase }) {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState(new Set())

  useEffect(() => {
    setLoading(true)
    authFetch(`/admin/jobs/${jobId}/clips`)
      .then(r => r.json()).then(d => setClips(d.clips || [])).finally(() => setLoading(false))
  }, [jobId])

  if (loading) return <div style={{ color: '#aaa', padding: '12px', fontSize: '0.82rem' }}>Loading clips…</div>
  if (!clips.length) return <div style={{ color: '#aaa', padding: '12px', fontSize: '0.82rem' }}>No clips found.</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', paddingTop: '12px' }}>
      {clips.map(c => (
        <div key={c.id || c.clip_id} style={{ ...card, padding: '0', overflow: 'hidden' }}>
          <div style={{ position: 'relative' }}>
            <video src={c.video_url} muted controls poster={c.thumbnail_url}
              style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }}/>
            <div style={{ position: 'absolute', top: '6px', left: '6px', ...badge('#f59e0b', 'rgba(0,0,0,0.7)'), color: '#fff' }}>
              🔥 {c.viral_score}/100
            </div>
          </div>
          <div style={{ padding: '8px 10px' }}>
            <button
              disabled={added.has(c.id || c.clip_id)}
              onClick={() => {
                setAdded(s => new Set([...s, c.id || c.clip_id]))
                onAddToShowcase({
                  job_id: jobId,
                  clip_id: c.clip_id || c.id,
                  title: c.title || 'ShortClipr Clip',
                  viral_score: c.viral_score || 0,
                  video_url: c.video_url,
                  thumbnail_url: c.thumbnail_url || '',
                })
              }}
              style={{
                width: '100%',
                background: added.has(c.id || c.clip_id) ? '#f0fdf4' : '#cf1322',
                color: added.has(c.id || c.clip_id) ? '#16a34a' : '#fff',
                border: added.has(c.id || c.clip_id) ? '1px solid #bbf7d0' : '2px solid #111',
                borderRadius: '7px', padding: '7px', fontWeight: 700, fontSize: '0.75rem',
                cursor: added.has(c.id || c.clip_id) ? 'default' : 'pointer',
                boxShadow: added.has(c.id || c.clip_id) ? 'none' : '1px 1px 0 #111',
              }}
            >
              {added.has(c.id || c.clip_id) ? '✓ Added to Showcase' : '+ Add to Showcase'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function GcsClipBrowser() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const check = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await authFetch('/admin/gcs/clips')
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to list clips')
      setData(await r.json())
    } catch (e) {
      setError(e.message)
      setData(null)
    }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>GCS Clip Browser</h2>
          <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
            Lists every clip stored in the bucket (real jobs + test batches), grouped by job.
          </p>
        </div>
        <button onClick={check} disabled={loading} style={{ ...btnRed, padding: '9px 18px', fontSize: '0.78rem' }}>
          {loading ? 'Checking…' : '🔎 Check All Videos'}
        </button>
      </div>

      {error && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#cf1322', fontSize: '0.82rem', marginBottom: '14px' }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <span style={badge('#16a34a', '#f0fdf4')}>{data.total_jobs} jobs</span>
            <span style={badge('#cf1322', '#fef2f2')}>{data.total_clips} clips</span>
          </div>
          {!data.jobs.length ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#aaa' }}>No clips found in GCS yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.jobs.map(j => (
                <div key={j.job_id} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111', fontFamily: 'monospace' }}>{j.job_id}</span>
                    {j.is_test && <span style={badge('#ca8a04', '#fefce8')}>TEST BATCH</span>}
                    <span style={badge('#666', '#f4f4f4')}>{j.clip_count} clips</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                    {j.clips.map(c => (
                      <div key={c.clip_id} style={{ background: '#111', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                        <video src={c.video_url} muted controls poster={c.thumbnail_url}
                          style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} />
                        <div style={{ position: 'absolute', bottom: '4px', left: '4px', right: '4px', fontSize: '0.62rem', color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '2px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.clip_id}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TestLabGenerator({ showToast }) {
  const [url, setUrl]         = useState('')
  const [jobId, setJobId]     = useState(null)
  const [job, setJob]         = useState(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!jobId) return
    if (job && (job.status === 'completed' || job.status === 'failed')) return
    const t = setInterval(async () => {
      const r = await authFetch(`/admin/test/jobs/${jobId}`)
      if (r.ok) setJob(await r.json())
    }, 3000)
    return () => clearInterval(t)
  }, [jobId, job])

  const start = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setStarting(true)
    setJob(null)
    try {
      const r = await authFetch('/admin/test/generate', { method: 'POST', body: JSON.stringify({ youtube_url: url.trim() }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to start test batch')
      const d = await r.json()
      setJobId(d.job_id)
      setJob({ status: 'processing', progress: 0, current_step: 'Starting...', clips: [], total_clips: d.total_clips })
    } catch (e) {
      showToast(e.message, 'error')
    }
    setStarting(false)
  }

  return (
    <div>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', marginBottom: '8px' }}>22-Clip Test Batch</h2>
      <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '20px', lineHeight: 1.6 }}>
        Paste a YouTube URL. No AI scoring — clips are sequential 30s segments from the start of the video.
        Clips 1-11 cycle through every <strong>caption style</strong> (same template), clips 12-22 cycle through
        every <strong>shorts template</strong> (same caption style).
      </p>

      <form onSubmit={start} style={{ ...card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', borderRadius: '8px', border: '2px solid #111', overflow: 'hidden', boxShadow: '2px 2px 0 #cf1322' }}>
          <input
            type="url" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            style={{ flex: 1, padding: '13px 14px', border: 'none', outline: 'none', fontSize: '0.9rem', minWidth: 0 }}
          />
          <button type="submit" disabled={starting || (job && job.status === 'processing')} style={{ ...btnRed, borderRadius: '0', border: 'none', padding: '13px 20px', boxShadow: 'none' }}>
            {starting ? 'Starting…' : '⚡ Generate'}
          </button>
        </div>
      </form>

      {job && (
        <div style={{ ...card, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.78rem', color: '#666' }}>
            <span>{job.current_step || '...'}</span>
            <span>{job.progress || 0}%</span>
          </div>
          <div style={{ background: '#f4f4f4', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${job.progress || 0}%`,
              background: job.status === 'failed' ? '#dc2626' : 'linear-gradient(90deg,#cf1322,#ff6b6b)',
              borderRadius: '4px', transition: 'width 0.5s ease',
            }} />
          </div>
          {job.status === 'failed' && (
            <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '0.8rem' }}>❌ {job.error}</div>
          )}
        </div>
      )}

      {job && job.clips && job.clips.length > 0 && (
        <div>
          {/* Phase 1: caption styles */}
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111', marginBottom: '10px' }}>
            📝 Caption Styles ({job.clips.filter(c => c.phase === 'caption_style').length}/11)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {job.clips.filter(c => c.phase === 'caption_style').map(c => (
              <ShortCard key={c.index} clip={c} label={c.style} />
            ))}
          </div>

          {/* Phase 2: shorts templates */}
          {job.clips.some(c => c.phase === 'short_template') && (
            <>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111', marginBottom: '10px' }}>
                🎬 Shorts Templates ({job.clips.filter(c => c.phase === 'short_template').length}/11)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                {job.clips.filter(c => c.phase === 'short_template').map(c => (
                  <ShortCard key={c.index} clip={c} label={c.template} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ShortCard({ clip, label }) {
  return (
    <div style={{ ...card, padding: '0', overflow: 'hidden', aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, background: '#111', overflow: 'hidden' }}>
        {clip.error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ff6b6b', fontSize: '0.7rem', padding: '8px', textAlign: 'center' }}>
            ❌ {clip.error}
          </div>
        ) : clip.video_url ? (
          <video src={clip.video_url} muted controls poster={clip.thumbnail_url}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: '0.78rem' }}>
            <div style={{ width: '18px', height: '18px', border: '2px solid #333', borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
          </div>
        )}
      </div>
      <div style={{ padding: '7px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#111', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {String(label).replace(/_/g, ' ')}
      </div>
    </div>
  )
}

// ── Main Admin Page ────────────────────────────────────────────

export default function Admin() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab]         = useState('showcase') // showcase | jobs | generate
  const [jobs, setJobs]       = useState([])
  const [showcase, setShowcase] = useState([])
  const [expandedJob, setExpandedJob] = useState(null)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingShowcase, setLoadingShowcase] = useState(false)
  const [toast, setToast]     = useState({ msg: '', type: 'success' })

  // Generate clip state
  const [genUrl, setGenUrl]   = useState('')
  const [genLoading, setGenLoading] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'success' }), 4000)
  }

  const fetchShowcase = async () => {
    setLoadingShowcase(true)
    const r = await authFetch('/admin/showcase')
    const d = await r.json()
    setShowcase(d.videos || [])
    setLoadingShowcase(false)
  }

  const fetchJobs = async () => {
    setLoadingJobs(true)
    try {
      const r = await authFetch('/admin/jobs')
      const d = await r.json()
      setJobs(d.jobs || [])
    } catch { setJobs([]) }
    setLoadingJobs(false)
  }

  useEffect(() => { fetchShowcase() }, [])
  useEffect(() => { if (tab === 'jobs') fetchJobs() }, [tab])

  const handleAddToShowcase = async (payload) => {
    const r = await authFetch('/admin/showcase/add', { method: 'POST', body: JSON.stringify(payload) })
    if (r.ok) {
      showToast('Clip added to showcase!')
      fetchShowcase()
    } else {
      const e = await r.json().catch(() => ({}))
      showToast(e.detail || 'Failed to add clip', 'error')
    }
  }

  // Quick generate — redirects to lab/dashboard with URL pre-filled
  const handleGenerate = (e) => {
    e.preventDefault()
    if (!genUrl.trim()) return
    sessionStorage.setItem('sc_pending_url', genUrl.trim())
    navigate('/dashboard')
  }

  // Status badge helper
  const statusBadge = (status) => {
    const map = {
      completed:  ['#16a34a', '#f0fdf4'],
      processing: ['#cf1322', '#fef2f2'],
      queued:     ['#ca8a04', '#fefce8'],
      failed:     ['#dc2626', '#fef2f2'],
    }
    const [color, bg] = map[status] || ['#666', '#f4f4f4']
    return <span style={{ ...badge(color, bg), textTransform: 'capitalize' }}>{status}</span>
  }

  const tabStyle = (active) => ({
    padding: '9px 20px', fontWeight: 700, fontSize: '0.82rem',
    background: active ? '#cf1322' : 'transparent',
    color: active ? '#fff' : '#555',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ background: '#f9f9f9', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e5e5',
        padding: '0 5%', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '60px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo size={28}/>
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>ShortClipr</span>
          <span style={{ ...badge('#cf1322'), marginLeft: '4px' }}>⚡ Admin</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: '#999', alignSelf: 'center' }}>{user?.email}</span>
          <button onClick={() => navigate('/dashboard')} style={{ ...btnOutline, fontSize: '0.78rem' }}>
            ← Dashboard
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 5%' }}>

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111', letterSpacing: '-0.03em', marginBottom: '4px' }}>
            Admin Panel
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#999' }}>
            Manage showcase videos · Generate clips · Control landing page content
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', background: '#f4f4f4',
          borderRadius: '10px', padding: '4px', width: 'fit-content',
          marginBottom: '24px',
        }}>
          {[
            { key: 'showcase', label: '🎬 Showcase'  },
            { key: 'jobs',     label: '📋 All Jobs'  },
            { key: 'generate', label: '⚡ Generate'  },
            { key: 'testlab',  label: '🧪 Test Lab'  },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Showcase tab ── */}
        {tab === 'showcase' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>Landing Page Showcase</h2>
                <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
                  These clips appear in the infinite video carousel on the landing page.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ ...badge('#16a34a', '#f0fdf4') }}>{showcase.length} videos</span>
                <button onClick={fetchShowcase} style={{ ...btnOutline, fontSize: '0.75rem', padding: '6px 12px' }}>
                  🔄 Refresh
                </button>
                <button onClick={() => setTab('jobs')} style={{ ...btnRed, padding: '8px 16px', fontSize: '0.78rem', boxShadow: '2px 2px 0 #111' }}>
                  + Add from Jobs →
                </button>
              </div>
            </div>

            {loadingShowcase ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#aaa', padding: '20px' }}>
                <div style={{ width: '18px', height: '18px', border: '2px solid #fecaca', borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
                Loading showcase…
              </div>
            ) : (
              <ShowcaseManager
                showcaseVideos={showcase}
                onDelete={fetchShowcase}
                onRefresh={fetchShowcase}
              />
            )}
          </div>
        )}

        {/* ── Jobs tab ── */}
        {tab === 'jobs' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>All Jobs</h2>
                <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
                  Click a completed job to view its clips, then add them to the showcase.
                </p>
              </div>
              <button onClick={fetchJobs} style={{ ...btnOutline, fontSize: '0.75rem', padding: '6px 12px' }}>
                🔄 Refresh
              </button>
            </div>

            {loadingJobs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#aaa', padding: '20px' }}>
                <div style={{ width: '18px', height: '18px', border: '2px solid #fecaca', borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
                Loading jobs…
              </div>
            ) : !jobs.length ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
                <p>No jobs found. Generate some clips first.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {jobs.map(job => (
                  <div key={job.job_id} style={{ ...card }}>
                    {/* Job header */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: job.status === 'completed' ? 'pointer' : 'default', flexWrap: 'wrap', gap: '10px' }}
                      onClick={() => job.status === 'completed' && setExpandedJob(expandedJob === job.job_id ? null : job.job_id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
                          {job.video_title || job.youtube_url}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#999' }}>
                          {job.user_email} · {new Date(job.created_at).toLocaleString()} · {job.options?.clip_count || '?'} clips
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {statusBadge(job.status)}
                        {job.status === 'completed' && (
                          <span style={{ fontSize: '0.78rem', color: '#cf1322', fontWeight: 600 }}>
                            {expandedJob === job.job_id ? '▲ Hide' : '▼ View clips'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded clip list */}
                    {expandedJob === job.job_id && job.status === 'completed' && (
                      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '14px' }}>
                        <JobClips
                          jobId={job.job_id}
                          onAddToShowcase={(payload) => {
                            handleAddToShowcase(payload)
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Generate tab ── */}
        {tab === 'generate' && (
          <div style={{ maxWidth: '600px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
              Generate New Clips
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '20px', lineHeight: 1.6 }}>
              Paste a YouTube URL to generate clips via the dashboard. After generation, come back here to the
              <strong style={{ color: '#cf1322' }}> Jobs tab</strong> to add clips to the showcase.
            </p>

            <form onSubmit={handleGenerate} style={{ ...card }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                  YouTube URL
                </label>
                <div style={{ display: 'flex', borderRadius: '8px', border: '2px solid #111', overflow: 'hidden', boxShadow: '2px 2px 0 #cf1322' }}>
                  <input
                    type="url" value={genUrl} onChange={e => setGenUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    style={{ flex: 1, padding: '13px 14px', border: 'none', outline: 'none', fontSize: '0.9rem', minWidth: 0 }}
                  />
                  <button type="submit" style={{ ...btnRed, borderRadius: '0', border: 'none', padding: '13px 20px', boxShadow: 'none' }}>
                    Generate →
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#aaa' }}>
                This will redirect you to the dashboard where you can configure and generate clips.
                Return here afterward to add the best clips to the showcase.
              </p>
            </form>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '20px' }}>
              {[
                { label: 'Showcase videos', val: showcase.length, icon: '🎬' },
                { label: 'Total jobs',       val: jobs.length,   icon: '📋' },
                { label: 'Avg viral score',  val: showcase.length ? Math.round(showcase.reduce((s, v) => s + v.viral_score, 0) / showcase.length) : '—', icon: '🔥' },
              ].map(s => (
                <div key={s.label} style={{ ...card, textAlign: 'center', padding: '16px' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#cf1322', letterSpacing: '-0.04em' }}>{s.val}</div>
                  <div style={{ fontSize: '0.68rem', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Test Lab tab ── */}
        {tab === 'testlab' && (
          <div>
            <TestLabGenerator showToast={showToast} />
            <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '32px 0' }} />
            <GcsClipBrowser />
          </div>
        )}
      </div>

      <Toast msg={toast.msg} type={toast.type} />
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}
