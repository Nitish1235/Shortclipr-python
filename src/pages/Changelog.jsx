import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

export default function Changelog() {
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">PRODUCT › CHANGELOG.TXT</div>
          <h1 className="legal-title">System <span>Updates</span></h1>
          <div className="legal-meta">
            Latest releases and improvements to the ShortClipr engine.
          </div>

          <div className="legal-section">
            <h2>v2.0.4 - Current</h2>
            <p><strong>[UPDATED]</strong> New brand identity — bold red S lettermark logo across all surfaces.</p>
            <p><strong>[ADDED]</strong> Enhanced subtitles customization (position, size, colors).</p>
            <p><strong>[FIXED]</strong> YouTube bot-detection bypass using PO token integration.</p>
            
            <h2>v1.9.0</h2>
            <p><strong>[ADDED]</strong> Stripe webhook integration for seamless Dodo Payments processing.</p>
            <p><strong>[ADDED]</strong> Real-time WebSocket connection for transcription progress.</p>
            
            <h2>v1.0.0</h2>
            <p><strong>[RELEASE]</strong> Initial beta launch of ShortClipr.</p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
