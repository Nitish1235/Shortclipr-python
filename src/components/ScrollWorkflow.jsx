import { useEffect, useRef, useState } from 'react'
import './scroll-workflow.css'

const photo = '/assets/workflow-podcast-cottonbro-7598543.jpg'

const steps = [
  {
    id: 'source',
    label: 'Bring your video',
    title: 'Start with the video you already made.',
    description: 'Paste a YouTube link. A full conversation, tutorial, or stream becomes the starting point for a set of short clips.',
    detail: 'Your original stays intact while you explore shorter moments.',
  },
  {
    id: 'moments',
    label: 'Find the moments',
    title: 'Find the part worth keeping.',
    description: 'ShortClipr suggests passages with a clear idea or answer. Review the surrounding context and choose the moments that work on their own.',
    detail: 'A shortlist helps you decide what deserves a closer look.',
  },
  {
    id: 'frame',
    label: 'Frame the speaker',
    title: 'Bring the speaker into focus.',
    description: 'The wide source becomes a portrait composition. Face-aware framing helps keep the active speaker visible as the clip moves.',
    detail: 'Check the full crop whenever speakers change or move.',
  },
  {
    id: 'finish',
    label: 'Finish the Short',
    title: 'Make the final frame yours.',
    description: 'Add readable captions, adjust their size and vertical position, and review the whole clip before exporting.',
    detail: 'A clear 9:16 clip is ready for your final review.',
  },
]

function WorkflowScene({ type }) {
  if (type === 'source') return (
    <div className="sw-scene sw-source">
      <div className="sw-video sw-video-wide">
        <img src={photo} alt="Two podcast hosts in a recording studio" />
        <span className="sw-video-play" aria-hidden="true">▶</span>
        <span className="sw-video-duration">39:30</span>
      </div>
      <div className="sw-source-details">
        <span className="sw-source-icon" aria-hidden="true">↗</span>
        <div><strong>One long conversation</strong><small>Paste a video link to begin</small></div>
        <span className="sw-status">Source video</span>
      </div>
    </div>
  )

  if (type === 'moments') return (
    <div className="sw-scene sw-moments">
      <div className="sw-moments-preview">
        <div className="sw-video sw-video-wide">
          <img src={photo} alt="The same podcast source with a moment selected" />
          <span className="sw-video-duration">12:14 / 39:30</span>
        </div>
        <div className="sw-timeline" aria-hidden="true"><span /><span /><b /><span /><span /></div>
        <div className="sw-selection-label"><i /> Selected passage <strong>00:42</strong></div>
      </div>
      <div className="sw-moment-list">
        <span className="sw-panel-eyebrow">MOMENTS TO REVIEW</span>
        <div className="sw-moment-item is-selected"><span>01</span><div><strong>A complete answer</strong><small>12:14 – 12:56</small></div><b>↗</b></div>
        <div className="sw-moment-item"><span>02</span><div><strong>A useful takeaway</strong><small>21:08 – 21:46</small></div></div>
        <div className="sw-moment-item"><span>03</span><div><strong>The key insight</strong><small>33:25 – 34:10</small></div></div>
      </div>
    </div>
  )

  if (type === 'frame') return (
    <div className="sw-scene sw-frame">
      <div className="sw-frame-source">
        <span className="sw-panel-eyebrow">ORIGINAL · 16:9</span>
        <div className="sw-video sw-video-wide">
          <img src={photo} alt="Wide podcast source showing both speakers" />
          <i className="sw-face-guide sw-face-guide-left" aria-hidden="true" />
          <i className="sw-face-guide sw-face-guide-right" aria-hidden="true" />
        </div>
        <small>Face-aware framing follows the conversation</small>
      </div>
      <span className="sw-frame-arrow" aria-hidden="true">→</span>
      <div className="sw-frame-output">
        <span className="sw-panel-eyebrow">REFRAMED · 9:16</span>
        <div className="sw-portrait"><img src={photo} alt="Portrait crop focused on the first podcast speaker" /><span>Speaker in frame</span></div>
      </div>
    </div>
  )

  return (
    <div className="sw-scene sw-finish">
      <div className="sw-final-portrait">
        <img src={photo} alt="Captioned portrait preview of the first podcast speaker" />
        <div className="sw-final-caption">A clear idea.<br /><mark>Ready</mark> to share.</div>
        <span className="sw-final-format">9:16 VERTICAL</span>
      </div>
      <div className="sw-final-details">
        <span className="sw-panel-eyebrow">FINAL REVIEW</span>
        <strong>Everything in its place.</strong>
        <div><span>✓</span> Speaker kept in frame</div>
        <div><span>✓</span> Captions positioned</div>
        <div><span>✓</span> Portrait preview ready</div>
        <small>Review the clip, then export when it looks right.</small>
      </div>
    </div>
  )
}

export default function ScrollWorkflow() {
  const [activeIndex, setActiveIndex] = useState(0)
  const stepRefs = useRef([])

  useEffect(() => {
    let frame
    const updateFromScroll = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const activationLine = window.innerHeight * 0.52
        let nextIndex = 0
        stepRefs.current.forEach((element, index) => {
          if (element && element.getBoundingClientRect().top <= activationLine) nextIndex = index
        })
        setActiveIndex(current => current === nextIndex ? current : nextIndex)
      })
    }

    updateFromScroll()
    window.addEventListener('scroll', updateFromScroll, { passive: true })
    window.addEventListener('resize', updateFromScroll)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', updateFromScroll)
      window.removeEventListener('resize', updateFromScroll)
    }
  }, [])

  return (
    <section id="moments" className="sw-workflow" aria-labelledby="sw-title">
      <div className="cloud-wrap sw-wrap">
        <div className="sw-heading">
          <p className="cloud-eyebrow">HOW SHORTCLIPR WORKS</p>
          <h2 id="sw-title">From one long video<br />to a Short worth sharing.</h2>
          <p>Follow the same source through each step. Scroll to see how a useful moment becomes a portrait clip you can review and refine.</p>
        </div>
        <div className="sw-story">
          <div className="sw-steps">
            {steps.map((step, index) => (
              <article
                ref={element => { stepRefs.current[index] = element }}
                className={`sw-step ${activeIndex === index ? 'is-active' : ''}`}
                key={step.id}
              >
                <div className="sw-step-copy">
                  <span className="sw-step-number">0{index + 1} <i /> {step.label}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <small>{step.detail}</small>
                </div>
                <div className="sw-mobile-visual"><WorkflowScene type={step.id} /></div>
              </article>
            ))}
          </div>
          <div className="sw-sticky" aria-label="Illustrated clip creation workflow">
            <div className="sw-studio-header"><span><i /> SHORTCLIPR STUDIO</span><b>0{activeIndex + 1} / 04</b></div>
            <div className="sw-scenes">
              {steps.map((step, index) => (
                <div className={`sw-scene-panel ${activeIndex === index ? 'is-active' : ''}`} aria-hidden={activeIndex !== index} key={step.id}>
                  <WorkflowScene type={step.id} />
                </div>
              ))}
            </div>
            <div className="sw-studio-progress" aria-hidden="true">{steps.map((step, index) => <span className={index <= activeIndex ? 'is-active' : ''} key={step.id} />)}</div>
          </div>
        </div>
        <p className="sw-credit">Illustrative workflow · Photo by <a href="https://www.pexels.com/photo/women-technology-young-smiling-7598543/" target="_blank" rel="noreferrer">cottonbro studio on Pexels</a></p>
      </div>
    </section>
  )
}
