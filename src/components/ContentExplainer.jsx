import { Link } from 'react-router-dom'
import './content-explainer.css'

const uses = [
  {
    image: '/assets/workflow-source-conversation.png',
    alt: 'Illustration of a wide conversation video before clipping',
    title: 'Video podcasts',
    description: 'Choose a complete answer or story, then check that the portrait frame follows the conversation.',
    href: '/youtube-shorts/tools/podcast-to-shorts',
    label: 'Explore podcast clips',
  },
  {
    image: '/assets/workflow-moment-found.png',
    alt: 'Illustration of a selected moment from a long video',
    title: 'Interviews',
    description: 'Keep the question when it gives the answer meaning. Check the final cut against the full exchange.',
    href: '/youtube-shorts/guides/how-to-choose-podcast-clips',
    label: 'Learn to choose moments',
  },
  {
    image: '/assets/studio-poster-wide.png',
    alt: 'Illustrative wide video frame to consider for a vertical clip',
    title: 'Tutorials',
    description: 'Find a single useful step and make sure the screen detail remains readable in a vertical frame.',
    href: '/youtube-shorts/guides/crop-horizontal-video-for-shorts',
    label: 'Learn vertical framing',
  },
]

export default function ContentExplainer() {
  return (
    <section className="content-explainer cloud-wrap cloud-section" aria-labelledby="content-explainer-title">
      <div className="content-explainer-heading">
        <p className="cloud-eyebrow">START WITH A VIDEO YOU ALREADY MADE</p>
        <h2 id="content-explainer-title">One clear moment is better than an arbitrary cut.</h2>
        <p>ShortClipr suggests moments, reframes them for a portrait preview, and adds captions. You decide whether the clip stands alone and represents the original fairly.</p>
      </div>
      <div className="content-explainer-grid">
        {uses.map(use => <article key={use.title}>
          <img src={use.image} alt={use.alt} loading="lazy" width="360" height="202" />
          <h3>{use.title}</h3>
          <p>{use.description}</p>
          <Link to={use.href}>{use.label} →</Link>
        </article>)}
      </div>
      <p className="content-explainer-note">Watch the workflow, review real showcase clips, and explore the clip and caption controls before choosing a plan to generate your own clips.</p>
    </section>
  )
}
