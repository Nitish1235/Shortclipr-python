import { useCallback, useEffect, useRef, useState } from 'react'

const STEPS = [
  { key: 'connect', label: 'Connect', title: 'Start with one YouTube URL.', copy: 'ShortClipr connects to the source without asking you to learn an editing timeline.', console: ['Source link received', 'Video stream connected'] },
  { key: 'map', label: 'Understand', title: 'Turn the conversation into context.', copy: 'Speech, speakers, pauses, and topic changes become a searchable map of the full video.', console: ['Audio mapped', 'Transcript indexed', 'Topic changes detected'] },
  { key: 'scan', label: 'Scan', title: 'Inspect the complete timeline.', copy: 'A scanning playhead compares every section and marks moments that can stand on their own.', console: ['Timeline scan running', 'Candidate moments ranked'] },
  { key: 'reframe', label: 'Reframe', title: 'See the wide video become vertical.', copy: 'The selected moment becomes 9:16 while the active speaker stays inside the viewing area.', console: ['Speaker position tracked', 'Vertical frame prepared'] },
  { key: 'finish', label: 'Finish', title: 'Review the finished short.', copy: 'Word-timed captions and export settings are applied, leaving a clip ready for approval.', console: ['Captions synchronized', 'Preview ready for review'] },
]

const SEGMENTS = [18, 31, 24, 44, 29, 52, 36, 63, 41, 27, 48, 33]
const YT_URL   = 'youtube.com/watch?v=dQw4w9WgXcQ'

// ── Typewriter hook ────────────────────────────────────────────────────────
function useTypewriter(text, { charDelay = 45, startDelay = 200, resetKey = 0 } = {}) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone]           = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    let tick = null
    const start = setTimeout(() => {
      tick = setInterval(() => {
        i += 1
        setDisplayed(text.slice(0, i))
        if (i >= text.length) { clearInterval(tick); tick = null; setDone(true) }
      }, charDelay)
    }, startDelay)
    return () => { clearTimeout(start); if (tick) clearInterval(tick) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  return { displayed, done }
}

// ── Visuals ────────────────────────────────────────────────────────────────
function SourceFrame({ compact = false }) {
  return (
    <div className={`hiw-source-frame${compact ? ' compact' : ''}`}>
      <img src="/assets/showcase_interview.png" alt="Long-form interview source" />
      <div className="hiw-source-shade" />
      <span>Long-form source</span>
      <div className="hiw-speaker-box" aria-hidden="true" />
    </div>
  )
}

function ConnectVisual({ animKey }) {
  const { displayed, done } = useTypewriter(YT_URL, { charDelay: 42, startDelay: 200, resetKey: animKey })
  return (
    <div className="hiw-connect-visual">
      <div className="hiw-url-field">
        <span className="hiw-url-prefix">URL</span>
        <span className="hiw-typed-url" aria-live="polite">
          {displayed}
          {!done && <span className="hiw-cursor" aria-hidden="true" />}
        </span>
        <b style={{ opacity: done ? 1 : 0 }}>Connected</b>
      </div>
      <div className={`hiw-source-wrapper${done ? ' hiw-source-visible' : ''}`}>
        <SourceFrame />
      </div>
      <div className="hiw-transform-line"><span /></div>
    </div>
  )
}

function MapVisual() {
  return (
    <div className="hiw-map-visual">
      <div className="hiw-waveform" aria-label="Audio waveform">
        {SEGMENTS.map((h, i) => <i key={i} style={{ '--bar-height': `${h}%`, '--bar-delay': `${i * 45}ms` }} />)}
        <span className="hiw-wave-scan" />
      </div>
      <div className="hiw-transcript-map">
        <p><span>00:18</span> The thing most creators miss is finding the sentence that makes somebody stop.</p>
        <p><span>00:27</span> Once that moment is clear, the rest of the clip becomes easier to shape.</p>
        <div className="hiw-topic-row"><b>Hook</b><b>Creator workflow</b><b>Editing</b></div>
      </div>
    </div>
  )
}

function ScanVisual() {
  return (
    <div className="hiw-scan-visual">
      <SourceFrame compact />
      <div className="hiw-timeline-shell">
        <div className="hiw-time-labels"><span>00:00</span><span>06:00</span><span>12:00</span></div>
        <div className="hiw-timeline-track">
          <i className="candidate one" /><i className="candidate two" /><i className="candidate three" />
          <span className="hiw-playhead" />
        </div>
        <div className="hiw-candidate-key"><span>Candidate moment</span><span>Scanning full video</span></div>
      </div>
    </div>
  )
}

