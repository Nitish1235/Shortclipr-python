const clips = [
  {
    tag: 'PODCAST_CLIP', title: 'Financial Strategy Hook',
    desc: 'From a 2-hour finance podcast → 28-second viral TikTok',
    score: 94, dur: '0:28', caption: 'This strategy made me $1M',
    img: '/assets/showcase_finance.png',
    captionColor: '#f9ff00',
  },
  {
    tag: 'TUTORIAL_CLIP', title: 'Developer Tutorial Moment',
    desc: 'From a 45-min coding video → 55-second Reels banger',
    score: 87, dur: '0:55', caption: 'Nobody tells you this.',
    img: '/assets/showcase_coding.png',
    captionColor: '#00cfff',
  },
  {
    tag: 'INTERVIEW_CLIP', title: 'Thought Leadership Moment',
    desc: 'From a 90-min interview → 62-second Shorts hit',
    score: 91, dur: '1:02', caption: 'The truth about AI',
    img: '/assets/showcase_interview.png',
    captionColor: '#ff80ff',
  },
]

const sectionLabel = {
  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
  textTransform: 'uppercase', letterSpacing: '0.12em',
  background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
  display: 'inline-block', padding: '4px 12px', marginBottom: '20px',
}

function PhoneClip({ clip }) {
  return (
    <div style={{ textAlign: 'center' }}>
      {/* Phone frame */}
      <div style={{
        width: '190px', margin: '0 auto 20px',
        background: '#111', borderRadius: '28px',
        padding: '10px 8px', border: '3px solid #333',
        boxShadow: '0 0 30px rgba(132,204,22,0.15)',
        position: 'relative',
      }}>
        {/* Notch */}
        <div style={{ width: '60px', height: '14px', background: '#000', borderRadius: '10px', margin: '0 auto 8px' }} />
        {/* Screen */}
        <div style={{
          aspectRatio: '9/16', background: '#000', borderRadius: '14px',
          position: 'relative', overflow: 'hidden', border: '1px solid #222',
        }}>
          {/* Real Video Image */}
          <img 
            src={clip.img} 
            alt={clip.title} 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />

          {/* REC badge */}
          <div style={{
            position: 'absolute', top: '10px', left: '10px',
            fontFamily: "'Space Mono', monospace", fontSize: '0.55rem',
            color: 'red', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span style={{ animation: 'blinker 1s infinite' }}>●</span> REC
          </div>
          {/* Duration */}
          <div style={{
            position: 'absolute', top: '10px', right: '10px',
            fontFamily: "'Space Mono', monospace", fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)',
          }}>{clip.dur}</div>
          {/* 9:16 label */}
          <div style={{
            position: 'absolute', bottom: '44px', right: '8px',
            fontFamily: "'Space Mono', monospace", fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)',
            border: '1px solid rgba(255,255,255,0.2)', padding: '1px 4px', borderRadius: '2px',
          }}>9:16</div>
          {/* Caption */}
          <div style={{
            position: 'absolute', bottom: '12px', left: '8px', right: '8px',
            textAlign: 'center', color: clip.captionColor,
            fontFamily: "'Inter', sans-serif", fontWeight: 900,
            fontSize: '0.7rem', textShadow: '2px 2px 0 #000',
            textTransform: 'uppercase', lineHeight: 1.3,
          }}>{clip.caption}</div>
          {/* Scan line effect */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 4px)',
            pointerEvents: 'none',
          }} />
        </div>
      </div>

      {/* Score */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        border: '1px solid var(--lime)', padding: '4px 14px', marginBottom: '14px',
        fontFamily: "'Space Mono', monospace",
      }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>VIRAL SCORE</span>
        <span style={{ fontSize: '1.4rem', color: 'var(--lime)', fontWeight: 700 }}>{clip.score}</span>
      </div>

      <div style={{
        fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
        color: 'var(--lime)', letterSpacing: '0.1em', marginBottom: '8px',
      }}>{clip.tag}</div>
      <h4 style={{ fontFamily: "'Space Mono', monospace", color: 'var(--text)', marginBottom: '6px', fontSize: '0.95rem' }}>{clip.title}</h4>
      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>{clip.desc}</p>
    </div>
  )
}

export default function Showcase() {
  return (
    <section id="showcase" style={{ padding: '90px 5%', borderTop: '2px dashed #1a3322' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={sectionLabel}>OUTPUT_PREVIEW</div>
        <h2 className="sec-title">WHAT YOU<br />ACTUALLY GET.</h2>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '40px', marginTop: '20px',
        }}>
          {clips.map(clip => (
            <PhoneClip key={clip.tag} clip={clip} />
          ))}
        </div>
      </div>
    </section>
  )
}
