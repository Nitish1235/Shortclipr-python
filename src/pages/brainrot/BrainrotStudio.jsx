// BrainrotStudio.jsx — the Brainrot Clips Maker creator + clips history.
//
// Distinct "sticker / doodle" identity (see brainrotTheme.js) so it never
// reads as a reskin of the YouTube-Shorts dashboard. One page:
//   left  = build controls (script, cast, background, vibe)
//   right = sticky 9:16 live preview + Generate
//   below = your generated brainrot clips
//
// Every control is backed by a real /brainrot/* endpoint built in Phase 1/2:
// characters (with images), voices (with previews + gender auto-assign),
// entry/exit animations, gameplay backgrounds, job submit + poll.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { brainrotApi } from './brainrotApi'
import { T, card, pill, btn, sticker, pressHandlers, FONT } from './brainrotTheme'
import PreviewStage from './PreviewStage'
import { getChemistry } from './chemistry'

// Evergreen 50/50 topics — reliably split an audience, which is what makes
// a brainrot debate generate comments. Curated, not pulled from other users'
// job history: script_input is live creator content and often half-formed,
// so surfacing it cross-account would be a privacy leak dressed up as a
// feature. See chemistry-pass design doc, Pass 05.
const SPARK_TOPICS = [
  'iPhone vs Android', 'Pizza vs Burgers', 'Cats vs Dogs',
  'Morning person vs Night owl', 'Summer vs Winter', 'PS5 vs Xbox',
  'Homework vs No homework', 'City vs Suburbs', 'Coffee vs Energy drinks',
  'Texting vs Calling',
]

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]
const CAPTION_STYLES = [
  { id: 'brainrot', label: 'Brainrot', blurb: 'Bouncy word-pop' },
  { id: 'loud',     label: 'Loud',     blurb: 'ALL CAPS punch' },
  { id: 'chaotic',  label: 'Chaotic',  blurb: 'Wiggly & wild' },
  { id: 'meme',     label: 'Meme',     blurb: 'Clean & heavy' },
]
const PROVIDERS = [
  { id: 'unrealspeech', label: 'UnrealSpeech' },
  { id: 'lemonfox',     label: 'Lemonfox' },
]
const ACTIVE_STATUSES = ['created', 'generating_script', 'synthesizing_voice', 'rendering']

// Each stage is a distinct "room" in the studio — same underlying design
// system, but its own accent color, editorial kicker label, and container
// treatment so the user always knows where they are. The rail below is a
// real progress spine (StageRail), not a row of interchangeable pills.
//
// accent: the one signature color that runs through only this stage's
//         container (heading rule, active node in the rail, focused input
//         underline). Kept inside the existing palette so nothing clashes.
// kicker: the small caps-monospace label that sits above each stage's
//         serif display heading — reads as a section marker in an editorial
//         layout (Vogue TOC / annual-report chapter, not a form step).
// title:  editorial noun-phrase headline for the stage (was just "Cast",
//         now "Casting call" — same word, different job).
const STAGES = [
  { id: 'spark',  label: 'Spark',  icon: '💡', kicker: 'Chapter 01', title: 'The premise',     hint: 'What are they arguing about?',         accent: '#ffd23f' },
  { id: 'cast',   label: 'Cast',   icon: '🎭', kicker: 'Chapter 02', title: 'Casting call',    hint: "Who's on screen?",                     accent: '#cf1322' },
  { id: 'scene',  label: 'Scene',  icon: '🎮', kicker: 'Chapter 03', title: 'The backdrop',    hint: 'The satisfying loop behind it all.',   accent: '#2d6cdf' },
  { id: 'style',  label: 'Style',  icon: '🎨', kicker: 'Chapter 04', title: 'Style & sound',   hint: 'Length, captions, motion, music.',     accent: '#1fa14e' },
  { id: 'review', label: 'Review', icon: '✅', kicker: 'Chapter 05', title: 'Final callsheet', hint: 'Everything, at a glance.',             accent: '#161616' },
]
const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]))

