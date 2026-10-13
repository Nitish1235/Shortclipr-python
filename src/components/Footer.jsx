import { useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from './Logo'

const GROUPS = [
  {
    title: 'Product',
    links: [
      ['Features', '/youtube-shorts#how-it-works'],
      ['Showcase', '/youtube-shorts#video-showcase'],
      ['Pricing', '/youtube-shorts#pricing'],
      ['Changelog', '/changelog'],
    ],
  },
  {
    title: 'Create',
    links: [
      ['YouTube to Shorts', '/youtube-shorts/tools/youtube-to-shorts-converter'],
      ['Long Video to Shorts', '/youtube-shorts/tools/long-video-to-shorts-ai'],
      ['AI Clip Maker', '/youtube-shorts/tools/ai-clip-maker'],
      ['TikTok Clip Maker', '/youtube-shorts/tools/tiktok-clip-maker'],
      ['Video to Reels', '/youtube-shorts/tools/video-to-reels'],
      ['Podcast to Shorts', '/youtube-shorts/tools/podcast-to-shorts'],
      ['Webinar to Clips', '/youtube-shorts/tools/webinar-to-clips'],
      ['Interview to Clips', '/youtube-shorts/tools/interview-to-clips'],
      ['All tools', '/youtube-shorts/tools'],
    ],
  },
  {
    title: 'Learn',
    links: [
      ['Long Videos to Shorts', '/youtube-shorts/guides/how-to-turn-long-videos-into-shorts'],
      ['Choose Podcast Clips', '/youtube-shorts/guides/how-to-choose-podcast-clips'],
      ['Crop Wide Video for Shorts', '/youtube-shorts/guides/crop-horizontal-video-for-shorts'],
      ['Repurpose a Podcast', '/youtube-shorts/guides/how-to-repurpose-a-podcast-into-clips'],
      ['All guides', '/youtube-shorts/guides'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About', '/about'],
      ['Contact', '/contact'],
      ['Press kit', '/press'],
      ['Careers', '/careers'],
    ],
  },
]

export default function Footer() {
  const [openGroup, setOpenGroup] = useState('Product')
  const year = new Date().getFullYear()

  return (
    <footer className="footer-v2">
      <div className="footer-v2-inner">
        <div className="footer-v2-main">
          <div className="footer-v2-brand">
            <Link to="/youtube-shorts"><Logo size={32} /><span>ShortClipr</span></Link>
            <p>Turn long videos into focused, ready-to-publish short clips.</p>
          </div>

          <div className="footer-v2-groups">
            {GROUPS.map((group) => {
              const isOpen = openGroup === group.title
              return (
                <section className={isOpen ? 'footer-v2-group open' : 'footer-v2-group'} key={group.title}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpenGroup(isOpen ? '' : group.title)}>
                    <span>{group.title}</span><i aria-hidden="true">+</i>
                  </button>
                  <div className="footer-v2-links">
                    {group.links.map(([label, href]) => <Link key={href} to={href}>{label}</Link>)}
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        <div className="footer-v2-bottom">
          <span>© {year} ShortClipr</span>
          <div>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/dmca">DMCA</Link>
          </div>
          <span>v2.0.4</span>
        </div>
      </div>

      <style>{`
        .footer-v2 { padding:48px 5% 24px; background:#fff; border-top:1px solid #e5e5e5; }
        .footer-v2-inner { max-width:1100px; margin:0 auto; }
        .footer-v2-main { display:grid; grid-template-columns:minmax(220px,1.1fr) minmax(0,2.4fr); gap:56px; }
        .footer-v2-brand > a { display:inline-flex; align-items:center; gap:10px; color:#cf1322; font-weight:800; text-decoration:none; }
        .footer-v2-brand p { max-width:235px; margin:14px 0 0; color:#888; font-size:.82rem; line-height:1.65; }
        .footer-v2-groups { display:grid; grid-template-columns:.75fr 1.2fr 1.8fr .75fr; gap:30px; }
        .footer-v2-group button { width:100%; padding:0; color:#111; background:none; border:0; font:inherit; text-align:left; cursor:default; }
        .footer-v2-group button span { font-size:.72rem; font-weight:800; letter-spacing:.09em; text-transform:uppercase; }
        .footer-v2-group button i { display:none; font-style:normal; }
        .footer-v2-links { display:grid; margin-top:15px; gap:8px; }
        .footer-v2-links a { color:#666; font-size:.78rem; line-height:1.35; text-decoration:none; }
        .footer-v2-links a:hover { color:#cf1322; }
        .footer-v2-bottom { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; margin-top:38px; padding-top:20px; color:#aaa; border-top:1px solid #e5e5e5; font-size:.74rem; }
        .footer-v2-bottom > div { display:flex; gap:18px; }
        .footer-v2-bottom a { color:#888; text-decoration:none; }
        .footer-v2-bottom > span:last-child { text-align:right; color:#ccc; }
        @media(max-width:800px){
          .footer-v2 { padding:36px 5% 22px; }
          .footer-v2-main { grid-template-columns:1fr; gap:28px; }
          .footer-v2-brand p { max-width:300px; }
          .footer-v2-groups { display:block; border-top:1px solid #e5e5e5; }
          .footer-v2-group { border-bottom:1px solid #e5e5e5; }
          .footer-v2-group button { display:flex; align-items:center; justify-content:space-between; padding:13px 2px; cursor:pointer; }
          .footer-v2-group button i { display:block; color:#cf1322; font-size:1.1rem; transition:transform .2s; }
          .footer-v2-group.open button i { transform:rotate(45deg); }
          .footer-v2-links { display:none; margin:0; padding:0 2px 14px; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; }
          .footer-v2-group.open .footer-v2-links { display:grid; }
          .footer-v2-bottom { grid-template-columns:1fr auto; margin-top:24px; }
          .footer-v2-bottom > span:last-child { display:none; }
        }
        @media(max-width:430px){
          .footer-v2-links { grid-template-columns:1fr; }
          .footer-v2-bottom { grid-template-columns:1fr; gap:12px; }
        }
      `}</style>
    </footer>
  )
}
