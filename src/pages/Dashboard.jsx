import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navigation from '../components/Navigation'
// import PublishModal from '../components/PublishModal'  // hidden — YouTube publishing coming soon
import ClipEngine from '../components/ClipEngine'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ── Status helpers ────────────────────────────────────────────────
const STATUS_COLOR = {
  completed:  { bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0', label:'Done'       },
  processing: { bg:'#fef2f2', color:'#cf1322', border:'#fecaca', label:'Processing' },
  queued:     { bg:'#fefce8', color:'#ca8a04', border:'#fde68a', label:'Queued'     },
  failed:     { bg:'#fef2f2', color:'#dc2626', border:'#fecaca', label:'Failed'     },
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const [jobs, setJobs]                     = useState([])
  const [loading, setLoading]               = useState(true)
  const [selectedJob, setSelectedJob]       = useState(null)
  const [clips, setClips]                   = useState([])
  const [loadingClips, setLoadingClips]     = useState(false)
  const [selectedClipIds, setSelectedClipIds] = useState(new Set())
  // const [showPublishModal, setShowPublishModal] = useState(false)  // hidden — coming soon
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeReason, setUpgradeReason]   = useState('')
  const activeSseJobs = useRef(new Set())

  const isPaid = user?.plan && user.plan !== 'free'

  const requirePlan = (reason) => {
    if (!isPaid) { setUpgradeReason(reason); setShowUpgradeModal(true); return false }
    return true
  }

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { logout(); return }
      if (res.ok) { const data = await res.json(); setJobs(data.jobs || []) }
    } catch (err) { console.error('Failed to fetch jobs', err) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(() => {
      setJobs(cur => {
        if (cur.some(j => ['queued','processing'].includes(j.status))) fetchJobs()
        return cur
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('sc_token')
    if (!token) return
    jobs.filter(j => ['queued','processing'].includes(j.status)).forEach(job => {
      if (activeSseJobs.current.has(job.job_id)) return
      activeSseJobs.current.add(job.job_id)
      const es = new EventSource(`${API_BASE}/jobs/${job.job_id}/stream?token=${token}`)
      es.onmessage = (e) => {
        const raw = e.data
        if (['done','completed','failed'].includes(raw) || raw.startsWith('error')) {
          es.close(); activeSseJobs.current.delete(job.job_id); fetchJobs(); return
        }
        if (raw.includes(':') && raw !== 'heartbeat') {
          const idx = raw.indexOf(':')
          const pct = parseInt(raw.slice(0, idx), 10)
          const step = raw.slice(idx + 1)
          if (!isNaN(pct)) {
            setJobs(prev => prev.map(j => j.job_id === job.job_id ? { ...j, progress: pct, current_step: step } : j))
          }
        }
      }
      es.onerror = () => { es.close(); activeSseJobs.current.delete(job.job_id) }
    })
  }, [jobs])

  const handleViewClips = async (jobId) => {
    if (selectedJob === jobId) return setSelectedJob(null)
    setSelectedJob(jobId); setLoadingClips(true)
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs/${jobId}/clips`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { logout(); return }
      if (res.ok) { const data = await res.json(); setClips(data.clips || []) }
    } catch (err) { console.error(err) }
    finally { setLoadingClips(false) }
  }

  const toggleClipSelection = (clipId) => {
    setSelectedClipIds(prev => { const n = new Set(prev); n.has(clipId) ? n.delete(clipId) : n.add(clipId); return n })
  }

  const handleBulkDownload = async () => {
    if (!requirePlan('Download clips')) return
    const sel = clips.filter(c => selectedClipIds.has(c.clip_id || c.id))
    if (sel.length > 1) alert("Allow Multiple Downloads in your browser to save all at once!")
    for (const clip of sel) {
      const token = localStorage.getItem('sc_token')
      const a = document.createElement('a')
      a.href = `${API_BASE}/clips/${clip.clip_id || clip.id}/download?token=${token}`
      a.download = `ShortClipr_${(clip.clip_id || clip.id || '').split('-')[0]}.mp4`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      await new Promise(r => setTimeout(r, 600))
    }
  }

  const handleSingleDownload = (e, clip) => {
    e.stopPropagation()
    if (!isPaid) { setUpgradeReason('Download clips'); setShowUpgradeModal(true); return }
    const token = localStorage.getItem('sc_token')
    const a = document.createElement('a')
    a.href = `${API_BASE}/clips/${clip.clip_id || clip.id}/download?token=${token}`
    a.download = `ShortClipr_${(clip.clip_id || clip.id || '').split('-')[0]}.mp4`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const handleEditClip = (e, jobId, clipId) => {
    e.stopPropagation()
    if (!isPaid) { setUpgradeReason('Access the clip editor'); setShowUpgradeModal(true); return }
    window.location.href = `/editor/${jobId}/${clipId}`
  }

  // handleConnectSocial — hidden until YouTube publishing feature is released
  // const handleConnectSocial = async (platform) => { ... }

  // ── Styles ────────────────────────────────────────────────────────
  const card = {
    background:'#fff', border:'1px solid #e5e5e5',
    borderRadius:'14px', padding:'24px',
  }

  const btnRed = {
    background:'#cf1322', color:'#fff',
    border:'2px solid #111', borderRadius:'8px',
    padding:'10px 20px', fontWeight:700, fontSize:'0.85rem',
    cursor:'pointer', boxShadow:'2px 2px 0 #111',
    transition:'transform 0.1s, box-shadow 0.1s',
  }

  const btnOutline = {
    background:'transparent', color:'#cf1322',
    border:'1.5px solid #cf1322', borderRadius:'8px',
    padding:'9px 18px', fontWeight:600, fontSize:'0.85rem',
    cursor:'pointer', transition:'background 0.15s',
  }

  return (
    <>
      <Navigation />
      <main style={{ background:'#f9f9f9', minHeight:'100vh', paddingBottom:'80px' }}>
        <div style={{ maxWidth:'960px', margin:'0 auto', padding:'32px 5% 0' }}>

          {/* ── Header ── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
            <div>
              <h1 style={{ fontSize:'1.6rem', fontWeight:700, letterSpacing:'-0.03em', color:'#0f0f0f', marginBottom:'4px' }}>
                Dashboard
              </h1>
              <p style={{ fontSize:'0.85rem', color:'#999' }}>Welcome back, {user?.email?.split('@')[0]}</p>
            </div>

            {/* Connect YouTube button — hidden until publishing feature is released */}
          </div>

          {/* ── Stats row ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px', marginBottom:'28px' }}>
            {[
              { label:'Shorts made',    val: user?.credits_used || 0,     color:'#cf1322' },
              { label:'Clips remaining',val: user?.videos_remaining || 0, color:'#16a34a' },
              { label:'Monthly limit',  val: user?.credits_limit || 3,    color:'#ca8a04' },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign:'center', padding:'20px 16px' }}>
                <div style={{ fontSize:'2rem', fontWeight:700, color:s.color, letterSpacing:'-0.05em' }}>{s.val}</div>
                <div style={{ fontSize:'0.75rem', color:'#999', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:'4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── ClipEngine (URL input + config) ── */}
          <div style={{ ...card, marginBottom:'28px', border:'2px solid #111', boxShadow:'4px 4px 0 #cf1322' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px', paddingBottom:'16px', borderBottom:'1px solid #e5e5e5' }}>
              <div style={{ width:'8px', height:'8px', background:'#cf1322', borderRadius:'50%' }}/>
              <span style={{ fontWeight:700, fontSize:'0.9rem', color:'#111' }}>New Video</span>
              <span style={{ fontSize:'0.78rem', color:'#999' }}>Paste a YouTube URL to generate clips</span>
            </div>
            <ClipEngine onJobCreated={fetchJobs} />
          </div>

          {/* ── Job History ── */}
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', paddingBottom:'16px', borderBottom:'1px solid #e5e5e5', flexWrap:'wrap', gap:'10px' }}>
              <h2 style={{ fontSize:'1rem', fontWeight:700, color:'#111' }}>
                Video History
              </h2>
              {jobs.some(j => ['queued','processing'].includes(j.status)) && (
                <div style={{
                  display:'flex', alignItems:'center', gap:'6px',
                  background:'#fef2f2', border:'1px solid #fecaca',
                  borderRadius:'8px', padding:'6px 12px',
                  fontSize:'0.75rem', fontWeight:600, color:'#cf1322',
                }}>
                  <span style={{ animation:'blink 1s infinite' }}>●</span>
                  Processing — keep this tab open
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'20px 0', color:'#aaa' }}>
                <div style={{ width:'20px', height:'20px', border:'2px solid #fecaca', borderTopColor:'#cf1322', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                Loading jobs…
              </div>
            ) : jobs.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px' }}>
                <div style={{ fontSize:'2.5rem', marginBottom:'12px' }}>🎬</div>
                <p style={{ color:'#999', fontSize:'0.9rem' }}>No videos yet. Paste a YouTube URL above to get started.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                {jobs.map(job => {
                  const st = STATUS_COLOR[job.status] || STATUS_COLOR.queued
                  return (
                    <div key={job.job_id} style={{
                      border:'1px solid #e5e5e5', borderRadius:'12px',
                      padding:'20px', background:'#fff',
                      borderLeft: job.status === 'completed' ? '4px solid #16a34a' :
                                   job.status === 'processing' ? '4px solid #cf1322' :
                                   job.status === 'failed' ? '4px solid #dc2626' :
                                   '4px solid #ca8a04',
                    }}>
                      {/* Job header */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'16px', marginBottom:'12px', flexWrap:'wrap' }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#111', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {job.video_title || job.youtube_url}
                          </div>
                          <div style={{ fontSize:'0.78rem', color:'#999' }}>
                            {new Date(job.created_at).toLocaleString()} · {job.options?.clip_count || '–'} clips requested
                          </div>
                        </div>
                        {/* Status badge */}
                        <div style={{
                          background:st.bg, color:st.color, border:`1px solid ${st.border}`,
                          borderRadius:'100px', padding:'4px 12px',
                          fontSize:'0.72rem', fontWeight:700, flexShrink:0,
                          textTransform:'uppercase', letterSpacing:'0.06em',
                        }}>{st.label}</div>
                      </div>

                      {/* Progress bar */}
                      {['queued','processing'].includes(job.status) && (
                        <div style={{ marginBottom:'16px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px', fontSize:'0.75rem', color:'#666' }}>
                            <span>{job.current_step || 'Waiting…'}</span>
                            <span>{job.progress || 0}%</span>
                          </div>
                          <div style={{ background:'#f4f4f4', borderRadius:'4px', height:'6px', overflow:'hidden' }}>
                            <div style={{
                              height:'100%', width:`${job.progress || 0}%`,
                              background:'linear-gradient(90deg,#cf1322,#ff6b6b)',
                              borderRadius:'4px', transition:'width 0.5s ease',
                            }}/>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {job.status === 'completed' && (
                        <button onClick={() => handleViewClips(job.job_id)} style={{
                          ...btnRed,
                          background: selectedJob === job.job_id ? '#111' : '#cf1322',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' }}
                          onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
                        >
                          {selectedJob === job.job_id ? '↑ Hide Clips' : `▶ View Clips`}
                        </button>
                      )}

                      {/* Clip gallery */}
                      {selectedJob === job.job_id && (
                        <div style={{ marginTop:'20px', paddingTop:'20px', borderTop:'1px solid #e5e5e5' }}>
                          {loadingClips ? (
                            <div style={{ display:'flex', alignItems:'center', gap:'10px', color:'#aaa', fontSize:'0.9rem' }}>
                              <div style={{ width:'18px', height:'18px', border:'2px solid #fecaca', borderTopColor:'#cf1322', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                              Loading clips…
                            </div>
                          ) : clips.length === 0 ? (
                            <p style={{ color:'#999', fontSize:'0.875rem' }}>No clips found.</p>
                          ) : (
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:'16px' }}>
                              {clips.map((clip, i) => (
                                <div key={clip.id} onClick={() => toggleClipSelection(clip.id)} style={{
                                  background:'#f9f9f9', border: selectedClipIds.has(clip.id) ? '2px solid #cf1322' : '1px solid #e5e5e5',
                                  borderRadius:'10px', overflow:'hidden', cursor:'pointer',
                                  boxShadow: selectedClipIds.has(clip.id) ? '0 0 0 3px rgba(207,19,34,0.15)' : 'none',
                                  position:'relative', transition:'border-color 0.15s',
                                }}>
                                  {selectedClipIds.has(clip.id) && (
                                    <div style={{
                                      position:'absolute', top:'8px', right:'8px', zIndex:10,
                                      background:'#cf1322', color:'#fff', width:'22px', height:'22px',
                                      borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                                      fontSize:'12px', fontWeight:900, boxShadow:'0 2px 6px rgba(0,0,0,0.2)',
                                    }}>✓</div>
                                  )}

                                  {/* Viral score badge */}
                                  <div style={{
                                    position:'absolute', top:'8px', left:'8px', zIndex:10,
                                    background:'rgba(0,0,0,0.75)', color:'#fff',
                                    fontSize:'0.62rem', fontWeight:700, padding:'2px 7px', borderRadius:'100px',
                                  }}>🔥 {clip.viral_score}/100</div>

                                  <video
                                    src={clip.video_url}
                                    controls
                                    poster={clip.thumbnail_url}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width:'100%', aspectRatio:'9/16', objectFit:'cover', display:'block' }}
                                  />

                                  <div style={{ padding:'10px 12px', display:'flex', justifyContent:'space-between' }}>
                                    <button onClick={e => handleEditClip(e, job.job_id, clip.clip_id || clip.id)} style={{
                                      background:'none', border:'none', cursor:'pointer',
                                      fontSize:'0.78rem', fontWeight:600,
                                      color: isPaid ? '#cf1322' : '#bbb',
                                      padding:0,
                                    }}>
                                      {isPaid ? '✏ Edit' : '🔒 Edit'}
                                    </button>
                                    <button onClick={e => handleSingleDownload(e, clip)} style={{
                                      background:'none', border:'none', cursor:'pointer',
                                      fontSize:'0.78rem', fontWeight:600,
                                      color: isPaid ? '#16a34a' : '#bbb',
                                      padding:0,
                                    }}>
                                      {isPaid ? '⬇ Download' : '🔒 Download'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Bulk action bar ── */}
        {selectedClipIds.size > 0 && (
          <div style={{
            position:'fixed', bottom:'28px', left:'50%', transform:'translateX(-50%)',
            background:'#fff', border:'2px solid #111',
            borderRadius:'14px', boxShadow:'4px 4px 0 #cf1322',
            padding:'14px 24px', zIndex:900,
            display:'flex', alignItems:'center', gap:'16px', flexWrap:'wrap',
          }}>
            <span style={{ fontWeight:700, fontSize:'0.88rem', color:'#111' }}>
              {selectedClipIds.size} clips selected
            </span>
            <button onClick={handleBulkDownload} style={btnRed}
              onMouseEnter={e => { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' }}
              onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
            >⬇ Download all</button>
            {/* 📺 Publish to YouTube — hidden until publishing feature is released */}
            <button onClick={() => setSelectedClipIds(new Set())} style={{
              background:'none', border:'none', cursor:'pointer',
              color:'#aaa', fontSize:'0.82rem', fontWeight:500,
            }}>Clear</button>
          </div>
        )}

        {/* ── Upgrade Modal ── */}
        {showUpgradeModal && (
          <div style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex:1000, padding:'20px',
          }}>
            <div style={{
              background:'#fff', border:'2px solid #111',
              borderRadius:'16px', boxShadow:'6px 6px 0 #cf1322',
              maxWidth:'460px', width:'100%', padding:'32px',
            }}>
              <div style={{
                width:'48px', height:'48px', background:'#fef2f2', borderRadius:'12px',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'1.4rem', marginBottom:'16px',
              }}>🔒</div>
              <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#111', marginBottom:'8px' }}>{upgradeReason}</h2>
              <p style={{ fontSize:'0.875rem', color:'#666', lineHeight:1.6, marginBottom:'24px' }}>
                This feature requires a paid plan. Free accounts get <strong style={{ color:'#cf1322' }}>3 free generations</strong> to try ShortClipr.
                Upgrade to unlock downloads, the editor, and unlimited shorts.
              </p>

              <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'24px' }}>
                {[
                  { name:'Starter', price:'$10/mo', perks:'100 shorts · Editor · Downloads' },
                  { name:'Pro',     price:'$45/mo', perks:'500 shorts · Priority · Everything' },
                ].map(plan => (
                  <div key={plan.name} style={{
                    border:'1px solid #e5e5e5', borderRadius:'10px',
                    padding:'14px 16px',
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                  }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#111' }}>{plan.name}</div>
                      <div style={{ fontSize:'0.75rem', color:'#999', marginTop:'2px' }}>{plan.perks}</div>
                    </div>
                    <span style={{ fontWeight:700, color:'#cf1322' }}>{plan.price}</span>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:'12px' }}>
                <a href="/" onClick={() => setShowUpgradeModal(false)} style={{
                  flex:1, textAlign:'center',
                  background:'#cf1322', color:'#fff',
                  border:'2px solid #111', borderRadius:'8px',
                  padding:'12px', fontWeight:700, fontSize:'0.875rem',
                  boxShadow:'2px 2px 0 #111',
                }}>View plans →</a>
                <button onClick={() => setShowUpgradeModal(false)} style={{
                  background:'transparent', border:'1.5px solid #e5e5e5',
                  borderRadius:'8px', color:'#666', padding:'12px 20px',
                  cursor:'pointer', fontWeight:600, fontSize:'0.875rem',
                }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* PublishModal — hidden until YouTube publishing feature is released */}
      </main>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes blink { 50% { opacity: 0 } }
        @media(max-width:600px){
          main > div > div:nth-child(2){ grid-template-columns:1fr !important; }
        }
      `}</style>
    </>
  )
}
