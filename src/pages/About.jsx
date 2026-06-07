import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

const STATS = [
  { num: '47K+',  label: 'Creators'          },
  { num: '2M+',   label: 'Clips Generated'   },
  { num: '< 60s', label: 'Avg Process Time'  },
  { num: '99.1%', label: 'Uptime'            },
]

const VALUES = [
  { icon:'⚡', title:'Speed First',    desc:`We built our entire pipeline around one principle: if it takes more than 60 seconds, it's not fast enough. Our InnerTube API + parallel FFmpeg approach is 5x faster than any competitor.` },
  { icon:'💸', title:'Fair Pricing',   desc:`No credit confusion. You pay per video, not per minute of source video. A 2-hour documentary costs the same as a 10-minute tutorial.` },
  { icon:'🎯', title:'User Control',   desc:`Your AI, your rules. Tell the AI exactly what to look for with topic/keyword search. No more blind-box clip selection — you define the strategy.` },
  { icon:'🔒', title:'No Watermarks', desc:`Even on the free plan. We don't hold your clips hostage. Try the full product, then decide if you need more.` },
]

export default function About() {
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">Company · About</div>
          <h1 className="legal-title">About <span>ShortClipr</span></h1>
          <div className="legal-meta">Built for creators who don't have time to edit.</div>

          <div className="legal-section">
            <h2>Our Mission</h2>
            <p>Long-form video is the most valuable content format on the internet. Podcasts, interviews, tutorials, documentaries — they contain hundreds of viral moments most creators never surface because manual editing is prohibitively time-consuming.</p>
            <p>ShortClipr was built to fix this. Paste a YouTube URL. Get 10 viral-ready short clips in under 60 seconds. No editing skills required. No complicated software. No credit card for the first 3 videos.</p>
          </div>

          <div className="about-stats">
            {STATS.map(s => (
              <div key={s.label} className="stat-box">
                <span className="stat-num">{s.num}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="legal-section">
            <h2>Why We Built This</h2>
            <p>We studied every major competitor — OpusClip, Klap, WayinAI, Vidyo — and found the same problems everywhere:</p>
            <ul>
              <li>Credit systems no one understands (1 credit = 1 minute of source video? Really?)</li>
              <li>2–5 minute processing windows long enough for users to give up and close the tab</li>
              <li>AI that misses comedy, sarcasm, and nuance — picks the wrong moments</li>
              <li>Watermarks on free plans that make it impossible to actually test the product</li>
            </ul>
            <p>We built ShortClipr as the answer to every one of these problems. Never downloads the full video → 5x faster. Per video pricing. No watermarks on free plan.</p>
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
