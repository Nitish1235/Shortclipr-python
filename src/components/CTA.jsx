import { useNavigate, useLocation } from 'react-router-dom'

export default function CTA() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleExploreWorkflow = (e) => {
    e.preventDefault()
    if (location.pathname === '/youtube-shorts') {
      const el = document.getElementById('hero')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        const input = el.querySelector('input[type="url"]')
        if (input) input.focus()
      }
    } else {
      navigate('/youtube-shorts', { state: { scrollToSection: 'hero' } })
    }
  }

  return (
    <section id="cta" className="cloud-cta" style={{
      background: '#cf1322',
      padding: 'clamp(80px, 10vw, 120px) 5%',
      textAlign: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative background text */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%) rotate(-10deg)',
        fontSize: 'clamp(5rem, 15vw, 14rem)',
        fontWeight: 800, letterSpacing: '-0.05em',
        color: 'rgba(255,255,255,0.05)',
        whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
      }}>SHORTCLIPR</div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '680px', margin: '0 auto' }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          background: 'rgba(255,255,255,0.15)', borderRadius: '100px',
          padding: '6px 16px', marginBottom: '24px',
          fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.95)',
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>
          <span style={{ width:'7px', height:'7px', background:'#fff', borderRadius:'50%', display:'inline-block' }}/>
          See the workflow before you create
        </div>

        {/* Big headline */}
        <h2 style={{
          fontSize: 'clamp(2.2rem, 6vw, 4.5rem)',
          fontWeight: 800, color: '#fff',
          letterSpacing: '-0.05em', lineHeight: 0.95,
          marginBottom: '20px',
        }}>
          Your next viral clip<br/>is already in your feed.
        </h2>

        <p style={{
          color: 'rgba(255,255,255,0.78)', fontSize: 'clamp(0.95rem, 1.5vw, 1.1rem)',
          maxWidth: '520px', margin: '0 auto 40px', lineHeight: 1.7,
        }}>
          Watch how a long YouTube video becomes a captioned vertical short, then explore the project and caption controls before choosing a plan to generate.
        </p>

        {/* Inline URL input */}
        <form onSubmit={handleExploreWorkflow} style={{
          display: 'flex', maxWidth: '580px', margin: '0 auto 16px',
          borderRadius: '12px', overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}>
          <input
            type="url"
            placeholder="See how a YouTube video becomes a Short..."
            style={{
              flex: 1, padding: '16px 18px',
              border: 'none', outline: 'none',
              fontSize: '0.95rem', background: 'rgba(255,255,255,0.95)',
              color: '#111', minWidth: 0,
            }}
            onClick={handleExploreWorkflow}
            readOnly
          />
          <button type="submit" style={{
            background: '#0f0f0f', color: '#fff',
            border: 'none', padding: '16px 24px',
            fontWeight: 800, fontSize: '0.9rem',
            cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#333'}
            onMouseLeave={e => e.currentTarget.style.background = '#0f0f0f'}
          >See how it works →</button>
        </form>

        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '32px' }}>
          Explore examples · Configure a project · Choose a plan to generate
        </p>

      </div>
    </section>
  )
}
