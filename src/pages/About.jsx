import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import SEO from '../components/SEO'

const VALUES = [
  { icon:'✂', title:'Useful suggestions', desc:'We help surface moments from long YouTube videos so creators can focus their review on possible clips.' },
  { icon:'▯', title:'Vertical presentation', desc:'Portrait framing and captions make a starting point for a Short. The final result still deserves a careful watch.' },
  { icon:'✓', title:'Editorial control', desc:'Creators decide whether a clip is clear, accurate, and worth sharing.' },
  { icon:'◉', title:'A clear path to creation', desc:'Explore the workflow, real showcase clips, and editing controls before choosing a paid plan to generate from your own video.' },
]

export default function About() {
  return (
    <>
      <SEO title="About ShortClipr | Video Clipping for Creators" description="Learn how ShortClipr helps creators find and review short clips from YouTube videos, video podcasts, interviews, and tutorials." path="/about" />
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">Company · About</div>
          <h1 className="legal-title">About <span>ShortClipr</span></h1>
          <div className="legal-meta">Built for creators who don't have time to edit.</div>

          <div className="legal-section">
            <h2>Our Mission</h2>
            <p>Creators often record more useful ideas than they can share from a single YouTube video. ShortClipr helps turn a video podcast, interview, or tutorial into short clip candidates with portrait framing and captions.</p>
            <p>Our aim is to make review easier. A suggested clip still needs a person to check context, the opening and ending, the crop, and caption accuracy before publishing.</p>
          </div>

          <div className="legal-section">
            <h2>Why We Built This</h2>
            <p>Short-form editing asks creators to make several decisions for every clip:</p>
            <ul>
              <li>Which moment makes sense without the rest of the video?</li>
              <li>What must remain in the frame when wide footage becomes vertical?</li>
              <li>Are the captions and the final cut faithful to the source?</li>
            </ul>
            <p>ShortClipr provides a starting point for those choices, while the creator makes the final call.</p>
          </div>

          <div className="legal-section">
            <h2>Our Values</h2>
            <div style={{ display:'grid', gap:'14px', marginTop:'16px' }}>
              {VALUES.map(v => (
                <div key={v.title} style={{
                  background:'#fef2f2', border:'1px solid #fecaca',
                  borderRadius:'10px', padding:'18px 20px',
                  display:'flex', gap:'14px', alignItems:'flex-start',
                }}>
                  <span style={{ fontSize:'1.4rem', flexShrink:0 }}>{v.icon}</span>
                  <div>
                    <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#cf1322', marginBottom:'6px' }}>{v.title}</div>
                    <p style={{ margin:0, fontSize:'0.875rem', color:'#555', lineHeight:1.75 }}>{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="legal-section">
            <h2>Work With Us</h2>
            <p>Interested in partnerships, press coverage, or enterprise plans?<br/>
            Reach us at <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a> or{' '}
            <a href="/contact">send us a message</a>.</p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