function ReframeVisual() {
  return (
    <div className="hiw-reframe-visual">
      <div className="hiw-before-pane"><span>Before · 16:9</span><SourceFrame compact /></div>
      <div className="hiw-frame-arrow"><i /></div>
      <div className="hiw-after-pane">
        <span>After · 9:16</span>
        <div className="hiw-portrait-crop"><img src="/assets/showcase_interview.png" alt="Vertically reframed interview" /><i /></div>
      </div>
    </div>
  )
}

function FinishVisual() {
  return (
    <div className="hiw-finish-visual">
      <div className="hiw-finished-phone">
        <img src="/assets/showcase_interview.png" alt="Finished short with captions" />
        <p><span>FIND</span> THE MOMENT<br />PEOPLE REMEMBER</p>
        <i>00:38</i>
      </div>
      <div className="hiw-export-queue">
        <span>Review summary</span>
        <div><p><b>Vertical framing</b><small>Speaker centered</small></p><em>Ready</em></div>
        <div><p><b>Captions</b><small>Word-timed and editable</small></p><em>Ready</em></div>
        <div><p><b>Export</b><small>1080 x 1920 MP4</small></p><em>Review</em></div>
      </div>
    </div>
  )
}

const VISUAL_COMPONENTS = [ConnectVisual, MapVisual, ScanVisual, ReframeVisual, FinishVisual]