// The one editorial display face used across every stage heading. Kept
// as a CSS var-style constant rather than a JS import so we can serve it
// from Google Fonts (which is CSP-allowed in the app) via a <link> in
// index.html without shipping any @font-face bytes here.
const FONT_DISPLAY = `'Fraunces', 'Iowan Old Style', Georgia, serif`
const FONT_MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`

export default function BrainrotStudio() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

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
  const [sfxLib, setSfxLib]     = useState([])

  // ── Stage rail ───────────────────────────────────────────────────
  const [stage, setStage] = useState('spark')

  // ── Builder state ───────────────────────────────────────────────
  const [script, setScript]         = useState('')
  const [castCount, setCastCount]   = useState(2)
  const [picked, setPicked]         = useState([])   // [{...character, side, voiceId, entry, exit, x, y, scale, rotation}]
  const [provider, setProvider]     = useState('unrealspeech')
  const [background, setBackground] = useState(null)
  const [category, setCategory]     = useState('all')
  const [duration, setDuration]     = useState(30)
  const [captionStyle, setCaption]  = useState('brainrot')
  const [charSearch, setCharSearch] = useState('')
  const [motionMode, setMotionMode] = useState('turn_based')  // 'turn_based' | 'always_on'
  const [musicId, setMusicId]       = useState('')
  const [musicVolume, setMusicVolume] = useState(0.3)
  const [introSfxId, setIntroSfxId] = useState('')
  const [outroSfxId, setOutroSfxId] = useState('')

  // ── Job state ───────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [activeJob, setActiveJob]   = useState(null)   // polled job being generated
  const [myClips, setMyClips]       = useState([])
  const [toast, setToast]           = useState(null)
  const [refLoaded, setRefLoaded]   = useState(false)
  const pollRef = useRef(null)
  const audioRef = useRef(null)

  // ── Draft autosave ───────────────────────────────────────────────
  // Protects an interrupted session (mobile especially): a reload restores
  // script, cast, background, and vibe from wherever the user left off.
  // Keyed per-user so a shared browser can't leak one account's draft into
  // another's session.
  const draftKey = user?.user_id ? `brainrot_draft_${user.user_id}` : null
  const hydratedRef = useRef(false)
  const saveTimerRef = useRef(null)

  // ── Load reference data + history ───────────────────────────────
  // Non-critical fetches (jobs, signature casts, audio assets) fail
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
      brainrotApi.listJobs(),
      brainrotApi.listSignatureCasts(),
      brainrotApi.audioAssets('music'),
      brainrotApi.audioAssets('sfx'),
    ]).then(([c, v, a, g, j, s, m, fx]) => {
      if (!alive) return
      if (c.status === 'fulfilled') { setRoster(c.value.characters || []); setRosterOnline(true) }
      else setRosterOnline(false)
      if (v.status === 'fulfilled') setVoices(v.value.voices || [])
      if (a.status === 'fulfilled') setMotions(a.value.entry || [])
      if (g.status === 'fulfilled') { setClipsLib(g.value.clips || []); setClipsOnline(true) }
      else setClipsOnline(false)
      if (j.status === 'fulfilled') setMyClips(j.value.jobs || [])
      if (s.status === 'fulfilled') setSignatureCasts(s.value.casts || [])
      if (m.status === 'fulfilled') setMusicLib(m.value.assets || [])
      if (fx.status === 'fulfilled') setSfxLib(fx.value.assets || [])
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
      if (draft.duration) setDuration(draft.duration)
      if (draft.provider) setProvider(draft.provider)
      if (draft.category) setCategory(draft.category)
      if (draft.motionMode) setMotionMode(draft.motionMode)
      if (draft.musicId) setMusicId(draft.musicId)
      if (draft.musicVolume) setMusicVolume(draft.musicVolume)
      if (draft.introSfxId) setIntroSfxId(draft.introSfxId)
      if (draft.outroSfxId) setOutroSfxId(draft.outroSfxId)
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

  // debounced save on every change, once the initial restore has run
  useEffect(() => {
    if (!hydratedRef.current || !draftKey) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const draft = {
        script, captionStyle, duration, provider, category,
        motionMode, musicId, musicVolume, introSfxId, outroSfxId,
        backgroundId: background?.id || null,
        picked: picked.map(p => ({
          id: p.id, side: p.side, voiceId: p.voiceId, entry: p.entry, exit: p.exit,
          x: p.x, y: p.y, scale: p.scale, rotation: p.rotation,
        })),
      }
      try { localStorage.setItem(draftKey, JSON.stringify(draft)) } catch { /* storage full/unavailable */ }
    }, 800)
    return () => clearTimeout(saveTimerRef.current)
  }, [script, captionStyle, duration, provider, category, background, picked, draftKey,
      motionMode, musicId, musicVolume, introSfxId, outroSfxId])

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
        x: side === 'left' ? 0.26 : 0.74, y: 0.76, scale: 1, rotation: 0,
      }])
    })
  }

  // keep sides consistent (first = left, second = right)
  const reflow = (arr) => arr.map((p, i) => ({ ...p, side: i === 0 ? 'left' : 'right', x: p.x ?? (i === 0 ? 0.26 : 0.74) }))

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
      x: i === 0 ? 0.26 : 0.74, y: 0.76, scale: 1, rotation: 0,
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
      showToast(e.message || 'Could not save this cast', 'err')
    } finally {
      setSavingCast(false)
    }
  }

  const removeSignatureCast = async (id) => {
    setSignatureCasts(prev => prev.filter(c => c.id !== id)) // optimistic
    try { await brainrotApi.deleteSignatureCast(id) }
    catch { showToast('Could not delete — try again', 'err') }
  }

  const isSavedPair = picked.length === 2 && signatureCasts.some(c => {
    const ids = new Set(c.character_ids)
    return ids.has(picked[0].id) && ids.has(picked[1].id)
  })

  const moveCharacter = useCallback((side, x, y) =>
    setPicked(prev => prev.map(p => p.side === side ? { ...p, x, y } : p)), [])

  // ── Voice preview ───────────────────────────────────────────────
  const playPreview = (url) => {
    if (!url) return
    if (audioRef.current) { audioRef.current.pause() }
    audioRef.current = new Audio(url)
    audioRef.current.play().catch(() => showToast('Preview not ready yet — admin needs to generate voice samples.', 'warn'))
  }

  const voicesFor = (gender) => {
    const forProvider = voices.filter(v => v.provider === provider)
    // gender-matching voices first
    return [...forProvider].sort((a, b) =>
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
        caption_color: 'yellow_black',
        tts_provider: provider,
        voice_left: picked.find(p => p.side === 'left')?.voiceId || '',
        voice_right: picked.find(p => p.side === 'right')?.voiceId || '',
        motion_mode: motionMode,
        music_asset_id: musicId || null,
        music_volume: musicVolume,
        intro_sfx_id: introSfxId || null,
        outro_sfx_id: outroSfxId || null,
      }
      const { job_id } = await brainrotApi.createJob(options)
      if (draftKey) { try { localStorage.removeItem(draftKey) } catch { /* ignore */ } }
      showToast('Cooking your brainrot clip… 🍳', 'ok')
      pollJob(job_id)
    } catch (e) {
      showToast(e.message || 'Failed to start', 'err')
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
        }
      } catch { /* keep polling through transient errors */ }
    }
    tick()
    pollRef.current = setInterval(tick, 2500)
  }

  // Connection state — quietly true when everything's fine, quietly
  // encourages a retry when it isn't. No page-wide red banner.
  const anyOffline = !rosterOnline || !clipsOnline
  const retryFetches = () => setRefetchTick(t => t + 1)

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.paper, fontFamily: FONT, color: T.ink,
      backgroundImage: `radial-gradient(${T.ink}14 1px, transparent 1px)`, backgroundSize: '22px 22px' }}>

      <Header user={user} onLogout={logout} navigate={navigate}
        connectionOffline={anyOffline} onRetryConnection={retryFetches} />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 20px 80px',
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 26, alignItems: 'start' }}>

        {/* ══ LEFT: builder ══════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>

          <StageRail stage={stage} onJump={goToStage} stageDone={stageDone} />

          {stage === 'spark' && (
          <StageShell id="spark">
            {/* A generous writing surface — feels like a manuscript page,
                not a form field. Cream inner tint, hairline rule under the
                text area that matches the stage accent. */}
            <div style={{ position: 'relative' }}>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="A hot take. An argument. Something people would fight about in the comments."
                rows={4}
                style={{
                  width: '100%', resize: 'vertical', boxSizing: 'border-box',
                  background: '#fffdf5',
                  border: `1.5px solid ${T.ink}22`,
                  borderBottom: `3px solid ${STAGE_BY_ID.spark.accent}`,
                  borderRadius: 12,
                  padding: '18px 18px',
                  fontSize: '1.05rem', fontFamily: FONT_DISPLAY, fontStyle: 'italic',
                  color: T.ink, lineHeight: 1.55, outline: 'none',
                }}
              />
              <div style={{ position: 'absolute', top: 10, right: 14, fontFamily: FONT_MONO,
                fontSize: '.62rem', color: T.mute, letterSpacing: '.05em' }}>
                {script.length}/280
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <SubLabel accent={STAGE_BY_ID.spark.accent}>Or try one that always lands</SubLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setScript(pickTopic(script))} {...pressHandlers}
                  style={{ ...pill(STAGE_BY_ID.spark.accent, { cursor: 'pointer', fontWeight: 900 }) }}>
                  🎲 Surprise me
                </button>
                {SPARK_TOPICS.slice(0, 6).map(t => (
                  <button key={t} onClick={() => setScript(t)}
                    style={{ ...pill('#fff', { cursor: 'pointer', border: `1.5px solid ${T.ink}33` }) }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <StageFootnote>
              The AI writes each character fully in-character and paces the dialogue to
              your chosen clip length. You'll be able to edit any line before rendering.
            </StageFootnote>
            <StageNextButton label="Next — casting call" onClick={goNext} accent={STAGE_BY_ID.cast.accent} />
          </StageShell>
          )}

          {stage === 'cast' && (
          <StageShell id="cast">
            <SubLabel accent={STAGE_BY_ID.cast.accent}>Cast size</SubLabel>
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
                      cursor: 'pointer', textAlign: 'left', padding: '10px 12px',
                      background: on ? T.ink : '#fff',
                      color: on ? '#fff' : T.ink,
                      border: `1.5px solid ${on ? T.ink : T.ink + '33'}`,
                      borderRadius: 10, transition: 'all .12s',
                    }}>
                    <div style={{ fontWeight: 800, fontSize: '.82rem' }}>{opt.title}</div>
                    <div style={{ fontSize: '.64rem', opacity: .75, marginTop: 2 }}>{opt.sub}</div>
                  </button>
                )
              })}
            </div>

            {/* signature casts — quick reload of a saved pair */}
            {signatureCasts.length > 0 && castCount === 2 && (
              <div style={{ marginBottom: 20 }}>
                <SubLabel accent={STAGE_BY_ID.cast.accent}>Your signature casts</SubLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {signatureCasts.map(cast => (
                    <SignatureCastChip key={cast.id} cast={cast} roster={roster}
                      onLoad={() => loadSignatureCast(cast)}
                      onDelete={() => removeSignatureCast(cast.id)} />
                  ))}
                </div>
              </div>
            )}

            {/* picked character cards */}
            {picked.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <SubLabel accent={STAGE_BY_ID.cast.accent}>On stage</SubLabel>
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
                        title={isSavedPair ? 'Already saved' : 'Save this pair as a signature cast'}
                        style={{
                          cursor: isSavedPair ? 'default' : 'pointer',
                          background: '#fff',
                          border: `1.5px solid ${isSavedPair ? T.green : T.ink + '33'}`,
                          borderRadius: 10, padding: '0 14px',
                          fontWeight: 800, fontSize: '.76rem',
                          color: isSavedPair ? T.green : T.ink,
                          whiteSpace: 'nowrap', fontFamily: FONT,
                        }}>
                        {isSavedPair ? '✓ Saved' : savingCast ? 'Saving…' : 'Save cast'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {castCount > 0 && !rosterOnline && roster.length === 0 ? (
              <OfflineState
                title="Character library isn't reachable right now"
                sub="Nothing on your end — we'll retry automatically. Or trigger it manually below."
                onRetry={retryFetches}
              />
            ) : castCount > 0 ? (
              <>
                <SubLabel accent={STAGE_BY_ID.cast.accent}>Choose from {roster.length || '100+'} characters</SubLabel>
                <input value={charSearch} onChange={e => setCharSearch(e.target.value)}
                  placeholder="Search by name, family, or archetype…"
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12,
                    background: '#fff', border: `1.5px solid ${T.ink}22`, borderRadius: 10,
                    padding: '10px 14px', fontSize: '.86rem', fontFamily: FONT, outline: 'none' }} />
                {/* Casting-board treatment: dark backdrop lets character art pop
                    like a theatrical spotlight, distinct from the paper feel of
                    every other stage. */}
                <div style={{
                  background: 'radial-gradient(circle at 50% 30%, #23202b 0%, #16141c 100%)',
                  borderRadius: 12, padding: 10,
                  boxShadow: `inset 0 2px 12px rgba(0,0,0,.4)`,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))',
                    gap: 8, maxHeight: 320, overflowY: 'auto', padding: 4 }}>
                    {filteredRoster.map(ch => {
                      const on = picked.some(p => p.id === ch.id)
                      return (
                        <button key={ch.id} onClick={() => toggleCharacter(ch)} title={`${ch.name} — ${ch.archetype}`}
                          style={{ position: 'relative', cursor: 'pointer', padding: 4,
                            background: on ? STAGE_BY_ID.cast.accent : 'rgba(255,255,255,.04)',
                            border: on ? `2px solid ${STAGE_BY_ID.cast.accent}` : `1px solid rgba(255,255,255,.08)`,
                            borderRadius: 10, transition: 'all .1s' }}>
                          <div style={{ width: '100%', aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                            background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                            <img src={ch.image_url} alt={ch.name} loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <div style={{ fontSize: '.58rem', fontWeight: 800, marginTop: 4, lineHeight: 1.1,
                            color: on ? T.ink : '#fff',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</div>
                          {on && <div style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                            borderRadius: '50%', background: T.ink, color: '#fff',
                            fontSize: '.62rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* provider toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: '.62rem', fontWeight: 700, color: T.mute, letterSpacing: '.05em', textTransform: 'uppercase' }}>Voice engine</span>
                  {PROVIDERS.map(pr => (
                    <button key={pr.id} onClick={() => setProvider(pr.id)}
                      style={{
                        cursor: 'pointer', padding: '5px 12px',
                        background: provider === pr.id ? T.ink : '#fff',
                        color: provider === pr.id ? '#fff' : T.ink,
                        border: `1.5px solid ${T.ink}33`,
                        borderRadius: 999, fontSize: '.72rem', fontWeight: 700,
                      }}>
                      {pr.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <StageFootnote>
                Pure narrator voice-over — no characters on screen, just captions over gameplay.
              </StageFootnote>
            )}
            <StageNextButton label="Next — the backdrop" onClick={goNext} accent={STAGE_BY_ID.scene.accent} />
          </StageShell>
          )}

          {stage === 'scene' && (
          <StageShell id="scene">
            {!clipsOnline && clipsLib.length === 0 ? (
              <OfflineState
                title="Backdrop library isn't reachable right now"
                sub="Not your fault. Retry, or come back to this step later."
                onRetry={retryFetches}
              />
            ) : clipsLib.length === 0 ? (
              <StageFootnote>
                No backdrops uploaded to the library yet. An admin adds gameplay
                clips through the internal library — check back once one lands.
              </StageFootnote>
            ) : (
              <>
                <SubLabel accent={STAGE_BY_ID.scene.accent}>Category</SubLabel>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)}
                      style={{
                        cursor: 'pointer',
                        background: category === cat ? T.ink : '#fff',
                        color: category === cat ? '#fff' : T.ink,
                        border: `1.5px solid ${T.ink}33`,
                        borderRadius: 999, padding: '5px 12px',
                        fontSize: '.72rem', fontWeight: 700, fontFamily: FONT,
                        textTransform: 'capitalize',
                      }}>
                      {cat.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                {/* Cinematic video-wall — dark inset frame lets the 9:16
                    thumbnails read like an actual bank of screens in an
                    editing suite, not a form's asset picker. */}
                <div style={{
                  background: '#0d0d10',
                  border: `1.5px solid ${T.ink}33`,
                  borderRadius: 12, padding: 10,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 6 }}>
                    {visibleClips.map(clip => {
                      const on = background?.id === clip.id
                      return (
                        <button key={clip.id} onClick={() => setBackground(clip)}
                          style={{
                            cursor: 'pointer', padding: 3,
                            background: on ? STAGE_BY_ID.scene.accent : 'transparent',
                            border: on ? `2px solid ${STAGE_BY_ID.scene.accent}` : `1px solid rgba(255,255,255,.06)`,
                            borderRadius: 8, transition: 'all .12s',
                          }}>
                          <div style={{ width: '100%', aspectRatio: '9/16', borderRadius: 5, overflow: 'hidden',
                            background: '#000', position: 'relative' }}>
                            {clip.thumbnail_url
                              ? <img src={clip.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#666', fontSize: '.58rem', fontWeight: 700, textTransform: 'capitalize' }}>{clip.category}</div>}
                            {on && <div style={{ position: 'absolute', top: 4, right: 4,
                              background: T.ink, color: '#fff', width: 16, height: 16, borderRadius: '50%',
                              fontSize: '.58rem', fontWeight: 900,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
                          </div>
                          {clip.source_title && (
                            <div style={{ fontSize: '.52rem', fontWeight: 700,
                              color: on ? T.ink : 'rgba(255,255,255,.6)',
                              marginTop: 3, padding: '0 2px',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {clip.source_title}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
            <StageNextButton label="Next — style & sound" onClick={goNext} accent={STAGE_BY_ID.style.accent} />
          </StageShell>
          )}

          {stage === 'style' && (
          <StageShell id="style">
            {/* Length — big monospace digit as the primary readout, slider
                and preset chips as the two ways to change it. */}
            <SubLabel accent={STAGE_BY_ID.style.accent}>Clip length</SubLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: '2.4rem', fontWeight: 700, letterSpacing: '-.03em', color: T.ink, lineHeight: 1 }}>
                {duration}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: '.9rem', color: T.mute }}>seconds</span>
            </div>
            <input type="range" min={5} max={120} step={5} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: STAGE_BY_ID.style.accent }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, marginBottom: 24 }}>
              {DURATION_PRESETS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  style={{
                    cursor: 'pointer',
                    background: duration === d ? T.ink : '#fff',
                    color: duration === d ? '#fff' : T.ink,
                    border: `1.5px solid ${T.ink}33`,
                    borderRadius: 999, padding: '4px 12px',
                    fontFamily: FONT_MONO, fontSize: '.72rem', fontWeight: 700,
                  }}>
                  {d}s
                </button>
              ))}
            </div>

            <StageDivider />

            <SubLabel accent={STAGE_BY_ID.style.accent}>Caption energy</SubLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 24 }}>
              {CAPTION_STYLES.map(cs => {
                const on = captionStyle === cs.id
                return (
                  <button key={cs.id} onClick={() => setCaption(cs.id)}
                    style={{ cursor: 'pointer', textAlign: 'left', padding: '10px 12px',
                      background: on ? T.ink : '#fff', color: on ? '#fff' : T.ink,
                      border: on ? `1.5px solid ${T.ink}` : `1.5px solid ${T.ink}22`,
                      borderRadius: 10, transition: 'all .12s' }}>
                    <div style={{ fontSize: '.86rem', fontWeight: 800 }}>{cs.label}</div>
                    <div style={{ fontSize: '.66rem', fontWeight: 500, opacity: .7, marginTop: 2 }}>{cs.blurb}</div>
                  </button>
                )
              })}
            </div>

            <StageDivider />

            <SubLabel accent={STAGE_BY_ID.style.accent}>Motion mode</SubLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 24 }}>
              <button onClick={() => setMotionMode('turn_based')}
                style={{
                  cursor: 'pointer', textAlign: 'left', padding: '10px 12px',
                  background: motionMode === 'turn_based' ? T.ink : '#fff',
                  color: motionMode === 'turn_based' ? '#fff' : T.ink,
                  border: motionMode === 'turn_based' ? `1.5px solid ${T.ink}` : `1.5px solid ${T.ink}22`,
                  borderRadius: 10,
                }}>
                <div style={{ fontWeight: 800, fontSize: '.82rem' }}>Turn-based</div>
                <div style={{ fontSize: '.64rem', fontWeight: 500, opacity: .75, marginTop: 2 }}>Enters/exits per line — classic brainrot</div>
              </button>
              <button onClick={() => setMotionMode('always_on')}
                style={{
                  cursor: 'pointer', textAlign: 'left', padding: '10px 12px',
                  background: motionMode === 'always_on' ? T.ink : '#fff',
                  color: motionMode === 'always_on' ? '#fff' : T.ink,
                  border: motionMode === 'always_on' ? `1.5px solid ${T.ink}` : `1.5px solid ${T.ink}22`,
                  borderRadius: 10,
                }}>
                <div style={{ fontWeight: 800, fontSize: '.82rem' }}>Always on</div>
                <div style={{ fontSize: '.64rem', fontWeight: 500, opacity: .75, marginTop: 2 }}>Both stay put the whole clip</div>
              </button>
            </div>

            <StageDivider />

            <SubLabel accent={STAGE_BY_ID.style.accent}>Background music</SubLabel>
            {musicLib.length === 0 ? (
              <StageFootnote>No tracks in the library yet — an admin adds these.</StageFootnote>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button onClick={() => setMusicId('')}
                    style={{
                      cursor: 'pointer', padding: '5px 12px',
                      background: !musicId ? T.ink : '#fff',
                      color: !musicId ? '#fff' : T.ink,
                      border: `1.5px solid ${T.ink}33`,
                      borderRadius: 999, fontSize: '.72rem', fontWeight: 700, fontFamily: FONT,
                    }}>None</button>
                  {musicLib.map(m => (
                    <button key={m.id} onClick={() => setMusicId(m.id)}
                      style={{
                        cursor: 'pointer', padding: '5px 12px',
                        background: musicId === m.id ? T.ink : '#fff',
                        color: musicId === m.id ? '#fff' : T.ink,
                        border: `1.5px solid ${T.ink}33`,
                        borderRadius: 999, fontSize: '.72rem', fontWeight: 700, fontFamily: FONT,
                      }}>{m.name}</button>
                  ))}
                </div>
                {musicId && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT_MONO,
                      fontSize: '.64rem', color: T.mute, marginBottom: 4 }}>
                      <span>Volume · ducks under dialogue</span>
                      <span>{Math.round(musicVolume * 100)}%</span>
                    </div>
                    <input type="range" min={0.2} max={0.4} step={0.02} value={musicVolume}
                      onChange={e => setMusicVolume(Number(e.target.value))}
                      style={{ width: '100%', accentColor: STAGE_BY_ID.style.accent }} />
                  </div>
                )}
              </>
            )}

            {sfxLib.length > 0 && (
              <>
                <div style={{ height: 20 }} />
                <SubLabel accent={STAGE_BY_ID.style.accent}>Sound effects</SubLabel>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ flex: 1 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: '.62rem', color: T.mute, letterSpacing: '.05em', textTransform: 'uppercase' }}>Intro</span>
                    <select value={introSfxId} onChange={e => setIntroSfxId(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', marginTop: 4,
                        background: '#fff', border: `1.5px solid ${T.ink}22`, borderRadius: 8,
                        padding: '8px 10px', fontSize: '.78rem', fontFamily: FONT, cursor: 'pointer' }}>
                      <option value="">None</option>
                      {sfxLib.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: '.62rem', color: T.mute, letterSpacing: '.05em', textTransform: 'uppercase' }}>Outro</span>
                    <select value={outroSfxId} onChange={e => setOutroSfxId(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', marginTop: 4,
                        background: '#fff', border: `1.5px solid ${T.ink}22`, borderRadius: 8,
                        padding: '8px 10px', fontSize: '.78rem', fontFamily: FONT, cursor: 'pointer' }}>
                      <option value="">None</option>
                      {sfxLib.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                </div>
              </>
            )}

            <StageNextButton label="Next — final callsheet" onClick={goNext} accent={STAGE_BY_ID.review.accent} />
          </StageShell>
          )}

          {stage === 'review' && (
          <StageShell id="review">
            {/* Callsheet: monospace lines like a shot list / receipt.
                No dashed borders, no big colored banners — quiet confidence. */}
            <div style={{
              border: `1.5px solid ${T.ink}`,
              borderRadius: 12, overflow: 'hidden', background: '#fff',
            }}>
              <div style={{ background: T.ink, color: '#fff',
                padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', fontFamily: FONT_MONO, fontSize: '.62rem',
                letterSpacing: '.1em', textTransform: 'uppercase' }}>
                <span>Callsheet · Brainrot Clip</span>
                <span style={{ opacity: .6 }}>{problems.length === 0 ? 'READY' : `${problems.length} MISSING`}</span>
              </div>
              <CallsheetRow label="Premise" done={stageDone.spark} onEdit={() => goToStage('spark')}>
                {script.trim() ? `"${script.trim().slice(0, 80)}${script.trim().length > 80 ? '…' : ''}"` : <em style={{ color: T.mute }}>No topic yet</em>}
              </CallsheetRow>
              <CallsheetRow label="Cast" done={stageDone.cast} onEdit={() => goToStage('cast')}>
                {castCount === 0 ? 'Narrator only' :
                  picked.length ? `${picked.map(p => p.name).join(' vs ')}${chemistry ? ` · ${chemistry.emoji} ${chemistry.label}` : ''}` :
                  <em style={{ color: T.mute }}>{`0 of ${castCount} picked`}</em>}
              </CallsheetRow>
              <CallsheetRow label="Backdrop" done={stageDone.scene} onEdit={() => goToStage('scene')}>
                {background ? `${background.category?.replace(/_/g, ' ') || 'Background'}${background.source_title ? ` — ${background.source_title}` : ''}` :
                  <em style={{ color: T.mute }}>No backdrop yet</em>}
              </CallsheetRow>
              <CallsheetRow label="Style" done={stageDone.style} onEdit={() => goToStage('style')} last>
                {duration}s · {CAPTION_STYLES.find(c => c.id === captionStyle)?.label || captionStyle} · {motionMode === 'always_on' ? 'always on' : 'turn-based'}
                {musicId ? ` · music: ${musicLib.find(m => m.id === musicId)?.name || 'on'}` : ''}
              </CallsheetRow>
            </div>

            <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '12px 14px', background: '#fffdf5',
              borderLeft: `3px solid ${STAGE_BY_ID.review.accent}`, borderRadius: 6 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: '.62rem', fontWeight: 700,
                color: T.mute, letterSpacing: '.06em', flexShrink: 0, paddingTop: 2 }}>COST</div>
              <div style={{ fontSize: '.8rem', color: T.ink, lineHeight: 1.5 }}>
                <strong>1 credit</strong> — charged only when the clip finishes rendering.
                If anything fails on our end, it's refunded automatically.
              </div>
            </div>

            {problems.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px',
                background: '#fff8f8', borderLeft: `3px solid ${T.red}`, borderRadius: 6 }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: '.62rem', fontWeight: 700,
                  color: T.redDark, letterSpacing: '.06em', marginBottom: 6 }}>NEEDS ATTENTION</div>
                {problems.map((p, i) => (
                  <div key={i} style={{ fontSize: '.8rem', fontWeight: 600, color: T.ink,
                    display: 'flex', gap: 8, marginBottom: 2 }}>
                    <span style={{ color: T.red, fontWeight: 900 }}>·</span>{p}
                  </div>
                ))}
              </div>
            )}
          </StageShell>
          )}
        </div>

        {/* ══ RIGHT: preview + generate (sticky) ═════════════════ */}
        <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PreviewStage
            background={background}
            characters={picked}
            captionStyle={captionStyle}
            onMoveCharacter={moveCharacter}
            chemistry={chemistry}
          />

          {isActive(activeJob) ? (
            <ProgressCard job={activeJob} />
          ) : (
            <>
              <button onClick={generate} disabled={!canGenerate} {...pressHandlers}
                style={{ ...btn(canGenerate ? T.red : '#c9c2b2', '#fff'),
                  width: '100%', padding: '15px 0', fontSize: '1.05rem',
                  cursor: canGenerate ? 'pointer' : 'not-allowed',
                  boxShadow: canGenerate ? sticker(5) : 'none' }}>
                {submitting ? 'Starting…' : '⚡ Generate Brainrot Clip'}
              </button>
              {problems.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#fffdf7',
                  border: `1px solid ${T.ink}18`, borderRadius: 10 }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: '.6rem', fontWeight: 700,
                    color: T.mute, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Still needed
                  </div>
                  {problems.map((p, i) => (
                    <div key={i} style={{ fontSize: '.78rem', fontWeight: 600, color: T.ink,
                      display: 'flex', gap: 7, marginBottom: 2 }}>
                      <span style={{ color: T.red, fontWeight: 900 }}>·</span>{p}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ══ Your clips ═════════════════════════════════════════ */}
      <ClipsHistory clips={myClips} navigate={navigate} activeJob={activeJob} />

      {/* toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          ...card({ background: toast.type === 'err' ? '#fff4f4' : toast.type === 'ok' ? '#f2fff5' : T.paper2 }),
          padding: '11px 18px', fontSize: '.86rem', fontWeight: 800,
          color: toast.type === 'err' ? T.redDark : toast.type === 'ok' ? T.green : T.ink }}>
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

// ── Header ────────────────────────────────────────────────────────
// ── Header ────────────────────────────────────────────────────────
// Clean, quiet, editorial. Accepts an optional connection-offline chip
// that replaces the old page-wide red banner — see anyOffline logic in
// the main component.
function Header({ user, onLogout, navigate, connectionOffline, onRetryConnection }) {
  const initials = (user?.full_name || user?.email || 'U')[0].toUpperCase()
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 200, background: 'rgba(251,246,234,.92)',
      backdropFilter: 'blur(10px)',
      borderBottom: `1px solid ${T.ink}22`, padding: '14px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.35rem' }}>🧠</span>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em' }}>
              Brainrot <span style={{ fontStyle: 'italic', color: T.red }}>Studio</span>
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: '.58rem', fontWeight: 500, color: T.mute,
              textTransform: 'uppercase', letterSpacing: '.14em', marginTop: 2 }}>
              by ShortClipr
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {connectionOffline && (
          <button onClick={onRetryConnection}
            title="Some data isn't reachable — click to retry"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              background: 'rgba(255,210,63,.18)',
              border: `1px solid rgba(207,19,34,.35)`, borderRadius: 999,
              padding: '4px 12px 4px 10px',
              fontFamily: FONT, fontSize: '.72rem', fontWeight: 600, color: T.ink,
            }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.red,
              display: 'inline-block', animation: 'br-pulse-dot 1.4s ease-in-out infinite' }} />
            Reconnecting
          </button>
        )}
        <Link to="/youtube-shorts/dashboard" style={{
          fontFamily: FONT, fontSize: '.78rem', fontWeight: 600, color: T.mute,
          textDecoration: 'none', padding: '6px 10px', borderRadius: 6,
        }}>← Shorts dashboard</Link>
        <div style={{ width: 32, height: 32, borderRadius: '50%',
          background: T.ink, border: `1px solid ${T.ink}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '.78rem', overflow: 'hidden' }}>
          {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
        </div>
        <button onClick={onLogout} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: FONT, fontSize: '.75rem', fontWeight: 600, color: T.mute,
          padding: '4px 8px',
        }}>Sign out</button>
      </div>
      <style>{`@keyframes br-pulse-dot { 0%,100% { opacity: .4 } 50% { opacity: 1 } }`}</style>
    </header>
  )
}

