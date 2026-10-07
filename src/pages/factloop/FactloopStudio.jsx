// FactloopStudio.jsx — the Factloop creator + clips history.
//
// Swiss minimal design, same chassis as BrainrotStudio (white surfaces, thin
// borders, Inter throughout) restyled with the cyan Factloop theme. Fully
// automatic pipeline: no character casting, no script review — 4 stages
// (Subject → Facts → Look → Generate) collect what's needed, then one
// click reserves a credit and runs script + AI image + TTS + render
// straight through with no gate in between.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { factloopApi } from './factloopApi'
import { T, card, pill, btn, pressHandlers, FONT } from './factloopTheme'
import { ClipTile } from './factloopShared'
import Logo from '../../components/Logo'
import { YTLogo, TTLogo } from '../../components/PlatformLogos'
import ErrorModal from './ErrorModal'
import { friendlyError } from './errorHelpers'
import {
  CAPTION_PRESETS, CAPTION_TRENDING, CAPTION_STYLE_BY_ID,
  CAPTION_COLORS, CAPTION_COLOR_BY_ID, DEFAULT_CAPTION_COLOR, DEFAULT_CAPTION_Y,
} from './captionStyles'

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]
const MAX_FACTS = 8
// Mirrors ACTIVE_JOB_STATUSES-equivalent handling in backend/app/pipeline/
// factloop_stage.py — Factloop has no 'awaiting_review' gate (no review
// step exists), so this is simpler than Brainrot's list.
const ACTIVE_STATUSES = ['created', 'generating_script', 'synthesizing_voice', 'api_done', 'rendering']
const CLIPS_PAGE_SIZE = 24
// Mirrors MUSIC_DUCK_FACTOR in backend/app/pipeline/factloop_composite.py.
const MUSIC_DUCK_FACTOR = 0.35

const STAGES = [
  { id: 'subject',  label: 'Subject',  title: 'Subject',  hint: 'What is this video about?' },
  { id: 'facts',    label: 'Facts',    title: 'Facts',    hint: 'Add the numbers the narrator will call out.' },
  { id: 'look',     label: 'Look',     title: 'Look',     hint: 'Gameplay, voice, captions, music.' },
  { id: 'generate', label: 'Generate', title: 'Generate', hint: 'Everything at a glance.' },
]
const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]))

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// YouTube/TikTok connect + publish gated to this one account while both
// platforms are pending app review — same beta gate BrainrotStudio uses.

function slugifyKey(label, existing) {
  let base = (label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!base) base = 'fact'
  base = base.slice(0, 30)
  let key = base, i = 2
  while (existing.includes(key)) { key = `${base}_${i}`; i += 1 }
  return key
}

function isActive(job) { return !!job && ACTIVE_STATUSES.includes(job.status) }

