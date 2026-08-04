const cases = [
  {
    icon: '🎙️',
    type: 'Podcasters',
    headline: 'Every episode → 10+ viral clips',
    bullets: ['Find every quotable moment', 'Auto-captioned & reframed', '3–5× more reach from clips'],
    stat: '10 clips / episode',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  {
    icon: '📹',
    type: 'YouTubers',
    headline: 'One video → content for every platform',
    bullets: ['Vertical format in minutes', 'Zero extra filming needed', 'TikTok + Reels + Shorts'],
    stat: '5× more content',
    color: '#cf1322',
    bg: '#fef2f2',
    border: '#fecaca',
  },
  {
    icon: '🎓',
    type: 'Educators & Coaches',
    headline: 'Course content → bite-sized lessons',
    bullets: ['Key concepts as short clips', '"Aha moments" go viral', 'Topic search built-in'],
    stat: '+200% course discovery',
    color: '#0369a1',
    bg: '#f0f9ff',
    border: '#bae6fd',
  },
  {
    icon: '💼',
    type: 'Marketing Teams',
    headline: 'One webinar → 10 social clips',
    bullets: ['Scale output without scaling team', 'Consistent daily posting', 'Multiple channels at once'],
    stat: '10 clips / webinar',
    color: '#059669',
    bg: '#f0fdf4',
    border: '#bbf7d0',
  },
]

export default function UseCases() {
  return (
    <section id="use-cases" style={{ padding: '96px 0', background: '#fff' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>
              Who it's for
            </span>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em' }}>
            Used by every kind of creator.
          </h2>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          {cases.map(c => (
            <div key={c.type} style={{
              background: c.bg,
              border: `1.5px solid ${c.border}`,
              borderRadius: '18px', padding: '28px',
              display: 'flex', flexDirection: 'column', gap: '16px',
              transition: 'transform 0.2s, box-shadow 0.2s',
              position: 'relative', overflow: 'hidden',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 32px ${c.color}20` }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              {/* Stat badge — top right */}
              <div style={{
                position: 'absolute', top: '20px', right: '20px',
                background: '#fff', border: `1px solid ${c.border}`,
                borderRadius: '100px', padding: '4px 12px',
                fontSize: '0.72rem', fontWeight: 800, color: c.color,
              }}>{c.stat}</div>

              {/* Icon + type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.6rem' }}>{c.icon}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {c.type}
                </span>
              </div>

              {/* Headline */}
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f0f0f', lineHeight: 1.3, paddingRight: '80px' }}>
                {c.headline}
              </h3>

              {/* Bullet points */}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {c.bullets.map(b => (
                  <li key={b} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.83rem', color: '#555' }}>
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: c.color + '18', border: `1px solid ${c.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                        <polyline points="2,6 5,9 10,3" stroke={c.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media(max-width:680px){
          #use-cases div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important;}
        }
      `}</style>
    </section>
  )
}
