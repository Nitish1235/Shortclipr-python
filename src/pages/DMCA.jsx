import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

export default function DMCA() {
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">LEGAL › DMCA.TXT</div>
          <h1 className="legal-title">DMCA <span>Policy</span></h1>
          <div className="legal-meta">
            Digital Millennium Copyright Act Notice and Takedown Procedure.
          </div>

          <div className="legal-section">
            <h2>Reporting Copyright Infringement</h2>
            <p>
              ShortClipr respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998, we will respond expeditiously to claims of copyright infringement committed using the ShortClipr service.
            </p>
            <p>If you are a copyright owner, or are authorized to act on behalf of one, please report alleged copyright infringements by sending a notice to our designated Copyright Agent containing the following information:</p>
            <ul>
              <li>A physical or electronic signature of a person authorized to act on behalf of the owner of the copyright interest.</li>
              <li>Identification of the copyrighted work claimed to have been infringed.</li>
              <li>Identification of the material that is claimed to be infringing and information reasonably sufficient to permit us to locate the material (e.g., specific URLs).</li>
              <li>Your address, telephone number, and email address.</li>
              <li>A statement that you have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.</li>
              <li>A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the copyright owner.</li>
            </ul>
            <h2>Designated Agent</h2>
            <p>Please send your DMCA notice to:<br />
            <strong>Email:</strong> <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a></p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
