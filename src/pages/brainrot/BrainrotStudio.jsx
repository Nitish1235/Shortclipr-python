// BrainrotStudio.jsx — the Brainrot Clips Maker creator + clips history.
//
// Swiss minimal design: ultra-clean white surfaces, thin borders, no shadows,
// typography-driven. Inter throughout. Same layout contract: left = controls,
// right = sticky 9:16 preview + Generate, tabs for create/clips.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { brainrotApi } from './brainrotApi'
import { T, card, pill, btn, pressHandlers, FONT } from './brainrotTheme'
import Logo from '../../components/Logo'
import PreviewStage from './PreviewStage'
import { getChemistry } from './chemistry'
import ErrorModal from './ErrorModal'
import { friendlyError } from './errorHelpers'
import {
  CAPTION_PRESETS, CAPTION_TRENDING, CAPTION_STYLE_BY_ID,
  CAPTION_COLORS, CAPTION_COLOR_BY_ID, DEFAULT_CAPTION_COLOR, DEFAULT_CAPTION_Y,
} from './captionStyles'

const SPARK_TOPICS = [
  'iPhone vs Android', 'Pizza vs Burgers', 'Cats vs Dogs',
  'Morning person vs Night owl', 'Summer vs Winter', 'PS5 vs Xbox',
  'Homework vs No homework', 'City vs Suburbs', 'Coffee vs Energy drinks',
  'Texting vs Calling',
]

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]
const ACTIVE_STATUSES = ['created', 'generating_script', 'synthesizing_voice', 'rendering']
const CLIPS_PAGE_SIZE = 24
// Mirrors MUSIC_DUCK_FACTOR in backend/app/pipeline/brainrot_composite.py —
// the render ducks music to this fraction of the slider's value whenever a
// character is talking, which is most of a clip. Previewing at the raw
// slider value (instead of this ducked level) made the preview sound much
// louder than what the actual rendered clip mostly plays at. Keep in sync
// if the backend constant ever changes.
const MUSIC_DUCK_FACTOR = 0.35

const STAGES = [
  { id: 'spark',  label: 'Script',     title: 'Script',       hint: 'What are they arguing about?' },
  { id: 'scene',  label: 'Scene',      title: 'Scene',        hint: 'Pick a gameplay background.' },
  { id: 'cast',   label: 'Cast',       title: 'Cast',         hint: "Who's on screen?" },
  { id: 'style',  label: 'Style',      title: 'Style',        hint: 'Length, captions, motion, music.' },
  { id: 'review', label: 'Review',     title: 'Review',       hint: 'Everything at a glance.' },
]
const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]))

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// YouTube/TikTok connect + publish are gated to this one account while
// both platforms are still pending app review (see the TikTok
// unaudited_client_can_only_post_to_private_accounts / YouTube audit
// situation) — everyone else sees a "Coming soon" placeholder instead of
// a connect button or publish buttons that would just fail for them.
const SOCIAL_BETA_EMAIL = 'jainnitish432@gmail.com'