// ── StageShell — one per stage, gives each its own visual identity ──
// A stage's outer container isn't a generic sticker card anymore. It's a
// spacious editorial page-fragment with a colored accent rail on the left
// (the stage's signature accent), a monospace kicker label ("Chapter 02"),
// and a serif display heading. Same container across all stages so the
// system reads as coherent; the accent color and heading text are what
// give each stage its own room.
function StageShell({ id, children }) {
  const meta = STAGE_BY_ID[id]
  return (
    <section style={{
      background: '#fffdf7',
      borderRadius: 16,
      border: `1px solid ${T.ink}18`,
      boxShadow: `0 1px 0 ${T.ink}08, 0 12px 40px -20px ${T.ink}22`,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Accent rail — the one bit of stage-specific color on the shell */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        background: meta.accent,
      }} />
      <div style={{ padding: '26px 28px 28px 32px' }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: '.65rem', fontWeight: 600,
          color: T.mute, letterSpacing: '.14em', textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          {meta.kicker} · {meta.label}
        </div>
        <h2 style={{
          margin: '0 0 6px', fontFamily: FONT_DISPLAY, fontWeight: 600,
          fontSize: 'clamp(1.5rem, 2.2vw, 1.85rem)', letterSpacing: '-.02em',
          color: T.ink, lineHeight: 1.05,
        }}>
          {meta.title}
        </h2>
        <p style={{
          margin: '0 0 22px', fontSize: '.86rem', color: T.mute,
          lineHeight: 1.5, maxWidth: '52ch',
        }}>
          {meta.hint}
        </p>
        {children}
      </div>
    </section>
  )
}

// ── SubLabel — the small monospace section marker inside a StageShell ──
function SubLabel({ children, accent }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontFamily: FONT_MONO, fontSize: '.62rem', fontWeight: 700,
      color: T.mute, letterSpacing: '.08em', textTransform: 'uppercase',
      marginBottom: 10,
    }}>
      {accent && <span style={{ width: 8, height: 8, background: accent, borderRadius: 2 }} />}
      {children}
    </div>
  )
}

