import { useState } from 'react'
import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

const TOPICS = ['General Question','Billing / Payments','Technical Issue','DMCA / Copyright','Press / Partnerships','Other']

export default function Contact() {
  const [form, setForm]     = useState({ name:'', email:'', topic:'', message:'' })
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 1200))
    setSent(true)
    setLoading(false)
  }

  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">Contact Us</div>
          <h1 className="legal-title">Get in <span>Touch</span></h1>
          <div className="legal-meta">We respond to all messages within 24–48 hours (business days).</div>

          <div className="legal-section">
            <h2>Direct Lines</h2>
            <ul>
              <li>All Inquiries: <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a></li>
            </ul>
            <p style={{ fontSize:'0.82rem', color:'#999' }}>
              Note: We do not offer phone support at this time. All support is handled via email.
            </p>
          </div>

          <div className="legal-section">
            <h2>Send a Message</h2>
            {sent ? (
              <div className="legal-alert" style={{ marginTop:'20px' }}>
                ✅ Message received. We'll get back to you within 24–48 hours.
                <br/><span style={{ fontSize:'0.75rem', opacity:0.7 }}>Check your spam folder if you don't hear from us.</span>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <div>
                  <label>Name *</label>
                  <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Your name" required/>
                </div>
                <div>
                  <label>Email Address *</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required/>
                </div>
                <div>
                  <label>Topic *</label>
                  <select name="topic" value={form.topic} onChange={handleChange} required>
                    <option value="">— Select a topic —</option>
                    {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label>Message *</label>
                  <textarea name="message" value={form.message} onChange={handleChange} placeholder="Describe your question or issue in detail…" required/>
                </div>
                <button type="submit" className="contact-submit" disabled={loading}>
                  {loading ? 'Sending…' : 'Send Message →'}
                </button>
              </form>
            )}
          </div>

          <div className="legal-section">
            <h2>Response Times</h2>
            <ul>
              <li>General / Billing — within 24 hours (Mon–Fri)</li>
              <li>Technical Issues — within 24 hours</li>
              <li>DMCA / Legal — within 2 business days</li>
              <li>Press / Partnerships — within 3 business days</li>
            </ul>
            <p style={{ fontSize:'0.82rem', color:'#999' }}>
              We do not offer refunds. For billing disputes, see our <a href="/terms">Terms of Service §6</a>.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
