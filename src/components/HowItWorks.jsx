import { useState, useEffect, useRef } from 'react'

const RED    = '#cf1322'
const RED_BG = '#fef2f2'
const RED_B  = '#fecaca'

/* ─── step data ────────────────────────────────────────────── */
const STEPS = [
  { num: '01', icon: '🔗', label: 'Paste URL',         short: 'Drop any YouTube link'         },
  { num: '02', icon: '🎙️', label: 'AI reads audio',    short: 'Transcription & semantic map'  },
  { num: '03', icon: '🧠', label: 'Best moments found', short: 'Hook-strength scoring'         },
  { num: '04', icon: '✨', label: 'Reframe & Export',   short: 'Clips ready in minutes'        },
]
const DESCS = [
  'Paste any YouTube link — podcast, interview, lecture. ShortClipr streams only the segments it needs, so no 2-hour wait for a full download.',
  'Our AI transcribes every word in seconds and builds a full semantic map of the video — emotions, pacing, topic shifts, and momentum signals.',
  'An LLM scores every segment by hook strength, emotional intensity, and retention signal. Only the highest-value moments get selected.',
  'Face-tracking reframes to 9:16, animated captions burn in word-by-word, and your clips are packaged — ready for TikTok, Reels, and Shorts.',
]
const STEP_MS = 3400

