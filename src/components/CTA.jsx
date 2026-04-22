export default function CTA() {
  return (
    <section id="cta" style={{
      padding: '100px 5%', margin: '0 5% 60px',
      background: 'var(--bg-dark)',
      border: '3px solid var(--lime)',
      boxShadow: '12px 12px 0 rgba(132,204,22,0.15)',
      textAlign: 'center', position: 'relative', overflow: 'hidden',
    }}>
      {/* VHS tape background label */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-15deg)',
        fontFamily: "'Space Mono', monospace", fontWeight: 700,
        fontSize: 'clamp(4rem, 10vw, 9rem)', color: 'rgba(132,204,22,0.04)',
        whiteSpace: 'nowrap', pointerEvents: 'none', letterSpacing: '0.1em',
        userSelect: 'none',
      }}>SHORTCLIPR</div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
          textTransform: 'uppercase', letterSpacing: '0.12em',
          background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
          display: 'inline-block', padding: '4px 12px', marginBottom: '24px',
        }}>SYSTEM_READY</div>

        <h2 style={{
          fontFamily: "'Space Mono', monospace", fontWeight: 700,
          fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.15, marginBottom: '20px',
          textTransform: 'uppercase',
        }}>
          STOP LEAVING<br />
          <span style={{
            WebkitTextStroke: '2px var(--lime)', color: 'transparent',
          }}>VIRAL CLIPS</span><br />
          ON THE TABLE.
        </h2>

        <p style={{
          fontFamily: "'Space Mono', monospace", fontSize: '1rem',
          color: 'var(--muted)', lineHeight: 1.7,
          maxWidth: '540px', margin: '0 auto 40px',
        }}>
          47,000+ creators are already using ShortClipr. Your next viral short is already 
          inside your last upload — you just haven't found it yet.
        </p>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#" style={{
            background: 'var(--lime)', color: 'var(--bg-dark)', border: '2px solid var(--lime)',
            padding: '16px 36px', fontFamily: "'Space Mono', monospace", fontWeight: 700,
            fontSize: '1rem', textDecoration: 'none', textTransform: 'uppercase',
            letterSpacing: '0.06em', transition: 'all 0.2s', display: 'inline-block',
            boxShadow: '4px 4px 0 rgba(0,0,0,0.4)',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--green)'; e.currentTarget.style.transform = 'translate(-2px,-2px)'; e.currentTarget.style.boxShadow = '6px 6px 0 rgba(0,0,0,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--lime)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.4)' }}
          >
            START FOR FREE — NO CC
          </a>
          <a href="#how-it-works" style={{
            background: 'transparent', color: 'var(--lime)', border: '2px solid var(--lime)',
            padding: '16px 36px', fontFamily: "'Space Mono', monospace", fontWeight: 700,
            fontSize: '1rem', textDecoration: 'none', textTransform: 'uppercase',
            letterSpacing: '0.06em', transition: 'all 0.2s', display: 'inline-block',
            boxShadow: '4px 4px 0 rgba(132,204,22,0.2)',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(132,204,22,0.1)'; e.currentTarget.style.transform = 'translate(-2px,-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = '' }}
          >
            SEE HOW IT WORKS
          </a>
        </div>

        <p style={{
          marginTop: '24px', fontFamily: "'Space Mono', monospace",
          fontSize: '0.72rem', color: 'var(--muted)',
        }}>
          Free forever plan · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  )
}
