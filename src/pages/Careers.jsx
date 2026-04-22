import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

export default function Careers() {
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">COMPANY › CAREERS.TXT</div>
          <h1 className="legal-title">Join <span>ShortClipr</span></h1>
          <div className="legal-meta">
            Help us build the fastest AI video editor on the internet.
          </div>

          <div className="legal-section">
            <h2>Open Positions</h2>
            <p>Currently, our team is operating at full capacity and we do not have any open roles.</p>
            <p>However, we are always on the lookout for exceptional talent in:</p>
            <ul>
              <li>Video Engineering (FFmpeg, OpenCV)</li>
              <li>AI/ML (NLP, Audio Processing, Vision)</li>
              <li>React / Node.js Full-Stack Engineering</li>
            </ul>
            <p>If you're passionate about creator tools and video infrastructure, send your resume or portfolio to <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a>.</p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
