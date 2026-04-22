const steps = [
  {
    id: '01', exe: 'INPUT.COM', status: 'READY', statusOk: true,
    icon: '📎', title: 'PASTE_URL',
    desc: 'Drop any YouTube video link — tutorials, podcasts, interviews, vlogs. Any length, any topic. No downloads needed.',
  },
  {
    id: '02', exe: 'PROCESS.COM', status: 'RUNNING', statusOk: false,
    icon: '⚙️', title: 'AI_ANALYZES',
    desc: 'Neural engine scans every frame for viral hooks, emotional peaks, and high-retention moments via sentiment analysis.',
  },
  {
    id: '03', exe: 'OUTPUT.COM', status: 'COMPLETE', statusOk: true,
    icon: '📱', title: 'DOWNLOAD_CLIPS',
    desc: 'Receive polished 9:16 vertical clips with burned-in captions, ready for TikTok, Reels, and YouTube Shorts. One click.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '90px 5%', borderTop: '2px dashed #1a3322' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={sectionLabel}>PROCESS_FLOW</div>
        <h2 className="sec-title">THREE STEPS.<br />DONE.</h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '30px', marginTop: '10px',
        }}>
          {steps.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="retro-card" style={{ flex: 1, position: 'relative' }}>
                {/* Step number badge */}
                <div style={{
                  position: 'absolute', top: '-1px', left: '-1px',
                  background: 'var(--lime)', color: 'var(--bg-dark)',
                  fontFamily: "'Space Mono', monospace", fontWeight: 700,
                  fontSize: '0.75rem', padding: '3px 10px',
                }}>STEP_{step.id}</div>

                {/* Terminal header row */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginTop: '24px', marginBottom: '20px',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem',
                  borderBottom: '1px solid #1a3322', paddingBottom: '10px',
                }}>
                  <span style={{ color: 'var(--lime)' }}>{step.exe}</span>
                  <span style={{ color: step.statusOk ? 'var(--green)' : 'var(--yellow)' }}>● {step.status}</span>
                </div>

                <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>{step.icon}</div>
                <h3 style={{ fontFamily: "'Space Mono', monospace", color: 'var(--yellow)', marginBottom: '12px', fontSize: '1rem' }}>
                  {step.title}
                </h3>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.87rem', lineHeight: 1.7, color: 'var(--muted)' }}>
                  {step.desc}
                </p>
              </div>

              {/* Arrow connector (not after last) */}
              {i < steps.length - 1 && (
                <div style={{
                  display: 'none', /* hidden on mobile, shown via flex on large screens */
                }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const sectionLabel = {
  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
  textTransform: 'uppercase', letterSpacing: '0.12em',
  background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
  display: 'inline-block', padding: '4px 12px', marginBottom: '20px',
}