export default function FactloopStudio() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const socialEnabled = user?.plan === 'marketer'

  // ── Reference data ──────────────────────────────────────────────
  const [clipsLib, setClipsLib] = useState([])
  const [voices, setVoices]     = useState([])
  const [musicLib, setMusicLib] = useState([])
  const [clipsOnline, setClipsOnline] = useState(true)
  const [refetchTick, setRefetchTick] = useState(0)
  const [refLoaded, setRefLoaded]     = useState(false)

  // ── View / stage ─────────────────────────────────────────────────
  const [stage, setStage] = useState('subject')
  const [view, setView]   = useState('create')   // 'create' | 'clips'

  // ── Subject / Facts ──────────────────────────────────────────────
  const [title, setTitle]     = useState('')
  const [context, setContext] = useState('')
  const [facts, setFacts]     = useState([{ key: 'fact_1', label: '', value: '', unit: '' }])

  // ── Look ─────────────────────────────────────────────────────────
  const [background, setBackground] = useState(null)
  const [category, setCategory]     = useState('all')
  const [duration, setDuration]     = useState(30)
  const [voiceId, setVoiceId]       = useState('')
  const [captionStyle, setCaption]  = useState('brainrot')
  const [captionColor, setCaptionColor] = useState(DEFAULT_CAPTION_COLOR)
  const [captionY, setCaptionY] = useState(DEFAULT_CAPTION_Y)
  const [showMoreStyles, setShowMoreStyles] = useState(false)
  const [musicId, setMusicId]       = useState('')
  const [musicVolume, setMusicVolume] = useState(0.3)

  // ── Post metadata (auto-generated, user-editable) ────────────────
  const [postTitle, setPostTitle]       = useState('')
  const [postHashtags, setPostHashtags] = useState([])
  const [metaLoading, setMetaLoading]   = useState(false)
  const metaTimerRef = useRef(null)

  // ── Publish modal / errors / toast ───────────────────────────────
  const [publishModal, setPublishModal] = useState(null)
  const [errorModal, setErrorModal] = useState(null)
  const [toast, setToast] = useState(null)

  // ── Social connectivity ──────────────────────────────────────────
  const [ytConnected, setYtConnected] = useState(false)
  const [ttConnected, setTtConnected] = useState(false)
  const [publishedYT,  setPublishedYT]  = useState(new Set())
  const [publishingYT, setPublishingYT] = useState(new Set())
  const [publishedTT,  setPublishedTT]  = useState(new Set())
  const [publishingTT, setPublishingTT] = useState(new Set())
  const [draftedTT,    setDraftedTT]    = useState(new Set())

  // ── Job state ─────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [activeJob, setActiveJob]   = useState(null)
  const [myClips, setMyClips]       = useState([])
  const [resumeActiveJobId, setResumeActiveJobId] = useState(null)
  const pollRef = useRef(null)
  const audioRef = useRef(null)
  const [previewingUrl, setPreviewingUrl] = useState(null)

  // ── My clips library — paginated, server-filtered ────────────────
  const [clipsFilter, setClipsFilter]           = useState('all')
  const [clipsCounts, setClipsCounts]           = useState({ all: 0, active: 0, complete: 0, queued: 0 })
  const [clipsOffset, setClipsOffset]           = useState(0)
  const [clipsHasMore, setClipsHasMore]         = useState(false)
  const [clipsLoadingMore, setClipsLoadingMore] = useState(false)

  const loadClipsPage = useCallback(async (status, offset, append) => {
    if (append) setClipsLoadingMore(true)
    try {
      const data = await factloopApi.listClips({ status, limit: CLIPS_PAGE_SIZE, offset })
      setMyClips(prev => append ? [...prev, ...(data.clips || [])] : (data.clips || []))
      setClipsCounts(data.counts || { all: 0, active: 0, complete: 0, queued: 0 })
      setClipsHasMore(!!data.has_more)
      setClipsOffset(offset + (data.clips || []).length)
    } catch { /* keep whatever's currently loaded */ }
    finally { if (append) setClipsLoadingMore(false) }
  }, [])

  const changeClipsFilter = (status) => { setClipsFilter(status); loadClipsPage(status, 0, false) }
  const loadMoreClips = () => loadClipsPage(clipsFilter, clipsOffset, true)

  // ── Load reference data + history ───────────────────────────────
  useEffect(() => {
    let alive = true
    Promise.allSettled([
      factloopApi.voices(),
      factloopApi.gameplayClips(),
      factloopApi.listClips({ status: 'all', limit: CLIPS_PAGE_SIZE, offset: 0 }),
      factloopApi.audioAssets('music'),
    ]).then(([v, g, j, m]) => {
      if (!alive) return
      if (v.status === 'fulfilled') setVoices((v.value.voices || []).filter(voice => voice.provider !== 'lemonfox'))
      if (g.status === 'fulfilled') { setClipsLib(g.value.clips || []); setClipsOnline(true) }
      else setClipsOnline(false)
      if (j.status === 'fulfilled') {
        const clips = j.value.clips || []
        setMyClips(clips)
        setClipsCounts(j.value.counts || { all: 0, active: 0, complete: 0, queued: 0 })
        setClipsHasMore(!!j.value.has_more)
        setClipsOffset(clips.length)
        const stillActive = clips.find(isActive)
        if (stillActive) setResumeActiveJobId(stillActive.job_id)
      }
      if (m.status === 'fulfilled') {
        const assets = m.value.assets || []
        setMusicLib(assets)
        const wii = assets.find(a => a.name?.toLowerCase().includes('wii shop'))
        if (wii) setMusicId(wii.id)
      }
      setRefLoaded(true)
    })
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current) }
  }, [refetchTick])

  // Default narrator voice once voices load, if none picked yet.
  useEffect(() => {
    if (!refLoaded || voiceId || voices.length === 0) return
    setVoiceId(voices[0].voice_id)
  }, [refLoaded, voices]) // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (msg, type = 'info') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3200) }

  // ── Social connect: detect callback URL params + verify server state ──
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const statusParam = params.get('status')
    if (statusParam === 'youtube_connected') {
      localStorage.setItem('yt_connected', 'true'); setYtConnected(true)
      showToast('YouTube connected!', 'ok')
      setView('clips')
      window.history.replaceState({}, '', '/factloop/studio')
    } else if (statusParam === 'tiktok_connected') {
      localStorage.setItem('tt_connected', 'true'); setTtConnected(true)
      showToast('TikTok connected!', 'ok')
      setView('clips')
      window.history.replaceState({}, '', '/factloop/studio')
    } else if (statusParam === 'youtube_error' || statusParam === 'tiktok_error') {
      const reason = params.get('reason') || 'unknown'
      showToast(`Connect failed: ${reason}`, 'err')
      setView('clips')
      window.history.replaceState({}, '', '/factloop/studio')
    } else {
      setYtConnected(localStorage.getItem('yt_connected') === 'true')
      setTtConnected(localStorage.getItem('tt_connected') === 'true')
    }
    const token = localStorage.getItem('sc_token')
    if (token) {
      fetch(`${API_BASE}/social/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return
          setYtConnected(d.youtube); if (!d.youtube) localStorage.removeItem('yt_connected')
          setTtConnected(d.tiktok);  if (!d.tiktok)  localStorage.removeItem('tt_connected')
        }).catch(() => {})
    }
  }, []) // eslint-disable-line

  const connectYT = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/auth/youtube?product=factloop`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); window.location.href = d.url }
      else {
        const err = new Error('yt connect failed'); err.status = r.status
        setErrorModal({ error: friendlyError(err, { title: 'Could not connect YouTube' }), retry: connectYT })
      }
    } catch (e) {
      setErrorModal({ error: friendlyError(e, { title: 'Could not connect YouTube' }), retry: connectYT })
    }
  }

  const connectTT = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/auth/tiktok?product=factloop`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const d = await r.json(); window.location.href = d.url }
      else {
        const err = new Error('tt connect failed'); err.status = r.status
        setErrorModal({ error: friendlyError(err, { title: 'Could not connect TikTok' }), retry: connectTT })
      }
    } catch (e) {
      setErrorModal({ error: friendlyError(e, { title: 'Could not connect TikTok' }), retry: connectTT })
    }
  }

  const disconnectSocial = async (platform) => {
    const label = platform === 'youtube' ? 'YouTube' : 'TikTok'
    try {
      const token = localStorage.getItem('sc_token')
      const r = await fetch(`${API_BASE}/social/disconnect/${platform}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) {
        const err = new Error('disconnect failed'); err.status = r.status
        setErrorModal({ error: friendlyError(err, { title: `Could not disconnect ${label}` }), retry: () => disconnectSocial(platform) })
        return
      }
      if (platform === 'youtube') { setYtConnected(false); localStorage.removeItem('yt_connected') }
      else { setTtConnected(false); localStorage.removeItem('tt_connected') }
    } catch (e) {
      setErrorModal({ error: friendlyError(e, { title: `Could not disconnect ${label}` }), retry: () => disconnectSocial(platform) })
    }
  }

  const publishYT = (job) => { if (!ytConnected) { connectYT(); return }; setPublishModal({ job, platform: 'youtube' }) }
  const publishTT = (job) => { if (!ttConnected) { connectTT(); return }; setPublishModal({ job, platform: 'tiktok' }) }

  const doPublish = async (job, platform, opts) => {
    const jobId = job.job_id
    const setPublishing = platform === 'youtube' ? setPublishingYT : setPublishingTT
    const setPublished  = platform === 'youtube' ? setPublishedYT  : setPublishedTT
    setPublishing(prev => new Set([...prev, jobId]))
    try {
      const token = localStorage.getItem('sc_token')
      const endpoint = platform === 'youtube' ? '/social/publish/youtube' : '/social/publish/tiktok'
      const clipPayload = { clip_id: jobId, video_url: job.output_url, ...opts }
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clips: [clipPayload] }),
      })
      const data = await res.json()
      const result = data.results?.[0]
      const platformLabel = platform === 'youtube' ? 'YouTube' : 'TikTok'
      if (res.ok && result?.status === 'success') {
        setPublished(prev => new Set([...prev, jobId]))
        if (result.forced_private) {
          showToast('Queued on TikTok — visible only to you for now (app is pending TikTok review for public posts)', 'ok')
        } else {
          showToast(platform === 'youtube' ? 'Published to YouTube Shorts! 🎉' : 'Queued on TikTok! 🔥', 'ok')
        }
      } else if (res.status === 400 && data.detail?.includes('not connected')) {
        if (platform === 'youtube') { localStorage.removeItem('yt_connected'); setYtConnected(false); connectYT() }
        else { localStorage.removeItem('tt_connected'); setTtConnected(false); connectTT() }
      } else if (result?.tiktok_error_code === 'unaudited_client_can_only_post_to_private_accounts') {
        setErrorModal({
          error: {
            title: 'This TikTok account needs to be Private',
            message: result.error,
            tips: [
              'Open the TikTok app → Profile → Settings and privacy → Privacy',
              'Turn on "Private account", then try publishing again',
              'This restriction lifts automatically once ShortClipr passes TikTok\'s app review',
            ],
          },
          retry: () => doPublish(job, platform, opts),
        })
      } else {
        const err = new Error('publish failed'); err.status = res.status
        setErrorModal({
          error: friendlyError(err, {
            title: `Couldn't publish to ${platformLabel}`,
            tips: [
              `${platformLabel} may have rejected the video format or length`,
              'Your connection to this platform may need to be refreshed',
              'Try again in a moment',
            ],
          }),
          retry: () => doPublish(job, platform, opts),
        })
      }
    } catch (e) {
      const platformLabel = platform === 'youtube' ? 'YouTube' : 'TikTok'
      setErrorModal({ error: friendlyError(e, { title: `Couldn't publish to ${platformLabel}` }), retry: () => doPublish(job, platform, opts) })
    }
    setPublishing(prev => { const n = new Set(prev); n.delete(jobId); return n })
  }

  const doDraft = async (job, opts) => {
    const jobId = job.job_id
    setDraftedTT(prev => prev) // no-op placeholder for symmetry with Brainrot's setDraftingTT
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/social/upload/tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clips: [{ clip_id: jobId, video_url: job.output_url, title: opts.title }] }),
      })
      const data = await res.json()
      const result = data.results?.[0]
      if (res.ok && result?.status === 'success') {
        setDraftedTT(prev => new Set([...prev, jobId]))
        showToast('Saved to TikTok drafts — open the TikTok app to finish posting 📥', 'ok')
      } else if (res.status === 400 && data.detail?.includes('not connected')) {
        localStorage.removeItem('tt_connected'); setTtConnected(false); connectTT()
      } else {
        const err = new Error('draft failed'); err.status = res.status
        setErrorModal({
          error: friendlyError(err, {
            title: "Couldn't save to TikTok drafts",
            tips: [
              'TikTok may have rejected the video format or length',
              'Your connection to TikTok may need to be refreshed (disconnect and reconnect)',
              'Try again in a moment',
            ],
          }),
          retry: () => doDraft(job, opts),
        })
      }
    } catch (e) {
      setErrorModal({ error: friendlyError(e, { title: "Couldn't save to TikTok drafts" }), retry: () => doDraft(job, opts) })
    }
  }

  // ── Derived: gameplay categories ────────────────────────────────
  const categories = useMemo(() => {
    const set = new Set(clipsLib.map(c => c.category).filter(Boolean))
    return ['all', ...Array.from(set)]
  }, [clipsLib])
  const visibleClips = useMemo(
    () => category === 'all' ? clipsLib : clipsLib.filter(c => c.category === category),
    [clipsLib, category],
  )

  // ── Facts management ─────────────────────────────────────────────
  const addFact = () => {
    if (facts.length >= MAX_FACTS) { showToast(`Up to ${MAX_FACTS} facts per video`, 'warn'); return }
    setFacts(prev => [...prev, { key: slugifyKey('', prev.map(f => f.key)), label: '', value: '', unit: '' }])
  }
  const removeFact = (idx) => setFacts(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  const updateFact = (idx, patch) => setFacts(prev => prev.map((f, i) => {
    if (i !== idx) return f
    const next = { ...f, ...patch }
    // Re-derive key from label so the narrator's stat_key references stay
    // meaningful — but only once the label actually changes, and keeping it
    // unique against every OTHER row's key.
    if (patch.label !== undefined) {
      const others = prev.filter((_, j) => j !== idx).map(x => x.key)
      next.key = slugifyKey(patch.label, others)
    }
    return next
  }))

  // ── Voice / music preview ─────────────────────────────────────────
  const stopPreview = () => { if (audioRef.current) audioRef.current.pause(); setPreviewingUrl(null) }
  const playPreview = (url, failMsg = 'Preview not ready yet.', volume = 1) => {
    if (!url) return
    if (previewingUrl === url && audioRef.current && !audioRef.current.paused) { stopPreview(); return }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, volume))
    audio.onended = () => setPreviewingUrl(prev => (prev === url ? null : prev))
    audioRef.current = audio
    setPreviewingUrl(url)
    audio.play().catch(() => { showToast(failMsg, 'warn'); setPreviewingUrl(null) })
  }
  useEffect(() => { stopPreview() }, [stage, view]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Post metadata — debounced on title/facts/context change ─────
  useEffect(() => {
    if (metaTimerRef.current) clearTimeout(metaTimerRef.current)
    if (!title.trim() || title.trim().length < 3) { setPostTitle(''); setPostHashtags([]); return }
    const scriptInput = [
      title.trim(),
      facts.filter(f => f.label && f.value).map(f => `${f.label}: ${f.value}${f.unit || ''}`).join(', '),
      context.trim(),
    ].filter(Boolean).join('. ')
    metaTimerRef.current = setTimeout(async () => {
      setMetaLoading(true)
      try {
        const d = await factloopApi.generatePostMeta(scriptInput)
        if (d.title) setPostTitle(d.title)
        if (d.hashtags?.length) setPostHashtags(d.hashtags)
      } catch { /* silent */ } finally { setMetaLoading(false) }
    }, 1800)
    return () => clearTimeout(metaTimerRef.current)
  }, [title, facts, context])

  // ── Validation ────────────────────────────────────────────────────
  const validFacts = useMemo(() => facts.filter(f => f.label.trim() && f.value.trim()), [facts])
  const problems = useMemo(() => {
    const p = []
    if (!title.trim()) p.push('Add a title')
    if (validFacts.length === 0) p.push('Add at least one fact')
    if (!background) p.push('Pick a gameplay background')
    return p
  }, [title, validFacts, background])

  const canGenerate = problems.length === 0 && !submitting && !isActive(activeJob)

  const stageDone = {
    subject: !!title.trim(),
    facts: validFacts.length > 0,
    look: !!background,
    generate: problems.length === 0,
  }
  const goToStage = (id) => setStage(id)
  const goNext = () => {
    const i = STAGES.findIndex(s => s.id === stage)
    if (i >= 0 && i < STAGES.length - 1) setStage(STAGES[i + 1].id)
  }

  // ── Submit + poll ───────────────────────────────────────────────
  const generate = async () => {
    if (!canGenerate) { if (problems.length) showToast(problems[0], 'warn'); return }
    setSubmitting(true)
    try {
      const options = {
        title: title.trim(),
        facts: validFacts.map(f => ({ key: f.key, label: f.label.trim(), value: f.value.trim(), unit: f.unit?.trim() || null })),
        context: context.trim(),
        gameplay_clip_id: background.id,
        duration_seconds: duration,
        caption_style: captionStyle,
        caption_color: captionColor,
        caption_y: captionY,
        voice_id: voiceId,
        music_asset_id: musicId || null,
        music_volume: musicVolume,
        post_title: postTitle,
        post_hashtags: postHashtags,
      }
      const { job_id } = await factloopApi.createJob(options)
      showToast('Generating your video…', 'ok')
      setClipsCounts(prev => ({ ...prev, all: prev.all + 1, active: prev.active + 1 }))
      pollJob(job_id)
    } catch (e) {
      setErrorModal({ error: friendlyError(e, { title: 'Could not start your video' }), retry: generate })
    } finally {
      setSubmitting(false)
    }
  }

  const pollJob = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    const tick = async () => {
      try {
        const job = await factloopApi.getJob(jobId)
        setActiveJob(job)
        if (!isActive(job)) {
          clearInterval(pollRef.current); pollRef.current = null
          if (job.status === 'complete') {
            showToast('Done! 🎉', 'ok')
            setMyClips(prev => [job, ...prev.filter(c => c.job_id !== job.job_id)])
          } else if (job.status === 'failed') {
            showToast(job.error_message || 'Generation failed', 'err')
          }
          loadClipsPage(clipsFilter, 0, false)
        }
      } catch { /* keep polling through transient errors */ }
    }
    tick()
    pollRef.current = setInterval(tick, 2500)
  }

  useEffect(() => {
    if (resumeActiveJobId) pollJob(resumeActiveJobId)
  }, [resumeActiveJobId]) // eslint-disable-line react-hooks/exhaustive-deps

  const anyOffline = !clipsOnline
  const retryFetches = () => setRefetchTick(t => t + 1)

  const libraryClips = activeJob && isActive(activeJob)
    ? [activeJob, ...myClips.filter(c => c.job_id !== activeJob.job_id)]
    : myClips
  const visibleLibraryClips = libraryClips.filter(c => {
    if (c.status === 'failed') return false
    if (clipsFilter === 'active') return isActive(c)
    if (clipsFilter === 'complete') return c.status === 'complete'
    return true
  })
  const renderingCount = Math.max(clipsCounts.active, isActive(activeJob) ? 1 : 0)

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.paper, fontFamily: FONT, color: T.ink }}>

      {publishModal && (
        <PublishModal
          job={publishModal.job}
          platform={publishModal.platform}
          ytConnected={ytConnected}
          ttConnected={ttConnected}
          onClose={() => setPublishModal(null)}
          onPublish={doPublish}
          onDraft={doDraft}
        />
      )}

      <ErrorModal
        error={errorModal?.error}
        onClose={() => setErrorModal(null)}
        onRetry={errorModal?.retry ? () => { const r = errorModal.retry; setErrorModal(null); r() } : undefined}
      />

      <Header user={user} onLogout={logout}
        connectionOffline={anyOffline} onRetryConnection={retryFetches}
        clipsCounts={clipsCounts} hasActiveJob={isActive(activeJob)} />

      <div className="fl-shell" style={{ maxWidth: 1360, margin: '0 auto', padding: '20px 24px 0',
        display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        <StudioSideNav view={view} onChange={setView} user={user}
          clipCount={clipsCounts.all}
          renderingCount={renderingCount}
          ytConnected={ytConnected} ttConnected={ttConnected}
          onConnectYT={connectYT} onConnectTT={connectTT}
          onDisconnect={disconnectSocial} socialEnabled={socialEnabled} />

        <div style={{ flex: 1, minWidth: 0 }}>
      {view === 'clips' ? (
        <ClipsLibrary clips={visibleLibraryClips} counts={clipsCounts}
          filter={clipsFilter} onFilterChange={changeClipsFilter}
          hasMore={clipsHasMore} loadingMore={clipsLoadingMore} onLoadMore={loadMoreClips}
          onCreate={() => setView('create')}
          ytConnected={ytConnected} ttConnected={ttConnected}
          publishedYT={publishedYT} publishingYT={publishingYT}
          publishedTT={publishedTT} publishingTT={publishingTT}
          draftedTT={draftedTT}
          onPublishYT={publishYT} onPublishTT={publishTT}
          onConnectYT={connectYT} onConnectTT={connectTT}
          onDisconnect={disconnectSocial} socialEnabled={socialEnabled} />
      ) : (
      <div className="fl-studio-grid" style={{ padding: '8px 0 80px',
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 32, alignItems: 'start' }}>

        {/* ══ LEFT: builder ══════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>

          <StageRail stage={stage} onJump={goToStage} stageDone={stageDone} />

          {stage === 'subject' && (
          <StageShell id="subject">
            <SubLabel>Title</SubLabel>
            <input
              value={title} onChange={e => setTitle(e.target.value.slice(0, 120))}
              placeholder="e.g. Virat Kohli's 2026 season in numbers"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 8,
                border: `1.5px solid ${T.line}`, fontSize: '.92rem', fontFamily: FONT,
                color: T.ink, outline: 'none', marginBottom: 4,
              }}
              onFocus={e => e.currentTarget.style.borderColor = T.primary}
              onBlur={e => e.currentTarget.style.borderColor = T.line}
            />
            <div style={{ textAlign: 'right', fontSize: '.7rem', color: T.mute, marginBottom: 20 }}>{title.length}/120</div>

            <SubLabel>Context (optional)</SubLabel>
            <textarea
              value={context} onChange={e => setContext(e.target.value.slice(0, 400))}
              rows={3}
              placeholder="Any extra framing for the narrator — tone, angle, audience…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 8,
                border: `1.5px solid ${T.line}`, fontSize: '.88rem', fontFamily: FONT,
                color: T.ink, outline: 'none', resize: 'vertical',
              }}
              onFocus={e => e.currentTarget.style.borderColor = T.primary}
              onBlur={e => e.currentTarget.style.borderColor = T.line}
            />
            <div style={{ textAlign: 'right', fontSize: '.7rem', color: T.mute }}>{context.length}/400</div>

            <StageNextButton label="Next: Facts" onClick={goNext} />
          </StageShell>
          )}

          {stage === 'facts' && (
          <StageShell id="facts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {facts.map((f, idx) => (
                <div key={idx} style={{
                  display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.7fr 32px', gap: 8, alignItems: 'center',
                  background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8, padding: 8,
                }}>
                  <input
                    value={f.label} onChange={e => updateFact(idx, { label: e.target.value.slice(0, 60) })}
                    placeholder="Label (e.g. Runs)"
                    style={factInputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = T.primary}
                    onBlur={e => e.currentTarget.style.borderColor = T.line}
                  />
                  <input
                    value={f.value} onChange={e => updateFact(idx, { value: e.target.value.slice(0, 40) })}
                    placeholder="Value (e.g. 1,240)"
                    style={factInputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = T.primary}
                    onBlur={e => e.currentTarget.style.borderColor = T.line}
                  />
                  <input
                    value={f.unit} onChange={e => updateFact(idx, { unit: e.target.value.slice(0, 12) })}
                    placeholder="Unit"
                    style={factInputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = T.primary}
                    onBlur={e => e.currentTarget.style.borderColor = T.line}
                  />
                  <button onClick={() => removeFact(idx)} disabled={facts.length <= 1}
                    style={{
                      cursor: facts.length > 1 ? 'pointer' : 'not-allowed', background: 'transparent',
                      border: 'none', color: facts.length > 1 ? T.mute : T.line, fontSize: '1rem',
                      width: 32, height: 32, borderRadius: 6,
                    }}
                    onMouseEnter={e => { if (facts.length > 1) e.currentTarget.style.color = T.error }}
                    onMouseLeave={e => e.currentTarget.style.color = facts.length > 1 ? T.mute : T.line}
                  >×</button>
                </div>
              ))}
            </div>
            <button onClick={addFact} disabled={facts.length >= MAX_FACTS} {...pressHandlers}
              style={{
                ...pill(T.lineSoft, { cursor: facts.length < MAX_FACTS ? 'pointer' : 'not-allowed', padding: '7px 16px' }),
              }}>
              + Add fact ({facts.length}/{MAX_FACTS})
            </button>
            <StageFootnote>
              Each fact becomes one narrated line with its own animated on-screen callout —
              numbers count up as the narrator says them.
            </StageFootnote>

            <StageNextButton label="Next: Look" onClick={goNext} />
          </StageShell>
          )}

          {stage === 'look' && (
          <StageShell id="look">
            {!clipsOnline && clipsLib.length === 0 ? (
              <OfflineState title="Backdrop library unreachable" sub="Not your fault. Retry, or come back to this step later." onRetry={retryFetches} />
            ) : clipsLib.length === 0 ? (
              <StageFootnote>No backdrops uploaded yet. An admin adds gameplay clips through the internal library.</StageFootnote>
            ) : (
              <>
                <SubLabel>Gameplay background</SubLabel>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)}
                      style={{
                        cursor: 'pointer',
                        background: category === cat ? T.ink : '#fff',
                        color: category === cat ? '#fff' : T.ink,
                        border: `1px solid ${category === cat ? T.ink : T.line}`,
                        borderRadius: 999, padding: '5px 14px',
                        fontSize: '.75rem', fontWeight: 500, fontFamily: FONT,
                        textTransform: 'capitalize',
                      }}>
                      {cat.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 10, padding: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))', gap: 6 }}>
                    {visibleClips.map(clip => (
                      <GameplayTile key={clip.id} clip={clip} on={background?.id === clip.id} onClick={() => setBackground(clip)} />
                    ))}
                  </div>
                </div>
              </>
            )}

            <StageDivider />

            <SubLabel>Narrator voice</SubLabel>
            {voices.length === 0 ? (
              <StageFootnote>No voices available.</StageFootnote>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
                {voices.map(v => {
                  const on = voiceId === v.voice_id
                  return (
                    <span key={v.voice_id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      border: `1px solid ${on ? T.ink : T.line}`, borderRadius: 999,
                      background: on ? T.ink : '#fff', overflow: 'hidden',
                    }}>
                      <button onClick={() => setVoiceId(v.voice_id)}
                        style={{
                          cursor: 'pointer', padding: '5px 6px 5px 14px', border: 'none', background: 'transparent',
                          color: on ? '#fff' : T.ink, fontSize: '.75rem', fontWeight: 500, fontFamily: FONT,
                        }}>{v.label} <span style={{ opacity: .6 }}>· {v.gender}</span></button>
                      {v.preview_url && (
                        <button onClick={() => playPreview(v.preview_url, 'Voice preview not ready yet.')}
                          style={{
                            cursor: 'pointer', padding: '5px 12px 5px 4px', border: 'none', background: 'transparent',
                            color: on ? '#fff' : T.mute, fontSize: '.7rem',
                          }}>{previewingUrl === v.preview_url ? '⏸' : '▶'}</button>
                      )}
                    </span>
                  )
                })}
              </div>
            )}

            <StageDivider />

            <SubLabel>Duration</SubLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 500, color: T.ink, lineHeight: 1 }}>{duration}</span>
              <span style={{ fontSize: '.85rem', color: T.mute }}>seconds</span>
            </div>
            <input type="range" min={5} max={120} step={5} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: T.primary }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, marginBottom: 24 }}>
              {DURATION_PRESETS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  style={{
                    cursor: 'pointer',
                    background: duration === d ? T.ink : '#fff',
                    color: duration === d ? '#fff' : T.ink,
                    border: `1px solid ${duration === d ? T.ink : T.line}`,
                    borderRadius: 999, padding: '4px 12px', fontSize: '.75rem', fontWeight: 500,
                  }}>{d}s</button>
              ))}
            </div>

            <StageDivider />

            <SubLabel>Caption style</SubLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 10 }}>
              {CAPTION_PRESETS.map(cs => {
                const on = captionStyle === cs.id
                return (
                  <button key={cs.id} onClick={() => setCaption(cs.id)}
                    style={{ cursor: 'pointer', textAlign: 'left', padding: '12px 14px',
                      background: on ? T.ink : '#fff', color: on ? '#fff' : T.ink,
                      border: `1px solid ${on ? T.ink : T.line}`, borderRadius: 10, transition: 'all .12s' }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 500 }}>{cs.label}</div>
                    <div style={{ fontSize: '.72rem', opacity: .6, marginTop: 2 }}>{cs.sub}</div>
                  </button>
                )
              })}
            </div>

            <button onClick={() => setShowMoreStyles(v => !v)}
              style={{
                cursor: 'pointer', background: 'transparent', border: 'none', padding: '2px 0',
                fontFamily: FONT, fontSize: '.8rem', fontWeight: 500, color: T.mute,
                display: 'flex', alignItems: 'center', gap: 5, marginBottom: showMoreStyles ? 10 : 24,
              }}>
              {showMoreStyles ? 'Hide styles' : 'More styles'}
              {!showMoreStyles && CAPTION_TRENDING.some(cs => cs.id === captionStyle) && (
                <span style={{ ...pill(T.lineSoft, { padding: '2px 8px', fontSize: '.68rem' }) }}>
                  {CAPTION_STYLE_BY_ID[captionStyle]?.label}
                </span>
              )}
            </button>

            {showMoreStyles && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 24,
                background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10, padding: 10,
              }}>
                {CAPTION_TRENDING.map(cs => {
                  const on = captionStyle === cs.id
                  return (
                    <button key={cs.id} onClick={() => setCaption(cs.id)}
                      style={{ cursor: 'pointer', textAlign: 'left', padding: '10px 12px',
                        background: on ? T.ink : '#fff', color: on ? '#fff' : T.ink,
                        border: `1px solid ${on ? T.ink : T.line}`, borderRadius: 8, transition: 'all .12s' }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 500 }}>{cs.label}</div>
                      <div style={{ fontSize: '.68rem', opacity: .6, marginTop: 2 }}>{cs.sub}</div>
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <SubLabel>Caption color</SubLabel>
              <span style={{ fontSize: '.75rem', color: T.mute }}>{CAPTION_COLOR_BY_ID[captionColor]?.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {CAPTION_COLORS.map(c => {
                const on = captionColor === c.id
                return (
                  <button key={c.id} onClick={() => setCaptionColor(c.id)} title={c.label}
                    style={{
                      cursor: 'pointer', width: 32, height: 32, borderRadius: 8,
                      background: c.text,
                      border: `1px solid ${c.outline === '#FFFFFF' ? T.line : c.outline}`,
                      boxShadow: on ? `0 0 0 2px ${T.ink}` : 'none', transition: 'box-shadow .12s',
                    }} />
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <SubLabel>Caption position</SubLabel>
              <span style={{ fontSize: '.75rem', color: T.mute }}>{Math.round(captionY * 100)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ fontSize: '.72rem', color: T.mute }}>Top</span>
              <input type="range" min={0} max={1} step={0.01} value={captionY}
                onChange={e => setCaptionY(Number(e.target.value))}
                style={{ flex: 1, accentColor: T.primary }} />
              <span style={{ fontSize: '.72rem', color: T.mute }}>Bottom</span>
            </div>

            <StageDivider />

            <SubLabel>Background music</SubLabel>
            {musicLib.length === 0 ? (
              <StageFootnote>No tracks in the library yet.</StageFootnote>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button onClick={() => setMusicId('')}
                    style={{
                      cursor: 'pointer', padding: '5px 14px',
                      background: !musicId ? T.ink : '#fff', color: !musicId ? '#fff' : T.ink,
                      border: `1px solid ${!musicId ? T.ink : T.line}`,
                      borderRadius: 999, fontSize: '.75rem', fontWeight: 500, fontFamily: FONT,
                    }}>None</button>
                  {musicLib.map(m => {
                    const on = musicId === m.id
                    return (
                      <span key={m.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        border: `1px solid ${on ? T.ink : T.line}`, borderRadius: 999,
                        background: on ? T.ink : '#fff', overflow: 'hidden',
                      }}>
                        <button onClick={() => setMusicId(m.id)}
                          style={{
                            cursor: 'pointer', padding: '5px 6px 5px 14px', border: 'none', background: 'transparent',
                            color: on ? '#fff' : T.ink, fontSize: '.75rem', fontWeight: 500, fontFamily: FONT,
                          }}>{m.name}</button>
                        <button onClick={() => playPreview(m.gcs_path, 'Could not play this track — try again in a moment.', musicVolume * MUSIC_DUCK_FACTOR)}
                          title={previewingUrl === m.gcs_path ? 'Stop preview' : `Preview at ~${Math.round(musicVolume * MUSIC_DUCK_FACTOR * 100)}% — ducked under narration, like it plays in the real video`}
                          disabled={!m.gcs_path}
                          style={{
                            cursor: m.gcs_path ? 'pointer' : 'not-allowed', padding: '5px 12px 5px 4px',
                            border: 'none', background: 'transparent',
                            color: on ? '#fff' : T.mute, fontSize: '.7rem', opacity: m.gcs_path ? 1 : .4,
                          }}>{previewingUrl === m.gcs_path ? '⏸' : '▶'}</button>
                      </span>
                    )
                  })}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: T.mute, marginBottom: 4 }}>
                    <span>Volume{!musicId && ' — applies once you pick a track'}</span>
                    <span>{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input type="range" min={0.2} max={0.6} step={0.02} value={musicVolume}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setMusicVolume(v)
                      if (audioRef.current) audioRef.current.volume = v * MUSIC_DUCK_FACTOR
                    }}
                    style={{ width: '100%', accentColor: T.primary, cursor: 'pointer' }} />
                </div>
              </>
            )}

            <StageNextButton label="Next: Generate" onClick={goNext} />
          </StageShell>
          )}

          {stage === 'generate' && (
          <StageShell id="generate">
            <CallsheetRow label="Subject" done={stageDone.subject} onEdit={() => goToStage('subject')}>
              {title || '—'}
            </CallsheetRow>
            <CallsheetRow label="Facts" done={stageDone.facts} onEdit={() => goToStage('facts')}>
              {validFacts.length ? validFacts.map(f => `${f.label}: ${f.value}${f.unit || ''}`).join(' · ') : '—'}
            </CallsheetRow>
            <CallsheetRow label="Look" done={stageDone.look} onEdit={() => goToStage('look')} last>
              {background ? `${(background.category || 'gameplay').replace(/_/g, ' ')} · ${duration}s` : '—'}
            </CallsheetRow>

            <StageDivider />

            <SubLabel>Post title {metaLoading && '(writing…)'}</SubLabel>
            <input value={postTitle} onChange={e => setPostTitle(e.target.value)}
              placeholder="Auto-generated once you add a title + facts"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
                border: `1.5px solid ${T.line}`, fontSize: '.85rem', fontFamily: FONT, color: T.ink,
                outline: 'none', marginBottom: 12,
              }}
              onFocus={e => e.currentTarget.style.borderColor = T.primary}
              onBlur={e => e.currentTarget.style.borderColor = T.line}
            />
            <SubLabel>Hashtags</SubLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px',
              border: `1.5px solid ${T.line}`, borderRadius: 8, minHeight: 44 }}>
              {postHashtags.map((tag, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: T.lineSoft, borderRadius: 999, padding: '2px 9px',
                  fontSize: '.76rem', fontWeight: 600, color: T.ink,
                }}>
                  {tag}
                  <button onClick={() => setPostHashtags(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, fontSize: '.7rem', padding: 0 }}>×</button>
                </span>
              ))}
              <HashtagInput onAdd={tag => setPostHashtags(prev => [...new Set([...prev, tag])])} />
            </div>

            <StageFootnote>
              Hit Generate on the right when you're ready — one credit is reserved immediately and
              your video runs straight through: script, AI image, narration, and render, no more steps.
            </StageFootnote>
          </StageShell>
          )}

        </div>

        {/* ══ RIGHT: preview + generate (sticky) ═══════════════════ */}
        <div className="fl-studio-preview" style={{ position: 'sticky', top: 112, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="fl-preview-stage" style={{ maxWidth: 260, margin: '0 auto', width: '100%' }}>
            <ClipTile
              clip={background}
              stats={validFacts.map(f => ({ key: f.key, label: f.label, value: `${f.value}${f.unit || ''}` }))}
              caption={title ? { text: title.slice(0, 42) } : null}
              radius={18}
            />
          </div>

          {isActive(activeJob) ? (
            <ProgressCard job={activeJob} />
          ) : (
            <>
              <button onClick={generate} disabled={!canGenerate} {...pressHandlers}
                style={{ ...btn(canGenerate ? T.primary : T.line, '#fff'),
                  width: '100%', padding: '14px 0', fontSize: '.92rem',
                  cursor: canGenerate ? 'pointer' : 'not-allowed' }}>
                {submitting ? 'Starting...' : 'Generate'}
              </button>
              {problems.length > 0 && (
                <div style={{ padding: '12px 14px', background: T.paper, borderRadius: 8 }}>
                  <div style={{ fontSize: '.72rem', color: T.mute, marginBottom: 6 }}>Still needed</div>
                  {problems.map((p, i) => (
                    <div key={i} style={{ fontSize: '.8rem', fontWeight: 500, color: T.ink, display: 'flex', gap: 7, marginBottom: 2 }}>
                      <span style={{ color: T.mute }}>·</span>{p}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
        </div>
      </div>

      {toast && (
        <div className="fl-toast" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: toast.type === 'err' ? '#fef2f2' : toast.type === 'ok' ? '#f0fdf4' : '#fff',
          border: `1px solid ${toast.type === 'err' ? '#fecaca' : toast.type === 'ok' ? '#bbf7d0' : T.line}`,
          color: toast.type === 'err' ? '#dc2626' : toast.type === 'ok' ? '#16a34a' : T.ink,
          borderRadius: 10, padding: '10px 18px', fontSize: '.85rem', fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxWidth: '80vw',
        }}>{toast.msg}</div>
      )}

      <style>{`
        @keyframes flPulseDot { 0%,100% { opacity: .4 } 50% { opacity: 1 } }
        @keyframes flSpin { to { transform: rotate(360deg) } }
        @media (max-width: 900px) {
          .fl-studio-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .fl-studio-preview { position: static !important; top: auto !important; }
          .fl-preview-stage { max-width: min(300px, 82vw) !important; margin: 0 auto !important; }
          .fl-shell { flex-direction: column !important; gap: 0 !important; padding-top: 14px !important;
            padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; }
          .fl-sidenav {
            position: fixed !important; inset: auto 0 0 0 !important; top: auto !important;
            width: 100% !important; flex-direction: row !important; flex-wrap: nowrap !important;
            align-items: stretch !important; gap: 2px !important;
            border-radius: 0 !important; border-left: none !important; border-right: none !important; border-bottom: none !important;
            padding: 6px calc(env(safe-area-inset-right, 0px) + 6px) calc(env(safe-area-inset-bottom, 0px) + 6px) calc(env(safe-area-inset-left, 0px) + 6px) !important;
            box-shadow: 0 -2px 14px rgba(0,0,0,.07) !important;
            z-index: 300 !important;
          }
          .fl-sidenav > button, .fl-sidenav > a {
            flex: 1 !important; flex-direction: column !important; justify-content: center !important;
            gap: 2px !important; min-height: 54px !important; padding: 6px 4px !important;
            font-size: .66rem !important; border-radius: 10px !important;
          }
          .fl-sidenav > button > span, .fl-sidenav > a > span { flex: none !important; }
          .fl-sidenav > div:not(.fl-pub-section) { display: none !important; }
          .fl-pub-section { display: none !important; }
          .fl-clips-connect { display: block !important; }
        }
        @media (max-width: 640px) {
          .fl-studio-headrow { padding: 8px 12px !important; gap: 8px !important; }
          .fl-shell { padding-left: 12px !important; padding-right: 12px !important; }
          .fl-studio-tag { display: none; }
          .fl-publish-modal-card { padding: 16px 14px 14px !important; border-radius: 12px !important; }
          .fl-header-stats > div { padding: 7px 8px !important; }
          .fl-header-stats > div > div:first-child { font-size: .92rem !important; }
          .fl-stage-body { padding: 18px 16px 22px !important; }
          .fl-stage-body h2 { font-size: 1.05rem !important; }
          .fl-callsheet-row { grid-template-columns: 62px 1fr 38px !important; padding: 10px 12px !important; gap: 8px !important; }
          .fl-toast { bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important; max-width: calc(100vw - 32px) !important; }
        }
        @media (max-width: 400px) {
          .fl-stage-rail { overflow-x: auto !important; scrollbar-width: none !important; }
          .fl-stage-rail::-webkit-scrollbar { display: none !important; }
          .fl-stage-rail button { flex: 0 0 auto !important; min-width: 62px !important; }
          .fl-stage-rail > span { display: none !important; }
        }
      `}</style>
    </div>
  )
}

const factInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 6,
  border: `1.5px solid ${T.line}`, fontSize: '.82rem', fontFamily: FONT, color: T.ink, outline: 'none',
}

// ── Header ──────────────────────────────────────────────────────────
function Header({ user, onLogout, connectionOffline, onRetryConnection, clipsCounts, hasActiveJob }) {
  const initials = (user?.full_name || user?.email || 'U')[0].toUpperCase()
  const totalCount     = clipsCounts.all
  const readyCount     = clipsCounts.complete
  const renderingCount = Math.max(clipsCounts.active, hasActiveJob ? 1 : 0)
  const queuedCount    = clipsCounts.queued

  const stats = [
    { n: totalCount,     l: 'Videos made', c: T.ink },
    { n: readyCount,     l: 'Ready',       c: T.success },
    { n: renderingCount, l: 'Rendering',   c: T.warning },
    { n: queuedCount,    l: 'Queued',      c: T.info },
  ]

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 200,
      background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.line}`,
    }}>
      <div className="fl-studio-headrow" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12 }}>
        <Link to="/factloop" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: T.ink }}>
          <Logo size={26} />
          <span style={{ fontSize: '.95rem', fontWeight: 600, letterSpacing: '-.02em' }}>ShortClipr</span>
          <span className="fl-studio-tag" style={{
            fontSize: '.62rem', color: T.mute, letterSpacing: '.06em',
            textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4,
            background: T.lineSoft, marginLeft: 2,
          }}>Factloop</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {typeof user?.brainrot_credits_remaining === 'number' && (
            <Link to="/factloop/billing" title="Credits remaining — click to top up" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
              background: T.lineSoft, border: `1px solid ${T.line}`, borderRadius: 999,
              padding: '5px 12px', fontSize: '.78rem', fontWeight: 600, color: T.ink,
            }}>
              <span style={{ fontSize: '.85rem' }}>📊</span>
              {user.brainrot_credits_remaining} credit{user.brainrot_credits_remaining === 1 ? '' : 's'}
            </Link>
          )}
          {connectionOffline && (
            <button onClick={onRetryConnection} title="Some data isn't reachable — click to retry"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: 999, padding: '4px 12px',
                fontFamily: FONT, fontSize: '.75rem', fontWeight: 500, color: T.error,
              }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.error,
                display: 'inline-block', animation: 'flPulseDot 1.4s ease-in-out infinite' }} />
              Reconnecting
            </button>
          )}
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.lineSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.ink, fontWeight: 500, fontSize: '.78rem', overflow: 'hidden' }}>
            {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <button onClick={onLogout} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: FONT, fontSize: '.78rem', fontWeight: 500, color: T.mute, padding: '4px 8px',
          }}>Sign out</button>
        </div>
      </div>

      <div className="fl-header-stats" style={{
        display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        borderTop: `1px solid ${T.line}`,
      }}>
        {stats.map((s, i, arr) => (
          <div key={i} style={{
            padding: '8px 12px', borderRight: i < arr.length - 1 ? `1px solid ${T.line}` : 'none',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0,
          }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-.04em', color: s.c, lineHeight: 1.1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.n}</div>
            <div style={{ fontSize: '.6rem', color: T.mute, textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </header>
  )
}

const SIDENAV_ICON = {
  create: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4L8 1z" fill="currentColor" opacity=".85"/>
    </svg>
  ),
  clips: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="1" y1="6.5" x2="15" y2="6.5" stroke="currentColor" strokeWidth="1.1"/>
      <rect x="3.5" y="8.5" width="3" height="2" rx=".5" fill="currentColor" opacity=".7"/>
      <rect x="8" y="8.5" width="4.5" height="2" rx=".5" fill="currentColor" opacity=".4"/>
    </svg>
  ),
  billing: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="3" y="9.5" width="3" height="1.5" rx=".4" fill="currentColor" opacity=".6"/>
    </svg>
  ),
}

function StudioSideNav({ view, onChange, clipCount, renderingCount, user, ytConnected, ttConnected, onConnectYT, onConnectTT, onDisconnect, socialEnabled }) {
  const ITEMS = [
    { id: 'create', label: 'Create',   icon: SIDENAV_ICON.create },
    { id: 'clips',  label: 'My clips', icon: SIDENAV_ICON.clips, count: clipCount },
  ]
  const itemStyle = (on) => ({
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
    padding: '10px 12px', borderRadius: 8, border: 'none', textAlign: 'left',
    background: on ? T.ink : 'transparent', color: on ? '#fff' : T.mute,
    fontFamily: FONT, fontSize: '.85rem', fontWeight: 500, transition: 'all .12s', textDecoration: 'none',
  })
  const hoverOn = e => { e.currentTarget.style.background = T.lineSoft }
  const hoverOff = e => { e.currentTarget.style.background = 'transparent' }

  return (
    <nav className="fl-sidenav" style={{
      position: 'sticky', top: 96, flexShrink: 0, width: 192,
      display: 'flex', flexDirection: 'column', gap: 2,
      background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: 6,
    }}>
      {ITEMS.map(it => {
        const on = view === it.id
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={itemStyle(on)}
            onMouseEnter={e => { if (!on) hoverOn(e) }} onMouseLeave={e => { if (!on) hoverOff(e) }}>
            <span style={{ flexShrink: 0, display: 'flex', opacity: on ? 1 : .7 }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.id === 'clips' && renderingCount > 0 && (
              <span title={`${renderingCount} rendering`} style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: on ? '#fff' : T.primary, animation: 'flPulseDot 1.4s ease-in-out infinite',
              }} />
            )}
            {typeof it.count === 'number' && it.count > 0 && (
              <span style={{
                fontSize: '.7rem', fontWeight: 500, flexShrink: 0, color: on ? '#fff' : T.mute,
                background: on ? 'rgba(255,255,255,.18)' : T.lineSoft,
                borderRadius: 999, padding: '1px 7px', minWidth: 16, textAlign: 'center',
              }}>{it.count}</span>
            )}
          </button>
        )
      })}

      <div style={{ height: 1, background: T.lineSoft, margin: '4px 4px' }} />

      <Link to="/factloop/billing" style={itemStyle(false)} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
        <span style={{ flexShrink: 0, display: 'flex', opacity: .7 }}>{SIDENAV_ICON.billing}</span>
        <span style={{ flex: 1 }}>Billing</span>
        <span style={{
          fontSize: '.68rem', fontWeight: 500, flexShrink: 0, textTransform: 'capitalize',
          color: T.mute, background: T.lineSoft, borderRadius: 999, padding: '1px 8px',
        }}>{user?.brainrot_plan || 'free'}</span>
      </Link>

      <div className="fl-pub-section" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div className="fl-pub-divider" style={{ height: 1, background: T.lineSoft, margin: '6px 4px' }} />
        <div className="fl-pub-label" style={{ padding: '4px 6px 2px', fontSize: '.65rem', fontWeight: 700,
          color: T.mute, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Publish to
        </div>
        <PublishConnections
          ytConnected={ytConnected} ttConnected={ttConnected}
          onConnectYT={onConnectYT} onConnectTT={onConnectTT} onDisconnect={onDisconnect}
          socialEnabled={socialEnabled}
        />
      </div>
    </nav>
  )
}

const YT_ICON = <YTLogo size={15} />
const TT_ICON = <TTLogo size={15} />

function PublishConnections({ ytConnected, ttConnected, onConnectYT, onConnectTT, onDisconnect, socialEnabled }) {
  if (!socialEnabled) return null
  return (
    <>
      <SocialConnectRow icon={YT_ICON} label="YouTube" connected={ytConnected} onConnect={onConnectYT} onDisconnect={() => onDisconnect('youtube')} />
      <SocialConnectRow icon={TT_ICON} label="TikTok" connected={ttConnected} onConnect={onConnectTT} onDisconnect={() => onDisconnect('tiktok')} />
    </>
  )
}

function SocialConnectRow({ icon, label, connected, onConnect, onDisconnect }) {
  const [hoverDisc, setHoverDisc] = useState(false)
  return (
    <div style={{
      borderRadius: 8, margin: '2px 0',
      border: `1px solid ${connected ? '#bbf7d0' : T.line}`,
      background: connected ? '#f0fdf4' : T.paper, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <span style={{ color: connected ? '#16a34a' : '#aaa', display: 'flex', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '.78rem', fontWeight: 600, color: connected ? '#15803d' : T.ink }}>{label}</span>
        {connected ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '.65rem', color: '#16a34a', fontWeight: 600 }}>✓ Connected</span>
          </span>
        ) : (
          <button onClick={onConnect} style={{
            fontSize: '.68rem', fontWeight: 700, color: '#fff', background: T.ink, border: 'none',
            cursor: 'pointer', padding: '3px 9px', borderRadius: 5, fontFamily: FONT,
          }}>Connect</button>
        )}
      </div>
      {connected && (
        <div style={{ borderTop: '1px solid #bbf7d0', padding: '5px 10px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onDisconnect} onMouseEnter={() => setHoverDisc(true)} onMouseLeave={() => setHoverDisc(false)}
            style={{
              fontSize: '.65rem', fontWeight: 600, color: hoverDisc ? '#dc2626' : '#999',
              background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', fontFamily: FONT, transition: 'color .12s',
            }}>Disconnect</button>
        </div>
      )}
    </div>
  )
}

function StageShell({ id, children }) {
  const meta = STAGE_BY_ID[id]
  return (
    <section style={{ background: '#fff', borderRadius: 12, border: `1px solid ${T.line}` }}>
      <div className="fl-stage-body" style={{ padding: '24px 24px 28px' }}>
        <h2 style={{ margin: '0 0 4px', fontWeight: 500, fontSize: '1.15rem', letterSpacing: '-.02em', color: T.ink, lineHeight: 1.2 }}>
          {meta.title}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: '.85rem', color: T.mute, lineHeight: 1.5 }}>{meta.hint}</p>
        {children}
      </div>
    </section>
  )
}

function SubLabel({ children }) {
  return (
    <div style={{ fontSize: '.75rem', fontWeight: 500, color: T.mute, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function StageDivider() { return <div style={{ height: 1, background: T.lineSoft, margin: '4px 0 20px' }} /> }

function StageFootnote({ children }) {
  return <p style={{ margin: '14px 0 0', fontSize: '.8rem', color: T.mute, lineHeight: 1.55 }}>{children}</p>
}

function StageNextButton({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 24, cursor: 'pointer',
        background: 'transparent', border: 'none', fontFamily: FONT, fontSize: '.85rem', fontWeight: 500, color: T.ink, padding: '4px 0',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.6' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >{label} <span style={{ display: 'inline-block' }}>→</span></button>
  )
}

function CallsheetRow({ label, done, onEdit, children, last }) {
  return (
    <div className="fl-callsheet-row" style={{
      display: 'grid', gridTemplateColumns: '80px 1fr 50px', gap: 12, alignItems: 'center',
      padding: '12px 16px', borderBottom: last ? 'none' : `1px solid ${T.lineSoft}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', fontWeight: 500, color: done ? T.ink : T.mute }}>
        <span style={{ color: done ? T.success : T.line, fontSize: '.6rem' }}>{done ? '●' : '○'}</span>
        {label}
      </div>
      <div style={{ fontSize: '.85rem', color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</div>
      <button onClick={onEdit}
        style={{ justifySelf: 'end', cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: FONT, fontSize: '.75rem', fontWeight: 500, color: T.mute, padding: '4px 6px' }}
        onMouseEnter={e => e.currentTarget.style.color = T.ink} onMouseLeave={e => e.currentTarget.style.color = T.mute}
      >Edit</button>
    </div>
  )
}

function OfflineState({ title, sub, onRetry }) {
  const [retrying, setRetrying] = useState(false)
  const handleRetry = async () => { setRetrying(true); onRetry?.(); setTimeout(() => setRetrying(false), 800) }
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 12 }}>
      <div style={{ fontSize: '1rem', fontWeight: 500, color: T.ink, marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: '.8rem', color: T.mute, lineHeight: 1.5, maxWidth: '38ch', margin: '0 auto 16px' }}>{sub}</div>}
      <button onClick={handleRetry} disabled={retrying}
        style={{
          cursor: retrying ? 'default' : 'pointer', background: T.ink, color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 18px', fontFamily: FONT, fontSize: '.8rem', fontWeight: 500, opacity: retrying ? .6 : 1,
        }}>{retrying ? 'Retrying…' : 'Retry'}</button>
    </div>
  )
}

function StageRail({ stage, onJump, stageDone }) {
  const doneCount = STAGES.filter(s => stageDone[s.id]).length
  return (
    <div className="fl-stage-rail" style={{
      display: 'flex', alignItems: 'center', gap: 2, background: T.paper2,
      border: `1px solid ${T.line}`, borderRadius: 10, padding: 4,
    }}>
      {STAGES.map((s) => {
        const on = stage === s.id
        const done = stageDone[s.id]
        return (
          <button key={s.id} onClick={() => onJump(s.id)} title={s.hint}
            style={{
              cursor: 'pointer', border: 'none', flex: 1, padding: '8px 6px', borderRadius: 8,
              background: on ? T.ink : 'transparent', color: on ? '#fff' : done ? T.ink : T.mute,
              fontFamily: FONT, fontSize: '.78rem', fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all .15s',
            }}>
            {done && !on && <span style={{ color: T.success, fontSize: '.6rem' }}>●</span>}
            {s.label}
          </button>
        )
      })}
      <span style={{ fontSize: '.7rem', fontWeight: 500, color: T.mute, padding: '0 8px', whiteSpace: 'nowrap' }}>
        {doneCount}/{STAGES.length}
      </span>
    </div>
  )
}

function GameplayTile({ clip, on, onClick }) {
  const videoRef = useRef(null)
  const handleEnter = () => { videoRef.current?.play().catch(() => {}) }
  const handleLeave = () => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = 0 } }
  return (
    <button onClick={onClick} onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      style={{
        cursor: 'pointer', padding: 3, background: on ? T.ink : 'transparent',
        border: on ? `2px solid ${T.ink}` : `1px solid ${T.line}`, borderRadius: 8, transition: 'all .12s',
      }}>
      <div style={{ width: '100%', aspectRatio: '9/16', borderRadius: 5, overflow: 'hidden', background: '#000', position: 'relative' }}>
        {clip.gcs_path ? (
          <video ref={videoRef} src={clip.gcs_path} poster={clip.thumbnail_url || undefined}
            muted loop playsInline preload="none" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : clip.thumbnail_url ? (
          <img src={clip.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666', fontSize: '.6rem', fontWeight: 500, textTransform: 'capitalize' }}>{clip.category}</div>
        )}
        {on && <div style={{ position: 'absolute', top: 4, right: 4, background: '#fff', color: T.ink, width: 16, height: 16,
          borderRadius: '50%', fontSize: '.58rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
      </div>
    </button>
  )
}

function ProgressCard({ job }) {
  const pct = job.progress || 0
  return (
    <div style={{ ...card({ padding: 16 }) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 500, fontSize: '.88rem' }}>{job.current_step || 'Working…'}</span>
      </div>
      <div style={{ height: 6, background: T.lineSoft, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: T.primary, transition: 'width .5s', borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 6, fontSize: '.75rem', fontWeight: 500, color: T.mute, textAlign: 'right' }}>{pct}%</div>
    </div>
  )
}

const STATUS_META = {
  complete:            { label: 'Ready',      color: T.success },
  failed:              { label: 'Failed',     color: T.error },
  created:             { label: 'Queued',     color: T.mute },
  generating_script:   { label: 'Writing',    color: T.info },
  synthesizing_voice:  { label: 'Voicing',    color: T.info },
  api_done:            { label: 'Queued',     color: T.info },
  rendering:           { label: 'Rendering',  color: T.info },
}
const LIBRARY_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'active',   label: 'Rendering' },
  { id: 'complete', label: 'Ready' },
]

function HashtagInput({ onAdd }) {
  const [val, setVal] = useState('')
  const commit = () => {
    const tag = val.trim().replace(/\s+/g, '').replace(/^#*/, '#')
    if (tag.length > 1) { onAdd(tag); setVal('') }
  }
  return (
    <input value={val} onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() } }}
      onBlur={commit} placeholder="+ add tag" maxLength={40}
      style={{
        border: '1.5px dashed #67e8f9', borderRadius: 999, background: 'transparent',
        padding: '3px 10px', fontSize: '.76rem', color: T.primaryDark, fontFamily: FONT, outline: 'none', width: 90,
      }} />
  )
}

function ClipsLibrary({ clips, counts, filter, onFilterChange, hasMore, loadingMore, onLoadMore,
  onCreate, ytConnected, ttConnected, publishedYT, publishingYT, publishedTT, publishingTT, draftedTT,
  onPublishYT, onPublishTT, onConnectYT, onConnectTT, onDisconnect, socialEnabled }) {

  return (
    <div style={{ padding: '8px 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontWeight: 500, fontSize: 'clamp(1.3rem, 2.2vw, 1.6rem)', letterSpacing: '-.02em', color: T.ink }}>
            Your videos
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: T.mute }}>Every video you've generated.</p>
        </div>
        <button onClick={onCreate} {...pressHandlers} style={{ ...btn(T.ink, '#fff', { padding: '10px 18px', fontSize: '.82rem' }) }}>
          New video
        </button>
      </div>

      <div className="fl-clips-connect" style={{ display: 'none', marginBottom: 20, padding: 10, background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <div style={{ padding: '2px 4px 8px', fontSize: '.68rem', fontWeight: 700, color: T.mute, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Publish to
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <PublishConnections ytConnected={ytConnected} ttConnected={ttConnected}
            onConnectYT={onConnectYT} onConnectTT={onConnectTT} onDisconnect={onDisconnect} socialEnabled={socialEnabled} />
        </div>
      </div>

      {counts.all > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
          {LIBRARY_FILTERS.map(f => {
            const on = filter === f.id
            const n = counts[f.id]
            return (
              <button key={f.id} onClick={() => onFilterChange(f.id)}
                style={{
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: on ? T.ink : T.paper2, color: on ? '#fff' : T.ink,
                  border: `1px solid ${on ? T.ink : T.line}`, borderRadius: 8, padding: '6px 13px',
                  fontSize: '.78rem', fontWeight: 500, fontFamily: FONT,
                }}>
                {f.label}
                <span style={{ fontSize: '.7rem', fontWeight: 500, color: on ? 'rgba(255,255,255,.7)' : T.mute }}>{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {counts.all === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 12 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 500, color: T.ink, marginBottom: 6 }}>No videos yet</div>
          <div style={{ fontSize: '.84rem', color: T.mute, maxWidth: '36ch', margin: '0 auto 18px', lineHeight: 1.5 }}>
            Your first Factloop video is a title, some facts, and a backdrop away.
          </div>
          <button onClick={onCreate} {...pressHandlers} style={{ ...btn(T.ink, '#fff', { padding: '11px 20px' }) }}>
            Make your first video
          </button>
        </div>
      ) : clips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: T.mute, fontSize: '.86rem' }}>Nothing in this filter yet.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
            {clips.map(job => (
              <ClipCard key={job.job_id} job={job}
                ytConnected={ytConnected} ttConnected={ttConnected}
                publishedYT={publishedYT} publishingYT={publishingYT}
                publishedTT={publishedTT} publishingTT={publishingTT}
                draftedTT={draftedTT}
                onPublishYT={onPublishYT} onPublishTT={onPublishTT}
                socialEnabled={socialEnabled} />
            ))}
          </div>
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <button onClick={onLoadMore} disabled={loadingMore} {...pressHandlers}
                style={{
                  ...btn(T.paper2, T.ink, { padding: '10px 24px', fontSize: '.82rem', border: `1px solid ${T.line}` }),
                  cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? .6 : 1,
                }}>{loadingMore ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ClipCard({ job, ytConnected, ttConnected, publishedYT, publishingYT, publishedTT, publishingTT, draftedTT, onPublishYT, onPublishTT, socialEnabled }) {
  const meta = STATUS_META[job.status] || STATUS_META.created
  const jid = job.job_id
  const isComplete = job.status === 'complete' && job.output_url
  const ytDone = publishedYT?.has(jid)
  const ttDone = publishedTT?.has(jid)
  const ttDraftDone = draftedTT?.has(jid)
  const ytBusy = publishingYT?.has(jid)
  const ttBusy = publishingTT?.has(jid)
  return (
    <div style={{ ...card({ padding: 8 }), transition: 'border-color .15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.line }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden',
        background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isComplete ? (
          <video src={job.output_url} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : job.status === 'failed' ? (
          <div style={{ color: '#ff8a8a', fontSize: '.78rem', fontWeight: 500, textAlign: 'center', padding: 12 }}>
            {job.error_message || 'Failed'}
          </div>
        ) : (
          <div style={{ width: '100%', padding: 16 }}>
            <div style={{ color: '#fff', fontSize: '.78rem', fontWeight: 500, textAlign: 'center', marginBottom: 10 }}>
              {job.current_step || 'Processing…'}
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,.15)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${job.progress || 0}%`, background: '#fff', transition: 'width .5s', borderRadius: 999 }} />
            </div>
          </div>
        )}
        <span style={{
          position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: '.6rem', fontWeight: 500, padding: '3px 8px', borderRadius: 999,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
          {meta.label}
        </span>
      </div>
      <div style={{ padding: '9px 4px 3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: '.72rem', fontWeight: 500, color: T.mute }}>
          {job.created_at ? new Date(job.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
        </span>
        {isComplete && (
          <a href={job.output_url} target="_blank" rel="noopener noreferrer" title="Open full size"
            style={{ fontSize: '.72rem', fontWeight: 500, color: T.ink, textDecoration: 'none' }}>Open ↗</a>
        )}
      </div>
      {isComplete && job.post_title && (
        <div style={{ padding: '0 4px 6px' }}>
          <div style={{ fontSize: '.7rem', fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.post_title}
          </div>
          {job.post_hashtags?.length > 0 && (
            <div style={{ fontSize: '.62rem', color: T.primaryDark, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.post_hashtags.join(' ')}
            </div>
          )}
        </div>
      )}
      {isComplete && socialEnabled && (
        <div style={{ display: 'flex', gap: 5, padding: '4px 4px 2px' }}>
          <button onClick={() => onPublishYT && onPublishYT(job)} disabled={ytDone || ytBusy}
            title={ytDone ? 'Published to YouTube' : ytConnected ? 'Publish to YouTube Shorts' : 'Connect YouTube'}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '6px 4px', borderRadius: 7, border: '1.5px solid',
              borderColor: ytDone ? '#16a34a' : '#e5e5e5', background: ytDone ? '#f0fdf4' : '#fff',
              color: ytDone ? '#16a34a' : '#333', fontSize: '.65rem', fontWeight: 600, cursor: ytDone ? 'default' : 'pointer', fontFamily: FONT,
            }}>
            {ytBusy ? (
              <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'flSpin .7s linear infinite' }} />
            ) : ytDone ? '✓ YT' : (<><YTLogo size={11} />{ytConnected ? 'YT' : 'YT+'}</>)}
          </button>
          <button onClick={() => onPublishTT && onPublishTT(job)} disabled={ttDone || ttBusy}
            title={
              ttDone ? 'Published to TikTok'
              : ttDraftDone ? 'Saved to TikTok Drafts — open to publish for real'
              : ttConnected ? 'Publish to TikTok, or save as a draft'
              : 'Connect TikTok'
            }
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '6px 4px', borderRadius: 7, border: '1.5px solid',
              borderColor: ttDone ? '#16a34a' : ttDraftDone ? '#67e8f9' : '#e5e5e5',
              background: ttDone ? '#f0fdf4' : ttDraftDone ? '#ecfeff' : '#fff',
              color: ttDone ? '#16a34a' : ttDraftDone ? T.primaryDark : '#333',
              fontSize: '.65rem', fontWeight: 600, cursor: ttDone ? 'default' : 'pointer', fontFamily: FONT,
            }}>
            {ttBusy ? (
              <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'flSpin .7s linear infinite' }} />
            ) : ttDone ? '✓ TT' : (<><TTLogo size={11} />{ttDraftDone ? 'Draft ✓' : ttConnected ? 'TT' : 'TT+'}</>)}
          </button>
        </div>
      )}
    </div>
  )
}

function PublishModal({ job, platform, ytConnected, ttConnected, onClose, onPublish, onDraft }) {
  const isPlatConnected = platform === 'youtube' ? ytConnected : ttConnected
  const tags = job.post_hashtags || []
  const defaultTitle = job.post_title || (job.title || '').slice(0, 80) || 'Factloop Video'

  const [title, setTitle]         = useState(defaultTitle)
  const [description, setDesc]    = useState(tags.join(' '))
  const [hashtags, setHashtags]   = useState(tags)
  const [ytPrivacy, setYtPrivacy] = useState('public')
  const [ttPrivacy, setTtPrivacy] = useState('SELF_ONLY')
  const [noDuet, setNoDuet]       = useState(false)
  const [noComment, setNoComment] = useState(false)
  const [noStitch, setNoStitch]   = useState(false)

  const [busy, setBusy] = useState(false)
  const [busyDraft, setBusyDraft] = useState(false)

  const fullTitle = hashtags.length
    ? `${title} ${hashtags.join(' ')}`.slice(0, platform === 'youtube' ? 100 : 150)
    : title.slice(0, platform === 'youtube' ? 100 : 150)

  const handlePublish = async () => {
    setBusy(true)
    await onPublish(job, platform, {
      title: fullTitle, description, tags: hashtags,
      privacy_status: ytPrivacy, privacy_level: ttPrivacy,
      disable_duet: noDuet, disable_comment: noComment, disable_stitch: noStitch,
    })
    setBusy(false)
    onClose()
  }

  const handleDraft = async () => {
    setBusyDraft(true)
    await onDraft(job, { title: fullTitle })
    setBusyDraft(false)
    onClose()
  }

  const isYT = platform === 'youtube'
  const accent = isYT ? '#cf1322' : '#000'
  const platformLabel = isYT ? 'YouTube Shorts' : 'TikTok'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fl-publish-modal-card" style={{
        background: '#fff', borderRadius: 16, border: `2px solid ${T.ink}`, boxShadow: `6px 6px 0 ${accent}`,
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '24px 24px 20px', fontFamily: FONT,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          {isYT ? <YTLogo size={20} /> : <TTLogo size={20} />}
          <span style={{ fontSize: '1rem', fontWeight: 800, color: T.ink }}>Post to {platformLabel}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.mute, fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
        </div>

        {!isPlatConnected && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef9c3', border: '1px solid #fde047', fontSize: '.82rem', color: '#854d0e', marginBottom: 16 }}>
            {platformLabel} isn't connected yet — connect it from the sidebar first.
          </div>
        )}

        <Field label={`Title ${isYT ? '(max 100 chars)' : '(caption, max 150 chars)'}`}>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={isYT ? 100 : 150}
            style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = accent}
            onBlur={e => e.currentTarget.style.borderColor = T.line}
          />
          <div style={{ textAlign: 'right', fontSize: '.65rem', color: T.mute, marginTop: 2 }}>
            {fullTitle.length}/{isYT ? 100 : 150} chars (hashtags included)
          </div>
        </Field>

        <Field label="Hashtags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', border: `1.5px solid ${T.line}`, borderRadius: 8, minHeight: 44 }}>
            {hashtags.map((tag, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.lineSoft, borderRadius: 999, padding: '2px 9px', fontSize: '.76rem', fontWeight: 600, color: T.ink }}>
                {tag}
                <button onClick={() => setHashtags(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, fontSize: '.7rem', padding: 0 }}>×</button>
              </span>
            ))}
            <HashtagInput onAdd={tag => setHashtags(prev => [...new Set([...prev, tag])])} />
          </div>
        </Field>

        {isYT && (
          <Field label="Description (optional)">
            <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} maxLength={5000}
              placeholder="Add more context, links, credits..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT }}
              onFocus={e => e.currentTarget.style.borderColor = accent}
              onBlur={e => e.currentTarget.style.borderColor = T.line}
            />
          </Field>
        )}

        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: T.mute, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Options</div>

          {isYT ? (
            <Field label="Privacy">
              <div style={{ display: 'flex', gap: 8 }}>
                {[['public','Public'],['unlisted','Unlisted'],['private','Private']].map(([v,l]) => (
                  <button key={v} onClick={() => setYtPrivacy(v)}
                    style={{
                      flex: 1, padding: '7px 4px', borderRadius: 7, cursor: 'pointer',
                      fontSize: '.76rem', fontWeight: 600, fontFamily: FONT,
                      border: `1.5px solid ${ytPrivacy === v ? accent : T.line}`,
                      background: ytPrivacy === v ? '#fef2f2' : '#fff',
                      color: ytPrivacy === v ? accent : T.mute,
                    }}>{l}</button>
                ))}
              </div>
            </Field>
          ) : (
            <>
              <Field label="Who can view">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    ['PUBLIC_TO_EVERYONE','Everyone'],
                    ['MUTUAL_FOLLOW_FRIENDS','Mutual followers'],
                    ['FOLLOWER_OF_CREATOR','Your followers'],
                    ['SELF_ONLY','Only me'],
                  ].map(([v,l]) => {
                    const locked = v !== 'SELF_ONLY'
                    return (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: locked ? 'not-allowed' : 'pointer', fontSize: '.82rem', fontWeight: 500, opacity: locked ? .45 : 1 }}>
                        <input type="radio" checked={ttPrivacy === v} disabled={locked} onChange={() => setTtPrivacy(v)} style={{ accentColor: '#000' }} />
                        {l}
                      </label>
                    )
                  })}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '.72rem', color: T.mute, lineHeight: 1.5 }}>
                  TikTok only allows "Only me" posts until this app passes their Content Posting API review —
                  other visibility options unlock automatically once approved.
                </p>
              </Field>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
                {[['noDuet','Disable Duet',noDuet,setNoDuet],
                  ['noComment','Disable Comments',noComment,setNoComment],
                  ['noStitch','Disable Stitch',noStitch,setNoStitch]].map(([k,l,v,s]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.8rem', fontWeight: 500 }}>
                    <input type="checkbox" checked={v} onChange={e => s(e.target.checked)} style={{ accentColor: '#000', width: 15, height: 15 }} />
                    {l}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <button onClick={handlePublish} disabled={busy || busyDraft || !isPlatConnected}
          style={{
            marginTop: 20, width: '100%', padding: '12px',
            background: isPlatConnected ? accent : '#e5e5e5', color: isPlatConnected ? '#fff' : '#aaa',
            border: `2px solid ${isPlatConnected ? T.ink : '#e5e5e5'}`, borderRadius: 10, fontWeight: 800, fontSize: '.9rem',
            cursor: isPlatConnected && !busy && !busyDraft ? 'pointer' : 'default',
            boxShadow: isPlatConnected ? `3px 3px 0 ${T.ink}` : 'none', fontFamily: FONT, transition: 'all .12s',
          }}>{busy ? 'Publishing…' : `Publish to ${platformLabel} →`}</button>

        {!isYT && (
          <button onClick={handleDraft} disabled={busy || busyDraft || !isPlatConnected}
            title="Saves to your TikTok drafts inbox — finish posting from the TikTok app whenever you're ready"
            style={{
              marginTop: 8, width: '100%', padding: '11px', background: '#fff',
              color: isPlatConnected ? T.ink : '#aaa', border: `1.5px solid ${isPlatConnected ? T.line : '#e5e5e5'}`,
              borderRadius: 10, fontWeight: 700, fontSize: '.84rem',
              cursor: isPlatConnected && !busy && !busyDraft ? 'pointer' : 'default', fontFamily: FONT, transition: 'all .12s',
            }}>{busyDraft ? 'Saving…' : 'Save to TikTok Drafts (post later from the app)'}</button>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', border: `1.5px solid ${T.line}`, borderRadius: 8,
  padding: '8px 12px', fontSize: '.86rem', background: '#fff', color: T.ink, outline: 'none',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 700, color: T.mute, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
