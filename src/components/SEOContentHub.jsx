import { Link } from 'react-router-dom'

const tools = [
  {
    title: 'YouTube to Shorts Converter',
    description: 'Turn a long YouTube video into short, captioned clips ready to review.',
    href: '/youtube-shorts/tools/youtube-to-shorts-converter',
  },
  {
    title: 'Podcast to Shorts',
    description: 'Find the strongest moments in interviews and podcast episodes.',
    href: '/youtube-shorts/tools/podcast-to-shorts',
  },
  {
    title: 'Video to Reels',
    description: 'Reframe long-form video into vertical clips for Instagram Reels.',
    href: '/youtube-shorts/tools/video-to-reels',
  },
  {
    title: 'TikTok Clip Maker',
    description: 'Create clear, vertical TikTok clips from videos you already made.',
    href: '/youtube-shorts/tools/tiktok-clip-maker',
  },
]

const guides = [
  ['Gameplay Shorts maker: 40/60 split guide', '/youtube-shorts/guides/gameplay-shorts-maker-guide'],
  ['How to use title cards in Shorts', '/youtube-shorts/guides/title-card-shorts-guide'],
  ['How to make caption-only Shorts', '/youtube-shorts/guides/caption-only-shorts-guide'],
  ['How to turn long videos into Shorts', '/youtube-shorts/guides/how-to-turn-long-videos-into-shorts'],
  ['How to choose podcast clips', '/youtube-shorts/guides/how-to-choose-podcast-clips'],
  ['How to crop horizontal video for Shorts', '/youtube-shorts/guides/crop-horizontal-video-for-shorts'],
]

export default function SEOContentHub() {
  return (
    <section className="seo-content-hub" aria-labelledby="seo-content-hub-title">
      <div className="cloud-wrap cloud-section">
        <div className="seo-content-hub-heading">
          <p className="cloud-eyebrow">EXPLORE SHORTCLIPR</p>
          <h2 id="seo-content-hub-title">Tools and guides for every<br />long-form video workflow.</h2>
          <p>
            Start with the format you are making, then use ShortClipr to find moments,
            create vertical clips, and publish more from every recording.
          </p>
        </div>

        <div className="seo-content-hub-tools">
          {tools.map(tool => (
            <Link key={tool.href} to={tool.href} className="seo-content-hub-card">
              <span>AI video tool</span>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              <b>Explore tool <i aria-hidden="true">→</i></b>
            </Link>
          ))}
        </div>

        <div className="seo-content-hub-guides">
          <div>
            <p className="cloud-eyebrow">LEARN THE WORKFLOW</p>
            <h3>Make more from every video.</h3>
          </div>
          <nav aria-label="ShortClipr guides">
            {guides.map(([label, href]) => <Link key={href} to={href}>{label} <span aria-hidden="true">↗</span></Link>)}
          </nav>
        </div>
      </div>
    </section>
  )
}
