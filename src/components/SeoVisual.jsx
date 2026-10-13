import './seo-visual.css'

export default function SeoVisual({ kind }) {
  if (kind === 'workflow') return (
    <figure className="seo-visual" aria-labelledby="seo-workflow-caption">
      <div className="seo-visual-workflow">
        <div><img src="/assets/workflow-source-conversation.png" alt="Illustrative wide video source showing a speaker" loading="lazy" width="400" height="230" /><b>1. Source video</b></div>
        <span aria-hidden="true">→</span>
        <div><img src="/assets/workflow-moment-found.png" alt="Illustrative selected moment from the same conversation" loading="lazy" width="400" height="230" /><b>2. Candidate moment</b></div>
        <span aria-hidden="true">→</span>
        <div className="seo-visual-portrait"><img src="/assets/workflow-moment-found.png" alt="Illustrative portrait crop to review before sharing" loading="lazy" width="180" height="230" /><b>3. Portrait preview</b></div>
      </div>
      <figcaption id="seo-workflow-caption">Illustration of the review sequence. Check the actual crop, captions, and meaning of each generated clip.</figcaption>
    </figure>
  )

  if (kind === 'podcast') return (
    <figure className="seo-visual" aria-labelledby="seo-podcast-caption">
      <div className="seo-visual-podcast">
        <div><span>?</span><b>Question</b><p>What changed?</p></div>
        <div><span>“</span><b>Answer</b><p>The guest explains one decision.</p></div>
        <div><span>✓</span><b>Payoff</b><p>What happened next?</p></div>
      </div>
      <figcaption id="seo-podcast-caption">Illustrative clip structure: keep the question and conclusion when they are needed to understand an answer.</figcaption>
    </figure>
  )

  if (kind === 'framing') return (
    <figure className="seo-visual" aria-labelledby="seo-framing-caption">
      <div className="seo-visual-framing">
        <div><span className="seo-visual-wide"><i className="seo-visual-person" /><i className="seo-visual-person" /></span><b>Wide interview source</b></div>
        <span aria-hidden="true">→</span>
        <div><span className="seo-visual-tall"><i className="seo-visual-person" /><i className="seo-visual-person" /></span><b>Two-speaker portrait layout</b></div>
        <span aria-hidden="true">→</span>
        <div><span className="seo-visual-tall seo-visual-screen"><i /><i /></span><b>Screen-focused tutorial</b></div>
      </div>
      <figcaption id="seo-framing-caption">Simple framing diagrams, not product screenshots. Choose a layout that retains the subject or instruction.</figcaption>
    </figure>
  )

  return null
}
