export default function SeoHeroMedia({ label = 'Clip workflow' }) {
  return (
    <figure className="seo-hero-media" aria-label="Illustration of a wide source video becoming a vertical clip">
      <div className="seo-hero-media-top"><span><i /> SHORTCLIPR STUDIO</span><span>WORKFLOW</span></div>
      <div className="seo-hero-media-canvas">
        <div className="seo-hero-source">
          <img src="/assets/workflow-source-conversation.png" width="560" height="315" alt="Wide source video illustration" loading="eager" />
          <span>SOURCE VIDEO</span>
          <div className="seo-hero-selection" aria-hidden="true" />
        </div>
        <span className="seo-hero-arrow" aria-hidden="true">→</span>
        <div className="seo-hero-output">
          <img src="/assets/workflow-moment-found.png" width="225" height="400" alt="Vertical crop of a selected moment" loading="eager" />
          <span>PORTRAIT PREVIEW</span>
          <strong>One clear<br /><mark>moment.</mark></strong>
        </div>
      </div>
      <figcaption><span>01 Find a moment</span><span>02 Check the frame</span><span>03 Review captions</span></figcaption>
      <p>{label} · illustrative example</p>
    </figure>
  )
}