// ── Main component ─────────────────────────────────────────────────────────
export default function HowItWorks() {
  const [active, setActive]   = useState(0)
  const [animKey, setAnimKey] = useState(0)  // bumped each time section enters view
  const sectionRef   = useRef(null)
  const storyRef     = useRef(null)
  const inViewRef    = useRef(false)
  const lockRef      = useRef(false)
  const unlockTimer  = useRef(null)

  // ── IntersectionObserver: replay every time section enters viewport ──────
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !inViewRef.current) {
        inViewRef.current = true
        setActive(0)
        setAnimKey(k => k + 1)
      } else if (!entry.isIntersecting) {
        inViewRef.current = false
      }
    }, { threshold: 0.18 })
    obs.observe(section)
    return () => obs.disconnect()
  }, [])

  // ── Scroll-based step update ─────────────────────────────────────────────
  useEffect(() => {
    const story = storyRef.current
    if (!story) return undefined
    const nodes = Array.from(story.querySelectorAll('[data-step]'))
    let frame = null
    const update = () => {
      if (lockRef.current || frame) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        const mobile = window.matchMedia('(max-width: 820px)').matches
        const line   = window.innerHeight * (mobile ? 0.72 : 0.5)
        const best = nodes.reduce((acc, node, i) => {
          const r = node.getBoundingClientRect()
          const d = Math.abs(r.top + r.height / 2 - line)
          return d < acc.distance ? { index: i, distance: d } : acc
        }, { index: 0, distance: Infinity })
        setActive(cur => cur === best.index ? cur : best.index)
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      if (frame) window.cancelAnimationFrame(frame)
      clearTimeout(unlockTimer.current)
    }
  }, [])

  const goToStep = useCallback((index) => {
    clearTimeout(unlockTimer.current)
    lockRef.current = true
    setActive(index)
    setAnimKey(k => k + 1)  // replay animation on explicit step click
    const target = storyRef.current?.querySelector(`[data-step="${index}"]`)
    if (window.matchMedia('(min-width: 821px)').matches) {
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
    unlockTimer.current = setTimeout(() => { lockRef.current = false }, 900)
  }, [])

  const ActiveVisual = VISUAL_COMPONENTS[active]
  const canvasKey    = `${STEPS[active].key}-${animKey}`

  return (
    <section id="how-it-works" className="hiw-v3" ref={sectionRef}>
      <div className="hiw-v3-inner">
        <header className="hiw-v3-heading">
          <span>How it works</span>
          <h2>Watch a long video become a finished short.</h2>
          <p>Move through the workflow yourself, or scroll to watch every stage unfold.</p>
        </header>

        <div className="hiw-scrubber" role="tablist" aria-label="ShortClipr workflow">
          <div className="hiw-scrubber-line"><i style={{ width: `${(active / (STEPS.length - 1)) * 100}%` }} /></div>
          {STEPS.map((step, i) => (
            <button key={step.key} type="button" role="tab" aria-selected={active === i}
              className={active === i ? 'active' : active > i ? 'complete' : ''}
              onClick={() => goToStep(i)}>
              <span>{String(i + 1).padStart(2, '0')}</span><b>{step.label}</b>
            </button>
          ))}
        </div>

        <div className="hiw-story-layout">
          <div className="hiw-story" ref={storyRef}>
            {STEPS.map((step, i) => (
              <button key={step.key} type="button" data-step={i}
                className={active === i ? 'active' : ''}
                onClick={() => goToStep(i)}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <div><h3>{step.title}</h3><p>{step.copy}</p></div>
              </button>
            ))}
          </div>

          <div className="hiw-sticky-workspace">
            <div className="hiw-workspace-bar">
              <span>ShortClipr workflow</span>
              <b>Stage {String(active + 1).padStart(2, '0')} of {String(STEPS.length).padStart(2, '0')}</b>
            </div>
            <div className="hiw-mobile-stage-copy">
              <b>{STEPS[active].title}</b><span>{STEPS[active].copy}</span>
            </div>
            {/* key on div forces DOM remount → CSS animations restart */}
            <div className="hiw-workspace-canvas" key={canvasKey}>
              {active === 0
                ? <ConnectVisual animKey={animKey} />
                : <ActiveVisual />}
            </div>
            <div className="hiw-console">
              <div className="hiw-console-head"><span>Processing console</span><b>Live workflow</b></div>
              {STEPS[active].console.map((line, i) => (
                <p key={`${canvasKey}-${line}`} style={{ '--log-delay': `${i * 130}ms` }}>
                  <i />{line}<span>{i === STEPS[active].console.length - 1 ? 'Active' : 'Complete'}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .hiw-v3 { padding:96px 0 112px; overflow:clip; background:#fff; color:#111; }
        .hiw-v3-inner { width:min(1120px,90%); margin:0 auto; }
        .hiw-v3-heading { max-width:720px; margin:0 auto 46px; text-align:center; }
        .hiw-v3-heading > span { color:#cf1322; font-size:.7rem; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
        .hiw-v3-heading h2 { margin:12px 0; color:#111; font-size:clamp(2rem,4.5vw,3.35rem); line-height:1.04; letter-spacing:0; }
        .hiw-v3-heading p { margin:0; color:#707070; font-size:.95rem; line-height:1.7; }

        .hiw-scrubber { position:relative; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); margin-bottom:34px; }
        .hiw-scrubber-line { position:absolute; top:15px; right:8.3%; left:8.3%; height:2px; overflow:hidden; background:#e5e5e5; }
        .hiw-scrubber-line i { display:block; height:100%; background:#cf1322; transition:width .45s ease; }
        .hiw-scrubber button { position:relative; z-index:1; display:grid; justify-items:center; padding:0 6px; color:#999; background:transparent; border:0; font:inherit; cursor:pointer; gap:7px; }
        .hiw-scrubber button span { display:grid; width:31px; height:31px; place-items:center; color:#888; background:#fff; border:1px solid #d8d8d8; border-radius:50%; font-size:.62rem; font-weight:800; transition:.25s ease; }
        .hiw-scrubber button b { font-size:.7rem; }
        .hiw-scrubber button.active span,.hiw-scrubber button.complete span { color:#fff; background:#cf1322; border-color:#cf1322; }
        .hiw-scrubber button.active b { color:#111; }

        .hiw-story-layout { display:grid; grid-template-columns:320px minmax(0,1fr); align-items:start; gap:28px; }
        .hiw-story { display:grid; gap:10px; }
        .hiw-story > button { display:grid; grid-template-columns:34px minmax(0,1fr); min-height:clamp(560px,82vh,760px); align-items:center; padding:28px 20px; color:#777; background:transparent; border:1px solid transparent; border-radius:7px; font:inherit; text-align:left; cursor:pointer; gap:12px; transition:.25s ease; }
        .hiw-story > button > span { padding-top:4px; color:#aaa; font-size:.64rem; font-weight:800; }
        .hiw-story h3 { margin:0 0 7px; color:#4d4d4d; font-size:1rem; line-height:1.3; letter-spacing:0; }
        .hiw-story p { margin:0; color:#8a8a8a; font-size:.76rem; line-height:1.6; }
        .hiw-story > button.active { background:#f7f7f5; border-color:#dededb; box-shadow:inset 3px 0 0 #cf1322; }
        .hiw-story > button.active > span { color:#cf1322; }
        .hiw-story > button.active h3 { color:#111; }

        .hiw-sticky-workspace { position:sticky; top:105px; overflow:hidden; background:#101010; border:1px solid #262626; border-radius:8px; box-shadow:0 22px 55px rgba(0,0,0,.14); }
        .hiw-workspace-bar { display:flex; align-items:center; justify-content:space-between; height:44px; padding:0 18px; color:#777; border-bottom:1px solid #262626; font-size:.65rem; }
        .hiw-workspace-bar b { color:#d6d6d6; font-weight:700; }
        .hiw-mobile-stage-copy { display:none; }
        .hiw-workspace-canvas { min-height:386px; padding:26px; animation:hiw-enter .42s ease both; }
        .hiw-console { min-height:126px; padding:14px 18px 16px; background:#0b0b0b; border-top:1px solid #262626; }
        .hiw-console-head { display:flex; justify-content:space-between; margin-bottom:9px; color:#777; font-size:.62rem; text-transform:uppercase; letter-spacing:.08em; }
        .hiw-console-head b { color:#cf1322; }
        .hiw-console p { display:grid; grid-template-columns:8px minmax(0,1fr) auto; align-items:center; margin:0; padding:5px 0; color:#aaa; font:500 .68rem/1.3 ui-monospace,SFMono-Regular,Consolas,monospace; gap:8px; opacity:0; animation:hiw-log .3s var(--log-delay) ease forwards; }
        .hiw-console p i { width:6px; height:6px; background:#2c9b68; border-radius:50%; }
        .hiw-console p span { color:#666; font-size:.58rem; }

        /* ConnectVisual */
        .hiw-connect-visual { position:relative; display:grid; gap:16px; }
        .hiw-url-field { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; min-height:48px; padding:0 13px; overflow:hidden; color:#bbb; background:#181818; border:1px solid #303030; border-radius:6px; gap:10px; }
        .hiw-url-prefix { color:#cf1322; font-size:.6rem; font-weight:800; letter-spacing:.06em; }
        .hiw-typed-url { display:block; overflow:hidden; font:500 .72rem/1 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:nowrap; color:#e0e0e0; }
        .hiw-cursor { display:inline-block; width:2px; height:.75em; margin-left:1px; background:#cf1322; vertical-align:text-bottom; animation:hiw-blink .7s step-end infinite; }
        .hiw-url-field b { color:#73c69f; font-size:.62rem; white-space:nowrap; transition:opacity .35s ease; }
        .hiw-transform-line { position:absolute; top:49px; left:36px; width:1px; height:17px; background:#cf1322; }
        .hiw-transform-line span { position:absolute; bottom:-1px; left:-3px; width:7px; height:7px; border-right:1px solid #cf1322; border-bottom:1px solid #cf1322; transform:rotate(45deg); }
        .hiw-source-wrapper { opacity:0; transform:translateY(8px); transition:opacity .45s .1s ease, transform .45s .1s ease; }
        .hiw-source-wrapper.hiw-source-visible { opacity:1; transform:none; }

        /* SourceFrame */
        .hiw-source-frame { position:relative; overflow:hidden; aspect-ratio:16/9; background:#222; border:1px solid #353535; border-radius:6px; }
        .hiw-source-frame.compact { min-height:150px; }
        .hiw-source-frame img { width:100%; height:100%; object-fit:cover; }
        .hiw-source-shade { position:absolute; inset:0; background:linear-gradient(180deg,transparent 48%,rgba(0,0,0,.68)); }
        .hiw-source-frame > span { position:absolute; bottom:10px; left:12px; color:#fff; font-size:.65rem; font-weight:700; }
        .hiw-speaker-box { position:absolute; top:20%; left:42%; width:19%; height:45%; border:1px solid rgba(255,255,255,.6); border-radius:4px; }

        /* MapVisual */
        .hiw-map-visual { display:grid; grid-template-columns:.68fr 1.32fr; min-height:330px; gap:16px; }
        .hiw-waveform,.hiw-transcript-map { position:relative; overflow:hidden; background:#181818; border:1px solid #303030; border-radius:6px; }
        .hiw-waveform { display:flex; align-items:center; padding:25px; gap:5px; }
        .hiw-waveform i { flex:1; height:var(--bar-height); background:#cf1322; border-radius:2px; opacity:.3; animation:hiw-bar .45s var(--bar-delay) ease forwards; }
        .hiw-wave-scan { position:absolute; top:0; bottom:0; width:2px; background:#fff; box-shadow:0 0 14px #fff; opacity:.65; animation:hiw-scan 2s ease-in-out infinite; }
        .hiw-transcript-map { display:flex; flex-direction:column; justify-content:center; padding:26px; }
        .hiw-transcript-map p { margin:0; padding:15px 0; color:#aaa; border-bottom:1px solid #292929; font-size:.76rem; line-height:1.65; }
        .hiw-transcript-map p span { margin-right:8px; color:#cf1322; font-size:.62rem; font-weight:800; }
        .hiw-topic-row { display:flex; flex-wrap:wrap; padding-top:18px; gap:7px; }
        .hiw-topic-row b { padding:5px 8px; color:#aaa; background:#242424; border-radius:3px; font-size:.58rem; }

        /* ScanVisual */
        .hiw-scan-visual { display:grid; grid-template-columns:.8fr 1.2fr; min-height:330px; align-items:center; gap:18px; }
        .hiw-timeline-shell { padding:24px 20px; background:#181818; border:1px solid #303030; border-radius:6px; }
        .hiw-time-labels,.hiw-candidate-key { display:flex; justify-content:space-between; color:#696969; font-size:.58rem; }
        .hiw-timeline-track { position:relative; height:76px; margin:8px 0 10px; background:repeating-linear-gradient(90deg,#242424 0,#242424 1px,transparent 1px,transparent 10%); border-top:1px solid #313131; border-bottom:1px solid #313131; }
        .hiw-timeline-track .candidate { position:absolute; top:20px; height:35px; background:rgba(207,19,34,.22); border:1px solid #cf1322; border-radius:3px; opacity:0; animation:hiw-candidate .35s ease forwards; }
        .hiw-timeline-track .one { left:8%; width:18%; animation-delay:.55s; }
        .hiw-timeline-track .two { left:43%; width:24%; animation-delay:1.05s; }
        .hiw-timeline-track .three { left:78%; width:14%; animation-delay:1.55s; }
        .hiw-playhead { position:absolute; top:-6px; bottom:-6px; left:0; width:2px; background:#fff; box-shadow:0 0 9px rgba(255,255,255,.65); animation:hiw-playhead 2.2s ease-in-out infinite; }
        .hiw-candidate-key span:first-child { color:#c8c8c8; }

        /* ReframeVisual */
        .hiw-reframe-visual { display:grid; grid-template-columns:minmax(0,1fr) 45px 145px; min-height:330px; align-items:center; gap:12px; }
        .hiw-before-pane > span,.hiw-after-pane > span { display:block; margin-bottom:8px; color:#777; font-size:.6rem; }
        .hiw-frame-arrow { height:1px; background:#555; }
        .hiw-frame-arrow i { display:block; width:8px; height:8px; margin:-4px 0 0 auto; border-top:1px solid #888; border-right:1px solid #888; transform:rotate(45deg); }
        .hiw-portrait-crop { position:relative; overflow:hidden; aspect-ratio:9/16; border:2px solid #cf1322; border-radius:6px; box-shadow:0 0 24px rgba(207,19,34,.2); }
        .hiw-portrait-crop img { width:100%; height:100%; object-fit:cover; animation:hiw-crop 1s ease both; }
        .hiw-portrait-crop i { position:absolute; inset:17% 16% 35%; border:1px solid rgba(255,255,255,.75); border-radius:4px; }

        /* FinishVisual */
        .hiw-finish-visual { display:grid; grid-template-columns:155px minmax(0,1fr); min-height:330px; align-items:center; justify-content:center; max-width:520px; margin:0 auto; gap:30px; }
        .hiw-finished-phone { position:relative; overflow:hidden; aspect-ratio:9/16; background:#222; border:5px solid #292929; border-radius:18px; box-shadow:0 0 28px rgba(207,19,34,.2); }
        .hiw-finished-phone img { width:100%; height:100%; object-fit:cover; }
        .hiw-finished-phone p { position:absolute; right:9px; bottom:35px; left:9px; margin:0; color:#fff; font-size:.67rem; font-weight:900; line-height:1.25; text-align:center; text-shadow:0 2px 5px #000; }
        .hiw-finished-phone p span { color:#fff; background:#cf1322; padding:1px 3px; }
        .hiw-finished-phone > i { position:absolute; top:10px; right:9px; padding:3px 5px; color:#fff; background:rgba(0,0,0,.65); border-radius:3px; font-size:.54rem; font-style:normal; }
        .hiw-export-queue > span { display:block; margin-bottom:12px; color:#777; font-size:.62rem; text-transform:uppercase; }
        .hiw-export-queue > div { display:flex; align-items:center; justify-content:space-between; padding:14px 0; border-bottom:1px solid #292929; gap:12px; opacity:0; animation:hiw-row .35s ease forwards; }
        .hiw-export-queue > div:nth-child(3) { animation-delay:.12s; }
        .hiw-export-queue > div:nth-child(4) { animation-delay:.24s; }
        .hiw-export-queue p { margin:0; }
        .hiw-export-queue b,.hiw-export-queue small { display:block; }
        .hiw-export-queue b { color:#ddd; font-size:.7rem; }
        .hiw-export-queue small { margin-top:3px; color:#666; font-size:.58rem; }
        .hiw-export-queue em { color:#73c69f; font-size:.58rem; font-style:normal; }

        /* Keyframes */
        @keyframes hiw-enter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        @keyframes hiw-log   { from { opacity:0; transform:translateX(-5px); } to { opacity:1; transform:none; } }
        @keyframes hiw-blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
        @keyframes hiw-bar   { from { transform:scaleY(.15); opacity:.2; } to { transform:scaleY(1); opacity:.9; } }
        @keyframes hiw-scan  { 0% { left:5%; } 50% { left:94%; } 100% { left:5%; } }
        @keyframes hiw-playhead { 0% { left:1%; } 50% { left:98%; } 100% { left:1%; } }
        @keyframes hiw-candidate { from { opacity:0; transform:scaleX(.4); transform-origin:left; } to { opacity:1; transform:scaleX(1); } }
        @keyframes hiw-row   { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        @keyframes hiw-crop  { from { transform:scale(1.35) translateX(-8%); } to { transform:scale(1.12) translateX(4%); } }

        /* Responsive */
        @media(max-width:820px) {
          .hiw-v3 { padding:72px 0 82px; }
          .hiw-v3-heading { margin-bottom:32px; }
          .hiw-scrubber { display:flex; margin-right:-5.5%; margin-bottom:20px; padding-right:5.5%; overflow-x:auto; scrollbar-width:none; }
          .hiw-scrubber::-webkit-scrollbar { display:none; }
          .hiw-scrubber-line { display:none; }
          .hiw-scrubber button { min-width:94px; grid-template-columns:27px auto; justify-content:start; align-items:center; padding:8px; gap:7px; }
          .hiw-scrubber button span { width:27px; height:27px; }
          .hiw-scrubber button b { white-space:nowrap; }
          .hiw-story-layout { grid-template-columns:1fr; }
          .hiw-story,.hiw-sticky-workspace { grid-area:1/1; }
          .hiw-story { display:grid; grid-template-columns:1fr; padding-bottom:18vh; overflow:visible; }
          .hiw-story > button { min-height:76vh; padding:0; opacity:0; pointer-events:none; }
          .hiw-sticky-workspace { position:sticky; top:82px; z-index:2; align-self:start; }
          .hiw-mobile-stage-copy { display:grid; min-height:78px; align-content:center; padding:12px 16px; color:#aaa; background:#141414; border-bottom:1px solid #262626; gap:4px; }
          .hiw-mobile-stage-copy b { color:#fff; font-size:.78rem; }
          .hiw-mobile-stage-copy span { font-size:.64rem; line-height:1.45; }
          .hiw-workspace-canvas { min-height:330px; }
        }
        @media(max-width:560px) {
          .hiw-v3-inner { width:90%; }
          .hiw-v3-heading h2 { font-size:2.15rem; }
          .hiw-story-layout { gap:18px; }
          .hiw-workspace-canvas { min-height:330px; padding:16px; }
          .hiw-workspace-bar { padding:0 14px; }
          .hiw-map-visual,.hiw-scan-visual { grid-template-columns:1fr; min-height:0; }
          .hiw-map-visual { gap:10px; }
          .hiw-waveform { min-height:105px; }
          .hiw-transcript-map { padding:17px; }
          .hiw-scan-visual .hiw-source-frame { display:none; }
          .hiw-timeline-shell { margin-top:50px; }
          .hiw-reframe-visual { grid-template-columns:minmax(0,1fr) 26px 105px; }
          .hiw-finish-visual { grid-template-columns:112px minmax(0,1fr); gap:16px; }
          .hiw-export-queue > div { padding:10px 0; }
          .hiw-url-field { grid-template-columns:auto minmax(0,1fr); }
          .hiw-url-field b { display:none; }
          .hiw-console { min-height:118px; }
        }
        @media(prefers-reduced-motion:reduce) {
          .hiw-v3 * { scroll-behavior:auto !important; animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
        }
      `}</style>
    </section>
  )
}