// ── StageDivider — hair-thin rule between sub-groups inside a shell ──
function StageDivider() {
  return <div style={{ height: 1, background: `${T.ink}12`, margin: '2px 0 20px' }} />
}

// ── StageFootnote — small muted explanatory copy at the bottom ──
function StageFootnote({ children }) {
  return (
    <p style={{
      margin: '14px 0 0', fontSize: '.76rem', color: T.mute,
      lineHeight: 1.55, fontStyle: 'italic',
    }}>
      {children}
    </p>
  )
}

// ── StageNextButton — quiet forward affordance, not a chunky primary ──
// The rail supports jumping anywhere; this is just the linear "keep going"
// path a first-time user naturally follows. Restraint here matters —
// the real primary CTA is Generate in the right column.
function StageNextButton({ label, onClick, accent = T.red }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        marginTop: 26, cursor: 'pointer',
        background: 'transparent', border: 'none',
        fontFamily: FONT, fontSize: '.82rem', fontWeight: 700, color: T.ink,
        padding: '4px 0', letterSpacing: '-.01em',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = accent }}
      onMouseLeave={e => { e.currentTarget.style.color = T.ink }}
    >
      {label} <span style={{ transition: 'transform .12s', display: 'inline-block' }}>→</span>
    </button>
  )
}

