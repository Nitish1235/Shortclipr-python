import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import Logo from '../components/Logo'

export default function PressKit() {
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">COMPANY › PRESS.TXT</div>
          <h1 className="legal-title">Press <span>Kit</span></h1>
          <div className="legal-meta">
            Assets, branding guidelines, and company information for media.
          </div>

          <div className="legal-section">
            <h2>Brand Assets</h2>
            <p>Download our official logos and brand assets below.</p>
            
            <div style={{ display: 'flex', gap: '20px', margin: '20px 0' }}>
              <div style={{ background: '#0a0a0a', padding: '30px', border: '1px solid var(--lime)', borderRadius: '8px', textAlign: 'center' }}>
                <Logo size={60} />
                <div style={{ marginTop: '15px', fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.8rem' }}>PRIMARY LOGO</div>
              </div>
            </div>
            <p>Please do not alter the logo colors or aspect ratio. Always ensure adequate contrast when placing on backgrounds.</p>

            <h2>Company Boilerplate</h2>
            <p>
              ShortClipr is an AI-powered video editing platform designed to transform long-form content into viral, vertical short-form videos automatically. Built for creators who don't have time to edit, ShortClipr extracts the highest-engagement moments from YouTube videos and renders them instantly—no editing required.
            </p>

            <h2>Media Contact</h2>
            <p>For press inquiries, please contact <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a>.</p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
