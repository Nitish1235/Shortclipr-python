import featReframe  from '../assets/feat_reframe.png'
import featCaptions from '../assets/feat_captions.png'
import featBatch    from '../assets/feat_batch.png'

const statChips = [
  { icon: '🧠', label: 'Viral Moment Detection', sub: 'LLM scores every second for hook strength' },
  { icon: '⚡', label: 'Minutes, Not Hours',     sub: 'Typically 5–10 min end-to-end' },
  { icon: '🎨', label: '9 Premium Layouts',      sub: 'Glass · Blur · Cinema · Neon & more' },
]

export default function Features() {
  return (
    <section id="features" style={{ padding: '88px 0', background: '#fff' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '52px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '24px', height: '2px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>
              Everything you need
            </span>
            <div style={{ width: '24px', height: '2px', background: '#cf1322' }}/>
          </div>
          <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.5rem)', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em', margin: '0 0 10px' }}>
            Built for creators who scale.
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#888', maxWidth: '420px', margin: '0 auto', lineHeight: 1.65 }}>
            Every tool your content pipeline needs — no editing software required.
          </p>
        </div>

        {/* Row 1 — 2 equal cards: Reframe + Captions */}
        <div id="feat-row1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

          {/* Card: Reframe */}
          <div className="feat-card" style={{ background: '#fafafa', border: '1px solid #ebebeb', borderRadius: '18px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Content */}
            <div style={{ padding: '24px 24px 18px' }}>
              <span style={{
                display: 'inline-block', background: '#fef2f2', color: '#cf1322',
                border: '1px solid #fecaca', borderRadius: '100px',
                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '3px 10px', marginBottom: '12px',
              }}>Smart Reframe</span>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f0f0f', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                Auto 9:16 Reframe
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#666', lineHeight: 1.65, margin: '0 0 16px' }}>
                Face-tracking keeps your speaker perfectly centered. No black bars — works on TikTok, Reels, Shorts & LinkedIn.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#cf1322' }}>100%</span>
                <span style={{ fontSize: '0.7rem', color: '#bbb' }}>platform coverage</span>
              </div>
            </div>
            {/* Image preview */}
            <div style={{ margin: '0 16px 16px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e0e0e0', flexShrink: 0 }}>
              <img src={featReframe} alt="Auto reframe preview" style={{ width: '100%', height: '190px', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
            </div>
          </div>

          {/* Card: Captions */}
          <div className="feat-card" style={{ background: '#fafafa', border: '1px solid #ebebeb', borderRadius: '18px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '24px 24px 18px' }}>
              <span style={{
                display: 'inline-block', background: '#fef2f2', color: '#cf1322',
                border: '1px solid #fecaca', borderRadius: '100px',
                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '3px 10px', marginBottom: '12px',
              }}>Captions</span>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f0f0f', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                11 Animated Caption Styles
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#666', lineHeight: 1.65, margin: '0 0 16px' }}>
                Word Pop, Hormozi Bold, Karaoke, MrBeast Giant — word-by-word sync with full color & font control.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#cf1322' }}>+40%</span>
                <span style={{ fontSize: '0.7rem', color: '#bbb' }}>avg retention with captions on</span>
              </div>
            </div>
            <div style={{ margin: '0 16px 16px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e0e0e0', flexShrink: 0 }}>
              <img src={featCaptions} alt="Caption styles preview" style={{ width: '100%', height: '190px', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
            </div>
          </div>
        </div>

        {/* Row 2 — wide horizontal card: Batch (image on right, text on left) */}
        <div style={{ marginBottom: '16px' }}>
          <div className="feat-card" style={{ background: '#fafafa', border: '1px solid #ebebeb', borderRadius: '18px', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1.1fr', minHeight: '200px' }}>
            {/* Text left */}
            <div style={{ padding: '32px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{
                display: 'inline-block', background: '#fef2f2', color: '#cf1322',
                border: '1px solid #fecaca', borderRadius: '100px',
                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: '3px 10px', marginBottom: '14px', alignSelf: 'flex-start',
              }}>Batch Export</span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f0f0f', margin: '0 0 10px', letterSpacing: '-0.03em' }}>
                One-Click Batch Download
              </h3>
              <p style={{ fontSize: '0.83rem', color: '#666', lineHeight: 1.65, margin: '0 0 18px', maxWidth: '320px' }}>
                Download all clips at once as a ZIP. Every clip is captioned, reframed, and ready to drag-and-drop into any platform.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#cf1322' }}>All clips</span>
                <span style={{ fontSize: '0.7rem', color: '#bbb' }}>ZIP · MP4 · TikTok · Reels · Shorts</span>
              </div>
            </div>
            {/* Image right */}
            <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', borderLeft: '1px solid #ebebeb' }}>
              <img src={featBatch} alt="Batch download preview" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
            </div>
          </div>
        </div>

        {/* Row 3 — 3 small stat chips */}
        <div id="features-chips" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {statChips.map(c => (
            <div key={c.label} className="feat-chip" style={{
              background: '#fafafa', border: '1px solid #ebebeb', borderRadius: '14px',
              padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: '13px',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(207,19,34,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#ebebeb'; e.currentTarget.style.boxShadow = '' }}
            >
              <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>{c.icon}</span>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f0f0f', marginBottom: '3px' }}>{c.label}</div>
                <div style={{ fontSize: '0.76rem', color: '#999', lineHeight: 1.5 }}>{c.sub}</div>
              </div>
            </div>
          ))}
        </div>

      </div>

      <style>{`
        .feat-card {
          cursor: default;
          transition: box-shadow 0.22s, transform 0.22s, border-color 0.22s;
        }
        .feat-card:hover {
          box-shadow: 0 8px 32px rgba(0,0,0,0.07);
          border-color: #d9d9d9 !important;
          transform: translateY(-2px);
        }
        @media(max-width: 860px) {
          #feat-row1 { grid-template-columns: 1fr !important; }
          #features-chips { grid-template-columns: repeat(2, 1fr) !important; }
          #feat-row2-inner { grid-template-columns: 1fr !important; }
        }
        @media(max-width: 520px) {
          #features-chips { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
