import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

const STATS = [
  { num: '47K+', label: 'Creators' },
  { num: '2M+', label: 'Clips Generated' },
  { num: '< 60s', label: 'Avg Process Time' },
  { num: '99.1%', label: 'Uptime' },
]

const VALUES = [
  {
    icon: '⚡',
    title: 'SPEED_FIRST',
    desc: `We built our entire pipeline around one principle: if it takes more than 60 seconds, it's not fast enough. Our InnerTube API + parallel FFmpeg approach is 5x faster than any competitor.`,
  },
  {
    icon: '💸',
    title: 'FAIR_PRICING',
    desc: `No credit confusion. No per-minute billing. You pay per video, not per minute of source video. A 2-hour documentary costs the same as a 10-minute tutorial. That's how it should work.`,
  },
  {
    icon: '🎯',
    title: 'USER_CONTROL',
    desc: `Your AI, your rules. Tell the AI exactly what to look for with topic/keyword search. No more blind-box clip selection — you define the strategy.`,
  },
  {
    icon: '🔒',
    title: 'NO_WATERMARKS',
    desc: `Even on the free plan. We don't hold your clips hostage. Try the full product, then decide if you need more. We believe you'll stay.`,
  },
]

export default function About() {
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">🏢 COMPANY › ABOUT.TXT</div>
          <h1 className="legal-title">About <span>ShortClipr</span></h1>
          <div className="legal-meta">
            Built for creators who don&apos;t have time to edit.
          </div>

          {/* Mission */}
          <div className="legal-section">
            <h2>Our Mission</h2>
            <p>
              Long-form video is the most valuable content format on the internet. Podcasts,
              interviews, tutorials, documentaries — they contain hundreds of viral moments that
              most creators never surface because manual editing is prohibitively time-consuming.
            </p>
            <p>
              ShortClipr was built to fix this. Paste a YouTube URL. Get 10 viral-ready short
              clips in under 60 seconds. No editing skills required. No complicated software.
              No credit card for the first 3 videos.
            </p>
          </div>

          {/* Stats */}
          <div className="about-stats">
            {STATS.map(s => (
              <div key={s.label} className="stat-box">
                <span className="stat-num">{s.num}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Why we built this */}
          <div className="legal-section">
            <h2>Why We Built This</h2>
            <p>
              We studied every major competitor — OpusClip, Klap, WayinAI, Vidyo — and found
              the same problems everywhere:
            </p>
            <ul>
              <li>Credit systems no one understands (1 credit = 1 minute of source video? Really?)</li>
              <li>2–5 minute processing windows long enough for users to give up and close the tab</li>
              <li>AI that misses comedy, sarcasm, and nuance — picks the wrong moments</li>
              <li>Watermarks on free plans that make it impossible to actually test the product</li>
            </ul>
            <p>
              We built ShortClipr as the answer to every one of these problems. The architecture
              is fundamentally different — we never download the full video, so we&apos;re 5x faster.
              The pricing is different — per video, not per minute. The free plan is different —
              no watermarks, real clips, real value.
            </p>
          </div>

          {/* Values */}
          <div className="legal-section">
            <h2>Our Values</h2>
            <div style={{ display: 'grid', gap: '20px', marginTop: '16px' }}>
              {VALUES.map(v => (
                <div key={v.title} style={{
                  background: 'rgba(132,204,22,0.04)',
                  border: '1px solid rgba(132,204,22,0.15)',
                  padding: '20px 22px',
                  display: 'flex', gap: '16px', alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{v.icon}</span>
                  <div>
                    <div style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: '0.78rem',
                      color: 'var(--lime)',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}>{v.title}</div>
                    <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.8 }}>
                      {v.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>


          {/* CTA */}
          <div className="legal-section">
            <h2>Work With Us</h2>
            <p>
              Interested in partnerships, press coverage, or enterprise plans?<br />
              Reach us at <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a> or{' '}
              <a href="/contact">send us a message</a>.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
