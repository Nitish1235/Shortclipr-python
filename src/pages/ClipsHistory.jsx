import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppLayout, { SIDEBAR_W } from '../components/AppLayout'
import { YTLogo, TTLogo } from '../components/PlatformLogos'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function fmtDur(sec) {
  if (!sec) return null
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date(), diff = now - d
  if (diff < 60000)     return 'just now'
  if (diff < 3600000)   return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000)  return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ClipsHistory() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading]   = useState(true)
  const [groups, setGroups]     = useState([])   // [{ job, clips[] }]
  const [modalOpen, setModalOpen]   = useState(false)
  const [modalClip, setModalClip]   = useState(null)
  const [modalJob, setModalJob]     = useState(null)

  const [ytConn, setYtConn]             = useState(localStorage.getItem('yt_connected') === 'true')
  const [ttConn, setTtConn]             = useState(localStorage.getItem('tt_connected') === 'true')
  const [publishingYT, setPublishingYT] = useState(new Set())
  const [publishingTT, setPublishingTT] = useState(new Set())
  const [publishedYT, setPublishedYT]   = useState(new Set())
  const [publishedTT, setPublishedTT]   = useState(new Set())
  const [toast, setToast]               = useState(null)

  const isPaid = user?.plan && user.plan !== 'free'

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Load jobs + clips (last 15 days). Mirrors CLIP_RETENTION_MS in
  // pages/Dashboard.jsx — keep both in sync if changed.
  const RETENTION_MS = 15 * 24 * 3600 * 1000
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const token = localStorage.getItem('sc_token')
        if (!token) return
        const res = await fetch(`${API_BASE}/jobs`, { headers: { Authorization: `Bearer ${token}` } })
        if (res.status === 401) { logout(); return }
        if (!res.ok) return
        const { jobs } = await res.json()

        const now = Date.now()
        const relevant = jobs
          .filter(j => j.status === 'completed' && (now - new Date(j.created_at)) < RETENTION_MS)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 25)

        const results = await Promise.all(
          relevant.map(job =>
            fetch(`${API_BASE}/jobs/${job.job_id}/clips`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : { clips: [] })
              .then(data => ({
                job,
                clips: (data.clips || [])
                  .filter(c => c.clip_ready === true)
                  .sort((a, b) => (b.viral_score || 0) - (a.viral_score || 0)),
              }))
          )
        )
        setGroups(results.filter(g => g.clips.length > 0))
      } catch (err) {
        console.error('ClipsHistory load failed', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [logout])

  // Social status
  useEffect(() => {
    const token = localStorage.getItem('sc_token')
    if (!token) return
    fetch(`${API_BASE}/social/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setYtConn(d.youtube); setTtConn(d.tiktok) } })
      .catch(() => {})
  }, [])

  // Keyboard nav for modal
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setModalOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Publish handlers — TEMPORARILY DISABLED ─────────────────────
  // Neither platform has granted official approval yet (YouTube API audit
  // / TikTok Content Posting API review both pending). Stubbed to a
  // "coming soon" toast below; original implementation kept commented
  // out so re-enabling later is just deleting the stubs and uncommenting.
  /*
  const handlePublishYT = async (e, clip) => {
    e.stopPropagation()
    if (!isPaid) { showToast('Upgrade to publish to YouTube', 'error'); return }
    if (!ytConn) {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/auth/youtube`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); window.location.href = d.url }
      return
    }
    const clipId = clip.clip_id || clip.id
    setPublishingYT(p => new Set([...p, clipId]))
    try {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/publish/youtube`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: clipId, title: clip.top_title || 'ShortClipr Video' }),
      })
      const d = await r.json()
      if (r.ok && d.status !== 'error') {
        setPublishedYT(p => new Set([...p, clipId]))
        showToast('Published to YouTube!')
      } else {
        showToast(d.detail || 'Publish failed', 'error')
      }
    } catch { showToast('Network error', 'error') }
    finally { setPublishingYT(p => { const n = new Set(p); n.delete(clipId); return n }) }
  }

  const handlePublishTT = async (e, clip) => {
    e.stopPropagation()
    if (!isPaid) { showToast('Upgrade to publish to TikTok', 'error'); return }
    if (!ttConn) {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/auth/tiktok`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); window.location.href = d.url }
      return
    }
    const clipId = clip.clip_id || clip.id
    setPublishingTT(p => new Set([...p, clipId]))
    try {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/publish/tiktok`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: clipId, title: clip.top_title || 'ShortClipr Video' }),
      })
      const d = await r.json()
      if (r.ok) {
        setPublishedTT(p => new Set([...p, clipId]))
        showToast('Queued for TikTok!')
      } else {
        showToast(d.detail || 'Publish failed', 'error')
      }
    } catch { showToast('Network error', 'error') }
    finally { setPublishingTT(p => { const n = new Set(p); n.delete(clipId); return n }) }
  }
  */
  const handlePublishYT = (e) => { e.stopPropagation(); showToast('YouTube publishing is coming soon!', 'info') }
  const handlePublishTT = (e) => { e.stopPropagation(); showToast('TikTok publishing is coming soon!', 'info') }

  const handleDownload = (e, clip, jobId) => {
    e.stopPropagation()
    const clipId = clip.clip_id || clip.id
    if (!isPaid) { navigate('/billing'); return }
    const token = localStorage.getItem('sc_token')
    const a = document.createElement('a')
    a.href = `${API_BASE}/clips/${clipId}/download?token=${token}`
    a.download = `ShortClipr_${clipId.split('-')[0]}.mp4`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    if (!isPaid && freeOk && !feedbackReward.clipId) {
      localStorage.setItem('sc_feedback_reward_clip_id', clipId)
      setFeedbackReward(r => ({ ...r, clipId }))
    }
  }

  const totalClips = groups.reduce((acc, g) => acc + g.clips.length, 0)

  return (
    <AppLayout>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'error' ? '#fef2f2' : toast.type === 'info' ? '#eff6ff' : '#f0fdf4',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : toast.type === 'info' ? '#bfdbfe' : '#bbf7d0'}`,
          color: toast.type === 'error' ? '#dc2626' : toast.type === 'info' ? '#1d4ed8' : '#16a34a',
          borderRadius: 10, padding: '10px 16px',
          fontSize: '.82rem', fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,.1)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'error' ? '✕' : toast.type === 'info' ? 'ℹ' : '✓'} {toast.msg}
        </div>
      )}

      <main style={{ flex: 1, background: '#f7f8fa', paddingBottom: 60 }}>
        {/* Header bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', height: 56, gap: 20 }}>
              <div>
                <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', margin: 0, lineHeight: 1 }}>Clips Library</h1>
                <p style={{ fontSize: '.72rem', color: '#9ca3af', margin: 0, marginTop: 2 }}>All your generated shorts</p>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 0, borderLeft: '1px solid #e5e7eb' }}>
                {[
                  { n: totalClips,                        l: 'Total clips',  c: '#111' },
                  { n: publishedYT.size + publishedTT.size, l: 'Published', c: '#16a34a' },
                ].map((s, i) => (
                  <div key={i} style={{
                    padding: '0 20px', borderRight: '1px solid #e5e7eb',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 56,
                  }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-.04em', color: s.c, lineHeight: 1 }}>{s.n}</div>
                    <div style={{ fontSize: '.62rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '20px 24px' }}>
          {/* Content */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{
                width: 32, height: 32, border: '3px solid #fecaca',
                borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }}/>
            </div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎬</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#374151', marginBottom: 8 }}>No clips found</div>
              <p style={{ fontSize: '.85rem', color: '#9ca3af', marginBottom: 20, maxWidth: 320, margin: '0 auto 20px' }}>
                No clips generated in the last 15 days. Head to the Dashboard to create some.
              </p>
              <a href="/youtube-shorts/dashboard" style={{
                display: 'inline-block', padding: '9px 20px', background: '#cf1322',
                color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '.83rem', textDecoration: 'none',
              }}>Go to Dashboard →</a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {groups.map(({ job, clips }) => (
                <div key={job.job_id}>
                  {/* Job header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cf1322', flexShrink: 0 }}/>
                    <h2 style={{
                      fontSize: '.88rem', fontWeight: 700, color: '#111', margin: 0,
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {job.video_title || job.youtube_url || 'Untitled Video'}
                    </h2>
                    <span style={{ fontSize: '.7rem', color: '#9ca3af', flexShrink: 0 }}>{fmtDate(job.created_at)}</span>
                    <span style={{
                      fontSize: '.68rem', color: '#6b7280',
                      background: '#f3f4f6', borderRadius: 5, padding: '2px 8px', flexShrink: 0,
                    }}>
                      {clips.length} clip{clips.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Clips grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: 10,
                  }}>
                    {clips.map(clip => {
                      const clipId  = clip.clip_id || clip.id
                      const ytDone  = publishedYT.has(clipId)
                      const ttDone  = publishedTT.has(clipId)
                      const ytPub   = publishingYT.has(clipId)
                      const ttPub   = publishingTT.has(clipId)
                      const dur     = fmtDur(clip.duration_sec)

                      return (
                        <div key={clipId} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {/* Square card */}
                          <div
                            onClick={() => { setModalClip(clip); setModalJob(job); setModalOpen(true) }}
                            style={{
                              aspectRatio: '1/1', position: 'relative', overflow: 'hidden',
                              borderRadius: 10, cursor: 'pointer',
                              background: clip.thumbnail_url ? 'transparent' : '#f3f4f6',
                              border: '1px solid #e5e7eb',
                              transition: 'transform .15s, box-shadow .15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                          >
                            {clip.thumbnail_url && (
                              <img src={clip.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                            )}
                            {/* Viral score */}
                            {clip.viral_score != null && (
                              <div style={{
                                position: 'absolute', top: 6, right: 6,
                                background: 'rgba(0,0,0,.72)', color: '#fbbf24',
                                borderRadius: 5, padding: '2px 6px',
                                fontSize: '.6rem', fontWeight: 900,
                              }}>🔥 {clip.viral_score}</div>
                            )}
                            {/* HD badge */}
                            <div style={{
                              position: 'absolute', top: 6, left: 6,
                              background: 'rgba(22,163,74,.9)', color: '#fff',
                              borderRadius: 4, padding: '2px 5px',
                              fontSize: '.55rem', fontWeight: 900,
                            }}>HD</div>
                            {/* Duration */}
                            {dur && (
                              <div style={{
                                position: 'absolute', bottom: 6, right: 6,
                                background: 'rgba(0,0,0,.65)', color: '#fff',
                                borderRadius: 4, padding: '2px 6px',
                                fontSize: '.6rem', fontWeight: 700,
                              }}>{dur}</div>
                            )}
                            {/* Published badges */}
                            {(ytDone || ttDone) && (
                              <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 3 }}>
                                {ytDone && (
                                  <div style={{ background: 'rgba(220,38,38,.9)', borderRadius: 4, padding: '2px 5px', fontSize: '.55rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <YTLogo size={7} /> ✓
                                  </div>
                                )}
                                {ttDone && (
                                  <div style={{ background: 'rgba(1,1,1,.9)', borderRadius: 4, padding: '2px 5px', fontSize: '.55rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <TTLogo size={7} /> ✓
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Play overlay */}
                            <div className="play-overlay" style={{
                              position: 'absolute', inset: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: 0, transition: 'opacity .15s', pointerEvents: 'none',
                            }}>
                              <div style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'rgba(255,255,255,.92)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 16px rgba(0,0,0,.25)',
                              }}>
                                <span style={{ fontSize: 14, marginLeft: 2, color: '#111' }}>▶</span>
                              </div>
                            </div>
                          </div>

                          {/* Title */}
                          <p style={{
                            margin: 0, fontSize: '.67rem', fontWeight: 700, color: '#374151',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{clip.top_title || 'Clip'}</p>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: 3 }}>
                            {/* Post-to-YouTube/TikTok disabled — pending platform
                                approval. Original buttons called handlePublishYT/TT
                                (now stubbed above). */}
                            <div
                              title="YouTube publishing — coming soon"
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                padding: '5px 4px', borderRadius: 7, fontSize: '.6rem', fontWeight: 700,
                                border: '1px dashed #e5e7eb', background: '#f9fafb',
                                color: '#9ca3af', cursor: 'default',
                              }}
                            >
                              <YTLogo size={10} /> Soon
                            </div>
                            <div
                              title="TikTok publishing — coming soon"
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                padding: '5px 4px', borderRadius: 7, fontSize: '.6rem', fontWeight: 700,
                                border: '1px dashed #e5e7eb', background: '#f9fafb',
                                color: '#9ca3af', cursor: 'default',
                              }}
                            >
                              <TTLogo size={10} /> Soon
                            </div>
                            <button
                              onClick={e => handleDownload(e, clip, job.job_id)}
                              title={isPaid ? 'Download MP4' : 'Upgrade to download'}
                              style={{
                                padding: '5px 7px', borderRadius: 7,
                                border: isPaid ? '1px solid #e5e7eb' : '1px solid #cf1322',
                                background: isPaid ? '#f9fafb' : '#fef2f2',
                                color: isPaid ? '#374151' : '#cf1322', cursor: 'pointer', fontSize: '.7rem',
                              }}
                            >{isPaid ? '⬇' : '💳'}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Video modal ── */}
      {modalOpen && modalClip && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16,
              width: '100%', maxWidth: 540,
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(0,0,0,.3)',
            }}
          >
            {/* Modal header */}
            <div style={{
              padding: '13px 18px', borderBottom: '1px solid #e5e7eb',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                flex: 1, fontSize: '.88rem', fontWeight: 700, color: '#111',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {modalClip.top_title || 'Clip Preview'}
              </span>
              {modalClip.viral_score != null && (
                <span style={{
                  background: '#fff0f3', color: '#cf1322',
                  border: '1px solid #fecaca', borderRadius: 7,
                  padding: '3px 10px', fontSize: '.76rem', fontWeight: 800,
                }}>🔥 {modalClip.viral_score}</span>
              )}
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e7eb',
                  background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, color: '#6b7280',
                }}
              >✕</button>
            </div>
            {/* Video */}
            <div style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ width: 200, aspectRatio: '9/16', overflow: 'hidden', borderRadius: 10 }}>
                <video
                  key={modalClip.clip_id || modalClip.id}
                  src={modalClip.video_url || modalClip.preview_url}
                  controls
                  controlsList="nodownload"
                  onContextMenu={e => e.preventDefault()}
                  poster={modalClip.thumbnail_url || undefined}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            </div>
            {/* Actions */}
            <div style={{ padding: '14px 18px', display: 'flex', gap: 8 }}>
              {/* Post-to-YouTube/TikTok disabled — pending platform approval.
                  Original buttons called handlePublishYT/TT (now stubbed above). */}
              <div
                title="YouTube publishing — coming soon"
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 12px', borderRadius: 9, fontSize: '.78rem', fontWeight: 700,
                  border: '1px dashed #d1d5db', background: '#f9fafb', color: '#9ca3af', cursor: 'default',
                }}
              ><YTLogo size={13} /> YouTube — Coming Soon</div>
              <div
                title="TikTok publishing — coming soon"
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 12px', borderRadius: 9, fontSize: '.78rem', fontWeight: 700,
                  border: '1px dashed #d1d5db', background: '#f9fafb', color: '#9ca3af', cursor: 'default',
                }}
              ><TTLogo size={13} /> TikTok — Coming Soon</div>
              <button
                onClick={e => handleDownload(e, modalClip, modalJob?.job_id)}
                style={{
                  padding: '9px 14px', borderRadius: 9,
                  border: isPaid ? '1px solid #e5e7eb' : '1px solid #cf1322',
                  background: isPaid ? '#f9fafb' : '#cf1322',
                  color: isPaid ? '#374151' : '#fff', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700,
                }}
              >{isPaid ? '⬇ Download' : '💳 Upgrade'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        div:hover > .play-overlay { opacity: 1 !important; background: rgba(0,0,0,.28) !important; }
      `}</style>
    </AppLayout>
  )
}
