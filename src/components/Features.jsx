const features = [
  {
    icon: '🧠',
    badge: 'AI Core',
    title: 'Viral Moment Detection',
    desc: 'LLM scores every moment by emotional intensity and hook strength — finds the gold inside a 3-hour podcast automatically.',
    highlight: '3.7× higher engagement',
    highlightSub: 'vs manually selected clips',
  },
  {
    icon: '📐',
    badge: 'Smart Reframe',
    title: 'Auto 9:16 Reframe',
    desc: 'Face-tracking keeps your speaker centered. Converts any landscape video to TikTok/Reels/Shorts — zero black bars.',
    highlight: '100% of platforms',
    highlightSub: 'TikTok · Reels · Shorts · LinkedIn',
  },
  {
    icon: '🗒️',
    badge: 'Captions',
    title: '11 Animated Caption Styles',
    desc: 'Word Pop, Hormozi Bold, Karaoke, MrBeast Giant — word-by-word sync with full color and font control.',
    highlight: '+40% avg retention',
    highlightSub: 'with captions enabled',
  },
  {
    icon: '⚡',
    badge: 'Speed',
    title: 'Minutes, Not Hours',
    desc: 'Stream extraction pulls only the segments we need — no full-video download. Typically 5–10 minutes end-to-end vs. hours of manual editing.',
    highlight: 'Way faster',
    highlightSub: 'than editing by hand',
  },
  {
    icon: '🎨',
    badge: 'Templates',
    title: '9 Premium Layouts',
    desc: 'Glass overlay, Blurred background, Neon Frame, Cinema bars, Split Screen — every template optimized for vertical mobile.',
    highlight: '9 layouts',
    highlightSub: 'Glass · Blur · Cinema · Neon & more',
  },
  {
    icon: '📦',
    badge: 'Batch',
    title: 'Batch Download',
    desc: 'Download all your clips at once as a ZIP. Every clip is captioned, reframed, and ready to drag-and-drop into any platform.',
    highlight: 'All clips in one click',
    highlightSub: 'ZIP · MP4 · TikTok · Reels · Shorts',
  },
]

export default function Features() {
  return (
    <section id="features" style={{ padding: '96px 0', background: '#fff' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>
              Everything you need
            </span>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em', marginBottom: '10px' }}>
            Built for creators who scale.
          </h2>
        </div>

        {/* Feature grid */}
        <div id="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {features.map((f) => (
            <div key={f.title} style={{
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex', flexDirection: 'column', gap: '12px',
              transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
              cursor: 'default',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(207,19,34,0.1)'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.borderColor = '#fecaca'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.transform = ''
                e.currentTarget.style.borderColor = '#e5e5e5'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.8rem' }}>{f.icon}</span>
                <span style={{
                  background: '#fef2f2', color: '#cf1322',
                  border: '1px solid #fecaca', borderRadius: '100px',
                  fontSize: '0.62rem', fontWeight: 700,
                  padding: '3px 10px', textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>{f.badge}</span>
              </div>

              <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0f0f0f', lineHeight: 1.3 }}>{f.title}</h3>

              <p style={{ fontSize: '0.845rem', color: '#777', lineHeight: 1.65, flex: 1 }}>{f.desc}</p>

              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '12px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#cf1322', letterSpacing: '-0.02em' }}>{f.highlight}</span>
                <span style={{ fontSize: '0.7rem', color: '#bbb' }}>{f.highlightSub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media(max-width:900px){
          #features-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media(max-width:580px){
          #features-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