// ── CallsheetRow — one line in the Review stage's callsheet ──
// Monospace treatment, thin rules, no dashed borders. Reads as a shot
// list / receipt / manifest — quiet confidence, not a form.
function CallsheetRow({ label, done, onEdit, children, last }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr 60px', gap: 12, alignItems: 'center',
      padding: '12px 14px',
      borderBottom: last ? 'none' : `1px solid ${T.ink}12`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: FONT_MONO, fontSize: '.62rem', fontWeight: 700,
        color: done ? T.ink : T.mute,
        letterSpacing: '.08em', textTransform: 'uppercase',
      }}>
        <span style={{ color: done ? T.green : T.ink + '55', fontFamily: FONT }}>
          {done ? '●' : '○'}
        </span>
        {label}
      </div>
      <div style={{ fontSize: '.86rem', color: T.ink, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </div>
      <button onClick={onEdit}
        style={{
          justifySelf: 'end', cursor: 'pointer',
          background: 'transparent', border: 'none',
          fontFamily: FONT_MONO, fontSize: '.62rem', fontWeight: 700,
          color: T.mute, letterSpacing: '.08em', textTransform: 'uppercase',
          padding: '4px 6px',
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
      background: '#fffdf5',
      border: `1px dashed ${T.ink}33`,
      borderRadius: 12,
    }}>
      <div style={{ fontSize: '1.8rem', marginBottom: 10, opacity: .35 }}>⚡</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: '1rem', fontWeight: 600,
        color: T.ink, marginBottom: 6, letterSpacing: '-.01em' }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: '.78rem', color: T.mute, lineHeight: 1.5,
          maxWidth: '38ch', margin: '0 auto 16px' }}>
          {sub}
        </div>
      )}
      <button onClick={handleRetry} disabled={retrying}
        style={{
          cursor: retrying ? 'default' : 'pointer',
          background: T.ink, color: '#fff',
          border: 'none', borderRadius: 8, padding: '8px 18px',
          fontFamily: FONT, fontSize: '.78rem', fontWeight: 700,
          opacity: retrying ? .6 : 1,
        }}>
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}

