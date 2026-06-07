import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'
import Logo from '../components/Logo'

const dlBtn = {
  fontSize:'0.85rem', fontWeight:600, padding:'9px 18px',
  border:'1.5px solid #e5e5e5', color:'#333', textDecoration:'none',
  borderRadius:'8px', background:'#fff', display:'inline-block',
  transition:'border-color 0.15s, color 0.15s',
}

export default function PressKit() {
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">Company · Press Kit</div>
          <h1 className="legal-title">Press <span>Kit</span></h1>
          <div className="legal-meta">Assets, branding guidelines, and company information for media.</div>

          <div className="legal-section">
            <h2>Brand Assets</h2>
            <p>Download our official logos and brand assets below.</p>

            {/* Logo previews */}
            <div style={{ display:'flex', gap:'16px', margin:'20px 0', flexWrap:'wrap' }}>
              <div style={{ background:'#fff', padding:'28px 32px', border:'1px solid #e5e5e5', borderRadius:'12px', textAlign:'center' }}>
                <Logo size={80}/>
                <div style={{ marginTop:'12px', fontSize:'0.72rem', fontWeight:600, color:'#999', textTransform:'uppercase', letterSpacing:'0.1em' }}>On Light</div>
              </div>
              <div style={{ background:'#111', padding:'28px 32px', border:'1px solid #333', borderRadius:'12px', textAlign:'center' }}>
                <Logo size={80}/>
                <div style={{ marginTop:'12px', fontSize:'0.72rem', fontWeight:600, color:'#666', textTransform:'uppercase', letterSpacing:'0.1em' }}>On Dark</div>
              </div>
            </div>

            {/* Downloads */}
            <div style={{ display:'flex', gap:'10px', margin:'16px 0', flexWrap:'wrap' }}>
              <a href="/logo.svg" download="shortclipr-logo.svg" style={dlBtn}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#cf1322'; e.currentTarget.style.color='#cf1322' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#e5e5e5'; e.currentTarget.style.color='#333' }}
              >↓ SVG Logo</a>
              <a href="/icon-512.png" download="shortclipr-icon-512.png" style={dlBtn}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#cf1322'; e.currentTarget.style.color='#cf1322' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#e5e5e5'; e.currentTarget.style.color='#333' }}
              >↓ PNG 512×512</a>
              <a href="/og-image.png" download="shortclipr-og-banner.png" style={dlBtn}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#cf1322'; e.currentTarget.style.color='#cf1322' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#e5e5e5'; e.currentTarget.style.color='#333' }}
              >↓ Social Banner 1200×630</a>
            </div>

            {/* Colors */}
            <div style={{ display:'flex', gap:'10px', margin:'20px 0', flexWrap:'wrap' }}>
              {[
                { color:'#cf1322', name:'Primary Red',  hex:'#cf1322' },
                { color:'#0f0f0f', name:'Dark',         hex:'#0f0f0f' },
                { color:'#ffffff', name:'White',        hex:'#ffffff', border:true },
                { color:'#f9f9f9', name:'Background',   hex:'#f9f9f9', border:true },
              ].map(c => (
                <div key={c.hex} style={{
                  background:c.color, border: c.border ? '1px solid #e5e5e5' : 'none',
                  borderRadius:'10px', padding:'16px 20px', textAlign:'center', minWidth:'100px',
                }}>
                  <div style={{ fontSize:'0.78rem', fontWeight:700, color: c.border ? '#111' : '#fff', fontFamily:'monospace' }}>{c.hex}</div>
                  <div style={{ fontSize:'0.65rem', color: c.border ? '#999' : 'rgba(255,255,255,0.7)', marginTop:'3px' }}>{c.name}</div>
                </div>
              ))}
            </div>

            <p>Please do not alter the logo colors or aspect ratio. Always ensure adequate contrast.</p>
          </div>

          <div className="legal-section">
            <h2>Company Boilerplate</h2>
            <p>ShortClipr is an AI-powered video editing platform that transforms long-form content into viral, vertical short-form videos automatically. Built for creators who don't have time to edit, ShortClipr extracts the highest-engagement moments from YouTube videos and renders them instantly — no editing required.</p>
          </div>

          <div className="legal-section">
            <h2>Media Contact</h2>
            <p>For press inquiries, please contact <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a>.</p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
