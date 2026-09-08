import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppLayout, { SIDEBAR_W } from '../components/AppLayout'
import ClipEngine from '../components/ClipEngine'
import SocialProofModal from '../components/SocialProofModal'
import { YTLogo, TTLogo } from '../components/PlatformLogos'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ── Timer helpers ─────────────────────────────────────────────────
// Clip retention: 15 days from job creation. Mirrors the filter in
// pages/ClipsHistory.jsx — keep both in sync if changed.
const CLIP_RETENTION_MS = 15 * 24 * 3600 * 1000

function msRemaining(createdAt) {
  if (!createdAt) return 0
  return new Date(createdAt).getTime() + CLIP_RETENTION_MS - Date.now()
}
function formatTimer(createdAt) {
  const ms = msRemaining(createdAt)
  if (ms <= 0) return 'Expired'
  const days = Math.floor(ms / (24 * 3600000))
  const hrs  = Math.floor((ms % (24 * 3600000)) / 3600000)
  if (days > 0) return `${days}d ${hrs}h`
  const mins = Math.floor((ms % 3600000) / 60000)
  return `${hrs}h ${mins}m`
}
// "Urgent" = clip has less than 1 day left. Was 6h under the old 24h window;
// scaled up because "6h left of 15 days" is invisible on the UI meter.
function isUrgent(createdAt) { return msRemaining(createdAt) < 24 * 3600000 }
function isExpired(createdAt) { return msRemaining(createdAt) <= 0 }

// Video-minutes stat formatting — e.g. 45 -> "45m", 125 -> "2h 5m"
function formatMinutes(mins) {
  const n = Math.max(0, Math.round(Number(mins) || 0))
  if (n < 60) return `${n}m`
  const h = Math.floor(n / 60)
  const m = n % 60
  // At 100h+ the "and m minutes" detail is just noise and blows out the
  // stats cell width — collapse to whole hours only.
  if (h >= 100) return `${h}h`
  return m ? `${h}h ${m}m` : `${h}h`
}

// ── Job status helpers ───────────────────────────────────────────
// Mirrors `count_active_jobs` in backend/app/db/supabase.py — any of these
// mean the job is still moving through the pipeline. Split-worker mode
// cycles through `api_processing → api_done → ffmpeg_processing`, so ALL of
// these must be considered "in progress" or the processing banner blinks
// off every time the status transitions between stages.
const ACTIVE_STATUSES = [
  'queued', 'created', 'dispatched', 'processing',
  'api_processing', 'api_done', 'ffmpeg_processing',
]
const isJobActive = (job) => !!job && ACTIVE_STATUSES.includes(job.status)