/* ─── Step 1 — URL typewriter ───────────────────────────────── */
const URL_STR = 'youtube.com/watch?v=dQw4w9WgXcQ'
function VisualURL({ tick }) {
  const [typed,    setTyped]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const [card,     setCard]     = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    setTyped(''); setSuccess(false); setCard(false)
    let i = 0
    ref.current = setInterval(() => {
      i++; setTyped(URL_STR.slice(0, i))
      if (i >= URL_STR.length) {
        clearInterval(ref.current)
        setTimeout(() => setSuccess(true), 350)
        setTimeout(() => setCard(true), 720)
      }
    }, 40)
    return () => clearInterval(ref.current)
  }, [tick])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Browser frame */}
      <div style={{ background: '#111', borderRadius: 12, border: '1px solid #222', overflow: 'hidden' }}>
        {/* Title bar */}
        <div style={{ background: '#0c0c0c', padding: '9px 14px', borderBottom: '1px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: 6 }}>
          {['#ef4444','#f59e0b','#22c55e'].map(c => (
            <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: .8 }}/>
          ))}
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 6, padding: '4px 10px', marginLeft: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#44b" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span style={{ fontSize: '0.65rem', color: '#555', fontFamily: 'monospace' }}>
              {typed}
              <span style={{ animation: 'blink-c 1s step-end infinite', color: RED }}>|</span>
            </span>
          </div>
        </div>
        {/* Content */}
        <div style={{ padding: '20px 18px', minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 16, height: 16, border: '2px solid #333', borderTopColor: RED, borderRadius: '50%', animation: 'spin-c .8s linear infinite' }}/>
                <span style={{ fontSize: '0.72rem', color: '#444' }}>Connecting to stream…</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, animation: 'flyUp .3s ease' }}>
              <div style={{ width: 44, height: 32, background: RED, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontSize: '1rem' }}>▶</span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e5e5e5' }}>Video stream detected</div>
                <div style={{ fontSize: '0.64rem', color: '#555', marginTop: 2 }}>Only segments needed will be fetched · Fast</div>
              </div>
              <span style={{ marginLeft: 'auto', background: '#0d2a18', color: '#4ade80', fontSize: '0.58rem', fontWeight: 700, padding: '3px 8px', borderRadius: 100, whiteSpace: 'nowrap', border: '1px solid #166534' }}>✓ READY</span>
            </div>
          )}
        </div>
      </div>
      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, opacity: card ? 1 : 0, transform: card ? 'none' : 'translateY(6px)', transition: 'all .4s ease' }}>
        {[['~2 min','Processing time'],['0 GB','Full download avoided'],['Any length','Podcast to lecture']].map(([v,l]) => (
          <div key={l} style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: RED, letterSpacing: '-0.02em' }}>{v}</div>
            <div style={{ fontSize: '0.6rem', color: '#555', marginTop: 2, lineHeight: 1.4 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Step 2 — Waveform + transcript ───────────────────────── */
const TRANSCRIPT_WORDS = ['So','the','real','question','is','what','makes','someone','stop','scrolling?','And','the','answer,','every','time,','is','emotion.']
const BARS_N = 30
function VisualTranscript({ tick }) {
  const [wi, setWi]   = useState(-1)
  const [done, setDone] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    setWi(-1); setDone(false)
    let i = -1
    ref.current = setInterval(() => {
      i++; setWi(i)
      if (i >= TRANSCRIPT_WORDS.length - 1) {
        clearInterval(ref.current)
        setTimeout(() => setDone(true), 400)
      }
    }, 140)
    return () => clearInterval(ref.current)
  }, [tick])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Waveform */}
      <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: '0.6rem', color: '#444', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Live audio stream</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 44 }}>
          {Array.from({ length: BARS_N }, (_, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: 3, background: RED,
              opacity: .65,
              animation: `wave-c ${.5 + (i % 6) * .12}s ease-in-out infinite alternate`,
              animationDelay: `${i * .035}s`,
              height: `${20 + Math.sin(i * .9) * 16 + Math.cos(i * 1.3) * 8}px`,
            }}/>
          ))}
        </div>
      </div>
      {/* Transcript */}
      <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: '0.6rem', color: '#444', textTransform: 'uppercase', letterSpacing: '.1em' }}>Transcript</span>
          {done && <span style={{ background: '#0d2a18', color: '#4ade80', fontSize: '0.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 100, border: '1px solid #166534', animation: 'flyUp .3s ease' }}>✓ COMPLETE</span>}
        </div>
        <p style={{ fontSize: '0.82rem', lineHeight: 2, fontWeight: 500 }}>
          {TRANSCRIPT_WORDS.map((w, i) => (
            <span key={i} style={{
              marginRight: 4,
              color: i < wi ? '#999' : i === wi ? '#fff' : '#2a2a2a',
              fontWeight: i === wi ? 800 : 400,
              background: i === wi ? 'rgba(207,19,34,.15)' : 'transparent',
              borderRadius: 3, padding: '0 2px',
              transition: 'all .12s',
            }}>{w}</span>
          ))}
        </p>
        <div style={{ marginTop: 8, fontSize: '0.62rem', color: '#555' }}>
          {wi >= 0 ? `${Math.round((wi / TRANSCRIPT_WORDS.length) * 817)} / 817 words` : '0 / 817 words'}
        </div>
      </div>
    </div>
  )
}

/* ─── Step 3 — Timeline scoring ────────────────────────────── */
const SEGS = [
  { l: '4%',  w: '13%', score: 9.2, label: 'Hook',     color: '#ef4444' },
  { l: '24%', w: '10%', score: 7.4, label: 'Context',  color: '#f97316' },
  { l: '42%', w: '15%', score: 9.5, label: 'Peak',     color: '#ef4444' },
  { l: '66%', w: '9%',  score: 8.1, label: 'Story',    color: '#f59e0b' },
  { l: '82%', w: '11%', score: 8.7, label: 'CTA',      color: '#f97316' },
]
function VisualTimeline({ tick }) {
  const [rev, setRev] = useState(-1)
  const ref = useRef(null)
  useEffect(() => {
    setRev(-1)
    let i = -1
    const tick2 = () => {
      i++; setRev(i)
      if (i < SEGS.length - 1) ref.current = setTimeout(tick2, 480)
    }
    ref.current = setTimeout(tick2, 300)
    return () => clearTimeout(ref.current)
  }, [tick])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px 16px' }}>
        <div style={{ fontSize: '0.6rem', color: '#444', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 36 }}>Video timeline · AI scoring</div>
        <div style={{ position: 'relative', height: 52 }}>
          {/* Track */}
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 5, background: '#1e1e1e', borderRadius: 3, transform: 'translateY(-50%)' }}/>
          {/* Tick marks */}
          {[0,25,50,75,100].map(p => (
            <div key={p} style={{ position: 'absolute', top: '50%', left: `${p}%`, width: 1, height: 12, background: '#2a2a2a', transform: 'translateY(-50%)' }}/>
          ))}
          {SEGS.map((s, i) => (
            <div key={i}>
              <div style={{
                position: 'absolute', top: '50%', left: s.l, width: s.w,
                height: 9, borderRadius: 4,
                background: i <= rev ? `linear-gradient(90deg, ${s.color}, ${s.color}cc)` : '#2a2a2a',
                transform: 'translateY(-50%)',
                boxShadow: i <= rev ? `0 0 12px ${s.color}80` : 'none',
                transition: 'all .35s ease',
              }}/>
              <div style={{
                position: 'absolute',
                left: `calc(${s.l} + ${s.w} / 2)`,
                top: -26, transform: 'translateX(-50%)',
                background: i <= rev ? s.color : '#1e1e1e',
                color: '#fff', fontSize: '0.58rem', fontWeight: 800,
                padding: '2px 5px', borderRadius: 5,
                opacity: i <= rev ? 1 : 0,
                transition: 'all .3s .1s',
                whiteSpace: 'nowrap',
              }}>{s.score}★</div>
              <div style={{
                position: 'absolute',
                left: `calc(${s.l} + ${s.w} / 2)`,
                bottom: -18, transform: 'translateX(-50%)',
                fontSize: '0.56rem', color: '#555',
                opacity: i <= rev ? 1 : 0,
                transition: 'opacity .3s .15s',
                whiteSpace: 'nowrap',
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[
          [`${Math.max(0, rev + 1)}/${SEGS.length}`, 'Moments scored'],
          ['9.5★',                                    'Highest hook score'],
          ['~4 min',                                  'Avg clip length'],
        ].map(([v, l]) => (
          <div key={l} style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: RED, letterSpacing: '-0.02em' }}>{v}</div>
            <div style={{ fontSize: '0.6rem', color: '#555', marginTop: 2, lineHeight: 1.4 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Step 4 — Phone + badges ───────────────────────────────── */
const CAP_WORDS = ['The', 'answer', 'is', 'emotion.']
function VisualExport({ tick }) {
  const [ci,     setCi]     = useState(-1)
  const [badges, setBadges] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    setCi(-1); setBadges(false)
    setTimeout(() => setBadges(true), 400)
    let i = 0
    ref.current = setInterval(() => { i = (i + 1) % CAP_WORDS.length; setCi(i) }, 480)
    return () => clearInterval(ref.current)
  }, [tick])

  const BADGE_LIST = [
    { icon: '📐', t: 'Face-tracked 9:16',     s: 'Speaker always centered' },
    { icon: '🗒️', t: 'Word-sync captions',    s: '11 animated styles' },
    { icon: '🎨', t: 'Premium layout applied', s: 'Glass · Blur · Neon · Cinema' },
    { icon: '📦', t: 'ZIP ready to post',      s: 'TikTok · Reels · Shorts' },
  ]

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      {/* Phone */}
      <div style={{ flexShrink: 0, width: 110, background: '#0a0a0a', borderRadius: 20, border: '2px solid #2a2a2a', overflow: 'hidden', boxShadow: `0 0 36px rgba(207,19,34,.18), 0 0 0 1px #111` }}>
        <div style={{ background: '#0a0a0a', height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 30, height: 4, background: '#222', borderRadius: 4 }}/>
        </div>
        {/* Video area */}
        <div style={{ height: 180, background: 'linear-gradient(170deg,#1c1c3a,#0d1b2a,#0a1628)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {/* Background glow */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, rgba(56,189,248,.06) 0%, transparent 70%)' }}/>
          {/* Silhouette body */}
          <div style={{ width: 38, height: 56, background: 'rgba(255,255,255,.06)', borderRadius: '18px 18px 8px 8px', position: 'relative', zIndex: 1 }}>
            <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }}/>
          </div>
          {/* Face track box */}
          {badges && (
            <div style={{
              position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)',
              width: 36, height: 36, border: '1.5px solid #38bdf8', borderRadius: 5,
              boxShadow: '0 0 10px rgba(56,189,248,.5)', animation: 'flyUp .4s ease',
            }}>
              {[{t:0,l:0},{t:0,r:0},{b:0,l:0},{b:0,r:0}].map((pos, i) => (
                <div key={i} style={{ position: 'absolute', width: 6, height: 6, background: '#38bdf8', borderRadius: 1, ...pos }}/>
              ))}
            </div>
          )}
        </div>
        {/* Caption bar */}
        <div style={{ background: '#080808', padding: '8px 6px', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
          {CAP_WORDS.map((w, i) => (
            <span key={i} style={{
              fontSize: '0.58rem', fontWeight: 900, textTransform: 'uppercase',
              color: '#fff', background: i === ci ? RED : 'transparent',
              borderRadius: 3, padding: '1px 2px', transition: 'background .1s',
              letterSpacing: '.02em',
            }}>{w}</span>
          ))}
        </div>
      </div>

      {/* Feature badges */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {BADGE_LIST.map((b, i) => (
          <div key={i} style={{
            background: '#111', border: '1px solid #1e1e1e', borderRadius: 10,
            padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
            opacity: badges ? 1 : 0,
            transform: badges ? 'none' : 'translateX(10px)',
            transition: `opacity .35s ${i * .09}s, transform .35s ${i * .09}s`,
          }}>
            <span style={{ fontSize: '.95rem', flexShrink: 0 }}>{b.icon}</span>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e5e5e5' }}>{b.t}</div>
              <div style={{ fontSize: '0.6rem', color: '#555', marginTop: 1 }}>{b.s}</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 5px #22c55e' }}/>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Main ─────────────────────────────────────────────────── */
const VISUALS = [VisualURL, VisualTranscript, VisualTimeline, VisualExport]

export default function HowItWorks() {
  const [active, setActive] = useState(0)
  const [tick,   setTick]   = useState(0)   // remount signal for visuals
  const [pct,    setPct]    = useState(0)   // progress bar 0-100
  const timerRef = useRef(null)
  const pctRef   = useRef(null)

  const goto = (i) => {
    clearTimeout(timerRef.current)
    clearInterval(pctRef.current)
    setActive(i)
    setTick(t => t + 1)
    setPct(0)
    startProgress(i)
  }

  const startProgress = (from) => {
    let p = 0
    const step = 100 / (STEP_MS / 50)
    pctRef.current = setInterval(() => {
      p += step
      if (p >= 100) {
        clearInterval(pctRef.current)
        const next = (from + 1) % STEPS.length
        timerRef.current = setTimeout(() => goto(next), 0)
        return
      }
      setPct(p)
    }, 50)
  }

  useEffect(() => {
    startProgress(0)
    return () => { clearTimeout(timerRef.current); clearInterval(pctRef.current) }
  }, [])

  const ActiveVisual = VISUALS[active]

  return (
    <section id="how-it-works" style={{ padding: '100px 0', background: '#fff' }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '0 5%' }}>

        {/* ── Header ─────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 22, height: 2, background: RED, borderRadius: 2 }}/>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '.2em' }}>How it works</span>
            <div style={{ width: 22, height: 2, background: RED, borderRadius: 2 }}/>
          </div>
          <h2 style={{ fontSize: 'clamp(1.9rem,3.5vw,2.7rem)', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em', margin: '0 0 12px' }}>
            URL to viral clip in 3 steps.
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#888', maxWidth: '380px', margin: '0 auto', lineHeight: 1.7 }}>
            Paste, wait a few minutes, download. That's the entire workflow.
          </p>
        </div>

        {/* ── Step tabs ──────────────────────────── */}
        <div id="hiw-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
          {STEPS.map((s, i) => {
            const isActive = i === active
            const isDone   = i < active
            return (
              <button
                key={i}
                onClick={() => goto(i)}
                style={{
                  background: isActive ? '#0f0f0f' : '#fafafa',
                  border: `1.5px solid ${isActive ? '#0f0f0f' : '#e5e5e5'}`,
                  borderRadius: 14,
                  padding: '14px 14px 12px',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all .22s ease',
                  outline: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.background = '#f5f5f5' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.background = '#fafafa' } }}
              >
                {/* Timer bar on active */}
                {isActive && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2, background: RED, width: `${pct}%`, transition: 'width .05s linear', borderRadius: '0 2px 2px 0' }}/>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: isActive ? '#fff' : isDone ? '#0f0f0f' : '#bbb', background: isActive ? RED : isDone ? '#0f0f0f' : '#ebebeb', borderRadius: 100, padding: '2px 7px', letterSpacing: '.06em' }}>
                    {isDone ? '✓' : s.num}
                  </span>
                  <span style={{ fontSize: '0.62rem', color: isActive ? 'rgba(255,255,255,.5)' : '#bbb', letterSpacing: '.06em' }}>
                    {s.icon}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isActive ? '#fff' : '#555', lineHeight: 1.3, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: '0.68rem', color: isActive ? 'rgba(255,255,255,.4)' : '#bbb', lineHeight: 1.4 }}>{s.short}</div>
              </button>
            )
          })}
        </div>

        {/* ── Demo panel ─────────────────────────── */}
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 20,
          padding: '28px 28px 24px',
          boxShadow: '0 24px 64px rgba(0,0,0,.14), 0 0 0 1px rgba(255,255,255,.02)',
        }}>
          {/* Panel top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#ef4444','#f59e0b','#22c55e'].map(c => (
                <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: .6 }}/>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#1a1a1a', border: '1px solid #252525', color: '#555', fontSize: '0.6rem', fontWeight: 600, padding: '3px 10px', borderRadius: 100 }}>
                shortclipr.com · live demo
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {STEPS.map((_, i) => (
                <div key={i} onClick={() => goto(i)} style={{
                  width: i === active ? 18 : 5, height: 5, borderRadius: 3,
                  background: i === active ? RED : '#222',
                  cursor: 'pointer', transition: 'all .25s',
                }}/>
              ))}
            </div>
          </div>

          {/* Animated visual — key on tick so it remounts cleanly */}
          <div key={tick} style={{ animation: 'flyUp .3s ease' }}>
            <ActiveVisual tick={tick} />
          </div>

          {/* Step description */}
          <div style={{
            marginTop: 20, paddingTop: 18,
            borderTop: '1px solid #181818',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <span style={{ background: RED, color: '#fff', fontSize: '0.58rem', fontWeight: 800, padding: '3px 9px', borderRadius: 100, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: 1, flexShrink: 0 }}>
              Step {STEPS[active].num}
            </span>
            <p style={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.75, margin: 0 }}>
              {DESCS[active]}
            </p>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes wave-c {
          from { transform: scaleY(.35); }
          to   { transform: scaleY(1); }
        }
        @keyframes flyUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink-c {
          0%,100% { opacity: 1; }
          50%      { opacity: 0; }
        }
        @keyframes spin-c {
          to { transform: rotate(360deg); }
        }
        @media(max-width: 700px) {
          #hiw-tabs { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media(max-width: 420px) {
          #hiw-tabs { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
