import ClipEngine from './ClipEngine'

export default function Hero() {
  return (
    <section className="hero" style={{ paddingTop: '130px' }}>
      <div className="terminal-badge">
        <span style={{ color: 'var(--green)', marginRight: '8px' }}>●</span>
        SYS_UPDATE_V2.0_ONLINE — STATUS: OPERATIONAL
      </div>

      <h1>
        LONG VIDEOS.<br />
        <span style={{ WebkitTextStroke: '2px var(--lime)', color: 'transparent' }}>VIRAL SHORTS.</span><br />
        <span style={{ fontSize: '0.6em', color: 'var(--muted)', WebkitTextStroke: '0px' }}>ZERO EDITING.</span>
      </h1>

      <p className="sub">
        Paste any YouTube URL. Our AI scans for the highest-engagement moments,
        reframes to 9:16, burns in cinematic captions, and delivers
        share-ready clips in minutes — not hours.
      </p>

      <ClipEngine />



      {/* Trust bar */}
      <div style={{
        display: 'flex', gap: '32px', flexWrap: 'wrap', justifyContent: 'center',
        marginTop: '8px', fontFamily: "'Space Mono', monospace",
      }}>
        {[['47K+','Creators'],['9.2M+','Clips Generated'],['4.8★','Avg Rating'],['99.1%','Uptime SLA']].map(([num, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', color: 'var(--lime)', fontWeight: 700 }}>{num}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Scroll hint */}
      <a href="#how-it-works" style={{
        marginTop: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        color: 'var(--muted)', textDecoration: 'none', fontFamily: "'Space Mono', monospace",
        fontSize: '0.75rem', animation: 'float 2s ease-in-out infinite',
      }}>
        SCROLL_DOWN
        <span style={{ fontSize: '1.2rem', color: 'var(--lime)' }}>▼</span>
      </a>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
      `}</style>
    </section>
  )
}
