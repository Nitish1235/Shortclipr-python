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

export default function BrainrotStudio() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // ── Reference data ──────────────────────────────────────────────
  const [roster, setRoster]     = useState([])
  const [voices, setVoices]     = useState([])
  const [motions, setMotions]   = useState([])
  const [clipsLib, setClipsLib] = useState([])
  const [refError, setRefError] = useState(null)

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

  // ── Job state ───────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [activeJob, setActiveJob]   = useState(null)   // polled job being generated
  const [myClips, setMyClips]       = useState([])
  const [toast, setToast]           = useState(null)
  const pollRef = useRef(null)
  const audioRef = useRef(null)

  // ── Load reference data + history ───────────────────────────────
  useEffect(() => {
    let alive = true
    Promise.allSettled([
      brainrotApi.characters(),
      brainrotApi.voices(),
      brainrotApi.animations(),
      brainrotApi.gameplayClips(),
      brainrotApi.listJobs(),
    ]).then(([c, v, a, g, j]) => {
      if (!alive) return
      if (c.status === 'fulfilled') setRoster(c.value.characters || [])
      else setRefError('Could not load characters. Is the backend running & bucket configured?')
      if (v.status === 'fulfilled') setVoices(v.value.voices || [])
      if (a.status === 'fulfilled') setMotions(a.value.entry || [])
      if (g.status === 'fulfilled') setClipsLib(g.value.clips || [])
      if (j.status === 'fulfilled') setMyClips(j.value.jobs || [])
    })
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

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
        motion_mode: 'turn_based',
      }
      const { job_id } = await brainrotApi.createJob(options)
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

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.paper, fontFamily: FONT, color: T.ink,
      backgroundImage: `radial-gradient(${T.ink}14 1px, transparent 1px)`, backgroundSize: '22px 22px' }}>

      <Header user={user} onLogout={logout} navigate={navigate} />

      {refError && (
        <div style={{ maxWidth: 1180, margin: '14px auto 0', padding: '0 20px' }}>
          <div style={{ ...card({ background: '#fff4f4', borderColor: T.red }), padding: '12px 16px', fontSize: '.85rem', fontWeight: 700, color: T.redDark }}>
            ⚠ {refError}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 20px 80px',
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 26, alignItems: 'start' }}>

        {/* ══ LEFT: builder ══════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* 1. Script */}
          <Section n="1" title="The Script" tip="Hook hard. A story, a hot take, an argument.">
            <textarea
              value={script}
              onChange={e => setScript(e.target.value)}
              placeholder="e.g. My dad tried to fix the wifi and took down the whole street…"
              rows={4}
              style={{
                width: '100%', resize: 'vertical', boxSizing: 'border-box',
                background: T.paper2, border: `2px solid ${T.ink}`, borderRadius: 10,
                padding: '12px 14px', fontSize: '.95rem', fontFamily: FONT, color: T.ink,
                lineHeight: 1.5, outline: 'none',
              }}
            />
            <div style={{ marginTop: 6, fontSize: '.72rem', color: T.mute, fontWeight: 600 }}>
              The AI writes each character fully in-character and paces it to your clip length.
            </div>
          </Section>

          {/* 2. Cast */}
          <Section n="2" title="Cast" tip="0–2 original characters. Voices auto-match each character.">
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[0, 1, 2].map(n => (
                <button key={n} onClick={() => setCast(n)} {...pressHandlers}
                  style={{ ...btn(castCount === n ? T.ink : T.paper2, castCount === n ? '#fff' : T.ink),
                    flex: 1, padding: '9px 0', fontSize: '.85rem' }}>
                  {n === 0 ? 'Narrator only' : `${n} character${n > 1 ? 's' : ''}`}
                </button>
              ))}
            </div>

            {/* picked character cards */}
            {picked.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {picked.map(p => (
                  <PickedCard key={p.id} p={p} motions={motions}
                    voices={voicesFor(p.gender)}
                    onRemove={() => toggleCharacter(p)}
                    onVoice={(voiceId) => updatePicked(p.id, { voiceId })}
                    onEntry={(entry) => updatePicked(p.id, { entry })}
                    onExit={(exit) => updatePicked(p.id, { exit })}
                    onPreview={playPreview} />
                ))}
              </div>
            )}

            {castCount > 0 ? (
              <>
                <input value={charSearch} onChange={e => setCharSearch(e.target.value)}
                  placeholder={`Search ${roster.length} characters…`}
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10,
                    background: T.paper2, border: `2px solid ${T.ink}`, borderRadius: 999,
                    padding: '8px 14px', fontSize: '.82rem', fontFamily: FONT, outline: 'none' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))',
                  gap: 8, maxHeight: 300, overflowY: 'auto', padding: 4 }}>
                  {filteredRoster.map(ch => {
                    const on = picked.some(p => p.id === ch.id)
                    return (
                      <button key={ch.id} onClick={() => toggleCharacter(ch)} title={`${ch.name} — ${ch.archetype}`}
                        style={{ position: 'relative', cursor: 'pointer', padding: 5,
                          background: on ? T.yellow : T.paper2,
                          border: `2px solid ${T.ink}`, borderRadius: 10,
                          boxShadow: on ? sticker(2) : 'none', transition: 'all .1s' }}>
                        <div style={{ width: '100%', aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                          background: '#e9e3d3', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                          <img src={ch.image_url} alt={ch.name} loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                        <div style={{ fontSize: '.58rem', fontWeight: 800, marginTop: 3, lineHeight: 1.1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</div>
                        {on && <div style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20,
                          borderRadius: '50%', background: T.red, color: '#fff', border: `2px solid ${T.ink}`,
                          fontSize: '.7rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
                      </button>
                    )
                  })}
                </div>
                {/* provider toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <span style={{ fontSize: '.72rem', fontWeight: 800, color: T.mute }}>Voice engine:</span>
                  {PROVIDERS.map(pr => (
                    <button key={pr.id} onClick={() => setProvider(pr.id)}
                      style={{ ...pill(provider === pr.id ? T.yellow : T.paper2), cursor: 'pointer' }}>
                      {pr.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '.82rem', color: T.mute, fontWeight: 600, padding: '4px 2px' }}>
                Pure narrator voice-over — no characters on screen, just captions over gameplay.
              </div>
            )}
          </Section>

          {/* 3. Background */}
          <Section n="3" title="Gameplay Background" tip="The satisfying loop behind it all.">
            {clipsLib.length === 0 ? (
              <div style={{ fontSize: '.82rem', color: T.mute, fontWeight: 600 }}>
                No gameplay backgrounds uploaded yet. An admin adds these in the library.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)}
                      style={{ ...pill(category === cat ? T.yellow : T.paper2), cursor: 'pointer', textTransform: 'capitalize' }}>
                      {cat.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
                  {visibleClips.map(clip => {
                    const on = background?.id === clip.id
                    return (
                      <button key={clip.id} onClick={() => setBackground(clip)}
                        style={{ cursor: 'pointer', padding: 4, background: on ? T.yellow : T.paper2,
                          border: `2px solid ${T.ink}`, borderRadius: 10, boxShadow: on ? sticker(2) : 'none' }}>
                        <div style={{ width: '100%', aspectRatio: '9/16', borderRadius: 6, overflow: 'hidden', background: '#000' }}>
                          {clip.thumbnail_url
                            ? <img src={clip.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '.6rem', fontWeight: 700, textTransform: 'capitalize' }}>{clip.category}</div>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </Section>

          {/* 4. Vibe */}
          <Section n="4" title="Vibe" tip="Length & caption energy.">
            <div style={{ fontSize: '.74rem', fontWeight: 800, color: T.mute, marginBottom: 8 }}>
              LENGTH · <span style={{ color: T.ink }}>{duration}s</span>
            </div>
            <input type="range" min={5} max={120} step={5} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: T.red }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, marginBottom: 18 }}>
              {DURATION_PRESETS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  style={{ ...pill(duration === d ? T.yellow : T.paper2), cursor: 'pointer' }}>{d}s</button>
              ))}
            </div>

            <div style={{ fontSize: '.74rem', fontWeight: 800, color: T.mute, marginBottom: 8 }}>CAPTION STYLE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {CAPTION_STYLES.map(cs => {
                const on = captionStyle === cs.id
                return (
                  <button key={cs.id} onClick={() => setCaption(cs.id)}
                    style={{ cursor: 'pointer', textAlign: 'left', padding: '9px 12px',
                      background: on ? T.ink : T.paper2, color: on ? '#fff' : T.ink,
                      border: `2px solid ${T.ink}`, borderRadius: 10, boxShadow: on ? sticker(3) : 'none' }}>
                    <div style={{ fontSize: '.86rem', fontWeight: 900 }}>{cs.label}</div>
                    <div style={{ fontSize: '.66rem', fontWeight: 600, opacity: .7 }}>{cs.blurb}</div>
                  </button>
                )
              })}
            </div>
          </Section>
        </div>

        {/* ══ RIGHT: preview + generate (sticky) ═════════════════ */}
        <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PreviewStage
            background={background}
            characters={picked}
            captionStyle={captionStyle}
            onMoveCharacter={moveCharacter}
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
                <div style={{ ...card({ padding: '10px 12px' }) }}>
                  <div style={{ fontSize: '.68rem', fontWeight: 900, color: T.mute, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>To generate:</div>
                  {problems.map((p, i) => (
                    <div key={i} style={{ fontSize: '.78rem', fontWeight: 700, color: T.ink, display: 'flex', gap: 6 }}>
                      <span style={{ color: T.red }}>○</span>{p}
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

// ── Header ────────────────────────────────────────────────────────
function Header({ user, onLogout, navigate }) {
  const initials = (user?.full_name || user?.email || 'U')[0].toUpperCase()
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 200, background: T.paper2,
      borderBottom: `2.5px solid ${T.ink}`, padding: '12px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: '1.5rem', transform: 'rotate(-8deg)', display: 'inline-block' }}>🧠</span>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-.01em' }}>
              Brainrot <span style={{ color: T.red }}>Studio</span>
            </div>
            <div style={{ fontSize: '.58rem', fontWeight: 700, color: T.mute, textTransform: 'uppercase', letterSpacing: '.1em' }}>by ShortClipr</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/youtube-shorts/dashboard" style={{ ...pill(T.paper2), textDecoration: 'none', cursor: 'pointer' }}>
          ← Shorts dashboard
        </Link>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: T.red, border: `2px solid ${T.ink}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '.85rem' }}>
          {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initials}
        </div>
        <button onClick={onLogout} style={{ ...pill(T.paper2), cursor: 'pointer' }}>Sign out</button>
      </div>
    </header>
  )
}

// ── Section wrapper ───────────────────────────────────────────────
function Section({ n, title, tip, children }) {
  return (
    <section style={{ ...card({ padding: '18px 18px 20px' }) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ width: 26, height: 26, flexShrink: 0, background: T.yellow, border: `2px solid ${T.ink}`,
          borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: '.82rem', transform: 'rotate(-5deg)' }}>{n}</span>
        <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 900, letterSpacing: '-.01em' }}>{title}</h2>
      </div>
      {tip && <div style={{ fontSize: '.74rem', color: T.mute, fontWeight: 600, margin: '0 0 14px 36px' }}>{tip}</div>}
      <div style={{ marginLeft: 0 }}>{children}</div>
    </section>
  )
}

// ── Picked character card ─────────────────────────────────────────
function PickedCard({ p, motions, voices, onRemove, onVoice, onEntry, onExit, onPreview }) {
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
