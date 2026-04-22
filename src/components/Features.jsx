const features = [
  {
    tag: 'CORE_AI', icon: '🧠', title: 'Viral Hook Detection', wide: false, large: true,
    desc: 'Our LLM-powered engine transcribes and semantically scores every moment of your video — flagging quotable lines, emotional spikes, and story-arc peaks that historically drive the most engagement across TikTok, Reels, and Shorts.',
    stat: { num: '3.7x', label: 'avg. engagement lift vs manual clipping' },
  },
  {
    tag: 'VISION', icon: '📐', title: 'Auto-Reframe 9:16', wide: false,
    desc: 'Smart face-tracking and subject-detection keeps your speaker centered frame-perfect. Zero letterboxing. No black bars.',
    chip: 'Face Tracking ON',
  },
  {
    tag: 'CAPTION_ENGINE', icon: '🗒️', title: 'Cinematic Burn-In Captions', wide: false,
    desc: 'Word-by-word highlighted captions synced to audio. Choose from 12 caption styles including the viral Bold Pop style.',
    chip: '+40% avg retention',
  },
  {
    tag: 'EXPORT', icon: '🚀', title: 'Multi-Platform Export', wide: false,
    desc: 'One-click optimized exports for TikTok, YouTube Shorts, Instagram Reels, and LinkedIn Video — correct specs every time.',
    chip: '4 Platforms',
  },
  {
    tag: 'BATCH', icon: '📦', title: 'Batch Processing', wide: false,
    desc: 'Queue up to 20 videos simultaneously. Our cloud pipeline scales horizontally so your clips are ready in parallel.',
    chip: '20x faster',
  },
  {
    tag: 'ANALYTICS', icon: '📊', title: 'Clip Score Dashboard', wide: true,
    desc: 'Every generated clip receives a Virality Score (0–100) based on hook strength, pacing, and caption coverage. Sort and prioritize your best content before posting.',
    meter: 88,
  },
]

const sectionLabel = {
  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
  textTransform: 'uppercase', letterSpacing: '0.12em',
  background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
  display: 'inline-block', padding: '4px 12px', marginBottom: '20px',
}

export default function Features() {
  return (
    <section id="features" style={{ padding: '90px 5%', borderTop: '2px dashed #1a3322' }}>
      <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
        <div style={sectionLabel}>SYSTEM_CAPABILITIES</div>
        <h2 className="sec-title">BUILT FOR<br />CREATORS WHO SCALE.</h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
        }}>
          {features.map((f, i) => (
            <div
              key={f.tag}
              className="retro-card"
              style={{
                gridColumn: f.large ? 'span 2' : f.wide ? '1 / -1' : 'span 1',
                position: 'relative', display: 'flex', flexDirection: 'column',
              }}
            >
              {/* Tag */}
              <div style={{
                fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                color: 'var(--lime)', letterSpacing: '0.1em', marginBottom: '16px',
                display: 'inline-block', borderBottom: '1px solid rgba(132,204,22,0.3)', paddingBottom: '4px',
              }}>{f.tag}</div>

              <span style={{ fontSize: '2.2rem', marginBottom: '14px', display: 'block' }}>{f.icon}</span>
              <h3 style={{ color: 'var(--yellow)', marginBottom: '12px', fontSize: '1.1rem' }}>{f.title}</h3>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.87rem', lineHeight: 1.7, color: 'var(--muted)', flex: 1 }}>{f.desc}</p>

              {/* Stat */}
              {f.stat && (
                <div style={{ marginTop: '24px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontSize: '2.5rem', fontFamily: "'Space Mono', monospace", fontWeight: 700, color: 'var(--lime)' }}>{f.stat.num}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.8rem', color: 'var(--muted)' }}>{f.stat.label}</span>
                </div>
              )}

              {/* Chip */}
              {f.chip && (
                <div style={{
                  marginTop: '20px', display: 'inline-block',
                  border: '1px solid var(--lime)', color: 'var(--lime)',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem',
                  padding: '4px 12px', letterSpacing: '0.05em',
                }}>{f.chip}</div>
              )}

              {/* Meter */}
              {f.meter && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ background: '#0f2a18', height: '12px', borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{
                      height: '100%', width: `${f.meter}%`, background: 'linear-gradient(90deg, var(--lime), var(--green))',
                      animation: 'meterFill 1.5s ease-out',
                    }} />
                  </div>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--green)' }}>
                    {f.meter} — HIGH_VIRAL_PROBABILITY
                  </span>
                  <style>{`@keyframes meterFill { from { width: 0% } to { width: ${f.meter}% } }`}</style>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          #features .retro-card { grid-column: 1 / -1 !important; }
          #features > div > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
