const pipelineSteps = [
  { icon: '▶', label: 'YouTube URL', metric: 'Any length', color: '#cf1322', bg: '#fef2f2', border: '#fecaca' },
  { icon: '⚡', label: 'Stream Extract', metric: '~0.1× realtime', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  { icon: '🎙', label: 'AI Transcribe', metric: '28 languages', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { icon: '🧠', label: 'Virality Score', metric: 'LLM scoring', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { icon: '📐', label: '9:16 Reframe', metric: 'Face tracking', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { icon: '💬', label: 'Caption Burn', metric: '11 styles', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  { icon: '✅', label: 'Ready Clips', metric: '5–15 clips', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
]

const metrics = [
  { val: '5×', label: 'Faster than competitors' },
  { val: '11', label: 'Caption styles' },
  { val: '28', label: 'Languages' },
  { val: '9', label: 'Layout templates' },
]

export default function VisualHighlights() {
  return (
    <section id="pipeline" style={{ padding: '96px 0', background: '#0f0f0f' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '28px', height: '1px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>AI Pipeline</span>
            <div style={{ width: '28px', height: '1px', background: '#cf1322' }}/>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', marginBottom: '10px' }}>
            What happens inside.
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#555', maxWidth: '400px', margin: '0 auto' }}>
            7 automated stages. Zero manual work.
          </p>
        </div>

        {/* Pipeline Flow */}
        <div style={{
          background: '#161616',
          border: '1px solid #222',
          borderRadius: '24px',
          padding: '40px 32px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background grid */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: 'linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            opacity: 0.6,
          }}/>

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Flow nodes row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0',
              overflowX: 'auto',
              paddingBottom: '8px',
            }}>
              {pipelineSteps.map((step, i) => (
                <div key={step.label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>

                  {/* Node */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                    cursor: 'default',
                  }}>
                    {/* Icon circle */}
                    <div style={{
                      width: '64px', height: '64px',
                      background: step.bg,
                      border: `2px solid ${step.border}`,
                      borderRadius: '16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.5rem',
                      boxShadow: `0 0 20px ${step.color}20`,
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${step.color}40` }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 0 20px ${step.color}20` }}
                    >
                      {step.icon}
                    </div>

                    {/* Label */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', marginBottom: '2px' }}>
                        {step.label}
                      </div>
                      <div style={{
                        fontSize: '0.62rem', fontWeight: 600, color: step.color,
                        background: step.bg + '22',
                        border: `1px solid ${step.border}55`,
                        borderRadius: '100px', padding: '1px 7px',
                        whiteSpace: 'nowrap',
                      }}>
                        {step.metric}
                      </div>
                    </div>
                  </div>

                  {/* Connector */}
                  {i < pipelineSteps.length - 1 && (
                    <div style={{ width: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingBottom: '30px' }}>
                      <svg width="40" height="16" viewBox="0 0 40 16" fill="none">
                        <line x1="2" y1="8" x2="30" y2="8" stroke="#333" strokeWidth="1.5" strokeDasharray="3 2"/>
                        <polyline points="27,4 38,8 27,12" stroke="#cf1322" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Flow line underneath */}
            <div style={{
              marginTop: '28px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, #cf1322, #7c3aed, #059669, transparent)',
              opacity: 0.4,
            }}/>
          </div>
        </div>

        {/* Metrics row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1px',
          marginTop: '2px',
          background: '#222',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #222',
        }}>
          {metrics.map((m, i) => (
            <div key={m.label} style={{
              background: '#161616',
              padding: '24px 20px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 'clamp(1.6rem, 2.5vw, 2rem)', fontWeight: 800, color: '#cf1322', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {m.val}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '6px', fontWeight: 500 }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>

      </div>

      <style>{`
        @media(max-width:640px){
          #pipeline div[style*="grid-template-columns: repeat(4"] {
            grid-template-columns: repeat(2,1fr) !important;
          }
        }
      `}</style>
    </section>
  )
}
