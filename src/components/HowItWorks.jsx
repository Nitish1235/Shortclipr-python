import { useNavigate, useLocation } from 'react-router-dom'

const steps = [
  {
    num: '01',
    title: 'Paste URL',
    sub: 'Any YouTube video · Any length',
    time: '5 sec',
    color: '#cf1322',
    bg: '#fef2f2',
    border: '#fecaca',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" fill="#cf1322"/>
        <polygon points="9.75 15.02 15.5 12 9.75 8.98" fill="#fff"/>
      </svg>
    ),
    chips: ['YouTube', 'Up to 6h', 'Any topic'],
  },
  {
    num: '02',
    title: 'AI Analyzes',
    sub: 'Transcribe · Score · Reframe · Caption',
    time: '2–4 min',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    ),
    chips: ['Transcription', 'Hook Detection', 'Auto Reframe'],
  },
  {
    num: '03',
    title: 'Get Clips',
    sub: '5–15 scored vertical clips ready',
    time: '30 sec',
    color: '#059669',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/>
        <line x1="12" y1="18" x2="12" y2="18.01"/>
      </svg>
    ),
    chips: ['TikTok', 'Reels', 'YT Shorts', 'LinkedIn'],
  },
]

export default function HowItWorks() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleStartFree = (e) => {
    e.preventDefault()
    if (location.pathname === '/') {
      const el = document.getElementById('hero')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        const input = el.querySelector('input[type="url"]')
        if (input) input.focus()
      }
    } else {
      navigate('/', { state: { scrollToSection: 'hero' } })
    }
  }

  return (
    <section id="how-it-works" style={{ padding: '96px 0', background: '#f9f9f9' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>How it works</span>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em', marginBottom: '10px' }}>
            URL to viral clip in <span style={{ color: '#cf1322' }}>3 steps.</span>
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#888', maxWidth: '400px', margin: '0 auto' }}>
            No software. No editing. Just paste and go.
          </p>
        </div>

        {/* Flow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', position: 'relative' }}>
          {steps.map((step, i) => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>

              {/* Step Card */}
              <div style={{
                flex: 1,
                background: '#fff',
                border: `1.5px solid ${step.border}`,
                borderRadius: '20px',
                padding: '28px 24px',
                display: 'flex', flexDirection: 'column', gap: '14px',
                boxShadow: `0 4px 24px ${step.color}10`,
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* Top accent bar */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: '3px', background: `linear-gradient(90deg, ${step.color}, ${step.color}66)`,
                }}/>

                {/* Number + Icon row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '40px', height: '40px',
                    background: step.bg,
                    border: `1.5px solid ${step.border}`,
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.78rem', fontWeight: 800, color: step.color,
                    letterSpacing: '-0.02em',
                  }}>{step.num}</div>
                  <div style={{
                    width: '44px', height: '44px',
                    background: step.bg,
                    borderRadius: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{step.icon}</div>
                </div>

                {/* Title */}
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f0f0f', marginBottom: '4px', letterSpacing: '-0.02em' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#888', lineHeight: 1.5 }}>{step.sub}</p>
                </div>

                {/* Time badge */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: step.bg, border: `1px solid ${step.border}`,
                  borderRadius: '100px', padding: '4px 12px',
                  fontSize: '0.7rem', fontWeight: 700, color: step.color,
                  width: 'fit-content',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={step.color} strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {step.time}
                </div>

                {/* Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '2px' }}>
                  {step.chips.map(c => (
                    <span key={c} style={{
                      background: '#f9f9f9', border: '1px solid #e5e5e5',
                      borderRadius: '100px', padding: '2px 9px',
                      fontSize: '0.65rem', fontWeight: 600, color: '#777',
                    }}>{c}</span>
                  ))}
                </div>
              </div>

              {/* Connector Arrow */}
              {i < steps.length - 1 && (
                <div style={{ width: '56px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <svg width="56" height="24" viewBox="0 0 56 24" fill="none">
                    <line x1="4" y1="12" x2="44" y2="12" stroke="#e5e5e5" strokeWidth="1.5" strokeDasharray="4 3"/>
                    <polyline points="40,7 52,12 40,17" stroke="#cf1322" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Total time banner */}
        <div style={{
          marginTop: '40px',
          background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
          borderRadius: '14px', padding: '18px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '20px', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: '#cf1322', borderRadius: '50%', animation: 'pulse 2s ease-in-out infinite' }}/>
            <span style={{ fontSize: '0.88rem', color: '#aaa', fontWeight: 500 }}>Total time:</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Minutes, not hours</span>
          </div>
          <div style={{ width: '1px', height: '20px', background: '#333' }}/>
          <div style={{ display: 'flex', gap: '16px' }}>
            {['No install', 'No account needed', 'Free to start'].map(t => (
              <span key={t} style={{ fontSize: '0.75rem', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#22c55e', fontSize: '0.8rem' }}>✓</span> {t}
              </span>
            ))}
          </div>
          <a href="/" onClick={handleStartFree} style={{
            background: '#cf1322', color: '#fff',
            border: 'none', borderRadius: '8px',
            padding: '9px 20px', fontWeight: 700, fontSize: '0.82rem',
            cursor: 'pointer', textDecoration: 'none',
            marginLeft: 'auto',
          }}>Try free →</a>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        @media(max-width:720px){
          #how-it-works > div > div[style*="display: flex; align-items: center; gap: 0"] {
            flex-direction: column !important;
          }
          #how-it-works > div > div[style*="display: flex; align-items: center; gap: 0"] > div {
            width: 100% !important;
          }
        }
      `}</style>
    </section>
  )
}
