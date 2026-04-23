import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navigation from '../components/Navigation'
import PublishModal from '../components/PublishModal'
import ClipEngine from '../components/ClipEngine'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState(null)
  const [clips, setClips] = useState([])
  const [loadingClips, setLoadingClips] = useState(false)
  const [selectedClipIds, setSelectedClipIds] = useState(new Set())
  const [showPublishModal, setShowPublishModal] = useState(false)

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401) {
        logout()
        return
      }
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs || [])
      }
    } catch (err) {
      console.error('Failed to fetch jobs', err)
    } finally {
      setLoading(false)
    }
  }

  // Polling for active jobs
  useEffect(() => {
    fetchJobs()
    const interval = setInterval(() => {
      setJobs(currentJobs => {
        const hasActiveJobs = currentJobs.some(j => !['completed', 'failed'].includes(j.status))
        if (hasActiveJobs) fetchJobs()
        return currentJobs
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleViewClips = async (jobId) => {
    if (selectedJob === jobId) return setSelectedJob(null)
    setSelectedJob(jobId)
    setLoadingClips(true)
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs/${jobId}/clips`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401) {
        logout()
        return
      }
      if (res.ok) {
        const data = await res.json()
        setClips(data.clips || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingClips(false)
    }
  }

  const toggleClipSelection = (clipId) => {
    setSelectedClipIds(prev => {
      const next = new Set(prev)
      if (next.has(clipId)) next.delete(clipId)
      else next.add(clipId)
      return next
    })
  }

  const handleBulkDownload = async () => {
    const selectedClips = clips.filter(c => selectedClipIds.has(c.id))
    if (selectedClips.length > 1) {
      alert("PRO TIP: Please 'Allow Multiple Downloads' in your browser pop-up to save all selected clips at once!")
    }
    for (const clip of selectedClips) {
      const link = document.createElement('a')
      link.href = clip.video_url
      link.download = `ShortClipr_${clip.id.split('-')[0]}.mp4`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      // Small delay to prevent browser download congestion
      await new Promise(r => setTimeout(r, 600))
    }
  }

  const handleConnectSocial = async (platform) => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/auth/${platform}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401) {
        logout()
        return
      }
      if (res.ok) {
        const { url } = await res.json()
        window.location.href = url // Redirect to Google OAuth
      }
    } catch (err) {
      alert('Failed to initiate auth flow')
    }
  }

  const renderProgressBar = (progress) => {
    const bars = Math.floor(progress / 5)
    return `[${'█'.repeat(bars)}${'░'.repeat(20 - bars)}] ${progress}%`
  }

  return (
    <>
      <Navigation />
      <main style={{ paddingTop: '120px', minHeight: '100vh', paddingBottom: '100px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 5%' }}>
          
          <div className="term-header" style={{ background: 'var(--lime)', color: '#000' }}>
            <span>SECURE.TERMINAL_DASHBOARD</span>
            <span>USER:{user?.email?.split('@')[0]}</span>
          </div>
          
          <div style={{ background: 'var(--bg-dark)', padding: '20px', border: '2px solid var(--lime)', borderTop: 'none', borderBottom: 'none', display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', color: 'var(--green)', fontWeight: 700 }}>{user?.credits_used || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>SHORTS MADE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', color: 'var(--yellow)', fontWeight: 700 }}>{user?.videos_remaining || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>REMAINING</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', color: 'var(--lime)', fontWeight: 700 }}>{user?.credits_limit || 3}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>MONTHLY LIMIT</div>
            </div>
          </div>

          <div style={{ borderLeft: '2px solid var(--lime)', borderRight: '2px solid var(--lime)', padding: '20px 5%' }}>
            <ClipEngine onJobCreated={fetchJobs} />
          </div>

          <div style={{ background: '#000', border: '2px solid var(--lime)', borderTop: '2px solid var(--lime)', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--muted)', paddingBottom: '12px', marginBottom: '24px' }}>
              <h2 style={{ fontFamily: "'Space Mono', monospace", color: 'var(--text)', margin: 0 }}>
                &gt; JOB HISTORY QUEUE
              </h2>
              {!user?.social_tokens?.youtube && (
                <button 
                  onClick={() => handleConnectSocial('youtube')}
                  style={{ background: 'none', border: '1px solid var(--yellow)', color: 'var(--yellow)', padding: '5px 10px', fontSize: '0.7rem', fontFamily: "'Space Mono', monospace", cursor: 'pointer' }}
                >
                  [!] CONNECT_YOUTUBE_OAUTH
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)' }}>[ FETCHING RECORDS... ]</div>
            ) : jobs.length === 0 ? (
              <div style={{ fontFamily: "'Space Mono', monospace", color: 'var(--muted)' }}>NO JOBS FOUND IN DATABASE.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {jobs.map(job => (
                  <div key={job.job_id} style={{
                    border: '1px solid var(--muted)',
                    background: job.status === 'completed' ? 'rgba(132, 204, 22, 0.05)' : 'rgba(0,0,0,0.5)',
                    padding: '20px', position: 'relative'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ fontFamily: "'Space Mono', monospace" }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '4px' }}>JOB_ID: {job.job_id.split('-')[0]}</div>
                        <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px' }}>{job.video_title || job.youtube_url}</div>
                        <div style={{ fontSize: '0.8rem', color: job.status === 'failed' ? '#ef4444' : 'var(--lime)', textTransform: 'uppercase' }}>
                          STATUS: {job.status} / {job.current_step || 'Awaiting Worker...'}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>
                        {new Date(job.created_at).toLocaleString()}
                        <br/>
                        TARGET SHORTS: {job.options?.clip_count}
                      </div>
                    </div>

                    {['queued', 'processing'].includes(job.status) && (
                      <div style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.9rem', marginBottom: '16px', letterSpacing: '0.1em' }}>
                        {renderProgressBar(job.progress || 0)}
                      </div>
                    )}

                    {job.status === 'completed' && (
                      <button 
                        onClick={() => handleViewClips(job.job_id)}
                        style={{
                          background: selectedJob === job.job_id ? 'var(--bg-dark)' : 'var(--lime)',
                          color: selectedJob === job.job_id ? 'var(--lime)' : '#000',
                          border: '1px solid var(--lime)', padding: '8px 16px',
                          fontFamily: "'Space Mono', monospace", fontWeight: 700, cursor: 'pointer',
                          willChange: 'background, color', transition: 'all 0.2s',
                        }}
                      >
                        {selectedJob === job.job_id ? '[ HIDE CLIPS ]' : '[ VIEW RENDERED CLIPS ]'}
                      </button>
                    )}

                    {/* Clip Gallery for this job */}
                    {selectedJob === job.job_id && (
                      <div style={{ marginTop: '24px', borderTop: '1px dashed var(--muted)', paddingTop: '24px' }}>
                        {loadingClips ? (
                          <div style={{ fontFamily: "'Space Mono', monospace", color: 'var(--yellow)' }}>&gt; ACCESSING GCS BUCKET...</div>
                        ) : clips.length === 0 ? (
                          <div style={{ fontFamily: "'Space Mono', monospace", color: 'var(--muted)' }}>NO CLIPS GENERATED OR GCS BUCKET EMPTY.</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                            {clips.map((clip, i) => (
                              <div 
                                key={clip.id} 
                                onClick={() => toggleClipSelection(clip.id)}
                                style={{ 
                                  background: '#000', border: selectedClipIds.has(clip.id) ? '1px solid var(--lime)' : '1px solid #1a3322', 
                                  padding: '12px', cursor: 'pointer', position: 'relative',
                                  boxShadow: selectedClipIds.has(clip.id) ? 'inset 0 0 10px rgba(132, 204, 22, 0.2)' : 'none'
                                }}
                              >
                                {selectedClipIds.has(clip.id) && (
                                  <div style={{ position: 'absolute', top: 5, right: 5, background: 'var(--lime)', color: '#000', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, zIndex: 10 }}>✓</div>
                                )}
                                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '8px', fontFamily: "'Space Mono', monospace", display: 'flex', justifyContent: 'space-between' }}>
                                  <span>CLIP_V{i+1}.MP4</span>
                                  <span style={{ color: 'var(--yellow)' }}>SCORE: {clip.viral_score}/100</span>
                                </div>
                                <video 
                                  src={clip.video_url} 
                                  controls 
                                  poster={clip.thumbnail_url}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ width: '100%', aspectRatio: '9/16', background: '#0a0a0a', border: '1px solid var(--muted)' }}
                                />
                                <div style={{ fontSize: '0.75rem', marginTop: '12px', color: 'var(--text)', fontFamily: "'Space Mono', monospace", display: 'flex', justifyContent: 'space-between' }}>
                                  <Link to={`/editor/${job.job_id}/${clip.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--yellow)', textDecoration: 'none' }}>✎ ADVANCED_EDIT</Link>
                                  <a href={clip.video_url} onClick={(e) => e.stopPropagation()} target="_blank" rel="noreferrer" style={{ color: 'var(--lime)', textDecoration: 'none' }}>⬇ DOWNLOAD</a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Bulk Action Bar */}
        {selectedClipIds.size > 0 && (
          <div style={{
            position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--lime)', color: '#000', padding: '15px 30px',
            borderRadius: '0px', border: '3px solid #000',
            boxShadow: '10px 10px 0 #000', zIndex: 900,
            display: 'flex', gap: '30px', alignItems: 'center',
            fontFamily: "'Space Mono', monospace"
          }}>
            <span style={{ fontWeight: 800 }}>{selectedClipIds.size} CLIPS_SELECTED</span>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={handleBulkDownload}
                style={{ background: '#000', color: 'var(--lime)', border: 'none', padding: '8px 15px', fontWeight: 800, cursor: 'pointer' }}
              >[ DOWNLOAD_ALL ]</button>
              <button 
                onClick={() => setShowPublishModal(true)}
                style={{ background: '#000', color: '#fff', border: 'none', padding: '8px 15px', fontWeight: 800, cursor: 'pointer' }}
              >[ PUBLISH_TO_YOUTUBE ]</button>
              <button 
                onClick={() => setSelectedClipIds(new Set())}
                style={{ background: 'none', border: 'none', color: '#000', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}
              >Deselect All</button>
            </div>
          </div>
        )}

        {showPublishModal && (
          <PublishModal 
            selectedClips={clips.filter(c => selectedClipIds.has(c.id))}
            onClose={() => setShowPublishModal(false)}
            onComplete={() => {
              setShowPublishModal(false)
              setSelectedClipIds(new Set())
            }}
          />
        )}
      </main>
    </>
  )
}