// ── StageRail — a real progress spine, not a row of pills ──
// Horizontal, always visible, every stage clickable — same navigation
// contract as before. What changed: it now reads as a *progression* —
// numbered nodes on a shared spine, connectors between them filled dark
// where done, muted where remaining, current stage sized larger with
// its own accent color as the spot of emphasis. Feels like a printed
// table of contents, not a form's step indicator.
function StageRail({ stage, onJump, stageDone }) {
  const activeIdx = STAGES.findIndex(s => s.id === stage)
  return (
    <div style={{
      background: '#fffdf7',
      border: `1px solid ${T.ink}12`,
      borderRadius: 14,
      padding: '18px 22px',
      boxShadow: `0 1px 0 ${T.ink}05`,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
        alignItems: 'flex-start',
        position: 'relative',
        gap: 4,
      }}>
        {/* Connector line — sits behind the nodes */}
        <div style={{
          position: 'absolute', left: '10%', right: '10%', top: 14, height: 1,
          background: `linear-gradient(to right, ${T.ink} 0%, ${T.ink} ${(activeIdx / (STAGES.length - 1)) * 100}%, ${T.ink}22 ${(activeIdx / (STAGES.length - 1)) * 100}%, ${T.ink}22 100%)`,
          zIndex: 0,
        }} />
        {STAGES.map((s, i) => {
          const active = stage === s.id
          const done = stageDone[s.id]
          const isPast = i < activeIdx
          return (
            <button key={s.id} onClick={() => onJump(s.id)} title={s.hint}
              style={{
                cursor: 'pointer', background: 'transparent', border: 'none',
                padding: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 8, position: 'relative', zIndex: 1,
                fontFamily: FONT,
              }}>
              <div style={{
                width: active ? 32 : 28, height: active ? 32 : 28,
                borderRadius: '50%',
                background: active ? s.accent : done || isPast ? T.ink : '#fffdf7',
                border: `1.5px solid ${active || done || isPast ? T.ink : T.ink + '44'}`,
                color: active ? (s.accent === '#ffd23f' ? T.ink : '#fff') : done || isPast ? '#fff' : T.mute,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: active ? '.78rem' : '.7rem', fontWeight: 700,
                fontFamily: FONT_MONO,
                transition: 'all .18s ease',
                boxShadow: active ? `0 4px 12px ${s.accent}55` : 'none',
              }}>
                {done && !active ? '✓' : String(i + 1).padStart(2, '0')}
              </div>
              <div style={{
                fontSize: active ? '.75rem' : '.7rem',
                fontWeight: active ? 700 : 500,
                color: active ? T.ink : done || isPast ? T.ink : T.mute,
                letterSpacing: '-.01em',
                transition: 'all .18s ease',
              }}>
                {s.label}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Chemistry badge ─────────────────────────────────────────────────
function ChemistryBadge({ chemistry }) {
  return (
    <div style={{ ...card({ padding: '10px 14px', boxShadow: sticker(2) }),
      display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: '1.3rem' }}>{chemistry.emoji}</span>
      <div>
        <div style={{ fontSize: '.82rem', fontWeight: 900 }}>{chemistry.label}</div>
        <div style={{ fontSize: '.68rem', fontWeight: 600, color: T.mute }}>{chemistry.blurb}</div>
      </div>
    </div>
  )
}

// ── Signature cast chip ──────────────────────────────────────────────
function SignatureCastChip({ cast, roster, onLoad, onDelete }) {
  const chars = cast.character_ids.map(id => roster.find(r => r.id === id)).filter(Boolean)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      background: T.paper2, border: `2px solid ${T.ink}`, borderRadius: 999, padding: '4px 6px 4px 4px' }}>
      <button onClick={onLoad} title={`Load ${cast.label || 'this cast'}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          background: 'none', border: 'none', padding: '2px 4px', fontFamily: FONT }}>
        <div style={{ display: 'flex' }}>
          {chars.map((c, i) => (
            <img key={c.id} src={c.image_url} alt="" style={{
              width: 22, height: 22, borderRadius: '50%', objectFit: 'cover',
              border: `1.5px solid ${T.ink}`, background: '#e9e3d3',
              marginLeft: i > 0 ? -8 : 0,
            }} />
          ))}
        </div>
        <span style={{ fontSize: '.72rem', fontWeight: 800 }}>{cast.label || 'Signature cast'}</span>
      </button>
      <button onClick={onDelete} title="Delete"
        style={{ cursor: 'pointer', background: 'none', border: 'none', color: T.mute,
          fontSize: '.7rem', fontWeight: 900, padding: '2px 6px' }}>✕</button>
    </div>
  )
}

// ── Picked character card ─────────────────────────────────────────
function PickedCard({ p, motions, voices, onRemove, onVoice, onEntry, onExit, onPreview, onScale, onRotation }) {
  const selectStyle = {
    background: T.paper2, border: `2px solid ${T.ink}`, borderRadius: 8,
    padding: '5px 8px', fontSize: '.72rem', fontWeight: 700, fontFamily: FONT, cursor: 'pointer', width: '100%',
  }
  const selectedVoice = voices.find(v => v.voice_id === p.voiceId)
  return (
    <div style={{ ...card({ padding: 10, boxShadow: sticker(2) }), display: 'flex', gap: 10 }}>
      <div style={{ position: 'relative', width: 56, flexShrink: 0 }}>
        <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: '#e9e3d3', border: `2px solid ${T.ink}` }}>
          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span style={{ ...pill(p.side === 'left' ? '#cde3ff' : '#ffe0cd', { padding: '1px 6px', fontSize: '.55rem', position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)' }) }}>
          {p.side}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
            <div style={{ fontSize: '.64rem', color: T.mute, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.archetype} · {p.gender}
            </div>
          </div>
          <button onClick={onRemove} title="Remove" style={{ ...pill('#fff4f4', { cursor: 'pointer', color: T.redDark, padding: '2px 8px' }) }}>✕</button>
        </div>
        {/* voice + preview */}
        <div style={{ display: 'flex', gap: 6, margintop: 6, marginTop: 8, alignItems: 'center' }}>
          <select value={p.voiceId} onChange={e => onVoice(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            <option value="">Auto voice (fits {p.gender})</option>
            {voices.map(v => (
              <option key={`${v.provider}:${v.voice_id}`} value={v.voice_id}>{v.label} · {v.gender}</option>
            ))}
          </select>
          <button onClick={() => onPreview(selectedVoice?.preview_url)}
            disabled={!selectedVoice?.preview_url}
            title={selectedVoice?.preview_url ? 'Play sample' : 'Pick a specific voice to preview'}
            style={{ ...pill(selectedVoice?.preview_url ? T.yellow : T.paper2, { padding: '5px 9px', cursor: selectedVoice?.preview_url ? 'pointer' : 'not-allowed' }) }}>▶</button>
        </div>
        {/* entry / exit */}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.56rem', fontWeight: 800, color: T.mute, textTransform: 'uppercase', letterSpacing: '.05em' }}>Enter</span>
            <select value={p.entry} onChange={e => onEntry(e.target.value)} style={selectStyle}>
              {motions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.56rem', fontWeight: 800, color: T.mute, textTransform: 'uppercase', letterSpacing: '.05em' }}>Exit</span>
            <select value={p.exit} onChange={e => onExit(e.target.value)} style={selectStyle}>
              {motions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>
        {/* scale / rotation */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.56rem', fontWeight: 800, color: T.mute, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Size · {Math.round((p.scale ?? 1) * 100)}%
            </span>
            <input type="range" min={0.7} max={1.3} step={0.05} value={p.scale ?? 1}
              onChange={e => onScale(Number(e.target.value))}
              style={{ width: '100%', accentColor: T.red, display: 'block', marginTop: 2 }} />
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: '.56rem', fontWeight: 800, color: T.mute, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Tilt · {p.rotation ?? 0}°
            </span>
            <input type="range" min={-15} max={15} step={1} value={p.rotation ?? 0}
              onChange={e => onRotation(Number(e.target.value))}
              style={{ width: '100%', accentColor: T.red, display: 'block', marginTop: 2 }} />
          </label>
        </div>
      </div>
    </div>
  )
}

// ── Progress card ─────────────────────────────────────────────────
function ProgressCard({ job }) {
  const pct = job.progress || 0
  return (
    <div style={{ ...card({ padding: 16 }) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: '1.1rem', animation: 'brSpin 1s linear infinite', display: 'inline-block' }}>🌀</span>
        <span style={{ fontWeight: 900, fontSize: '.92rem' }}>{job.current_step || 'Working…'}</span>
      </div>
      <div style={{ height: 12, background: T.paper, border: `2px solid ${T.ink}`, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `repeating-linear-gradient(45deg,${T.red},${T.red} 8px,${T.redDark} 8px,${T.redDark} 16px)`, transition: 'width .5s' }} />
      </div>
      <div style={{ marginTop: 6, fontSize: '.72rem', fontWeight: 800, color: T.mute, textAlign: 'right' }}>{pct}%</div>
      <style>{`@keyframes brSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Clips history ─────────────────────────────────────────────────
function ClipsHistory({ clips, activeJob }) {
  const merged = activeJob && isActive(activeJob)
    ? [activeJob, ...clips.filter(c => c.job_id !== activeJob.job_id)]
    : clips
  if (!merged.length) return null
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px 80px' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ transform: 'rotate(-6deg)', display: 'inline-block' }}>🎬</span> Your Brainrot Clips
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 16 }}>
        {merged.map(job => (
          <div key={job.job_id} style={{ ...card({ padding: 8 }) }}>
            <div style={{ width: '100%', aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {job.status === 'complete' && job.output_url ? (
                <video src={job.output_url} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : job.status === 'failed' ? (
                <div style={{ color: '#ff8a8a', fontSize: '.72rem', fontWeight: 800, textAlign: 'center', padding: 12 }}>
                  ⚠ {job.error_message || 'Failed'}
                </div>
              ) : (
                <div style={{ color: '#fff', fontSize: '.74rem', fontWeight: 800, textAlign: 'center', padding: 12 }}>
                  {job.current_step || 'Processing…'}<br /><span style={{ opacity: .6 }}>{job.progress || 0}%</span>
                </div>
              )}
            </div>
            <div style={{ padding: '8px 4px 3px', fontSize: '.66rem', fontWeight: 700, color: T.mute }}>
              {job.created_at ? new Date(job.created_at).toLocaleString() : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