// ── Status colors ─────────────────────────────────────────────────
const STATUS_COLOR = {
  completed:  { bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0', label:'Done'       },
  processing: { bg:'#fef2f2', color:'#cf1322', border:'#fecaca', label:'Processing' },
  queued:     { bg:'#fefce8', color:'#ca8a04', border:'#fde68a', label:'Queued'     },
  failed:     { bg:'#fef2f2', color:'#dc2626', border:'#fecaca', label:'Failed'     },
}

export default function Dashboard() {
  const { user, logout, fetchUser } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Social publishing is beta — only available to the allowlisted account
  const socialEnabled = user?.email === 'jainnitish432@gmail.com'

  // Jobs & clips
  const [jobs, setJobs]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [clips, setClips]             = useState([])
  const [loadingClips, setLoadingClips] = useState(false)

  // UI state
  const [filter, setFilter]           = useState('all') // all | unpublished | expiring
  const [selectedClipIds, setSelectedClipIds] = useState(new Set())
  const [showGeneratePanel, setShowGeneratePanel] = useState(true)

  // Modal
  const [modalOpen, setModalOpen]     = useState(false)
  const [modalIdx, setModalIdx]       = useState(0)

  // Social
  const [ytConnected, setYtConnected] = useState(false)
  const [ttConnected, setTtConnected] = useState(false)
  const [publishedYT, setPublishedYT] = useState(new Set())
  const [publishingYT, setPublishingYT] = useState(new Set())
  const [publishedTT, setPublishedTT] = useState(new Set())
  const [publishingTT, setPublishingTT] = useState(new Set())
  const [draftedTT,   setDraftedTT]   = useState(new Set())
  const [draftingTT,  setDraftingTT]  = useState(new Set())
  // Per-clip topic + hashtags (optional, used when publishing)
  const [clipMeta, setClipMeta] = useState({}) // { [clipId]: { topic: '', hashtags: '' } }
  const updateClipMeta = (clipId, field, value) =>
    setClipMeta(prev => ({ ...prev, [clipId]: { ...(prev[clipId] || {}), [field]: value } }))

  // Modals / toasts
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeReason, setUpgradeReason]       = useState('')
  const [toast, setToast]                       = useState(null) // { msg, type }

  // Post-queue feedback survey — see FeedbackModal.jsx. Reward state
  // mirrors what the backend enforces (server is authoritative; this is
  // just for showing the right button/lock state without an extra fetch).
  const [showSocialProofModal, setShowSocialProofModal] = useState(false)

  const activeSseJobs = useRef(new Set())
  const clipPollRef   = useRef(null)
  const [tick, setTick] = useState(0) // drives timer re-renders

  const isPaid = user?.plan && user.plan !== 'free'
  const currentJob = jobs[0] || null          // most-recent job only
  const isActive = isJobActive(currentJob)

  // Friendly, non-technical status — never surface raw backend step text
  // (e.g. "Reading transcript...", "Downloading clips...") to the user.
  const friendlyJobStatus = (job) => {
    if (!job) return 'Queued…'
    const n = job.clip_count || 'your'
    const pct = job.progress || 0
    if (pct >= 95) return 'Almost done — finalizing…'
    if (pct >= 60) return `Encoding ${n} clips in HD…`
    if (pct >= 25) return `Generating ${n} clips — this'll take a few minutes…`
    return `Getting started…`
  }

  // ── Utils ──────────────────────────────────────────────────────
  const requirePlan = (reason) => {
    if (!isPaid) { setUpgradeReason(reason); setShowUpgradeModal(true); return false }
    return true
  }
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // ── Timer tick every 60s ───────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // ── Social connect detection (URL params + localStorage) ─────
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const statusParam = params.get('status')

    if (statusParam === 'youtube_connected' || statusParam === 'social_connected') {
      localStorage.setItem('yt_connected', 'true')
      setYtConnected(true)
      showToast('YouTube connected successfully!')
      window.history.replaceState({}, '', '/youtube-shorts/dashboard')
    } else if (statusParam === 'tiktok_connected') {
      localStorage.setItem('tt_connected', 'true')
      setTtConnected(true)
      showToast('TikTok connected successfully!')
      window.history.replaceState({}, '', '/youtube-shorts/dashboard')
    } else if (statusParam === 'tiktok_error') {
      const reason = params.get('reason') || 'unknown error'
      showToast(`TikTok connect failed: ${reason}`, 'error')
      window.history.replaceState({}, '', '/youtube-shorts/dashboard')
    } else {
      setYtConnected(localStorage.getItem('yt_connected') === 'true')
      setTtConnected(localStorage.getItem('tt_connected') === 'true')
    }

    // Also verify against server-side state on mount
    const token = localStorage.getItem('sc_token')
    if (token) {
      fetch(`${API_BASE}/social/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return
          if (d.youtube !== undefined) {
            setYtConnected(d.youtube)
            if (!d.youtube) localStorage.removeItem('yt_connected')
          }
          if (d.tiktok !== undefined) {
            setTtConnected(d.tiktok)
            if (!d.tiktok) localStorage.removeItem('tt_connected')
          }
        })
        .catch(() => {})
    }
  }, []) // eslint-disable-line

  // ── Fetch jobs ─────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { logout(); return }
      if (res.ok) {
        const data = await res.json()
        // Sort newest first
        const sorted = (data.jobs || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        setJobs(sorted)
      }
    } catch (err) { console.error('Failed to fetch jobs', err) }
    finally { setLoading(false) }
  }, [logout])

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(() => {
      setJobs(cur => {
        if (cur.some(isJobActive)) fetchJobs()
        return cur
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  // ── SSE for live job progress ──────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('sc_token')
    if (!token) return
    jobs.filter(isJobActive).forEach(job => {
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
            setJobs(prev => prev.map(j =>
              j.job_id === job.job_id ? { ...j, progress: pct, current_step: step } : j
            ))
          }
        }
      }
      es.onerror = () => { es.close(); activeSseJobs.current.delete(job.job_id) }
    })
  }, [jobs, fetchJobs])

  // ── Fetch clips for current job ────────────────────────────────
  const fetchClips = useCallback(async (jobId) => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs/${jobId}/clips`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401) { logout(); return }
      if (res.ok) {
        const data = await res.json()
        setClips(prev => {
          const byId = Object.fromEntries(prev.map(c => [c.clip_id || c.id, c]))
          ;(data.clips || []).forEach(c => { byId[c.clip_id || c.id] = c })
          return Object.values(byId).sort((a, b) => b.viral_score - a.viral_score)
        })
      }
    } catch (err) { console.error(err) }
  }, [logout])

  // Auto-load clips when current job changes
  useEffect(() => {
    if (!currentJob) return
    setClips([])
    setLoadingClips(true)
    fetchClips(currentJob.job_id).finally(() => setLoadingClips(false))
    if (isJobActive(currentJob)) {
      clearInterval(clipPollRef.current)
      clipPollRef.current = setInterval(() => fetchClips(currentJob.job_id), 3000)
    }
    return () => clearInterval(clipPollRef.current)
  }, [currentJob?.job_id]) // eslint-disable-line

  // Stop polling when job finishes
  useEffect(() => {
    if (!currentJob) return
    if (!isJobActive(currentJob)) {
      clearInterval(clipPollRef.current)
      clipPollRef.current = null
      fetchClips(currentJob.job_id)
    }
  }, [currentJob?.status]) // eslint-disable-line

  useEffect(() => () => clearInterval(clipPollRef.current), [])

  // ── Derived clip lists ────────────────────────────────────────
  // Clips are hidden from the UI 15 days after generation (see
  // CLIP_RETENTION_MS above + matching filter in ClipsHistory.jsx).
  // Server-side, non-showcased clips get deleted whenever the user
  // deletes the parent job — this UI cutoff is a soft rolloff so old
  // clips stop cluttering the dashboard even if the user never cleans up.
  const jobExpired = currentJob && isExpired(currentJob.created_at)
  const rawClips = clips.filter(c => c.clip_ready === false)   // Phase 1: encoding
  const hdClips  = jobExpired ? [] : clips.filter(c => c.clip_ready === true)  // Phase 2: ready
  const filteredClips = hdClips.filter(c => {
    const id = c.clip_id || c.id
    if (filter === 'unpublished') return !publishedYT.has(id) && !publishedTT.has(id)
    if (filter === 'expiring')    return currentJob && isUrgent(currentJob.created_at)
    return true
  })

  // ── Selection ──────────────────────────────────────────────────
  const toggleSelect = (e, clipId) => {
    e.stopPropagation()
    setSelectedClipIds(prev => { const n = new Set(prev); n.has(clipId) ? n.delete(clipId) : n.add(clipId); return n })
  }

  // ── Download ───────────────────────────────────────────────────
  // Free-plan users normally can't download — but if they submitted the
  // post-queue feedback survey, one clip from THAT job is unlocked. This
  // mirrors the server-side check in editor.py's download endpoint (which
  // is the actual enforcement point); it just keeps the button state
  // honest without a separate fetch.
  const canFreeDownload = (clip) => {
    if (!feedbackReward || !currentJob) return false
    if (String(feedbackReward.jobId) !== String(currentJob.job_id)) return false
    const clipId = String(clip.clip_id || clip.id)
    return !feedbackReward.clipId || String(feedbackReward.clipId) === clipId
  }

  const doDownload = (clipId, isFreeReward) => {
    const token = localStorage.getItem('sc_token')
    const a = document.createElement('a')
    a.href = `${API_BASE}/clips/${clipId}/download?token=${token}`
    a.download = `ShortClipr_${clipId.split('-')[0]}.mp4`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    if (isFreeReward && !feedbackReward.clipId) {
      localStorage.setItem('sc_feedback_reward_clip_id', clipId)
      setFeedbackReward(r => ({ ...r, clipId }))
    }
  }
  const handleSingleDownload = (e, clip) => {
    e.stopPropagation()
    const clipId = clip.clip_id || clip.id
    if (!isPaid && !canFreeDownload(clip)) { navigate('/billing'); return }
    doDownload(clipId, !isPaid && canFreeDownload(clip))
  }
  const handleBulkDownload = async () => {
    if (!isPaid) { navigate('/billing'); return }
    const sel = filteredClips.filter(c => selectedClipIds.has(c.clip_id || c.id))
    if (sel.length > 1) alert('Allow Multiple Downloads in your browser to save all at once!')
    for (const clip of sel) { doDownload(clip.clip_id || clip.id); await new Promise(r => setTimeout(r, 600)) }
  }

  // ── YouTube + TikTok publishing ───────────────────────────────────
  const handleConnectYouTube = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/auth/youtube`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) { const data = await res.json(); window.location.href = data.url }
      else showToast('Could not start YouTube connect', 'error')
    } catch { showToast('Network error — try again', 'error') }
  }

  const handlePublishYT = async (e, clip) => {
    e.stopPropagation()
    if (!requirePlan('Publish to YouTube')) return
    if (!ytConnected) { handleConnectYouTube(); return }
    const clipId = clip.clip_id || clip.id
    const meta = clipMeta[clipId] || {}
    const hashtags = (meta.hashtags || '').split(/[\s,#]+/).filter(Boolean)
    setPublishingYT(prev => new Set([...prev, clipId]))
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/publish/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clips: [{ clip_id: clipId, video_url: clip.video_url,
            title: clip.top_title || currentJob?.video_title || 'Short Clip',
            description: meta.topic || '', tags: hashtags }]
        })
      })
      const data = await res.json()
      if (res.ok && data.results?.[0]?.status === 'success') {
        setPublishedYT(prev => new Set([...prev, clipId]))
        showToast('Published to YouTube Shorts!')
      } else if (res.status === 400 && data.detail?.includes('not connected')) {
        localStorage.removeItem('yt_connected'); setYtConnected(false); handleConnectYouTube()
      } else {
        showToast(data.results?.[0]?.error || 'YouTube publish failed', 'error')
      }
    } catch { showToast('YouTube publish failed', 'error') }
    setPublishingYT(prev => { const n = new Set(prev); n.delete(clipId); return n })
  }

  const handleBulkPublishYT = async () => {
    if (!requirePlan('Publish to YouTube')) return
    if (!ytConnected) { handleConnectYouTube(); return }
    const sel = filteredClips.filter(c =>
      selectedClipIds.has(c.clip_id || c.id) && !publishedYT.has(c.clip_id || c.id)
    )
    if (!sel.length) return
    setPublishingYT(new Set(sel.map(c => c.clip_id || c.id)))
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/publish/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clips: sel.map(c => {
            const cId = c.clip_id || c.id
            const meta = clipMeta[cId] || {}
            const hashtags = (meta.hashtags || '').split(/[\s,#]+/).filter(Boolean)
            return { clip_id: cId, video_url: c.video_url,
              title: c.top_title || currentJob?.video_title || 'Short Clip',
              description: meta.topic || '', tags: hashtags }
          })
        })
      })
      if (res.ok) {
        const data = await res.json()
        const ids = (data.results || []).filter(r => r.status === 'success').map(r => r.clip_id)
        setPublishedYT(prev => new Set([...prev, ...ids]))
        showToast(`${ids.length} clip${ids.length !== 1 ? 's' : ''} published to YouTube!`)
      } else { showToast('Bulk publish failed', 'error') }
    } catch { showToast('Bulk publish failed', 'error') }
    setPublishingYT(new Set())
  }

  const handleConnectTikTok = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/auth/tiktok`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) { const data = await res.json(); window.location.href = data.url }
      else {
        const data = await res.json()
        showToast(data.detail || 'Could not start TikTok connect', 'error')
      }
    } catch { showToast('Network error — try again', 'error') }
  }

  const handlePublishTT = async (e, clip) => {
    e.stopPropagation()
    if (!requirePlan('Publish to TikTok')) return
    if (!ttConnected) { handleConnectTikTok(); return }
    const clipId = clip.clip_id || clip.id
    const meta = clipMeta[clipId] || {}
    const hashStr = meta.hashtags ? ' ' + meta.hashtags.trim() : ''
    const baseTitle = clip.top_title || currentJob?.video_title || 'Short Clip'
    const titleStr = baseTitle.slice(0, 150 - hashStr.length) + hashStr
    setPublishingTT(prev => new Set([...prev, clipId]))
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/publish/tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clips: [{ clip_id: clipId, video_url: clip.video_url, title: titleStr }]
        })
      })
      const data = await res.json()
      const result = data.results?.[0]
      if (res.ok && result?.status === 'success') {
        setPublishedTT(prev => new Set([...prev, clipId]))
        showToast('Queued on TikTok! Video will appear in ~1 min.')
      } else if (res.status === 400 && data.detail?.includes('not connected')) {
        localStorage.removeItem('tt_connected'); setTtConnected(false); handleConnectTikTok()
      } else {
        showToast(result?.error || data.detail || 'TikTok publish failed', 'error')
      }
    } catch { showToast('TikTok publish failed', 'error') }
    setPublishingTT(prev => { const n = new Set(prev); n.delete(clipId); return n })
  }

  const handleBulkPublishTT = async () => {
    if (!requirePlan('Publish to TikTok')) return
    if (!ttConnected) { handleConnectTikTok(); return }
    const sel = filteredClips.filter(c =>
      selectedClipIds.has(c.clip_id || c.id) && !publishedTT.has(c.clip_id || c.id)
    )
    if (!sel.length) return
    setPublishingTT(new Set(sel.map(c => c.clip_id || c.id)))
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/publish/tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clips: sel.map(c => {
            const cId = c.clip_id || c.id
            const meta = clipMeta[cId] || {}
            const hashStr = meta.hashtags ? ' ' + meta.hashtags.trim() : ''
            const base = c.top_title || currentJob?.video_title || 'Short Clip'
            return { clip_id: cId, video_url: c.video_url,
              title: base.slice(0, 150 - hashStr.length) + hashStr }
          })
        })
      })
      if (res.ok) {
        const data = await res.json()
        const ids = (data.results || []).filter(r => r.status === 'success').map(r => r.clip_id)
        setPublishedTT(prev => new Set([...prev, ...ids]))
        showToast(`${ids.length} clip${ids.length !== 1 ? 's' : ''} queued on TikTok!`)
      } else { showToast('TikTok bulk publish failed', 'error') }
    } catch { showToast('TikTok bulk publish failed', 'error') }
    setPublishingTT(new Set())
  }

  const handleDraftTT = async (e, clip) => {
    e.stopPropagation()
    if (!requirePlan('Save TikTok Draft')) return
    if (!ttConnected) { handleConnectTikTok(); return }
    const clipId = clip.clip_id || clip.id
    const meta = clipMeta[clipId] || {}
    const hashStr = meta.hashtags ? ' ' + meta.hashtags.trim() : ''
    const baseTitle = clip.top_title || currentJob?.video_title || 'Short Clip'
    const titleStr = baseTitle.slice(0, 150 - hashStr.length) + hashStr
    setDraftingTT(prev => new Set([...prev, clipId]))
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/upload/tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clips: [{ clip_id: clipId, video_url: clip.video_url, title: titleStr }] })
      })
      const data = await res.json()
      const result = data.results?.[0]
      if (res.ok && result?.status === 'success') {
        setDraftedTT(prev => new Set([...prev, clipId]))
        showToast('Saved to TikTok drafts! Edit and post from the TikTok app.')
      } else if (res.status === 400 && data.detail?.includes('not connected')) {
        localStorage.removeItem('tt_connected'); setTtConnected(false); handleConnectTikTok()
      } else {
        showToast(result?.error || data.detail || 'TikTok draft failed', 'error')
      }
    } catch { showToast('TikTok draft failed', 'error') }
    setDraftingTT(prev => { const n = new Set(prev); n.delete(clipId); return n })
  }

  const handleBulkDraftTT = async () => {
    if (!requirePlan('Save TikTok Draft')) return
    if (!ttConnected) { handleConnectTikTok(); return }
    const sel = filteredClips.filter(c =>
      selectedClipIds.has(c.clip_id || c.id) && !draftedTT.has(c.clip_id || c.id)
    )
    if (!sel.length) return
    setDraftingTT(new Set(sel.map(c => c.clip_id || c.id)))
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/upload/tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clips: sel.map(c => {
            const cId = c.clip_id || c.id
            const meta = clipMeta[cId] || {}
            const hashStr = meta.hashtags ? ' ' + meta.hashtags.trim() : ''
            const base = c.top_title || currentJob?.video_title || 'Short Clip'
            return { clip_id: cId, video_url: c.video_url, title: base.slice(0, 150 - hashStr.length) + hashStr }
          })
        })
      })
      if (res.ok) {
        const data = await res.json()
        const ids = (data.results || []).filter(r => r.status === 'success').map(r => r.clip_id)
        setDraftedTT(prev => new Set([...prev, ...ids]))
        showToast(`${ids.length} clip${ids.length !== 1 ? 's' : ''} saved to TikTok drafts!`)
      } else { showToast('TikTok bulk draft failed', 'error') }
    } catch { showToast('TikTok bulk draft failed', 'error') }
    setDraftingTT(new Set())
  }

  // ── Modal ──────────────────────────────────────────────────────
  const openModal = (idx) => { setModalIdx(idx); setModalOpen(true) }
  const closeModal = () => setModalOpen(false)
  const nextModal = () => setModalIdx(i => (i + 1) % filteredClips.length)
  const prevModal = () => setModalIdx(i => (i - 1 + filteredClips.length) % filteredClips.length)

  useEffect(() => {
    const onKey = (e) => {
      if (!modalOpen) return
      if (e.key === 'Escape')      closeModal()
      if (e.key === 'ArrowRight')  nextModal()
      if (e.key === 'ArrowLeft')   prevModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, filteredClips.length]) // eslint-disable-line

  const modalClip = filteredClips[modalIdx] || null
  const modalClipId = modalClip ? (modalClip.clip_id || modalClip.id) : null

  // ── Shared style objects ───────────────────────────────────────
  const S = {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    background: '#fff',
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <AppLayout>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position:'fixed', top:'20px', right:'20px', zIndex:9999,
          background: toast.type === 'error' ? '#fef2f2' : toast.type === 'info' ? '#eff6ff' : '#f0fdf4',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : toast.type === 'info' ? '#bfdbfe' : '#bbf7d0'}`,
          color: toast.type === 'error' ? '#dc2626' : toast.type === 'info' ? '#1d4ed8' : '#16a34a',
          borderRadius:'10px', padding:'10px 16px',
          fontSize:'.82rem', fontWeight:600,
          boxShadow:'0 4px 20px rgba(0,0,0,.1)',
          display:'flex', alignItems:'center', gap:'8px',
          animation:'slideIn .2s ease',
        }}>
          {toast.type === 'error' ? '✕' : toast.type === 'info' ? 'ℹ' : '✓'} {toast.msg}
        </div>
      )}

      <main className="dashboard-page" style={{ background:'#f7f8fa', flex:1, paddingBottom:'90px' }}>

        {/* ── Platform status + stats bar ── */}
        <div style={{ background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
          <div style={{ maxWidth:'1140px', margin:'0 auto', padding:'0 24px' }}>
            {/* Row 1 — pills only. Stats live on their own row (below) so they
                never wrap awkwardly next to the pills at narrower widths. */}
            <div style={{ display:'flex', alignItems:'center', gap:'16px', minHeight:'44px', flexWrap:'wrap' }}>
              {/* Platform pills */}
              <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                {socialEnabled ? (<>
                  {ytConnected ? (
                    <div style={{
                      display:'flex', alignItems:'center', gap:'6px',
                      padding:'5px 12px', borderRadius:'8px',
                      border:'1px solid #fca5a5', background:'#fff5f5',
                      fontSize:'.72rem', fontWeight:700, color:'#dc2626',
                    }}>
                      <YTLogo size={14} />
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', display:'inline-block' }}/>
                      Connected
                    </div>
                  ) : (
                    <button onClick={handleConnectYouTube} style={{
                      display:'flex', alignItems:'center', gap:'6px',
                      padding:'5px 12px', borderRadius:'8px',
                      border:'1px solid #fca5a5', background:'#fff5f5',
                      fontSize:'.72rem', fontWeight:700, color:'#dc2626',
                      cursor:'pointer',
                    }}>
                      <YTLogo size={14} /> Connect YouTube
                    </button>
                  )}
                  {ttConnected ? (
                    <div style={{
                      display:'flex', alignItems:'center', gap:'6px',
                      padding:'5px 12px', borderRadius:'8px',
                      border:'1px solid #e9d5ff', background:'#faf5ff',
                      fontSize:'.72rem', fontWeight:700, color:'#7c3aed',
                    }}>
                      <TTLogo size={14} />
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80', display:'inline-block' }}/>
                      Connected
                    </div>
                  ) : (
                    <button onClick={handleConnectTikTok} style={{
                      display:'flex', alignItems:'center', gap:'6px',
                      padding:'5px 12px', borderRadius:'8px',
                      border:'1px solid #e9d5ff', background:'#faf5ff',
                      fontSize:'.72rem', fontWeight:700, color:'#7c3aed',
                      cursor:'pointer',
                    }}>
                      <TTLogo size={14} /> Connect TikTok
                    </button>
                  )}
                </>) : (
                  <div style={{
                    display:'flex', alignItems:'center', gap:'6px',
                    padding:'5px 12px', borderRadius:'8px',
                    border:'1px solid #e5e7eb', background:'#f9fafb',
                    fontSize:'.72rem', fontWeight:700, color:'#9ca3af',
                  }}>
                    📲 Social publishing — coming soon
                  </div>
                )}
              </div>

            </div>

            {/* Row 2 — stats. Full-width, evenly divided columns so no single
                cell (e.g. "1665h") blows out the others' widths. */}
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(7, minmax(0, 1fr))',
              borderTop:'1px solid #e5e7eb',
            }}>
              {[
                { n: user?.credits_used || 0,      l:'Shorts made',      c:'#cf1322' },
                { n: user?.videos_remaining || 0,  l:'Credits left',     c:'#16a34a' },
                { n: formatMinutes(user?.video_minutes_used),      l:'Minutes used', c:'#cf1322' },
                { n: formatMinutes(user?.video_minutes_remaining), l:'Minutes left', c:'#16a34a' },
                { n: rawClips.length,              l:'Encoding',         c:'#f59e0b' },
                { n: hdClips.length,               l:'HD ready',         c:'#1d4ed8' },
                { n: publishedYT.size + publishedTT.size, l:'Published', c:'#16a34a' },
              ].map((s, i, arr) => (
                <div key={i} style={{
                  padding:'8px 12px',
                  borderRight: i < arr.length - 1 ? '1px solid #e5e7eb' : 'none',
                  display:'flex', flexDirection:'column', justifyContent:'center',
                  minWidth:0,
                }}>
                  <div style={{
                    fontSize:'1.05rem', fontWeight:800, letterSpacing:'-.04em',
                    color:s.c, lineHeight:1.1,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>{s.n}</div>
                  <div style={{
                    fontSize:'.6rem', color:'#9ca3af', textTransform:'uppercase',
                    letterSpacing:'.08em', marginTop:3,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth:'1140px', margin:'0 auto', padding:'20px 24px 0' }}>

          {/* ── Generate panel ──
              NOTE: no `overflow:hidden` here — ClipEngine's live preview
              uses `position:sticky` while scrolling its config sections,
              and an overflow:hidden ancestor would clip/disable that. */}
          <div style={{
            background:'#fff', border:'1.5px solid #e5e7eb',
            borderRadius:'12px', marginBottom:'20px',
          }}>
            <button
              onClick={() => setShowGeneratePanel(v => !v)}
              style={{
                width:'100%', padding:'13px 18px',
                background:'none', border:'none', cursor:'pointer',
                display:'flex', alignItems:'center', gap:'10px',
                borderBottom: showGeneratePanel ? '1px solid #e5e7eb' : 'none',
              }}
            >
              <span style={{ width:8, height:8, borderRadius:'50%', background:'#cf1322', flexShrink:0 }}/>
              <span style={{ fontWeight:700, fontSize:'.88rem', color:'#111' }}>Generate Clips</span>
              <span style={{ fontSize:'.76rem', color:'#9ca3af' }}>Paste a YouTube URL to extract viral shorts</span>
              <span style={{ marginLeft:'auto', color:'#9ca3af', fontSize:'12px' }}>{showGeneratePanel ? '▲' : '▼'}</span>
            </button>
            {showGeneratePanel && (
              <div style={{ padding:'16px 18px' }}>
                <ClipEngine onJobCreated={(jobId) => {
                  fetchJobs()
                  setShowGeneratePanel(false)
                }} />
              </div>
            )}
          </div>

          {/* ── Active job progress banner ── */}
          {isActive && (
            <div style={{
              background:'#fff', border:'1.5px solid #fecaca',
              borderRadius:'12px', padding:'14px 18px',
              marginBottom:'20px', borderLeft:'4px solid #cf1322',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:'#cf1322', animation:'blink 1s infinite' }}/>
                  <span style={{ fontWeight:700, fontSize:'.85rem', color:'#111' }}>
                    {currentJob.video_title || currentJob.youtube_url}
                  </span>
                </div>
                <div style={{
                  background:'#fef2f2', color:'#cf1322', border:'1px solid #fecaca',
                  borderRadius:'100px', padding:'3px 10px',
                  fontSize:'.68rem', fontWeight:700, textTransform:'uppercase',
                }}>Processing</div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px', fontSize:'.8rem', color:'#374151', fontWeight:600 }}>
                <span>{friendlyJobStatus(currentJob)}</span>
                <span style={{ color:'#cf1322', fontWeight:800 }}>{currentJob.progress || 0}%</span>
              </div>
              <div style={{ background:'#eee', borderRadius:'100px', height:'10px', overflow:'hidden', boxShadow:'inset 0 1px 2px rgba(0,0,0,0.08)' }}>
                <div style={{
                  height:'100%', width:`${currentJob.progress || 0}%`,
                  background:'linear-gradient(90deg,#cf1322,#ff6b6b)',
                  borderRadius:'100px', transition:'width .8s cubic-bezier(0.22,0.61,0.36,1)',
                  boxShadow:'0 1px 4px rgba(207,19,34,0.5)',
                }}/>
              </div>
              <div style={{ marginTop:'8px', fontSize:'.73rem', color:'#9ca3af', display:'flex', alignItems:'center', gap:'5px' }}>
                📧 We'll email you the moment your clips are ready — feel free to close this tab.
              </div>
              {hdClips.length > 0 && (
                <div style={{ marginTop:'8px', fontSize:'.73rem', color:'#16a34a', fontWeight:600 }}>
                  ✓ {hdClips.length} clip{hdClips.length !== 1 ? 's' : ''} ready below — more generating…
                </div>
              )}
            </div>
          )}

          {/* ── Failed job banner ── */}
          {currentJob && currentJob.status === 'failed' && (
            <div style={{
              background:'#fff', border:'1.5px solid #fecaca',
              borderRadius:'12px', padding:'14px 18px',
              marginBottom:'20px', borderLeft:'4px solid #dc2626',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'12px', marginBottom:'8px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', minWidth:0 }}>
                  <span style={{ fontSize:'1.1rem' }}>⚠️</span>
                  <span style={{ fontWeight:700, fontSize:'.85rem', color:'#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {currentJob.video_title || currentJob.youtube_url}
                  </span>
                </div>
                <div style={{
                  background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca',
                  borderRadius:'100px', padding:'3px 10px',
                  fontSize:'.68rem', fontWeight:700, textTransform:'uppercase', flexShrink:0,
                }}>Failed</div>
              </div>
              <div style={{ fontSize:'.82rem', color:'#7f1d1d', lineHeight:1.5 }}>
                {currentJob.error_message || 'Something went wrong while processing this video. Please try again or contact support if the issue persists.'}
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {loading && (
            <div style={{ textAlign:'center', padding:'64px 20px' }}>
              <div style={{ width:32, height:32, border:'3px solid #fecaca', borderTopColor:'#cf1322', borderRadius:'50%', margin:'0 auto 16px', animation:'spin .8s linear infinite' }}/>
              <p style={{ fontSize:'.85rem', color:'#9ca3af' }}>Loading…</p>
            </div>
          )}

          {!loading && !currentJob && (
            <div style={{ textAlign:'center', padding:'64px 20px' }}>
              <div style={{ fontSize:'3rem', marginBottom:'16px' }}>🎬</div>
              <p style={{ fontSize:'1rem', fontWeight:700, color:'#374151', marginBottom:'8px' }}>No clips yet</p>
              <p style={{ fontSize:'.84rem', color:'#9ca3af' }}>Paste a YouTube URL above to generate your first viral shorts.</p>
            </div>
          )}

          {/* ── Phase 1: Raw clips encoding ── */}
          {rawClips.length > 0 && (
            <div style={{ background:'#fff', border:'1.5px solid #fde68a', borderRadius:'14px', overflow:'hidden', marginBottom:'20px' }}>
              {/* Section header */}
              <div style={{
                padding:'12px 18px', borderBottom:'1px solid #fde68a',
                background:'#fffbeb',
                display:'flex', alignItems:'center', gap:'10px',
              }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#f59e0b', animation:'blink 1s infinite', flexShrink:0 }}/>
                <span style={{ fontWeight:700, fontSize:'.86rem', color:'#92400e' }}>Extracting Clips</span>
                <span style={{
                  fontSize:'.68rem', fontWeight:700, padding:'2px 9px', borderRadius:'100px',
                  background:'#fef3c7', color:'#b45309', border:'1px solid #fde68a',
                }}>{rawClips.length} clip{rawClips.length !== 1 ? 's' : ''} found</span>
                <span style={{ fontSize:'.72rem', color:'#a16207', marginLeft:4 }}>
                  Encoding HD versions — will appear below when ready
                </span>
                <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:14, height:14, border:'2px solid #fde68a', borderTopColor:'#f59e0b', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
                  <span style={{ fontSize:'.7rem', color:'#a16207', fontWeight:600 }}>{currentJob?.progress || 0}%</span>
                </div>
              </div>

              {/* Square card grid */}
              <div style={{ padding:'16px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:'12px' }}>
                {rawClips.map(clip => {
                  const clipId = clip.clip_id || clip.id
                  const dur = clip.duration
                    ? `${Math.floor(clip.duration/60)}:${String(Math.round(clip.duration%60)).padStart(2,'0')}`
                    : null
                  return (
                    <div key={clipId} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {/* Square card */}
                      <div style={{
                        width:'100%', aspectRatio:'1/1', borderRadius:12,
                        overflow:'hidden', position:'relative',
                        background:'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)',
                        border:'1.5px solid #e5e7eb',
                        flexShrink:0,
                      }}>
                        {/* 360p preview video (muted, looped) */}
                        {clip.preview_url && (
                          <video
                            src={clip.preview_url}
                            muted autoPlay loop playsInline
                            controlsList="nodownload"
                            onContextMenu={e => e.preventDefault()}
                            style={{ width:'100%', height:'100%', objectFit:'cover', opacity:.45, display:'block' }}
                          />
                        )}
                        {/* Encoding overlay */}
                        <div style={{
                          position:'absolute', inset:0,
                          display:'flex', flexDirection:'column',
                          alignItems:'center', justifyContent:'center', gap:8,
                          background:'rgba(0,0,0,.35)',
                        }}>
                          <div style={{
                            width:30, height:30, borderRadius:'50%',
                            border:'2.5px solid rgba(255,255,255,.25)',
                            borderTopColor:'#fff',
                            animation:'spin 1s linear infinite',
                          }}/>
                          <span style={{
                            color:'#fff', fontSize:'.6rem', fontWeight:800,
                            textTransform:'uppercase', letterSpacing:'.12em',
                            textShadow:'0 1px 3px rgba(0,0,0,.6)',
                          }}>Encoding HD</span>
                        </div>
                        {/* Viral score */}
                        <div style={{
                          position:'absolute', top:8, right:8,
                          background:'rgba(207,19,34,.88)', color:'#fff',
                          borderRadius:6, padding:'3px 8px',
                          fontSize:'.68rem', fontWeight:800,
                          backdropFilter:'blur(4px)',
                        }}>🔥 {clip.viral_score}</div>
                        {/* Duration */}
                        {dur && (
                          <div style={{
                            position:'absolute', bottom:8, right:8,
                            background:'rgba(0,0,0,.65)', color:'#fff',
                            borderRadius:4, padding:'2px 7px',
                            fontSize:'.62rem', fontWeight:700,
                          }}>{dur}</div>
                        )}
                      </div>
                      {/* Title below card */}
                      <p style={{
                        margin:0, fontSize:'.68rem', fontWeight:600, color:'#6b7280',
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                        lineHeight:1.3,
                      }}>{clip.top_title || 'Generating…'}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Phase 2: HD clips ready ── */}
          {(hdClips.length > 0 || (!loading && currentJob && !isActive && hdClips.length === 0)) && (
            <div style={{ background:'#fff', border:'1.5px solid #e5e7eb', borderRadius:'14px', overflow:'hidden', marginBottom:'20px' }}>
              {/* Section header */}
              <div style={{
                padding:'12px 18px', borderBottom:'1px solid #e5e7eb',
                display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap',
              }}>
                <span style={{ fontWeight:700, fontSize:'.86rem', color:'#111' }}>
                  {hdClips.length > 0 ? 'Your Clips' : jobExpired ? 'Clips Expired' : 'No clips yet'}
                </span>
                {hdClips.length > 0 && (
                  <>
                    {/* 15-day soft expiry reminder — clips leave the dashboard after this. */}
                    <span style={{
                      fontSize:'.68rem', fontWeight:600, padding:'2px 9px', borderRadius:'100px',
                      background:'#fffbeb', color:'#b45309', border:'1px solid #fde68a',
                    }}>⏳ Clips last 15 days — download or publish before they expire</span>
                    <span style={{
                      fontSize:'.68rem', fontWeight:700, padding:'2px 9px', borderRadius:'100px',
                      background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0',
                    }}>{hdClips.length} HD ready</span>
                    {currentJob && (
                      <span style={{ fontSize:'.72rem', color:'#9ca3af' }}>
                        {currentJob.video_title
                          ? `"${currentJob.video_title.slice(0,50)}${currentJob.video_title.length > 50 ? '…' : ''}"`
                          : currentJob.youtube_url}
                      </span>
                    )}
                    {/* Expiry timer */}
                    {currentJob && (
                      <span style={{
                        fontSize:'.7rem', fontWeight:700,
                        color: isUrgent(currentJob.created_at) ? '#ef4444' : '#f59e0b',
                      }}>
                        {isUrgent(currentJob.created_at) ? '⚠ ' : ''}{formatTimer(currentJob.created_at)} left
                      </span>
                    )}
                    {/* Filters */}
                    <div style={{ marginLeft:'auto', display:'flex', gap:'6px' }}>
                      {['all','unpublished','expiring'].map(f => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                          padding:'4px 12px', borderRadius:'7px', border:'1px solid',
                          borderColor: filter === f ? (f==='expiring'?'#fca5a5':'#cf1322') : '#e5e7eb',
                          background: filter === f ? (f==='expiring'?'#fff5f5':'#fff0f3') : 'none',
                          color: filter === f ? (f==='expiring'?'#dc2626':'#cf1322') : '#6b7280',
                          fontSize:'.72rem', fontWeight:600, cursor:'pointer',
                        }}>
                          {f==='expiring' ? '⚠ Expiring' : f.charAt(0).toUpperCase()+f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Grid body */}
              <div style={{ padding:'16px' }}>
                {hdClips.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 20px', color:'#9ca3af', fontSize:'.84rem' }}>
                    {isActive
                      ? 'HD clips will appear here as they finish encoding…'
                      : jobExpired
                      ? '⏰ These clips have passed their 15-day window and were removed from your dashboard. Generate a new batch to get fresh ones.'
                      : 'No clips found.'}
                  </div>
                ) : filteredClips.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'24px', color:'#9ca3af', fontSize:'.84rem' }}>
                    No clips match this filter.
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:'12px' }}>
                    {filteredClips.map((clip, idx) => {
                      const clipId    = clip.clip_id || clip.id
                      const isSel     = selectedClipIds.has(clipId)
                      const ytDone    = publishedYT.has(clipId)
                      const ttDone    = publishedTT.has(clipId)
                      const ttDraft   = draftedTT.has(clipId)
                      const ytPubbing = publishingYT.has(clipId)
                      const ttPubbing = publishingTT.has(clipId)
                      const ttDrafting = draftingTT.has(clipId)
                      const allDone   = ytDone && (ttDone || ttDraft)
                      const urgent    = currentJob && isUrgent(currentJob.created_at)
                      const dur = clip.duration
                        ? `${Math.floor(clip.duration/60)}:${String(Math.round(clip.duration%60)).padStart(2,'0')}`
                        : null

                      return (
                        <div key={clipId} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {/* Square card */}
                          <div
                            onClick={() => openModal(idx)}
                            style={{
                              width:'100%', aspectRatio:'1/1', borderRadius:12,
                              overflow:'hidden', position:'relative', cursor:'pointer',
                              border:`2px solid ${isSel ? '#cf1322' : allDone ? '#bbf7d0' : urgent ? '#fca5a5' : '#e5e7eb'}`,
                              boxShadow: isSel ? '0 0 0 3px rgba(207,19,34,.12)' : '0 2px 8px rgba(0,0,0,.07)',
                              transition:'all .15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform='scale(1.02)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,.14)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow=isSel?'0 0 0 3px rgba(207,19,34,.12)':'0 2px 8px rgba(0,0,0,.07)' }}
                          >
                            {/* Thumbnail */}
                            {clip.thumbnail_url ? (
                              <img
                                src={clip.thumbnail_url}
                                alt=""
                                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                              />
                            ) : (
                              <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)' }}/>
                            )}

                            {/* Checkbox top-left */}
                            <div
                              onClick={e => toggleSelect(e, clipId)}
                              style={{
                                position:'absolute', top:8, left:8,
                                width:22, height:22, borderRadius:6,
                                background: isSel ? '#cf1322' : 'rgba(255,255,255,.88)',
                                border:`2px solid ${isSel ? '#cf1322' : 'rgba(0,0,0,.15)'}`,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize:10, color:'#fff', fontWeight:900, cursor:'pointer',
                                backdropFilter:'blur(4px)',
                              }}
                            >{isSel && '✓'}</div>

                            {/* Viral score top-right */}
                            <div style={{
                              position:'absolute', top:8, right:8,
                              background:'rgba(207,19,34,.88)', color:'#fff',
                              borderRadius:6, padding:'3px 8px',
                              fontSize:'.68rem', fontWeight:800,
                              backdropFilter:'blur(4px)',
                            }}>🔥 {clip.viral_score}</div>

                            {/* HD badge */}
                            <div style={{
                              position:'absolute', top:36, right:8,
                              background:'rgba(22,163,74,.9)', color:'#fff',
                              borderRadius:4, padding:'2px 6px',
                              fontSize:'.55rem', fontWeight:900,
                            }}>HD</div>

                            {/* Duration bottom-right */}
                            {dur && (
                              <div style={{
                                position:'absolute', bottom:8, right:8,
                                background:'rgba(0,0,0,.65)', color:'#fff',
                                borderRadius:4, padding:'2px 7px',
                                fontSize:'.62rem', fontWeight:700,
                              }}>{dur}</div>
                            )}

                            {/* Published badges bottom-left */}
                            {(ytDone || ttDone) && (
                              <div style={{ position:'absolute', bottom:8, left:8, display:'flex', gap:3 }}>
                                {ytDone && (
                                  <div style={{ background:'rgba(220,38,38,.9)', borderRadius:4, padding:'2px 6px', fontSize:'.55rem', fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:3 }}>
                                    <YTLogo size={8} /> ✓
                                  </div>
                                )}
                                {ttDone && (
                                  <div style={{ background:'rgba(1,1,1,.9)', borderRadius:4, padding:'2px 6px', fontSize:'.55rem', fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:3 }}>
                                    <TTLogo size={8} /> ✓
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Play overlay */}
                            <div
                              className="play-overlay"
                              style={{
                                position:'absolute', inset:0,
                                background:'rgba(0,0,0,0)',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                opacity:0, transition:'opacity .15s',
                                pointerEvents:'none',
                              }}
                            >
                              <div style={{
                                width:44, height:44, borderRadius:'50%',
                                background:'rgba(255,255,255,.92)',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                boxShadow:'0 4px 16px rgba(0,0,0,.25)',
                              }}>
                                <span style={{ fontSize:16, marginLeft:3, color:'#111' }}>▶</span>
                              </div>
                            </div>
                          </div>

                          {/* Clip title */}
                          <p style={{
                            margin:0, fontSize:'.68rem', fontWeight:700, color:'#374151',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          }}>{clip.top_title || 'Clip'}</p>

                          {/* Action buttons row */}
                          <div style={{ display:'flex', gap:4 }}>
                            {socialEnabled ? (<>
                            <button
                              onClick={e => handlePublishYT(e, clip)}
                              disabled={ytPubbing || ytDone}
                              title={ytDone ? 'Published to YouTube' : ytConnected ? 'Publish to YouTube Shorts' : 'Connect YouTube to publish'}
                              style={{
                                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:3,
                                padding:'5px 4px', borderRadius:7, fontSize:'.6rem', fontWeight:700,
                                border: ytDone ? '1px solid #bbf7d0' : '1px solid #fca5a5',
                                background: ytDone ? '#f0fdf4' : '#fff5f5',
                                color: ytDone ? '#16a34a' : '#dc2626',
                                cursor: (ytPubbing || ytDone) ? 'default' : 'pointer',
                                opacity: ytPubbing ? 0.7 : 1,
                              }}
                            >
                              <YTLogo size={10} /><span style={{fontSize:'.5rem'}}>{ytPubbing ? '…' : ytDone ? '✓' : 'Post'}</span>
                            </button>
                            {/* TikTok: publish + draft split */}
                            <div style={{ flex:1, display:'flex', gap:2 }}>
                              <button
                                onClick={e => handlePublishTT(e, clip)}
                                disabled={ttPubbing || ttDone}
                                title={ttDone ? 'Published to TikTok' : 'Publish to TikTok'}
                                style={{
                                  flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:2,
                                  padding:'5px 2px', borderRadius:7, fontSize:'.55rem', fontWeight:700,
                                  border: ttDone ? '1px solid #d8b4fe' : '1px solid #e9d5ff',
                                  background: ttDone ? '#faf5ff' : '#fdf4ff',
                                  color: ttDone ? '#7c3aed' : '#9333ea',
                                  cursor: (ttPubbing || ttDone) ? 'default' : 'pointer',
                                  opacity: ttPubbing ? 0.7 : 1,
                                }}
                              >
                                <TTLogo size={9} /><span style={{fontSize:'.5rem'}}>{ttPubbing ? '…' : ttDone ? '✓' : 'Post'}</span>
                              </button>
                              <button
                                onClick={e => handleDraftTT(e, clip)}
                                disabled={ttDrafting || ttDraft}
                                title={ttDraft ? 'Saved to TikTok drafts' : 'Save to TikTok drafts'}
                                style={{
                                  flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:2,
                                  padding:'5px 2px', borderRadius:7, fontSize:'.55rem', fontWeight:700,
                                  border: ttDraft ? '1px solid #d8b4fe' : '1px solid #e9d5ff',
                                  background: ttDraft ? '#faf5ff' : '#fdf4ff',
                                  color: ttDraft ? '#7c3aed' : '#9333ea',
                                  cursor: (ttDrafting || ttDraft) ? 'default' : 'pointer',
                                  opacity: ttDrafting ? 0.7 : 1,
                                }}
                              >
                                <TTLogo size={9} /><span style={{fontSize:'.5rem'}}>{ttDrafting ? '…' : ttDraft ? '✓' : 'Draft'}</span>
                              </button>
                            </div>
                            </>) : (
                              <div title="Social publishing coming soon" style={{
                                flex:1, display:'flex', alignItems:'center', justifyContent:'center',
                                padding:'5px 4px', borderRadius:7, fontSize:'.5rem', fontWeight:700,
                                border:'1px solid #e5e7eb', background:'#f9fafb', color:'#9ca3af',
                              }}>Coming soon</div>
                            )}
                            <button
                              onClick={e => handleSingleDownload(e, clip)}
                              title={isPaid ? 'Download MP4' : canFreeDownload(clip) ? 'Download free (feedback reward)' : 'Upgrade to download'}
                              style={{
                                padding:'5px 7px', borderRadius:7,
                                border: (isPaid || canFreeDownload(clip)) ? '1px solid #e5e7eb' : '1px solid #cf1322',
                                background: (isPaid || canFreeDownload(clip)) ? '#f9fafb' : '#fef2f2',
                                color: (isPaid || canFreeDownload(clip)) ? '#374151' : '#cf1322', cursor:'pointer', fontSize:'.7rem',
                              }}
                            >{isPaid ? '⬇' : canFreeDownload(clip) ? '🎁' : '💳'}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Bulk action bar ── */}
      {selectedClipIds.size > 0 && (
        <div style={{
          position:'fixed', bottom:0, left:SIDEBAR_W, right:0,
          background:'rgba(255,255,255,.97)', borderTop:'1.5px solid #e5e7eb',
          padding:'11px 24px', zIndex:500,
          display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap',
          backdropFilter:'blur(12px)',
        }}>
          <span style={{ fontWeight:700, fontSize:'.84rem', color:'#111' }}>
            {selectedClipIds.size} clip{selectedClipIds.size !== 1 ? 's' : ''} selected
          </span>
          <div style={{ width:1, height:20, background:'#e5e7eb' }}/>
          <button onClick={handleBulkDownload} style={{
            background: isPaid ? '#111' : '#cf1322', color:'#fff', border:'none',
            borderRadius:7, padding:'7px 16px', fontWeight:700, fontSize:'.76rem', cursor:'pointer',
          }}>{isPaid ? '⬇ Download' : '💳 Upgrade to Download'}</button>
          {socialEnabled && (<>
          <button onClick={handleBulkPublishYT} style={{
            display:'flex', alignItems:'center', gap:7,
            background:'#fff5f5', color:'#dc2626', border:'1px solid #fca5a5',
            borderRadius:7, padding:'7px 16px', fontWeight:700, fontSize:'.76rem', cursor:'pointer',
          }}>
            <YTLogo size={14} /> Publish to YouTube
          </button>
          <button onClick={handleBulkPublishTT} style={{
            display:'flex', alignItems:'center', gap:7,
            background:'#faf5ff', color:'#7c3aed', border:'1px solid #e9d5ff',
            borderRadius:7, padding:'7px 16px', fontWeight:700, fontSize:'.76rem', cursor:'pointer',
          }}>
            <TTLogo size={14} /> Post to TikTok
          </button>
          <button onClick={handleBulkDraftTT} style={{
            display:'flex', alignItems:'center', gap:7,
            background:'#fff', color:'#7c3aed', border:'1px solid #e9d5ff',
            borderRadius:7, padding:'7px 16px', fontWeight:700, fontSize:'.76rem', cursor:'pointer',
          }}>
            <TTLogo size={14} /> Save TikTok Draft
          </button>
          </>)}
          <div style={{ width:1, height:20, background:'#e5e7eb' }}/>
          <button onClick={() => setSelectedClipIds(new Set())} style={{
            background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:'.76rem',
          }}>Clear</button>
        </div>
      )}

      {/* ══ VIDEO PREVIEW MODAL ══ */}
      {modalOpen && modalClip && (
        <div
          onClick={closeModal}
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.6)',
            zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center',
            padding:20, backdropFilter:'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:'#fff', borderRadius:16, width:'100%', maxWidth:800,
              maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column',
              boxShadow:'0 24px 80px rgba(0,0,0,.3)',
            }}
          >
            {/* Modal header */}
            <div style={{
              padding:'13px 18px', borderBottom:'1px solid #e5e7eb',
              display:'flex', alignItems:'center', gap:10, flexShrink:0,
            }}>
              <span style={{ flex:1, fontSize:'.88rem', fontWeight:700, color:'#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {currentJob?.video_title || 'Clip Preview'}
              </span>
              <span style={{ background:'#fff0f3', color:'#cf1322', border:'1px solid #fecaca', borderRadius:7, padding:'3px 10px', fontSize:'.76rem', fontWeight:800 }}>
                🔥 {modalClip.viral_score}
              </span>
              {currentJob && (
                <span style={{
                  fontSize:'.74rem', fontWeight:600,
                  color: isUrgent(currentJob.created_at) ? '#ef4444' : '#f59e0b',
                }}>
                  {isUrgent(currentJob.created_at) ? '⚠ ' : ''}{formatTimer(currentJob.created_at)} left
                </span>
              )}
              <button onClick={closeModal} style={{
                width:30, height:30, borderRadius:7, border:'1px solid #e5e7eb',
                background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:14, color:'#6b7280',
              }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>
              {/* Video panel */}
              <div style={{ flexShrink:0, background:'#000', padding:'16px 12px 16px 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ width:190, aspectRatio:'9/16', position:'relative', overflow:'hidden', borderRadius:10 }}>
                  <video
                    key={modalClip.clip_id || modalClip.id}
                    src={modalClip.video_url || modalClip.preview_url}
                    controls
                    controlsList="nodownload"
                    onContextMenu={e => e.preventDefault()}
                    poster={modalClip.thumbnail_url || undefined}
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                  />
                  {/* Score overlay */}
                  <div style={{
                    position:'absolute', top:10, right:10, zIndex:5,
                    background:'rgba(207,19,34,.9)', color:'#fff',
                    fontSize:12, fontWeight:900, padding:'4px 8px', borderRadius:7,
                    pointerEvents:'none',
                  }}>🔥 {modalClip.viral_score}</div>
                  <div style={{
                    position:'absolute', top:10, left:10, zIndex:5,
                    background:'rgba(22,163,74,.9)', color:'#fff',
                    fontSize:'.52rem', fontWeight:900, padding:'2px 5px', borderRadius:4,
                    pointerEvents:'none',
                  }}>HD</div>
                </div>
              </div>

              {/* Info panel */}
              <div style={{ flex:1, padding:'18px 20px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>

                {/* Score bar */}
                <div>
                  <div style={{ fontSize:'.62rem', textTransform:'uppercase', letterSpacing:'.1em', fontWeight:700, color:'#9ca3af', marginBottom:6 }}>Viral Score</div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:'1.5rem', fontWeight:900, letterSpacing:'-.06em', color:'#cf1322', lineHeight:1 }}>{modalClip.viral_score}</span>
                    <div style={{ flex:1, height:6, background:'#f3f4f6', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${modalClip.viral_score}%`, background:'linear-gradient(90deg,#cf1322,#ff6b6b)', borderRadius:3 }}/>
                    </div>
                    <span style={{ fontSize:'.72rem', color:'#9ca3af' }}>/100</span>
                  </div>
                </div>

                {/* Meta */}
                {currentJob && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <div style={{ fontSize:'.62rem', textTransform:'uppercase', letterSpacing:'.1em', fontWeight:700, color:'#9ca3af', marginBottom:3 }}>Expires</div>
                      <div style={{ fontSize:'.82rem', color: isUrgent(currentJob.created_at) ? '#ef4444' : '#374151', fontWeight:600 }}>
                        {isUrgent(currentJob.created_at) ? '⚠ ' : ''}{formatTimer(currentJob.created_at)} left
                      </div>
                    </div>
                    {modalClip.duration && (
                      <div>
                        <div style={{ fontSize:'.62rem', textTransform:'uppercase', letterSpacing:'.1em', fontWeight:700, color:'#9ca3af', marginBottom:3 }}>Duration</div>
                        <div style={{ fontSize:'.82rem', color:'#374151', fontWeight:600 }}>
                          {Math.floor(modalClip.duration / 60)}:{String(modalClip.duration % 60).padStart(2,'0')}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Topic & Hashtags — optional per-clip info used when publishing */}
                <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:'11px 13px' }}>
                  <div style={{ fontSize:'.62rem', textTransform:'uppercase', letterSpacing:'.1em', fontWeight:700, color:'#9ca3af', marginBottom:8 }}>
                    Topic & Hashtags <span style={{ textTransform:'none', letterSpacing:'normal', fontWeight:400 }}>(optional — used when publishing)</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    <div>
                      <label style={{ fontSize:'.7rem', fontWeight:600, color:'#374151', display:'block', marginBottom:3 }}>Topic / Description</label>
                      <input
                        type="text"
                        placeholder="e.g. How to grow on YouTube in 2025"
                        value={clipMeta[modalClipId]?.topic || ''}
                        onChange={e => updateClipMeta(modalClipId, 'topic', e.target.value)}
                        style={{
                          width:'100%', padding:'6px 10px', borderRadius:6,
                          border:'1px solid #e5e7eb', fontSize:'.76rem', outline:'none',
                          boxSizing:'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize:'.7rem', fontWeight:600, color:'#374151', display:'block', marginBottom:3 }}>Hashtags</label>
                      <input
                        type="text"
                        placeholder="#shorts #viral #youtube"
                        value={clipMeta[modalClipId]?.hashtags || ''}
                        onChange={e => updateClipMeta(modalClipId, 'hashtags', e.target.value)}
                        style={{
                          width:'100%', padding:'6px 10px', borderRadius:6,
                          border:'1px solid #e5e7eb', fontSize:'.76rem', outline:'none',
                          boxSizing:'border-box',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* YouTube publish section */}
                {socialEnabled ? (
                <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ padding:'9px 13px', background:'#fafafa', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:8 }}>
                    <YTLogo size={16} />
                    <span style={{ fontSize:'.8rem', fontWeight:700, flex:1 }}>YouTube Shorts</span>
                    <span style={{
                      fontSize:'.65rem', fontWeight:700, padding:'2px 8px', borderRadius:8,
                      background: ytConnected ? '#dcfce7' : '#f3f4f6',
                      color: ytConnected ? '#16a34a' : '#6b7280',
                    }}>
                      {ytConnected ? '● Connected' : 'Not connected'}
                    </span>
                  </div>
                  <div style={{ padding:'11px 13px' }}>
                    {publishedYT.has(modalClipId) ? (
                      <div style={{ fontSize:'.74rem', color:'#16a34a', fontWeight:600 }}>✓ Published to YouTube Shorts</div>
                    ) : ytConnected ? (
                      <button
                        onClick={e => handlePublishYT(e, modalClip)}
                        disabled={publishingYT.has(modalClipId)}
                        style={{
                          width:'100%', padding:'7px 16px', borderRadius:7, fontSize:'.75rem', fontWeight:700,
                          background: publishingYT.has(modalClipId) ? '#f3f4f6' : '#fff5f5',
                          color: publishingYT.has(modalClipId) ? '#9ca3af' : '#dc2626',
                          border: `1px solid ${publishingYT.has(modalClipId) ? '#d1d5db' : '#fca5a5'}`,
                          cursor: publishingYT.has(modalClipId) ? 'default' : 'pointer',
                        }}
                      >
                        {publishingYT.has(modalClipId) ? 'Uploading…' : 'Publish to YouTube Shorts'}
                      </button>
                    ) : (
                      <button
                        onClick={handleConnectYouTube}
                        style={{
                          width:'100%', padding:'7px 16px', borderRadius:7, fontSize:'.75rem', fontWeight:700,
                          background:'#fff5f5', color:'#dc2626', border:'1px solid #fca5a5', cursor:'pointer',
                        }}
                      >
                        Connect YouTube
                      </button>
                    )}
                  </div>
                </div>
                ) : (
                <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:'11px 13px', background:'#f9fafb', display:'flex', alignItems:'center', gap:8 }}>
                  <YTLogo size={14} />
                  <span style={{ fontSize:'.74rem', color:'#9ca3af', fontWeight:600 }}>YouTube Shorts — coming soon</span>
                </div>
                )}

                {/* TikTok section */}
                {socialEnabled ? (
                <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
                  <div style={{ padding:'9px 13px', background:'#fafafa', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:8 }}>
                    <TTLogo size={16} />
                    <span style={{ fontSize:'.8rem', fontWeight:700, flex:1 }}>TikTok</span>
                    <span style={{
                      fontSize:'.65rem', fontWeight:700, padding:'2px 8px', borderRadius:8,
                      background: ttConnected ? '#f3e8ff' : '#f3f4f6',
                      color: ttConnected ? '#7c3aed' : '#6b7280',
                    }}>
                      {ttConnected ? '● Connected' : 'Not connected'}
                    </span>
                  </div>
                  <div style={{ padding:'11px 13px', display:'flex', flexDirection:'column', gap:6 }}>
                    {ttConnected ? (<>
                      {/* Publish directly */}
                      {publishedTT.has(modalClipId) ? (
                        <div style={{ fontSize:'.74rem', color:'#7c3aed', fontWeight:600 }}>✓ Published to TikTok</div>
                      ) : (
                        <button
                          onClick={e => handlePublishTT(e, modalClip)}
                          disabled={publishingTT.has(modalClipId)}
                          style={{
                            width:'100%', padding:'7px 16px', borderRadius:7, fontSize:'.75rem', fontWeight:700,
                            background: publishingTT.has(modalClipId) ? '#f3f4f6' : '#faf5ff',
                            color: publishingTT.has(modalClipId) ? '#9ca3af' : '#7c3aed',
                            border: `1px solid ${publishingTT.has(modalClipId) ? '#d1d5db' : '#e9d5ff'}`,
                            cursor: publishingTT.has(modalClipId) ? 'default' : 'pointer',
                          }}
                        >
                          {publishingTT.has(modalClipId) ? 'Uploading…' : 'Publish to TikTok'}
                        </button>
                      )}
                      {/* Save as draft */}
                      {draftedTT.has(modalClipId) ? (
                        <div style={{ fontSize:'.74rem', color:'#7c3aed', fontWeight:600 }}>✓ Saved to TikTok drafts</div>
                      ) : (
                        <button
                          onClick={e => handleDraftTT(e, modalClip)}
                          disabled={draftingTT.has(modalClipId)}
                          style={{
                            width:'100%', padding:'7px 16px', borderRadius:7, fontSize:'.75rem', fontWeight:700,
                            background: draftingTT.has(modalClipId) ? '#f3f4f6' : '#fff',
                            color: draftingTT.has(modalClipId) ? '#9ca3af' : '#7c3aed',
                            border: `1px solid ${draftingTT.has(modalClipId) ? '#d1d5db' : '#e9d5ff'}`,
                            cursor: draftingTT.has(modalClipId) ? 'default' : 'pointer',
                          }}
                        >
                          {draftingTT.has(modalClipId) ? 'Saving…' : 'Save to TikTok Drafts'}
                        </button>
                      )}
                    </>) : (
                      <button
                        onClick={handleConnectTikTok}
                        style={{
                          width:'100%', padding:'7px 16px', borderRadius:7, fontSize:'.75rem', fontWeight:700,
                          background:'#faf5ff', color:'#7c3aed', border:'1px solid #e9d5ff', cursor:'pointer',
                        }}
                      >
                        Connect TikTok
                      </button>
                    )}
                  </div>
                </div>
                ) : (
                <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:'11px 13px', background:'#f9fafb', display:'flex', alignItems:'center', gap:8 }}>
                  <TTLogo size={14} />
                  <span style={{ fontSize:'.74rem', color:'#9ca3af', fontWeight:600 }}>TikTok — coming soon</span>
                </div>
                )}

                {/* Download */}
                <button onClick={e => { handleSingleDownload(e, modalClip); if (isPaid || canFreeDownload(modalClip)) closeModal() }} style={{
                  width:'100%', padding:'9px', borderRadius:8,
                  border: (isPaid || canFreeDownload(modalClip)) ? '1px solid #e5e7eb' : '1px solid #cf1322',
                  background: (isPaid || canFreeDownload(modalClip)) ? '#111' : '#cf1322',
                  color:'#fff',
                  fontSize:'.78rem', fontWeight:700, cursor:'pointer', textAlign:'center',
                }}>{isPaid ? '⬇ Download MP4' : canFreeDownload(modalClip) ? '🎁 Free Download' : '💳 Upgrade to Download'}</button>
              </div>
            </div>

            {/* Modal footer — prev/next nav */}
            <div style={{
              padding:'10px 18px', borderTop:'1px solid #e5e7eb',
              display:'flex', alignItems:'center', gap:8,
              background:'#fafafa', flexShrink:0,
            }}>
              <button onClick={prevModal} style={{
                padding:'6px 14px', borderRadius:7, border:'1px solid #e5e7eb',
                background:'#fff', color:'#6b7280', fontSize:'.76rem', cursor:'pointer',
              }}>← Prev</button>
              <span style={{ flex:1, textAlign:'center', fontSize:'.73rem', color:'#9ca3af' }}>
                Clip {modalIdx + 1} of {filteredClips.length}
              </span>
              <button onClick={nextModal} style={{
                padding:'6px 14px', borderRadius:7, border:'1px solid #e5e7eb',
                background:'#fff', color:'#6b7280', fontSize:'.76rem', cursor:'pointer',
              }}>Next →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Social proof ── */}
      {showSocialProofModal && (
        <SocialProofModal onClose={() => setShowSocialProofModal(false)} />
      )}

      {/* ── Upgrade Modal ── */}
      {showUpgradeModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:1100, padding:20,
        }}>
          <div style={{
            background:'#fff', border:'2px solid #111',
            borderRadius:16, boxShadow:'6px 6px 0 #cf1322',
            maxWidth:460, width:'100%', padding:32,
          }}>
            <div style={{
              width:48, height:48, background:'#fef2f2', borderRadius:12,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1.4rem', marginBottom:16,
            }}>🔒</div>
            <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#111', marginBottom:8 }}>{upgradeReason}</h2>
            <p style={{ fontSize:'.875rem', color:'#666', lineHeight:1.6, marginBottom:24 }}>
              This feature requires a paid plan. Free accounts get <strong style={{ color:'#cf1322' }}>3 free generations</strong> to try ShortClipr.
              Upgrade to unlock downloads, the editor, and unlimited shorts.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
              {[
                { name:'Starter', price:'$10/mo', perks:'50 shorts · Editor · Downloads' },
                { name:'Pro',     price:'$45/mo', perks:'350 shorts · Priority · Everything' },
              ].map(plan => (
                <div key={plan.name} style={{
                  border:'1px solid #e5e5e5', borderRadius:10, padding:'14px 16px',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:'.9rem', color:'#111' }}>{plan.name}</div>
                    <div style={{ fontSize:'.75rem', color:'#999', marginTop:2 }}>{plan.perks}</div>
                  </div>
                  <span style={{ fontWeight:700, color:'#cf1322' }}>{plan.price}</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:12 }}>
              <a href="/youtube-shorts" onClick={() => setShowUpgradeModal(false)} style={{
                flex:1, textAlign:'center',
                background:'#cf1322', color:'#fff',
                border:'2px solid #111', borderRadius:8,
                padding:12, fontWeight:700, fontSize:'.875rem',
                boxShadow:'2px 2px 0 #111', textDecoration:'none', display:'block',
              }}>View plans →</a>
              <button onClick={() => setShowUpgradeModal(false)} style={{
                background:'transparent', border:'1.5px solid #e5e5e5',
                borderRadius:8, color:'#666', padding:'12px 20px',
                cursor:'pointer', fontWeight:600, fontSize:'.875rem',
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes blink   { 50% { opacity: 0 } }
        @keyframes slideIn { from { transform: translateY(-8px); opacity:0 } to { transform: translateY(0); opacity:1 } }
        div:hover > .play-overlay { opacity: 1 !important; background: rgba(0,0,0,.28) !important; }
      `}</style>
    </AppLayout>
  )
}