export default function BrainrotStudio() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const socialEnabled = (user?.email || '').trim().toLowerCase() === SOCIAL_BETA_EMAIL

  // ── Reference data ──────────────────────────────────────────────
  const [roster, setRoster]     = useState([])
  const [voices, setVoices]     = useState([])
  const [motions, setMotions]   = useState([])
  const [clipsLib, setClipsLib] = useState([])
  // Per-resource "did the last fetch succeed?" flags — replaces the old
  // single `refError` string that used to fire a page-wide red banner with
  // a developer message ("Is the backend running & bucket configured?").
  // Now each affected section shows its own inline empty-state with a
  // Retry button, and the header shows a subtle "offline" chip. Users
  // never see the word "bucket" again.
  const [rosterOnline, setRosterOnline] = useState(true)
  const [clipsOnline,  setClipsOnline]  = useState(true)
  const [refetchTick,  setRefetchTick]  = useState(0)  // bump to force a re-fetch
  const [signatureCasts, setSignatureCasts] = useState([])
  const [savingCast, setSavingCast] = useState(false)
  const [musicLib, setMusicLib] = useState([])

  // ── Stage rail ───────────────────────────────────────────────────
  const [stage, setStage] = useState('spark')

  // ── Top-level view: the create flow vs. the clips library ────────
  const [view, setView] = useState('create')   // 'create' | 'clips'

  // ── Builder state ───────────────────────────────────────────────
  const [script, setScript]         = useState('')
  const [castCount, setCastCount]   = useState(2)
  const [picked, setPicked]         = useState([])   // [{...character, side, voiceId, entry, exit, x, y, scale, rotation}]
  const [background, setBackground] = useState(null)
  const [category, setCategory]     = useState('all')
  const [duration, setDuration]     = useState(30)
  const [captionStyle, setCaption]  = useState('brainrot')
  const [captionColor, setCaptionColor] = useState(DEFAULT_CAPTION_COLOR)
  const [captionY, setCaptionY] = useState(DEFAULT_CAPTION_Y)
  const [showMoreStyles, setShowMoreStyles] = useState(false)
  const [charSearch, setCharSearch] = useState('')
  const [motionMode, setMotionMode] = useState('turn_based')  // 'turn_based' | 'always_on'
  const [musicId, setMusicId]       = useState('')
  const [musicVolume, setMusicVolume] = useState(0.3)

  // ── Post metadata (auto-generated from script, user-editable) ───
  const [postTitle, setPostTitle]       = useState('')
  const [postHashtags, setPostHashtags] = useState([])
  const [metaLoading, setMetaLoading]   = useState(false)
  const metaTimerRef = useRef(null)

  // Debounce: generate post meta 1.8s after user stops typing script
  useEffect(() => {
    if (metaTimerRef.current) clearTimeout(metaTimerRef.current)
    if (!script.trim() || script.trim().length < 8) { setPostTitle(''); setPostHashtags([]); return }
    metaTimerRef.current = setTimeout(async () => {
      setMetaLoading(true)
      try {
        const d = await brainrotApi.generatePostMeta(script)
        if (d.title)    setPostTitle(d.title)
        if (d.hashtags?.length) setPostHashtags(d.hashtags)
      } catch { /* silent */ } finally { setMetaLoading(false) }
    }, 1800)
    return () => clearTimeout(metaTimerRef.current)
  }, [script])

  // ── Publish modal state ──────────────────────────────────────────
  const [publishModal, setPublishModal] = useState(null) // { job, platform }

  // ── Error popup — friendly, never raw backend text (see errorHelpers.js)
  const [errorModal, setErrorModal] = useState(null) // { error, retry? }

  // ── Social connectivity ──────────────────────────────────────────
  const [ytConnected, setYtConnected] = useState(false)
  const [ttConnected, setTtConnected] = useState(false)
  const [publishedYT,  setPublishedYT]  = useState(new Set())
  const [publishingYT, setPublishingYT] = useState(new Set())
  const [publishedTT,  setPublishedTT]  = useState(new Set())
  const [publishingTT, setPublishingTT] = useState(new Set())

  // ── Job state ───────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [activeJob, setActiveJob]   = useState(null)   // polled job being generated
  const [myClips, setMyClips]       = useState([])
  const [toast, setToast]           = useState(null)
  const [refLoaded, setRefLoaded]   = useState(false)
  // Set by the reference-data load effect when it finds a job still active
  // from an earlier visit — picked up by the effect right after pollJob's
  // own definition below (can't call pollJob directly from the earlier
  // effect; it isn't declared yet at that point in the component).
  const [resumeActiveJobId, setResumeActiveJobId] = useState(null)
  const pollRef = useRef(null)
  const audioRef = useRef(null)

  // ── My clips library — paginated, server-filtered (GET /brainrot/clips) ──
  const [clipsFilter, setClipsFilter]           = useState('all')   // 'all' | 'active' | 'complete'
  const [clipsCounts, setClipsCounts]           = useState({ all: 0, active: 0, complete: 0, queued: 0 })
  const [clipsOffset, setClipsOffset]           = useState(0)
  const [clipsHasMore, setClipsHasMore]         = useState(false)
  const [clipsLoadingMore, setClipsLoadingMore] = useState(false)

  // ── Draft autosave ───────────────────────────────────────────────
  // Protects an interrupted session (mobile especially): a reload restores
  // script, cast, background, and vibe from wherever the user left off.
  // Keyed per-user so a shared browser can't leak one account's draft into
  // another's session.
  const draftKey = user?.user_id ? `brainrot_draft_${user.user_id}` : null
  const hydratedRef = useRef(false)
  const saveTimerRef = useRef(null)

  // Fetches one page of the "My clips" library from its own endpoint
  // (GET /brainrot/clips — separate from /brainrot/jobs, which backs the
  // create flow's live status polling below). `append` drives Load More
  // vs. a fresh page (initial load / filter switch / post-completion resync).
  const loadClipsPage = useCallback(async (status, offset, append) => {
    if (append) setClipsLoadingMore(true)
    try {
      const data = await brainrotApi.listClips({ status, limit: CLIPS_PAGE_SIZE, offset })
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
  // Non-critical fetches (clips, signature casts, audio assets) fail
  // silently — their absence just means an empty list, no user-facing
  // error. Critical fetches (characters, gameplay clips) update the
  // per-resource online flag so the affected section can render its own
  // inline empty-state with a Retry button — no more page-wide red banner.
  useEffect(() => {
    let alive = true
    Promise.allSettled([
      brainrotApi.characters(),
      brainrotApi.voices(),
      brainrotApi.animations(),
      brainrotApi.gameplayClips(),
      brainrotApi.listClips({ status: 'all', limit: CLIPS_PAGE_SIZE, offset: 0 }),
      brainrotApi.listSignatureCasts(),
      brainrotApi.audioAssets('music'),
    ]).then(([c, v, a, g, j, s, m]) => {
      if (!alive) return
      if (c.status === 'fulfilled') { setRoster(c.value.characters || []); setRosterOnline(true) }
      else setRosterOnline(false)
      if (v.status === 'fulfilled') setVoices(v.value.voices || [])
      if (a.status === 'fulfilled') setMotions(a.value.entry || [])
      if (g.status === 'fulfilled') { setClipsLib(g.value.clips || []); setClipsOnline(true) }
      else setClipsOnline(false)
      if (j.status === 'fulfilled') {
        const clips = j.value.clips || []
        setMyClips(clips)
        setClipsCounts(j.value.counts || { all: 0, active: 0, complete: 0, queued: 0 })
        setClipsHasMore(!!j.value.has_more)
        setClipsOffset(clips.length)
        // A job still running from an earlier visit (page reload, closed
        // tab, came back later) has nothing polling it — pollJob only ever
        // gets started from generate() in the SAME session that submitted
        // it. Without this, its status/progress just freezes at whatever
        // it was on THIS page load until the user manually reloads again
        // to get a fresh snapshot. MAX_CONCURRENT_BRAINROT_JOBS_PER_USER
        // caps this at one, so at most one clip in the list can need it.
        // Flagged via state (see resumeActiveJobId) rather than calling
        // pollJob directly — it isn't declared yet at this point in the
        // component; the effect right after its definition picks this up.
        const stillActive = clips.find(isActive)
        if (stillActive) setResumeActiveJobId(stillActive.job_id)
      }
      if (s.status === 'fulfilled') setSignatureCasts(s.value.casts || [])
      if (m.status === 'fulfilled') setMusicLib(m.value.assets || [])
      setRefLoaded(true)
    })
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current) }
  }, [refetchTick])

  // restore a saved draft once reference data is in (so characters/backgrounds
  // can be re-hydrated with fresh image URLs rather than stale cached ones)
  useEffect(() => {
    if (!refLoaded || hydratedRef.current) return
    hydratedRef.current = true
    if (!draftKey) return
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.script) setScript(draft.script)
      if (draft.captionStyle) setCaption(draft.captionStyle)
      if (draft.captionColor) setCaptionColor(draft.captionColor)
      if (draft.captionY) setCaptionY(draft.captionY)
      if (draft.duration) setDuration(draft.duration)
      if (draft.category) setCategory(draft.category)
      if (draft.motionMode) setMotionMode(draft.motionMode)
      if (draft.musicId) setMusicId(draft.musicId)
      if (draft.musicVolume) setMusicVolume(draft.musicVolume)
      if (Array.isArray(draft.picked) && draft.picked.length) {
        const hydrated = draft.picked
          .map(saved => {
            const ch = roster.find(r => r.id === saved.id)
            return ch ? { ...ch, ...saved } : null
          })
          .filter(Boolean)
        if (hydrated.length) { setCastCount(hydrated.length); setPicked(hydrated) }
      }
      if (draft.backgroundId) {
        const bg = clipsLib.find(c => c.id === draft.backgroundId)
        if (bg) setBackground(bg)
      }
      showToast('Picked up your draft from where you left off', 'ok')
    } catch { /* corrupt or foreign draft — ignore, start fresh */ }
  }, [refLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Default background music: "Wii Shop Channel" unless a restored draft
  // (see above) or a manual pick already set musicId. Gated on
  // hydratedRef so this runs only after the draft-restore attempt above —
  // same commit, since that effect sets the ref synchronously as its first
  // line and effects run in declaration order — so an explicit "None" from
  // an older draft format is never overridden by this default. Name-matched
  // (not a hardcoded id, which is per-deployment/DB-generated) with a loose
  // pattern to tolerate the "chanel" vs "channel" spelling in the library.
  useEffect(() => {
    if (!hydratedRef.current || musicId || musicLib.length === 0) return
    const wiiShop = musicLib.find(m => /wii\s*shop/i.test(m.name || ''))
    if (wiiShop) setMusicId(wiiShop.id)
  }, [refLoaded, musicLib]) // eslint-disable-line react-hooks/exhaustive-deps

  // debounced save on every change, once the initial restore has run
  useEffect(() => {
    if (!hydratedRef.current || !draftKey) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const draft = {
        script, captionStyle, captionColor, captionY, duration, category,
        motionMode, musicId, musicVolume,
        backgroundId: background?.id || null,
        picked: picked.map(p => ({
          id: p.id, side: p.side, voiceId: p.voiceId, entry: p.entry, exit: p.exit,
          x: p.x, y: p.y, scale: p.scale, rotation: p.rotation,
        })),
      }
      try { localStorage.setItem(draftKey, JSON.stringify(draft)) } catch { /* storage full/unavailable */ }
    }, 800)
    return () => clearTimeout(saveTimerRef.current)
  }, [script, captionStyle, captionColor, captionY, duration, category, background, picked, draftKey,
      motionMode, musicId, musicVolume])

  // ── Social connect: detect callback URL params + verify server state ──
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const statusParam = params.get('status')
    if (statusParam === 'youtube_connected') {
      localStorage.setItem('yt_connected', 'true'); setYtConnected(true)
      showToast('YouTube connected!', 'ok')
      setView('clips')
      window.history.replaceState({}, '', '/brainrot/studio')
    } else if (statusParam === 'tiktok_connected') {
      localStorage.setItem('tt_connected', 'true'); setTtConnected(true)
      showToast('TikTok connected!', 'ok')
      setView('clips')
      window.history.replaceState({}, '', '/brainrot/studio')
    } else if (statusParam === 'youtube_error' || statusParam === 'tiktok_error') {
      const reason = params.get('reason') || 'unknown'
      showToast(`Connect failed: ${reason}`, 'err')
      setView('clips')
      window.history.replaceState({}, '', '/brainrot/studio')
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
      const r = await fetch(`${API_BASE}/social/auth/youtube?product=brainrot`, { headers: { Authorization: `Bearer ${token}` } })
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
      const r = await fetch(`${API_BASE}/social/auth/tiktok?product=brainrot`, { headers: { Authorization: `Bearer ${token}` } })
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

  // Open publish modal instead of posting directly
  const publishYT = (job) => {
    if (!ytConnected) { connectYT(); return }
    setPublishModal({ job, platform: 'youtube' })
  }

  const publishTT = (job) => {
    if (!ttConnected) { connectTT(); return }
    setPublishModal({ job, platform: 'tiktok' })
  }

  // Actual API call — called from PublishModal on confirm
  const doPublish = async (job, platform, opts) => {
    const jobId = job.job_id
    const setPublishing = platform === 'youtube' ? setPublishingYT : setPublishingTT
    const setPublished  = platform === 'youtube' ? setPublishedYT  : setPublishedTT
    setPublishing(prev => new Set([...prev, jobId]))
    try {
      const token = localStorage.getItem('sc_token')
      const endpoint = platform === 'youtube' ? '/social/publish/youtube' : '/social/publish/tiktok'
      const clipPayload = {
        clip_id: jobId,
        video_url: job.output_url,
        ...opts,
      }
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
        // This one is safe to show verbatim — it's our own curated copy
        // (see _publish_one_tiktok in social.py), not raw backend text.
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
      setErrorModal({
        error: friendlyError(e, { title: `Couldn't publish to ${platformLabel}` }),
        retry: () => doPublish(job, platform, opts),
      })
    }
    setPublishing(prev => { const n = new Set(prev); n.delete(jobId); return n })
  }

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3200)
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

  const chemistry = useMemo(() => {
    if (picked.length !== 2) return null
    return getChemistry(picked[0], picked[1])
  }, [picked])

  const filteredRoster = useMemo(() => {
    const q = charSearch.trim().toLowerCase()
    if (!q) return roster
    return roster.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.archetype?.toLowerCase().includes(q) ||
      c.family?.toLowerCase().includes(q))
  }, [roster, charSearch])

  // ── Cast management ─────────────────────────────────────────────
  const setCast = (n) => {
    setCastCount(n)
    setPicked(prev => prev.slice(0, n).map((p, i) => ({ ...p, side: i === 0 ? 'left' : 'right' })))
  }

  const toggleCharacter = (ch) => {
    setPicked(prev => {
      const exists = prev.find(p => p.id === ch.id)
      if (exists) return reflow(prev.filter(p => p.id !== ch.id))
      if (prev.length >= castCount) { showToast('Remove a character first, or bump the cast size.', 'warn'); return prev }
      const side = prev.some(p => p.side === 'left') ? 'right' : 'left'
      const entry = motions[0]?.id || 'slide'
      return reflow([...prev, {
        ...ch, side, voiceId: '', entry, exit: entry,
        x: side === 'left' ? 0.17 : 0.83, y: 0.76, scale: 1, rotation: 0,
      }])
    })
  }

  // keep sides consistent (first = left, second = right)
  const reflow = (arr) => arr.map((p, i) => ({ ...p, side: i === 0 ? 'left' : 'right', x: p.x ?? (i === 0 ? 0.17 : 0.83) }))

  const updatePicked = (id, patch) =>
    setPicked(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))

  // ── Signature casts — saved character pairs ─────────────────────
  const loadSignatureCast = (cast) => {
    const resolved = cast.character_ids
      .map(id => roster.find(r => r.id === id))
      .filter(Boolean)
    if (resolved.length < 2) {
      showToast('One of these characters left the roster — can\'t reload this cast.', 'warn')
      return
    }
    const entry = motions[0]?.id || 'slide'
    setCastCount(2)
    setPicked(resolved.map((ch, i) => ({
      ...ch, side: i === 0 ? 'left' : 'right', voiceId: '', entry, exit: entry,
      x: i === 0 ? 0.17 : 0.83, y: 0.76, scale: 1, rotation: 0,
    })))
    showToast(`Loaded ${cast.label || 'signature cast'}`, 'ok')
  }

  const saveCurrentCast = async () => {
    if (picked.length !== 2 || savingCast) return
    setSavingCast(true)
    try {
      const label = `${picked[0].name} & ${picked[1].name}`
      const cast = await brainrotApi.saveSignatureCast(picked.map(p => p.id), label)
      setSignatureCasts(prev => [cast, ...prev])
      showToast('Saved as a signature cast', 'ok')
    } catch (e) {
      setErrorModal({ error: friendlyError(e, { title: 'Could not save this cast' }), retry: saveCurrentCast })
    } finally {
      setSavingCast(false)
    }
  }

  const removeSignatureCast = async (id) => {
    const prevCasts = signatureCasts
    setSignatureCasts(prev => prev.filter(c => c.id !== id)) // optimistic
    try { await brainrotApi.deleteSignatureCast(id) }
    catch (e) {
      setSignatureCasts(prevCasts) // roll back the optimistic removal
      setErrorModal({ error: friendlyError(e, { title: 'Could not delete this cast' }), retry: () => removeSignatureCast(id) })
    }
  }

  const isSavedPair = picked.length === 2 && signatureCasts.some(c => {
    const ids = new Set(c.character_ids)
    return ids.has(picked[0].id) && ids.has(picked[1].id)
  })

  const moveCharacter = useCallback((side, x, y) =>
    setPicked(prev => prev.map(p => p.side === side ? { ...p, x, y } : p)), [])

  const moveCaption = useCallback((y) => setCaptionY(y), [])

  // ── Voice / music preview ─────────────────────────────────────────
  // `volume` (0-1) lets the music picker's preview actually reflect the
  // volume slider — previously always played at full volume regardless of
  // where the slider sat, so dragging it appeared to do nothing.
  //
  // `previewingUrl` tracks which track (if any) is currently playing so a
  // second click on the SAME ▶ button stops it instead of restarting it —
  // previously every click spawned a fresh Audio() that played to the end
  // regardless of what you clicked next.
  const [previewingUrl, setPreviewingUrl] = useState(null)

  const stopPreview = () => {
    if (audioRef.current) audioRef.current.pause()
    setPreviewingUrl(null)
  }

  const playPreview = (url, failMsg = 'Preview not ready yet — admin needs to generate voice samples.', volume = 1) => {
    if (!url) return
    if (previewingUrl === url && audioRef.current && !audioRef.current.paused) {
      stopPreview()
      return
    }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, volume))
    audio.onended = () => setPreviewingUrl(prev => (prev === url ? null : prev))
    audioRef.current = audio
    setPreviewingUrl(url)
    audio.play().catch(() => { showToast(failMsg, 'warn'); setPreviewingUrl(null) })
  }

  // Stop any playing preview the moment the user navigates away — to a
  // different builder stage (Spark/Scene/Cast/Style/Review) or between the
  // Create/My clips views — instead of letting it keep playing to the end
  // in the background regardless of where they went next.
  useEffect(() => { stopPreview() }, [stage, view]) // eslint-disable-line react-hooks/exhaustive-deps

  const voicesFor = (gender) => {
    // Combined pool across both TTS providers — shown as one flat list with
    // no provider distinction (see voice_catalog.default_voice_for_gender
    // backend-side). gender-matching voices first.
    return [...voices].sort((a, b) =>
      (a.gender === gender ? -1 : 0) - (b.gender === gender ? -1 : 0))
  }

  // ── Validation ──────────────────────────────────────────────────
  const problems = useMemo(() => {
    const p = []
    if (!script.trim()) p.push('Add a script or idea')
    if (!background) p.push('Pick a gameplay background')
    if (castCount > 0 && picked.length < castCount) p.push(`Pick ${castCount} character${castCount > 1 ? 's' : ''}`)
    return p
  }, [script, background, castCount, picked])

  const canGenerate = problems.length === 0 && !submitting && !isActive(activeJob)

  // Per-stage completion, driving the rail's checkmarks — Style and Review
  // have no hard requirement of their own (sensible defaults / nothing to
  // fill in), so they read "done" once the stages that DO gate Generate are.
  const stageDone = {
    spark: !!script.trim(),
    cast: castCount === 0 || picked.length >= castCount,
    scene: !!background,
    style: true,
    review: problems.length === 0,
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
        script_input: script.trim(),
        character_positions: picked.map(p => ({
          character_id: p.id, side: p.side,
          x: p.x, y: p.y, scale: p.scale, rotation: p.rotation,
          entry: p.entry, exit: p.exit,
        })),
        gameplay_clip_id: background.id,
        duration_seconds: duration,
        caption_style: captionStyle,
        caption_color: captionColor,
        caption_y: captionY,
        voice_left: picked.find(p => p.side === 'left')?.voiceId || '',
        voice_right: picked.find(p => p.side === 'right')?.voiceId || '',
        motion_mode: motionMode,
        music_asset_id: musicId || null,
        music_volume: musicVolume,
        post_title: postTitle,
        post_hashtags: postHashtags,
      }
      const { job_id } = await brainrotApi.createJob(options)
      if (draftKey) { try { localStorage.removeItem(draftKey) } catch { /* ignore */ } }
      showToast('Cooking your brainrot clip… 🍳', 'ok')
      // Optimistic — the authoritative counts land once the job finishes
      // and pollJob resyncs from the server (see below).
      setClipsCounts(prev => ({ ...prev, all: prev.all + 1, active: prev.active + 1 }))
      pollJob(job_id)
      setView('clips')
    } catch (e) {
      setErrorModal({ error: friendlyError(e, { title: 'Could not start your clip' }), retry: generate })
    } finally {
      setSubmitting(false)
    }
  }

  const pollJob = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    const tick = async () => {
      try {
        const job = await brainrotApi.getJob(jobId)
        setActiveJob(job)
        if (!isActive(job)) {
          clearInterval(pollRef.current); pollRef.current = null
          if (job.status === 'complete') {
            showToast('Done! 🔥', 'ok')
            setMyClips(prev => [job, ...prev.filter(c => c.job_id !== job.job_id)])
          } else if (job.status === 'failed') {
            showToast(job.error_message || 'Generation failed', 'err')
          }
          // Resync counts + first page from the server now that this job
          // has left the "active" state — the optimistic bump in generate()
          // only estimated the totals.
          loadClipsPage(clipsFilter, 0, false)
        }
      } catch { /* keep polling through transient errors */ }
    }
    tick()
    pollRef.current = setInterval(tick, 2500)
  }

  // Picks up a job the reference-data load effect (above) found still
  // active from an earlier visit — see resumeActiveJobId's own comment.
  // Placed here (after pollJob's declaration) rather than inside that
  // earlier effect directly, since pollJob isn't in scope yet up there.
  useEffect(() => {
    if (resumeActiveJobId) pollJob(resumeActiveJobId)
  }, [resumeActiveJobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Connection state — quietly true when everything's fine, quietly
  // encourages a retry when it isn't. No page-wide red banner.
  const anyOffline = !rosterOnline || !clipsOnline
  const retryFetches = () => setRefetchTick(t => t + 1)

  // clips tab data: merge the actively-polling job in so it shows up live,
  // then re-apply the current tab's filter (myClips is already server-
  // filtered per clipsFilter, but the merged-in activeJob isn't, so a job
  // that just started wouldn't otherwise respect e.g. the "Ready" tab).
  const libraryClips = activeJob && isActive(activeJob)
    ? [activeJob, ...myClips.filter(c => c.job_id !== activeJob.job_id)]
    : myClips
  const visibleLibraryClips = libraryClips.filter(c => {
    if (c.status === 'failed') return false
    if (clipsFilter === 'active') return isActive(c)
    if (clipsFilter === 'complete') return c.status === 'complete'
    return true
  })
  // clipsCounts comes from the server and may lag by one until the next
  // resync (see pollJob) — Math.max keeps a just-started job reflected
  // immediately in the sidenav/header without waiting on that round-trip.
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
        />
      )}

      <ErrorModal
        error={errorModal?.error}
        onClose={() => setErrorModal(null)}
        onRetry={errorModal?.retry ? () => { const r = errorModal.retry; setErrorModal(null); r() } : undefined}
      />

      <Header user={user} onLogout={logout} navigate={navigate}
        connectionOffline={anyOffline} onRetryConnection={retryFetches}
        clipsCounts={clipsCounts} hasActiveJob={isActive(activeJob)} />

      <div className="br-shell" style={{ maxWidth: 1360, margin: '0 auto', padding: '20px 24px 0',
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
          onPublishYT={publishYT} onPublishTT={publishTT}
          onConnectYT={connectYT} onConnectTT={connectTT}
          onDisconnect={disconnectSocial} socialEnabled={socialEnabled} />
      ) : (
      <div className="br-studio-grid" style={{ padding: '8px 0 80px',
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 32, alignItems: 'start' }}>

        {/* ══ LEFT: builder ══════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>

          <StageRail stage={stage} onJump={goToStage} stageDone={stageDone} />

          {stage === 'spark' && (
          <StageShell id="spark">
            <div style={{ position: 'relative' }}>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="A hot take, an argument, something people would fight about in the comments..."
                rows={4}
                style={{
                  width: '100%', resize: 'vertical', boxSizing: 'border-box',
                  background: '#fff',
                  border: `1px solid ${T.line}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  fontSize: '.92rem', fontFamily: FONT,
                  color: T.ink, lineHeight: 1.6, outline: 'none',
                }}
              />
              <div style={{ position: 'absolute', top: 12, right: 14,
                fontSize: '.7rem', color: T.mute }}>
                {script.length}/280
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <SubLabel>Or try a topic</SubLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setScript(pickTopic(script))} {...pressHandlers}
                  style={{ ...pill(T.ink, { cursor: 'pointer', color: '#fff', border: 'none' }) }}>
                  Surprise me
                </button>
                {SPARK_TOPICS.slice(0, 6).map(t => (
                  <button key={t} onClick={() => setScript(t)}
                    style={{ ...pill('#fff', { cursor: 'pointer' }) }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Post meta — auto-generated, user-editable */}
            {(postTitle || postHashtags.length > 0 || metaLoading) && (
              <div style={{
                marginTop: 16, padding: '14px 16px', borderRadius: 10,
                background: '#faf5ff', border: '1.5px solid #e9d5ff',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#7c3aed',
                    textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Post metadata
                  </span>
                  {metaLoading && (
                    <span style={{ fontSize: '.68rem', color: '#a78bfa' }}>✦ generating…</span>
                  )}
                </div>
                {/* Title */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: '.7rem', fontWeight: 600, color: '#6b21a8',
                    display: 'block', marginBottom: 4 }}>Title</label>
                  <input
                    value={postTitle}
                    onChange={e => setPostTitle(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. This debate is INSANE 🔥"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      border: '1.5px solid #d8b4fe', borderRadius: 7,
                      padding: '8px 12px', fontSize: '.86rem', fontFamily: FONT,
                      background: '#fff', color: T.ink, outline: 'none',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#7c3aed'}
                    onBlur={e => e.currentTarget.style.borderColor = '#d8b4fe'}
                  />
                  <div style={{ textAlign: 'right', fontSize: '.65rem', color: '#a78bfa', marginTop: 2 }}>
                    {postTitle.length}/100
                  </div>
                </div>
                {/* Hashtags */}
                <div>
                  <label style={{ fontSize: '.7rem', fontWeight: 600, color: '#6b21a8',
                    display: 'block', marginBottom: 6 }}>Hashtags</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {postHashtags.map((tag, i) => (
                      <span key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#ede9fe', color: '#6d28d9',
                        border: '1px solid #c4b5fd', borderRadius: 999,
                        padding: '3px 10px', fontSize: '.76rem', fontWeight: 600,
                      }}>
                        {tag}
                        <button onClick={() => setPostHashtags(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                            color: '#a78bfa', fontSize: '.7rem', padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    <HashtagInput onAdd={tag => setPostHashtags(prev => [...new Set([...prev, tag])])} />
                  </div>
                </div>
              </div>
            )}

            <StageFootnote>
              The AI writes each character fully in-character and paces the dialogue to
              your chosen clip length.
            </StageFootnote>
            <StageNextButton label="Next: Scene" onClick={goNext} />
          </StageShell>
          )}

          {stage === 'cast' && (
          <StageShell id="cast">
            <SubLabel>Cast size</SubLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
              {[
                { n: 0, title: 'Solo narrator',  sub: 'Voice only' },
                { n: 1, title: 'Monologue',      sub: '1 character' },
                { n: 2, title: 'Debate',         sub: '2 characters' },
              ].map(opt => {
                const on = castCount === opt.n
                return (
                  <button key={opt.n} onClick={() => setCast(opt.n)}
                    style={{
                      cursor: 'pointer', textAlign: 'left', padding: '12px 14px',
                      background: on ? T.ink : '#fff',
                      color: on ? '#fff' : T.ink,
                      border: `1px solid ${on ? T.ink : T.line}`,
                      borderRadius: 10, transition: 'all .12s',
                    }}>
                    <div style={{ fontWeight: 500, fontSize: '.85rem' }}>{opt.title}</div>
                    <div style={{ fontSize: '.72rem', opacity: .6, marginTop: 2 }}>{opt.sub}</div>
                  </button>
                )
              })}
            </div>

            {signatureCasts.length > 0 && castCount === 2 && (
              <div style={{ marginBottom: 20 }}>
                <SubLabel>Saved casts</SubLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {signatureCasts.map(cast => (
                    <SignatureCastChip key={cast.id} cast={cast} roster={roster}
                      onLoad={() => loadSignatureCast(cast)}
                      onDelete={() => removeSignatureCast(cast.id)} />
                  ))}
                </div>
              </div>
            )}

            {picked.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <SubLabel>Selected</SubLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {picked.map(p => (
                    <PickedCard key={p.id} p={p} motions={motions}
                      voices={voicesFor(p.gender)}
                      onRemove={() => toggleCharacter(p)}
                      onVoice={(voiceId) => updatePicked(p.id, { voiceId })}
                      onEntry={(entry) => updatePicked(p.id, { entry })}
                      onExit={(exit) => updatePicked(p.id, { exit })}
                      onScale={(scale) => updatePicked(p.id, { scale })}
                      onRotation={(rotation) => updatePicked(p.id, { rotation })}
                      onPreview={playPreview} />
                  ))}
                  {chemistry && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                      <div style={{ flex: 1 }}><ChemistryBadge chemistry={chemistry} /></div>
                      <button onClick={saveCurrentCast} disabled={isSavedPair || savingCast}
                        title={isSavedPair ? 'Already saved' : 'Save this pair'}
                        style={{
                          cursor: isSavedPair ? 'default' : 'pointer',
                          background: '#fff',
                          border: `1px solid ${isSavedPair ? T.green : T.line}`,
                          borderRadius: 8, padding: '0 14px',
                          fontWeight: 500, fontSize: '.8rem',
                          color: isSavedPair ? T.green : T.ink,
                          whiteSpace: 'nowrap', fontFamily: FONT,
                        }}>
                        {isSavedPair ? 'Saved' : savingCast ? 'Saving...' : 'Save cast'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {castCount === 2 && picked.length === 2 && (
              <div style={{ marginBottom: 20 }}>
                <SubLabel>Motion mode</SubLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {[
                    { id: 'turn_based', title: 'Turn-based', sub: 'Swap per dialogue line' },
                    { id: 'always_on',  title: 'Always on',  sub: 'Both stay on screen' },
                  ].map(opt => {
                    const on = motionMode === opt.id
                    return (
                      <button key={opt.id} onClick={() => setMotionMode(opt.id)}
                        style={{
                          cursor: 'pointer', textAlign: 'left', padding: '12px 14px',
                          background: on ? T.ink : '#fff', color: on ? '#fff' : T.ink,
                          border: `1px solid ${on ? T.ink : T.line}`,
                          borderRadius: 10,
                        }}>
                        <div style={{ fontWeight: 500, fontSize: '.85rem' }}>{opt.title}</div>
                        <div style={{ fontSize: '.72rem', opacity: .6, marginTop: 2 }}>{opt.sub}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {castCount > 0 && !rosterOnline && roster.length === 0 ? (
              <OfflineState
                title="Character library unreachable"
                sub="We'll retry automatically, or you can trigger it manually."
                onRetry={retryFetches}
              />
            ) : castCount > 0 ? (
              <>
                <SubLabel>Characters ({roster.length || '100+'})</SubLabel>
                <input value={charSearch} onChange={e => setCharSearch(e.target.value)}
                  placeholder="Search by name, family, or archetype..."
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12,
                    background: '#fff', border: `1px solid ${T.line}`, borderRadius: 8,
                    padding: '10px 14px', fontSize: '.85rem', fontFamily: FONT, outline: 'none' }} />
                <div style={{
                  background: '#fff',
                  border: `1px solid ${T.line}`,
                  borderRadius: 10, padding: 8,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))',
                    gap: 6, maxHeight: 320, overflowY: 'auto', padding: 2 }}>
                    {filteredRoster.map(ch => {
                      const on = picked.some(p => p.id === ch.id)
                      return (
                        <button key={ch.id} onClick={() => toggleCharacter(ch)} title={`${ch.name} — ${ch.archetype}`}
                          style={{ position: 'relative', cursor: 'pointer', padding: 4,
                            background: on ? T.lineSoft : '#fff',
                            border: on ? `2px solid ${T.ink}` : `1px solid ${T.line}`,
                            borderRadius: 8, transition: 'all .1s' }}>
                          <div style={{ width: '100%', aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                            background: T.lineSoft, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                            <img src={ch.image_url} alt={ch.name} loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <div style={{ fontSize: '.62rem', fontWeight: 500, marginTop: 4, lineHeight: 1.1,
                            color: T.ink,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</div>
                          {on && <div style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16,
                            borderRadius: '50%', background: T.ink, color: '#fff',
                            fontSize: '.58rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <StageFootnote>
                Pure narrator voice-over — no characters on screen, just captions over gameplay.
              </StageFootnote>
            )}
            <StageNextButton label="Next: Style" onClick={goNext} />
          </StageShell>
          )}

          {stage === 'scene' && (
          <StageShell id="scene">
            {!clipsOnline && clipsLib.length === 0 ? (
              <OfflineState
                title="Backdrop library unreachable"
                sub="Not your fault. Retry, or come back to this step later."
                onRetry={retryFetches}
              />
            ) : clipsLib.length === 0 ? (
              <StageFootnote>
                No backdrops uploaded yet. An admin adds gameplay clips through the internal library.
              </StageFootnote>
            ) : (
              <>
                <SubLabel>Category</SubLabel>
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
                <div style={{
                  background: '#fff',
                  border: `1px solid ${T.line}`,
                  borderRadius: 10, padding: 8,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))', gap: 6 }}>
                    {visibleClips.map(clip => (
                      <GameplayTile key={clip.id} clip={clip}
                        on={background?.id === clip.id} onClick={() => setBackground(clip)} />
                    ))}
                  </div>
                </div>
              </>
            )}

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
                      background: !musicId ? T.ink : '#fff',
                      color: !musicId ? '#fff' : T.ink,
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
                          title={previewingUrl === m.gcs_path ? 'Stop preview' : `Preview at ~${Math.round(musicVolume * MUSIC_DUCK_FACTOR * 100)}% — ducked under dialogue, like it plays in the real clip`}
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
                {/* Always visible AND always interactive (not gated on
                    musicId) — a `disabled` attribute here previously made
                    the slider genuinely non-draggable whenever "None" was
                    selected, which is exactly the state it defaults to, so
                    most people's first encounter with this control was one
                    that looked broken. Pre-setting a volume before picking
                    a track is harmless (music_volume is a no-op server-side
                    until music_asset_id is actually set), so there's no
                    reason to lock it — the hint text is enough context. */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    fontSize: '.75rem', color: T.mute, marginBottom: 4 }}>
                    <span>Volume{!musicId && ' — applies once you pick a track'}</span>
                    <span>{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input type="range" min={0.2} max={0.6} step={0.02} value={musicVolume}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setMusicVolume(v)
                      // Live-update whatever preview is currently playing —
                      // previously the slider only took effect on the NEXT
                      // ▶ click, so dragging it while a track played had no
                      // audible effect at all and looked completely dead.
                      // Scaled by the same duck factor the preview plays
                      // at, so a live drag matches what you already hear.
                      if (audioRef.current) audioRef.current.volume = v * MUSIC_DUCK_FACTOR
                    }}
                    style={{ width: '100%', accentColor: T.ink, cursor: 'pointer' }} />
                </div>
              </>
            )}

            <StageNextButton label="Next: Cast" onClick={goNext} />
          </StageShell>
          )}

          {stage === 'style' && (
          <StageShell id="style">
            <SubLabel>Duration</SubLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 500, color: T.ink, lineHeight: 1 }}>
                {duration}
              </span>
              <span style={{ fontSize: '.85rem', color: T.mute }}>seconds</span>
            </div>
            <input type="range" min={5} max={120} step={5} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: T.ink }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, marginBottom: 24 }}>
              {DURATION_PRESETS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  style={{
                    cursor: 'pointer',
                    background: duration === d ? T.ink : '#fff',
                    color: duration === d ? '#fff' : T.ink,
                    border: `1px solid ${duration === d ? T.ink : T.line}`,
                    borderRadius: 999, padding: '4px 12px',
                    fontSize: '.75rem', fontWeight: 500,
                  }}>
                  {d}s
                </button>
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
                      border: `1px solid ${on ? T.ink : T.line}`,
                      borderRadius: 10, transition: 'all .12s' }}>
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
                        border: `1px solid ${on ? T.ink : T.line}`,
                        borderRadius: 8, transition: 'all .12s' }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 500 }}>{cs.label}</div>
                      <div style={{ fontSize: '.68rem', opacity: .6, marginTop: 2 }}>{cs.sub}</div>
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <SubLabel>Caption color</SubLabel>
              <span style={{ fontSize: '.75rem', color: T.mute }}>
                {CAPTION_COLOR_BY_ID[captionColor]?.label}
              </span>
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
                      boxShadow: on ? `0 0 0 2px ${T.ink}` : 'none',
                      transition: 'box-shadow .12s',
                    }} />
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <SubLabel>Caption position</SubLabel>
              <span style={{ fontSize: '.75rem', color: T.mute }}>
                {Math.round(captionY * 100)}%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: '.72rem', color: T.mute }}>Top</span>
              <input type="range" min={0} max={1} step={0.01} value={captionY}
                onChange={e => setCaptionY(Number(e.target.value))}
                style={{ flex: 1, accentColor: T.ink }} />
              <span style={{ fontSize: '.72rem', color: T.mute }}>Bottom</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
              {[{ label: 'Top', v: 0.14 }, { label: 'Middle', v: 0.5 }, { label: 'Bottom', v: 0.82 }].map(p => (
                <button key={p.label} onClick={() => setCaptionY(p.v)}
                  style={{
                    cursor: 'pointer',
                    background: Math.abs(captionY - p.v) < 0.01 ? T.ink : '#fff',
                    color: Math.abs(captionY - p.v) < 0.01 ? '#fff' : T.ink,
                    border: `1px solid ${Math.abs(captionY - p.v) < 0.01 ? T.ink : T.line}`,
                    borderRadius: 999, padding: '4px 12px',
                    fontSize: '.75rem', fontWeight: 500, fontFamily: FONT,
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
            <StageFootnote>
              Drag the caption on the preview to reposition. Burned in at this exact spot when rendered.
            </StageFootnote>

            <StageNextButton label="Next: Review" onClick={goNext} />
          </StageShell>
          )}

          {stage === 'review' && (
          <StageShell id="review">
            <div style={{
              border: `1px solid ${T.line}`,
              borderRadius: 10, overflow: 'hidden', background: '#fff',
            }}>
              <div style={{ background: T.ink, color: '#fff',
                padding: '10px 16px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', fontSize: '.75rem', fontWeight: 500 }}>
                <span>Summary</span>
                <span style={{ opacity: .6 }}>{problems.length === 0 ? 'Ready' : `${problems.length} missing`}</span>
              </div>
              <CallsheetRow label="Script" done={stageDone.spark} onEdit={() => goToStage('spark')}>
                {script.trim() ? `"${script.trim().slice(0, 80)}${script.trim().length > 80 ? '...' : ''}"` : <em style={{ color: T.mute }}>No topic yet</em>}
              </CallsheetRow>
              <CallsheetRow label="Scene" done={stageDone.scene} onEdit={() => goToStage('scene')}>
                {background ? `${background.category?.replace(/_/g, ' ') || 'Background'}${background.source_title ? ` — ${background.source_title}` : ''}` :
                  <em style={{ color: T.mute }}>No backdrop yet</em>}
                {musicId ? ` · ${musicLib.find(m => m.id === musicId)?.name || 'music'}` : ''}
              </CallsheetRow>
              <CallsheetRow label="Cast" done={stageDone.cast} onEdit={() => goToStage('cast')}>
                {castCount === 0 ? 'Narrator only' :
                  picked.length ? `${picked.map(p => p.name).join(' vs ')}${castCount === 2 ? ` · ${motionMode === 'always_on' ? 'always on' : 'turn-based'}` : ''}` :
                  <em style={{ color: T.mute }}>{`0 of ${castCount} picked`}</em>}
              </CallsheetRow>
              <CallsheetRow label="Style" done={stageDone.style} onEdit={() => goToStage('style')} last>
                {duration}s · {CAPTION_STYLE_BY_ID[captionStyle]?.label || captionStyle}
              </CallsheetRow>
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px',
              background: T.paper, borderRadius: 8 }}>
              <div style={{ fontSize: '.82rem', color: T.ink, lineHeight: 1.5 }}>
                <strong style={{ fontWeight: 500 }}>1 credit</strong> — charged only when the clip finishes rendering.
                Refunded automatically if anything fails.
              </div>
            </div>

            {problems.length > 0 && (
              <div style={{ marginTop: 12, padding: '12px 16px',
                background: '#fef2f2', borderRadius: 8 }}>
                {problems.map((p, i) => (
                  <div key={i} style={{ fontSize: '.82rem', fontWeight: 500, color: T.redDark,
                    display: 'flex', gap: 8, marginBottom: 2 }}>
                    <span>·</span>{p}
                  </div>
                ))}
              </div>
            )}
          </StageShell>
          )}
        </div>

        {/* ══ RIGHT: preview + generate (sticky) ═════════════════ */}
        <div className="br-studio-preview" style={{ position: 'sticky', top: 112, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PreviewStage
            background={background}
            characters={picked}
            captionStyle={captionStyle}
            captionColor={captionColor}
            captionY={captionY}
            motionMode={motionMode}
            onMoveCharacter={moveCharacter}
            onMoveCaption={moveCaption}
            chemistry={chemistry}
          />

          {isActive(activeJob) ? (
            <ProgressCard job={activeJob} />
          ) : (
            <>
              <button onClick={generate} disabled={!canGenerate} {...pressHandlers}
                style={{ ...btn(canGenerate ? T.ink : T.line, '#fff'),
                  width: '100%', padding: '14px 0', fontSize: '.92rem',
                  cursor: canGenerate ? 'pointer' : 'not-allowed' }}>
                {submitting ? 'Starting...' : 'Generate'}
              </button>
              {problems.length > 0 && (
                <div style={{ padding: '12px 14px', background: T.paper,
                  borderRadius: 8 }}>
                  <div style={{ fontSize: '.72rem', color: T.mute, marginBottom: 6 }}>
                    Still needed
                  </div>
                  {problems.map((p, i) => (
                    <div key={i} style={{ fontSize: '.8rem', fontWeight: 500, color: T.ink,
                      display: 'flex', gap: 7, marginBottom: 2 }}>
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
        <div className="br-toast" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: toast.type === 'err' ? '#fef2f2' : toast.type === 'ok' ? '#f0fdf4' : '#fff',
          border: `1px solid ${toast.type === 'err' ? '#fecaca' : toast.type === 'ok' ? '#bbf7d0' : T.line}`,
          borderRadius: 8, padding: '10px 18px', fontSize: '.85rem', fontWeight: 500,
          color: toast.type === 'err' ? T.redDark : toast.type === 'ok' ? '#166534' : T.ink }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function isActive(job) { return !!job && ACTIVE_STATUSES.includes(job.status) }

// picks a random Spark topic, avoiding an immediate repeat of the current script
function pickTopic(current) {
  const pool = SPARK_TOPICS.filter(t => t !== current)
  return pool[Math.floor(Math.random() * pool.length)] || SPARK_TOPICS[0]
}

function Header({ user, onLogout, navigate, connectionOffline, onRetryConnection, clipsCounts, hasActiveJob }) {
  const initials = (user?.full_name || user?.email || 'U')[0].toUpperCase()

  // Brainrot-only stats — sourced from GET /brainrot/clips's server-computed
  // counts rather than the (now paginated) client-side clip list, so these
  // stay accurate regardless of how many pages have been loaded. Failed
  // clips are excluded server-side so a stuck/errored run never lingers as
  // a distraction on the dashboard. Math.max covers the gap between a job
  // just starting and the next server resync (see pollJob).
  const totalCount     = clipsCounts.all
  const readyCount     = clipsCounts.complete
  const renderingCount = Math.max(clipsCounts.active, hasActiveJob ? 1 : 0)
  const queuedCount    = clipsCounts.queued

  const stats = [
    { n: totalCount,     l: 'Clips made', c: T.ink },
    { n: readyCount,     l: 'Ready',      c: T.green },
    { n: renderingCount, l: 'Rendering',  c: '#f59e0b' },
    { n: queuedCount,    l: 'Queued',     c: T.blue },
  ]

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 200,
      background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.line}`,
    }}>
      {/* Row 1 — brand + user chrome */}
      <div className="br-studio-headrow" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12 }}>
        <Link to="/brainrot" style={{ display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', color: T.ink }}>
          <Logo size={26} />
          <span style={{ fontSize: '.95rem', fontWeight: 600, letterSpacing: '-.02em' }}>
            ShortClipr
          </span>
          <span className="br-studio-tag" style={{
            fontSize: '.62rem', color: T.mute, letterSpacing: '.06em',
            textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4,
            background: T.lineSoft, marginLeft: 2,
          }}>Brainrot</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {typeof user?.brainrot_credits_remaining === 'number' && (
            <Link to="/brainrot/billing" title="Credits remaining — click to top up" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
              background: T.lineSoft, border: `1px solid ${T.line}`, borderRadius: 999,
              padding: '5px 12px', fontSize: '.78rem', fontWeight: 600, color: T.ink,
            }}>
              <span style={{ fontSize: '.85rem' }}>🧠</span>
              {user.brainrot_credits_remaining} credit{user.brainrot_credits_remaining === 1 ? '' : 's'}
            </Link>
          )}
          {connectionOffline && (
            <button onClick={onRetryConnection}
              title="Some data isn't reachable — click to retry"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: 999,
                padding: '4px 12px',
                fontFamily: FONT, fontSize: '.75rem', fontWeight: 500, color: T.redDark,
              }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.red,
                display: 'inline-block', animation: 'br-pulse-dot 1.4s ease-in-out infinite' }} />
              Reconnecting
            </button>
          )}
          <div style={{ width: 30, height: 30, borderRadius: '50%',
            background: T.lineSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.ink, fontWeight: 500, fontSize: '.78rem', overflow: 'hidden' }}>
            {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <button onClick={onLogout} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: FONT, fontSize: '.78rem', fontWeight: 500, color: T.mute,
            padding: '4px 8px',
          }}>Sign out</button>
        </div>
      </div>

      {/* Row 2 — stats grid, same layout as YT-shorts Dashboard */}
      <div className="br-header-stats" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        borderTop: `1px solid ${T.line}`,
      }}>
        {stats.map((s, i, arr) => (
          <div key={i} style={{
            padding: '8px 12px',
            borderRight: i < arr.length - 1 ? `1px solid ${T.line}` : 'none',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            minWidth: 0,
          }}>
            <div style={{
              fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-.04em',
              color: s.c, lineHeight: 1.1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.n}</div>
            <div style={{
              fontSize: '.6rem', color: T.mute, textTransform: 'uppercase',
              letterSpacing: '.08em', marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{s.l}</div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes br-pulse-dot { 0%,100% { opacity: .4 } 50% { opacity: 1 } }
        @keyframes brSpin { to { transform: rotate(360deg) } }

        /* ── Tablet / mobile: stack the two-column studio grid, and turn
           the desktop side rail into a fixed bottom tab bar (the standard
           mobile-app nav pattern) instead of squeezing a sticky sidebar
           full of desktop-density content under the header. Publish/social
           connect moves out of the tab bar entirely — see .br-clips-connect
           below, rendered inside "My clips" instead, where it's contextual. */
        @media (max-width: 900px) {
          .br-studio-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .br-studio-preview { position: static !important; top: auto !important; }
          .br-preview-stage { max-width: min(340px, 82vw) !important; margin: 0 auto !important; }
          .br-shell { flex-direction: column !important; gap: 0 !important; padding-top: 14px !important;
            padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; }

          .br-sidenav {
            position: fixed !important; inset: auto 0 0 0 !important; top: auto !important;
            width: 100% !important; flex-direction: row !important; flex-wrap: nowrap !important;
            align-items: stretch !important; gap: 2px !important;
            border-radius: 0 !important; border-left: none !important; border-right: none !important; border-bottom: none !important;
            padding: 6px calc(env(safe-area-inset-right, 0px) + 6px) calc(env(safe-area-inset-bottom, 0px) + 6px) calc(env(safe-area-inset-left, 0px) + 6px) !important;
            box-shadow: 0 -2px 14px rgba(0,0,0,.07) !important;
            z-index: 300 !important;
          }
          .br-sidenav > button, .br-sidenav > a {
            flex: 1 !important; flex-direction: column !important; justify-content: center !important;
            gap: 2px !important; min-height: 54px !important; padding: 6px 4px !important;
            font-size: .66rem !important; border-radius: 10px !important;
          }
          .br-sidenav > button > span, .br-sidenav > a > span { flex: none !important; }
          .br-sidenav > div:not(.br-pub-section) { display: none !important; } /* divider */
          .br-pub-section { display: none !important; } /* relocated to .br-clips-connect on mobile */

          /* "Connected accounts" — shown at the top of My Clips on mobile only
             (desktop already has this in the side rail). */
          .br-clips-connect { display: block !important; }
        }

        @media (max-width: 640px) {
          .br-studio-headrow { padding: 8px 12px !important; gap: 8px !important; }
          .br-shell { padding-left: 12px !important; padding-right: 12px !important; }
          .br-studio-tag { display: none; }
          .br-publish-modal-card { padding: 16px 14px 14px !important; border-radius: 12px !important; }
          .br-header-stats > div { padding: 7px 8px !important; }
          .br-header-stats > div > div:first-child { font-size: .92rem !important; }
          .br-stage-body { padding: 18px 16px 22px !important; }
          .br-stage-body h2 { font-size: 1.05rem !important; }
          .br-callsheet-row { grid-template-columns: 62px 1fr 38px !important; padding: 10px 12px !important; gap: 8px !important; }
          .br-toast { bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important; max-width: calc(100vw - 32px) !important; }
        }

        @media (max-width: 400px) {
          .br-stage-rail { overflow-x: auto !important; scrollbar-width: none !important; }
          .br-stage-rail::-webkit-scrollbar { display: none !important; }
          .br-stage-rail button { flex: 0 0 auto !important; min-width: 62px !important; }
          .br-stage-rail > span { display: none !important; }
        }
      `}</style>
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

// ── Small inline hashtag adder ─────────────────────────────────────
function HashtagInput({ onAdd }) {
  const [val, setVal] = useState('')
  const commit = () => {
    const tag = val.trim().replace(/\s+/g, '').replace(/^#*/, '#')
    if (tag.length > 1) { onAdd(tag); setVal('') }
  }
  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() } }}
      onBlur={commit}
      placeholder="+ add tag"
      maxLength={40}
      style={{
        border: '1.5px dashed #c4b5fd', borderRadius: 999, background: 'transparent',
        padding: '3px 10px', fontSize: '.76rem', color: '#6d28d9',
        fontFamily: FONT, outline: 'none', width: 90,
      }}
    />
  )
}

// ── Publish modal — shown when user clicks YT or TT on a ClipCard ─
function PublishModal({ job, platform, ytConnected, ttConnected, onClose, onPublish }) {
  const isPlatConnected = platform === 'youtube' ? ytConnected : ttConnected
  const tags = job.post_hashtags || []
  const defaultTitle = job.post_title || (job.script_input || '').slice(0, 80) || 'Brainrot Clip'

  const [title, setTitle]         = useState(defaultTitle)
  const [description, setDesc]    = useState(tags.join(' '))
  const [hashtags, setHashtags]   = useState(tags)
  // YouTube
  const [ytPrivacy, setYtPrivacy] = useState('public')
  // TikTok
  // TikTok rejects anything but SELF_ONLY until the app passes their
  // Content Posting API audit — default + lock to that so users aren't
  // offered an option that will fail (see backend TIKTOK_APP_AUDITED).
  const [ttPrivacy, setTtPrivacy] = useState('SELF_ONLY')
  const [noDuet, setNoDuet]       = useState(false)
  const [noComment, setNoComment] = useState(false)
  const [noStitch, setNoStitch]   = useState(false)

  const [busy, setBusy] = useState(false)

  const fullTitle = hashtags.length
    ? `${title} ${hashtags.join(' ')}`.slice(0, platform === 'youtube' ? 100 : 150)
    : title.slice(0, platform === 'youtube' ? 100 : 150)

  const handlePublish = async () => {
    setBusy(true)
    await onPublish(job, platform, {
      title: fullTitle,
      description,
      tags: hashtags,
      privacy_status: ytPrivacy,
      privacy_level: ttPrivacy,
      disable_duet: noDuet,
      disable_comment: noComment,
      disable_stitch: noStitch,
    })
    setBusy(false)
    onClose()
  }

  const isYT = platform === 'youtube'
  const accent = isYT ? '#cf1322' : '#000'
  const platformLabel = isYT ? 'YouTube Shorts' : 'TikTok'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="br-publish-modal-card" style={{
        background: '#fff', borderRadius: 16,
        border: `2px solid ${T.ink}`, boxShadow: `6px 6px 0 ${accent}`,
        width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto',
        padding: '24px 24px 20px',
        fontFamily: FONT,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          {isYT
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill={accent}><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            : <svg width="17" height="20" viewBox="0 0 24 24" fill={accent}><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.26 6.26 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.94a8.17 8.17 0 0 0 4.78 1.52V7.01a4.85 4.85 0 0 1-1.01-.32z"/></svg>
          }
          <span style={{ fontSize: '1rem', fontWeight: 800, color: T.ink }}>
            Post to {platformLabel}
          </span>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            cursor: 'pointer', color: T.mute, fontSize: '1.1rem', lineHeight: 1,
          }}>✕</button>
        </div>

        {!isPlatConnected && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef9c3',
            border: '1px solid #fde047', fontSize: '.82rem', color: '#854d0e', marginBottom: 16 }}>
            {platformLabel} isn't connected yet — connect it from the sidebar first.
          </div>
        )}

        {/* Title */}
        <Field label={`Title ${isYT ? '(max 100 chars)' : '(caption, max 150 chars)'}`}>
          <input value={title} onChange={e => setTitle(e.target.value)}
            maxLength={isYT ? 100 : 150}
            style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = accent}
            onBlur={e => e.currentTarget.style.borderColor = T.line}
          />
          <div style={{ textAlign: 'right', fontSize: '.65rem', color: T.mute, marginTop: 2 }}>
            {fullTitle.length}/{isYT ? 100 : 150} chars (hashtags included)
          </div>
        </Field>

        {/* Hashtags */}
        <Field label="Hashtags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px',
            border: `1.5px solid ${T.line}`, borderRadius: 8, minHeight: 44 }}>
            {hashtags.map((tag, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: T.lineSoft, borderRadius: 999,
                padding: '2px 9px', fontSize: '.76rem', fontWeight: 600, color: T.ink,
              }}>
                {tag}
                <button onClick={() => setHashtags(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: T.mute, fontSize: '.7rem', padding: 0 }}>×</button>
              </span>
            ))}
            <HashtagInput onAdd={tag => setHashtags(prev => [...new Set([...prev, tag])])} />
          </div>
        </Field>

        {/* Description — YouTube only */}
        {isYT && (
          <Field label="Description (optional)">
            <textarea value={description} onChange={e => setDesc(e.target.value)}
              rows={3} maxLength={5000}
              placeholder="Add more context, links, credits..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT }}
              onFocus={e => e.currentTarget.style.borderColor = accent}
              onBlur={e => e.currentTarget.style.borderColor = T.line}
            />
          </Field>
        )}

        {/* Platform options */}
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: T.mute,
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Options
          </div>

          {isYT ? (
            <Field label="Privacy">
              <div style={{ display: 'flex', gap: 8 }}>
                {[['public','Public'],['unlisted','Unlisted'],['private','Private']].map(([v,l]) => (
                  <button key={v} onClick={() => setYtPrivacy(v)}
                    style={{
                      flex: 1, padding: '7px 4px', borderRadius: 7, cursor: 'pointer',
                      fontSize: '.76rem', fontWeight: 600, fontFamily: FONT,
                      border: `1.5px solid ${ytPrivacy === v ? accent : T.line}`,
                      background: ytPrivacy === v ? (accent === '#cf1322' ? '#fef2f2' : '#f0f0f0') : '#fff',
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
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8,
                        cursor: locked ? 'not-allowed' : 'pointer', fontSize: '.82rem', fontWeight: 500,
                        opacity: locked ? .45 : 1 }}>
                        <input type="radio" checked={ttPrivacy === v} disabled={locked}
                          onChange={() => setTtPrivacy(v)} style={{ accentColor: '#000' }} />
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
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer', fontSize: '.8rem', fontWeight: 500 }}>
                    <input type="checkbox" checked={v} onChange={e => s(e.target.checked)}
                      style={{ accentColor: '#000', width: 15, height: 15 }} />
                    {l}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Submit */}
        <button onClick={handlePublish} disabled={busy || !isPlatConnected}
          style={{
            marginTop: 20, width: '100%', padding: '12px',
            background: isPlatConnected ? accent : '#e5e5e5',
            color: isPlatConnected ? '#fff' : '#aaa',
            border: `2px solid ${isPlatConnected ? T.ink : '#e5e5e5'}`,
            borderRadius: 10, fontWeight: 800, fontSize: '.9rem',
            cursor: isPlatConnected && !busy ? 'pointer' : 'default',
            boxShadow: isPlatConnected ? `3px 3px 0 ${T.ink}` : 'none',
            fontFamily: FONT, transition: 'all .12s',
          }}>
          {busy ? 'Publishing…' : `Publish to ${platformLabel} →`}
        </button>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: `1.5px solid ${T.line}`, borderRadius: 8,
  padding: '8px 12px', fontSize: '.86rem',
  background: '#fff', color: T.ink, outline: 'none',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 700,
        color: T.mute, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SocialConnectRow({ icon, label, connected, onConnect, onDisconnect }) {
  const [hoverDisc, setHoverDisc] = useState(false)
  return (
    <div style={{
      borderRadius: 8, margin: '2px 0',
      border: `1px solid ${connected ? '#bbf7d0' : T.line}`,
      background: connected ? '#f0fdf4' : T.paper,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <span style={{ color: connected ? '#16a34a' : '#aaa', display: 'flex', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '.78rem', fontWeight: 600,
          color: connected ? '#15803d' : T.ink }}>
          {label}
        </span>
        {connected ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '.65rem', color: '#16a34a', fontWeight: 600 }}>✓ Connected</span>
          </span>
        ) : (
          <button onClick={onConnect} style={{
            fontSize: '.68rem', fontWeight: 700, color: '#fff',
            background: T.ink, border: 'none', cursor: 'pointer',
            padding: '3px 9px', borderRadius: 5, fontFamily: FONT,
          }}>Connect</button>
        )}
      </div>
      {connected && (
        <div className="br-social-disc-row" style={{ borderTop: '1px solid #bbf7d0', padding: '5px 10px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onDisconnect}
            onMouseEnter={() => setHoverDisc(true)}
            onMouseLeave={() => setHoverDisc(false)}
            style={{
              fontSize: '.65rem', fontWeight: 600,
              color: hoverDisc ? '#dc2626' : '#999',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '1px 4px', fontFamily: FONT,
              transition: 'color .12s',
            }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

// Left-side nav — Create / My clips, plus a Billing link. Brainrot has its
// own plan/credits pool (brainrot_plan / brainrot_credits_*, migration 016)
// fully separate from YT-Shorts, so this opens /brainrot/billing — its own
// page, not the shared /billing. Sticky column on desktop, collapses to a
// horizontal bar (same items, same active styling) on mobile via the
// .br-sidenav / .br-shell media rules in Header's <style> block.
function StudioSideNav({ view, onChange, clipCount, renderingCount, user, ytConnected, ttConnected, onConnectYT, onConnectTT, onDisconnect, socialEnabled }) {
  const ITEMS = [
    { id: 'create', label: 'Create',   icon: SIDENAV_ICON.create },
    { id: 'clips',  label: 'My clips', icon: SIDENAV_ICON.clips, count: clipCount },
  ]
  const itemStyle = (on) => ({
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
    padding: '10px 12px', borderRadius: 8, border: 'none', textAlign: 'left',
    background: on ? T.ink : 'transparent',
    color: on ? '#fff' : T.mute,
    fontFamily: FONT, fontSize: '.85rem', fontWeight: 500,
    transition: 'all .12s', textDecoration: 'none',
  })
  const hoverOn = e => { e.currentTarget.style.background = T.lineSoft }
  const hoverOff = e => { e.currentTarget.style.background = 'transparent' }

  return (
    <nav className="br-sidenav" style={{
      position: 'sticky', top: 96, flexShrink: 0, width: 192,
      display: 'flex', flexDirection: 'column', gap: 2,
      background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: 6,
    }}>
      {ITEMS.map(it => {
        const on = view === it.id
        return (
          <button key={it.id} onClick={() => onChange(it.id)}
            style={itemStyle(on)}
            onMouseEnter={e => { if (!on) hoverOn(e) }}
            onMouseLeave={e => { if (!on) hoverOff(e) }}
          >
            <span style={{ flexShrink: 0, display: 'flex', opacity: on ? 1 : .7 }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.id === 'clips' && renderingCount > 0 && (
              <span title={`${renderingCount} rendering`} style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: on ? '#fff' : T.red,
                animation: 'br-pulse-dot 1.4s ease-in-out infinite',
              }} />
            )}
            {typeof it.count === 'number' && it.count > 0 && (
              <span style={{
                fontSize: '.7rem', fontWeight: 500, flexShrink: 0,
                color: on ? '#fff' : T.mute,
                background: on ? 'rgba(255,255,255,.18)' : T.lineSoft,
                borderRadius: 999, padding: '1px 7px', minWidth: 16, textAlign: 'center',
              }}>{it.count}</span>
            )}
          </button>
        )
      })}

      <div style={{ height: 1, background: T.lineSoft, margin: '4px 4px' }} />

      <Link to="/brainrot/billing" style={itemStyle(false)}
        onMouseEnter={hoverOn} onMouseLeave={hoverOff}
      >
        <span style={{ flexShrink: 0, display: 'flex', opacity: .7 }}>{SIDENAV_ICON.billing}</span>
        <span style={{ flex: 1 }}>Billing</span>
        <span style={{
          fontSize: '.68rem', fontWeight: 500, flexShrink: 0, textTransform: 'capitalize',
          color: T.mute, background: T.lineSoft,
          borderRadius: 999, padding: '1px 8px',
        }}>{user?.brainrot_plan || 'free'}</span>
      </Link>

      {/* ── Social publish section (desktop only — mobile shows this inside
           "My clips" instead, via .br-clips-connect) ── */}
      <div className="br-pub-section" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div className="br-pub-divider" style={{ height: 1, background: T.lineSoft, margin: '6px 4px' }} />
        <div className="br-pub-label" style={{ padding: '4px 6px 2px', fontSize: '.65rem', fontWeight: 700,
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

// Shared YouTube/TikTok connect rows — used in the desktop side rail
// (StudioSideNav) and, on mobile, resurfaced inside "My clips" (see
// .br-clips-connect in Header's mobile styles) since the bottom tab bar
// has no room for it.
const YT_ICON = <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
const TT_ICON = <svg width="13" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.26 6.26 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.94a8.17 8.17 0 0 0 4.78 1.52V7.01a4.85 4.85 0 0 1-1.01-.32z"/></svg>

function PublishConnections({ ytConnected, ttConnected, onConnectYT, onConnectTT, onDisconnect, socialEnabled }) {
  if (!socialEnabled) {
    return (
      <>
        <ComingSoonRow icon={YT_ICON} label="YouTube" />
        <ComingSoonRow icon={TT_ICON} label="TikTok" />
      </>
    )
  }
  return (
    <>
      <SocialConnectRow
        icon={YT_ICON}
        label="YouTube"
        connected={ytConnected}
        onConnect={onConnectYT}
        onDisconnect={() => onDisconnect('youtube')}
      />
      <SocialConnectRow
        icon={TT_ICON}
        label="TikTok"
        connected={ttConnected}
        onConnect={onConnectTT}
        onDisconnect={() => onDisconnect('tiktok')}
      />
    </>
  )
}

// Shown to everyone except SOCIAL_BETA_EMAIL while YouTube/TikTok are
// pending platform review — same visual shape as SocialConnectRow so it
// doesn't look like a broken/missing feature, just not launched yet.
function ComingSoonRow({ icon, label }) {
  return (
    <div style={{
      borderRadius: 8, margin: '2px 0',
      border: `1px solid ${T.line}`, background: T.paper, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <span style={{ color: '#bbb', display: 'flex', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '.78rem', fontWeight: 600, color: T.mute }}>{label}</span>
        <span style={{
          fontSize: '.63rem', fontWeight: 700, color: T.mute,
          background: T.lineSoft, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
        }}>Coming soon</span>
      </div>
    </div>
  )
}

function StageShell({ id, children }) {
  const meta = STAGE_BY_ID[id]
  return (
    <section style={{
      background: '#fff',
      borderRadius: 12,
      border: `1px solid ${T.line}`,
    }}>
      <div className="br-stage-body" style={{ padding: '24px 24px 28px' }}>
        <h2 style={{
          margin: '0 0 4px', fontWeight: 500,
          fontSize: '1.15rem', letterSpacing: '-.02em',
          color: T.ink, lineHeight: 1.2,
        }}>
          {meta.title}
        </h2>
        <p style={{
          margin: '0 0 20px', fontSize: '.85rem', color: T.mute,
          lineHeight: 1.5,
        }}>
          {meta.hint}
        </p>
        {children}
      </div>
    </section>
  )
}

function SubLabel({ children }) {
  return (
    <div style={{
      fontSize: '.75rem', fontWeight: 500,
      color: T.mute, textTransform: 'uppercase',
      letterSpacing: '.04em',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function StageDivider() {
  return <div style={{ height: 1, background: T.lineSoft, margin: '4px 0 20px' }} />
}

function StageFootnote({ children }) {
  return (
    <p style={{
      margin: '14px 0 0', fontSize: '.8rem', color: T.mute,
      lineHeight: 1.55,
    }}>
      {children}
    </p>
  )
}

function StageNextButton({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        marginTop: 24, cursor: 'pointer',
        background: 'transparent', border: 'none',
        fontFamily: FONT, fontSize: '.85rem', fontWeight: 500, color: T.ink,
        padding: '4px 0',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.6' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {label} <span style={{ display: 'inline-block' }}>→</span>
    </button>
  )
}

function CallsheetRow({ label, done, onEdit, children, last }) {
  return (
    <div className="br-callsheet-row" style={{
      display: 'grid', gridTemplateColumns: '80px 1fr 50px', gap: 12, alignItems: 'center',
      padding: '12px 16px',
      borderBottom: last ? 'none' : `1px solid ${T.lineSoft}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: '.78rem', fontWeight: 500,
        color: done ? T.ink : T.mute,
      }}>
        <span style={{ color: done ? T.green : T.line, fontSize: '.6rem' }}>
          {done ? '●' : '○'}
        </span>
        {label}
      </div>
      <div style={{ fontSize: '.85rem', color: T.ink, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </div>
      <button onClick={onEdit}
        style={{
          justifySelf: 'end', cursor: 'pointer',
          background: 'transparent', border: 'none',
          fontFamily: FONT, fontSize: '.75rem', fontWeight: 500,
          color: T.mute, padding: '4px 6px',
        }}
        onMouseEnter={e => e.currentTarget.style.color = T.ink}
        onMouseLeave={e => e.currentTarget.style.color = T.mute}
      >Edit</button>
    </div>
  )
}

// ── OfflineState — inline "resource unreachable" empty state ──
// Replaces the old page-wide red banner. Lives inside the affected
// section, so a user only sees it in the context that actually needs the
// missing data. Retry button, no scary jargon, no "bucket configured?"
function OfflineState({ title, sub, onRetry }) {
  const [retrying, setRetrying] = useState(false)
  const handleRetry = async () => {
    setRetrying(true)
    onRetry?.()
    setTimeout(() => setRetrying(false), 800)
  }
  return (
    <div style={{
      textAlign: 'center', padding: '32px 20px',
      background: T.paper2,
      border: `1px solid ${T.line}`,
      borderRadius: 12,
    }}>
      <div style={{ fontSize: '1rem', fontWeight: 500,
        color: T.ink, marginBottom: 6 }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: '.8rem', color: T.mute, lineHeight: 1.5,
          maxWidth: '38ch', margin: '0 auto 16px' }}>
          {sub}
        </div>
      )}
      <button onClick={handleRetry} disabled={retrying}
        style={{
          cursor: retrying ? 'default' : 'pointer',
          background: T.ink, color: '#fff',
          border: 'none', borderRadius: 8, padding: '8px 18px',
          fontFamily: FONT, fontSize: '.8rem', fontWeight: 500,
          opacity: retrying ? .6 : 1,
        }}>
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}

function StageRail({ stage, onJump, stageDone }) {
  const doneCount = STAGES.filter(s => stageDone[s.id]).length

  return (
    <div className="br-stage-rail" style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: T.paper2,
      border: `1px solid ${T.line}`,
      borderRadius: 10,
      padding: 4,
    }}>
      {STAGES.map((s) => {
        const isActive = stage === s.id
        const done = stageDone[s.id]
        return (
          <button key={s.id} onClick={() => onJump(s.id)} title={s.hint}
            style={{
              cursor: 'pointer', border: 'none',
              flex: 1, padding: '8px 6px',
              borderRadius: 8,
              background: isActive ? T.ink : 'transparent',
              color: isActive ? '#fff' : done ? T.ink : T.mute,
              fontFamily: FONT, fontSize: '.78rem', fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all .15s',
            }}>
            {done && !isActive && <span style={{ color: T.green, fontSize: '.6rem' }}>●</span>}
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
  const handleLeave = () => {
    const v = videoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
  }
  return (
    <button onClick={onClick} onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      style={{
        cursor: 'pointer', padding: 3,
        background: on ? T.ink : 'transparent',
        border: on ? `2px solid ${T.ink}` : `1px solid ${T.line}`,
        borderRadius: 8, transition: 'all .12s',
      }}>
      <div style={{ width: '100%', aspectRatio: '9/16', borderRadius: 5, overflow: 'hidden',
        background: '#000', position: 'relative' }}>
        {clip.gcs_path ? (
          <video ref={videoRef} src={clip.gcs_path} poster={clip.thumbnail_url || undefined}
            muted loop playsInline preload="none"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : clip.thumbnail_url ? (
          <img src={clip.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666', fontSize: '.6rem', fontWeight: 500, textTransform: 'capitalize' }}>{clip.category}</div>
        )}
        {on && <div style={{ position: 'absolute', top: 4, right: 4,
          background: '#fff', color: T.ink, width: 16, height: 16, borderRadius: '50%',
          fontSize: '.58rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
      </div>
      {clip.source_title && (
        <div style={{ fontSize: '.55rem', fontWeight: 500,
          color: on ? '#fff' : T.mute,
          marginTop: 3, padding: '0 2px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clip.source_title}
        </div>
      )}
    </button>
  )
}

function ChemistryBadge({ chemistry }) {
  return (
    <div style={{ ...card({ padding: '10px 14px' }),
      display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: '1.2rem' }}>{chemistry.emoji}</span>
      <div>
        <div style={{ fontSize: '.82rem', fontWeight: 500 }}>{chemistry.label}</div>
        <div style={{ fontSize: '.72rem', color: T.mute }}>{chemistry.blurb}</div>
      </div>
    </div>
  )
}

function SignatureCastChip({ cast, roster, onLoad, onDelete }) {
  const chars = cast.character_ids.map(id => roster.find(r => r.id === id)).filter(Boolean)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 999, padding: '4px 8px 4px 4px' }}>
      <button onClick={onLoad} title={`Load ${cast.label || 'this cast'}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          background: 'none', border: 'none', padding: '2px 4px', fontFamily: FONT }}>
        <div style={{ display: 'flex' }}>
          {chars.map((c, i) => (
            <img key={c.id} src={c.image_url} alt="" style={{
              width: 22, height: 22, borderRadius: '50%', objectFit: 'cover',
              border: `1px solid ${T.line}`, background: T.lineSoft,
              marginLeft: i > 0 ? -8 : 0,
            }} />
          ))}
        </div>
        <span style={{ fontSize: '.75rem', fontWeight: 500 }}>{cast.label || 'Signature cast'}</span>
      </button>
      <button onClick={onDelete} title="Delete"
        style={{ cursor: 'pointer', background: 'none', border: 'none', color: T.mute,
          fontSize: '.7rem', fontWeight: 500, padding: '2px 6px' }}>✕</button>
    </div>
  )
}

function PickedCard({ p, motions, voices, onRemove, onVoice, onEntry, onExit, onPreview, onScale, onRotation }) {
  const selectStyle = {
    background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 8,
    padding: '6px 8px', fontSize: '.78rem', fontWeight: 500, fontFamily: FONT, cursor: 'pointer', width: '100%',
  }
  const selectedVoice = voices.find(v => v.voice_id === p.voiceId)
  return (
    <div style={{ ...card({ padding: 12 }), display: 'flex', gap: 12 }}>
      <div style={{ position: 'relative', width: 52, flexShrink: 0 }}>
        <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: T.lineSoft, border: `1px solid ${T.line}` }}>
          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span style={{ ...pill(T.lineSoft, { padding: '1px 6px', fontSize: '.55rem', position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)' }) }}>
          {p.side}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
            <div style={{ fontSize: '.72rem', color: T.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.archetype} · {p.gender}
            </div>
          </div>
          <button onClick={onRemove} title="Remove" style={{ cursor: 'pointer', background: 'none', border: `1px solid ${T.line}`,
            borderRadius: 6, padding: '2px 8px', fontSize: '.7rem', color: T.mute }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <select value={p.voiceId} onChange={e => onVoice(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            <option value="">Auto voice (fits {p.gender})</option>
            {voices.map(v => (
              <option key={`${v.provider}:${v.voice_id}`} value={v.voice_id}>{v.label} · {v.gender}</option>
            ))}
          </select>
          <button onClick={() => onPreview(selectedVoice?.preview_url)}
            disabled={!selectedVoice?.preview_url}
            title={selectedVoice?.preview_url ? 'Play sample' : 'Pick a specific voice to preview'}
            style={{ ...pill(selectedVoice?.preview_url ? T.lineSoft : T.paper2, { padding: '5px 9px', cursor: selectedVoice?.preview_url ? 'pointer' : 'not-allowed' }) }}>▶</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.65rem', fontWeight: 500, color: T.mute }}>Enter</span>
            <select value={p.entry} onChange={e => onEntry(e.target.value)} style={selectStyle}>
              {motions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.65rem', fontWeight: 500, color: T.mute }}>Exit</span>
            <select value={p.exit} onChange={e => onExit(e.target.value)} style={selectStyle}>
              {motions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.65rem', fontWeight: 500, color: T.mute }}>
              Size {Math.round((p.scale ?? 1) * 100)}%
            </span>
            <input type="range" min={0.7} max={1.3} step={0.05} value={p.scale ?? 1}
              onChange={e => onScale(Number(e.target.value))}
              style={{ width: '100%', accentColor: T.ink, display: 'block', marginTop: 2 }} />
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.65rem', fontWeight: 500, color: T.mute }}>
              Tilt {p.rotation ?? 0}°
            </span>
            <input type="range" min={-15} max={15} step={1} value={p.rotation ?? 0}
              onChange={e => onRotation(Number(e.target.value))}
              style={{ width: '100%', accentColor: T.ink, display: 'block', marginTop: 2 }} />
          </label>
        </div>
      </div>
    </div>
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
        <div style={{ height: '100%', width: `${pct}%`, background: T.ink, transition: 'width .5s', borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 6, fontSize: '.75rem', fontWeight: 500, color: T.mute, textAlign: 'right' }}>{pct}%</div>
    </div>
  )
}

const STATUS_META = {
  complete:            { label: 'Ready',      color: T.green },
  failed:              { label: 'Failed',     color: T.red },
  created:             { label: 'Queued',     color: T.mute },
  generating_script:   { label: 'Writing',    color: T.blue },
  synthesizing_voice:  { label: 'Voicing',    color: T.blue },
  rendering:           { label: 'Rendering',  color: T.blue },
}
const LIBRARY_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'active',   label: 'Rendering' },
  { id: 'complete', label: 'Ready' },
]

function ClipsLibrary({ clips, counts, filter, onFilterChange, hasMore, loadingMore, onLoadMore,
  onCreate, ytConnected, ttConnected, publishedYT, publishingYT, publishedTT, publishingTT,
  onPublishYT, onPublishTT, onConnectYT, onConnectTT, onDisconnect, socialEnabled }) {

  return (
    <div style={{ padding: '8px 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontWeight: 500,
            fontSize: 'clamp(1.3rem, 2.2vw, 1.6rem)', letterSpacing: '-.02em', color: T.ink }}>
            Your clips
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: T.mute }}>
            Every clip you've generated.
          </p>
        </div>
        <button onClick={onCreate} {...pressHandlers}
          style={{ ...btn(T.ink, '#fff', { padding: '10px 18px', fontSize: '.82rem' }) }}>
          New clip
        </button>
      </div>

      {/* Mobile only — desktop already has this in the side rail. The bottom
          tab bar has no room for it, so it lives here instead, contextually
          next to the clips it publishes. */}
      <div className="br-clips-connect" style={{
        display: 'none', marginBottom: 20, padding: 10,
        background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 12,
      }}>
        <div style={{ padding: '2px 4px 8px', fontSize: '.68rem', fontWeight: 700,
          color: T.mute, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Publish to
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <PublishConnections
            ytConnected={ytConnected} ttConnected={ttConnected}
            onConnectYT={onConnectYT} onConnectTT={onConnectTT} onDisconnect={onDisconnect}
            socialEnabled={socialEnabled}
          />
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
                  background: on ? T.ink : T.paper2,
                  color: on ? '#fff' : T.ink,
                  border: `1px solid ${on ? T.ink : T.line}`,
                  borderRadius: 8, padding: '6px 13px',
                  fontSize: '.78rem', fontWeight: 500, fontFamily: FONT,
                }}>
                {f.label}
                <span style={{
                  fontSize: '.7rem', fontWeight: 500,
                  color: on ? 'rgba(255,255,255,.7)' : T.mute,
                }}>{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {counts.all === 0 ? (
        <div style={{
          textAlign: 'center', padding: '64px 20px',
          background: T.paper2, border: `1px solid ${T.line}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 500, color: T.ink, marginBottom: 6 }}>
            No clips yet
          </div>
          <div style={{ fontSize: '.84rem', color: T.mute, maxWidth: '36ch', margin: '0 auto 18px', lineHeight: 1.5 }}>
            Your first brainrot clip is a script, a cast, and a backdrop away.
          </div>
          <button onClick={onCreate} {...pressHandlers}
            style={{ ...btn(T.ink, '#fff', { padding: '11px 20px' }) }}>
            Make your first clip
          </button>
        </div>
      ) : clips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: T.mute, fontSize: '.86rem' }}>
          Nothing in this filter yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
            {clips.map(job => (
              <ClipCard key={job.job_id} job={job}
                ytConnected={ytConnected} ttConnected={ttConnected}
                publishedYT={publishedYT} publishingYT={publishingYT}
                publishedTT={publishedTT} publishingTT={publishingTT}
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
                }}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ClipCard({ job, ytConnected, ttConnected, publishedYT, publishingYT, publishedTT, publishingTT, onPublishYT, onPublishTT, socialEnabled }) {
  const meta = STATUS_META[job.status] || STATUS_META.created
  const jid = job.job_id
  const isComplete = job.status === 'complete' && job.output_url
  const ytDone = publishedYT?.has(jid)
  const ttDone = publishedTT?.has(jid)
  const ytBusy = publishingYT?.has(jid)
  const ttBusy = publishingTT?.has(jid)
  return (
    <div style={{ ...card({ padding: 8 }), transition: 'border-color .15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.line }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden',
        background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isComplete ? (
          <video src={job.output_url} controls playsInline preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          position: 'absolute', top: 8, left: 8,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(0,0,0,.65)', color: '#fff',
          fontSize: '.6rem', fontWeight: 500, padding: '3px 8px', borderRadius: 999,
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
          <a href={job.output_url} target="_blank" rel="noopener noreferrer"
            title="Open full size"
            style={{ fontSize: '.72rem', fontWeight: 500, color: T.ink, textDecoration: 'none' }}>
            Open ↗
          </a>
        )}
      </div>
      {isComplete && job.post_title && (
        <div style={{ padding: '0 4px 6px' }}>
          <div style={{ fontSize: '.7rem', fontWeight: 700, color: T.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.post_title}
          </div>
          {job.post_hashtags?.length > 0 && (
            <div style={{ fontSize: '.62rem', color: '#7c3aed', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.post_hashtags.join(' ')}
            </div>
          )}
        </div>
      )}
      {isComplete && !socialEnabled && (
        <div style={{ padding: '4px 4px 2px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '7px 4px', borderRadius: 7, border: '1.5px solid #e5e5e5',
            background: '#fafafa', color: T.mute, fontSize: '.65rem', fontWeight: 600,
          }}>
            Publish to YouTube/TikTok — coming soon
          </div>
        </div>
      )}
      {isComplete && socialEnabled && (
        <div style={{ display: 'flex', gap: 5, padding: '4px 4px 2px' }}>
          {/* YouTube publish */}
          <button
            onClick={() => onPublishYT && onPublishYT(job)}
            disabled={ytDone || ytBusy}
            title={ytDone ? 'Published to YouTube' : ytConnected ? 'Publish to YouTube Shorts' : 'Connect YouTube'}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '6px 4px', borderRadius: 7, border: '1.5px solid',
              borderColor: ytDone ? '#16a34a' : '#e5e5e5',
              background: ytDone ? '#f0fdf4' : '#fff',
              color: ytDone ? '#16a34a' : '#333',
              fontSize: '.65rem', fontWeight: 600, cursor: ytDone ? 'default' : 'pointer',
              fontFamily: FONT,
            }}>
            {ytBusy ? (
              <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            ) : ytDone ? '✓ YT' : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                {ytConnected ? 'YT' : 'YT+'}
              </>
            )}
          </button>
          {/* TikTok publish */}
          <button
            onClick={() => onPublishTT && onPublishTT(job)}
            disabled={ttDone || ttBusy}
            title={ttDone ? 'Published to TikTok' : ttConnected ? 'Publish to TikTok' : 'Connect TikTok'}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '6px 4px', borderRadius: 7, border: '1.5px solid',
              borderColor: ttDone ? '#16a34a' : '#e5e5e5',
              background: ttDone ? '#f0fdf4' : '#fff',
              color: ttDone ? '#16a34a' : '#333',
              fontSize: '.65rem', fontWeight: 600, cursor: ttDone ? 'default' : 'pointer',
              fontFamily: FONT,
            }}>
            {ttBusy ? (
              <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            ) : ttDone ? '✓ TT' : (
              <>
                <svg width="10" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.26 6.26 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.94a8.17 8.17 0 0 0 4.78 1.52V7.01a4.85 4.85 0 0 1-1.01-.32z"/></svg>
                {ttConnected ? 'TT' : 'TT+'}
              </>
            )}
          </button>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
