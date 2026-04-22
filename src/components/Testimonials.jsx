const testimonials = [
  {
    handle: '@jayleedotco', role: 'Content Creator · 1.2M subs', platform: 'TikTok',
    initials: 'JL', hue: 120,
    quote: 'I used to spend 3 hours per clip edit. Now I queue 5 YouTube vids, go make coffee, and come back to 30 ready-to-post shorts. My upload frequency went from 3x/week to daily.',
    stat: 'Views: 2.1M last month', score: 94, featured: false,
  },
  {
    handle: '@miakoshiro', role: 'Podcast Host · 340K listeners', platform: 'Reels',
    initials: 'MK', hue: 200,
    quote: 'ShortClipr found a 47-second clip from episode 83 that I would\'ve completely missed. That single clip pulled 800K Reels views and added 12K followers in a week. Wild.',
    stat: 'Best Clip: 800K views', score: 97, featured: true,
  },
  {
    handle: '@devraj_builds', role: 'Tech YouTuber · 220K subs', platform: 'Shorts',
    initials: 'DV', hue: 30,
    quote: 'The captions are genuinely better than what I was doing manually. The Bold Pop style with word-by-word highlight is exactly what the algorithm loves right now. 10/10 tool.',
    stat: 'Clips generated: 730+', score: 89, featured: false,
  },
]

const sectionLabel = {
  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
  textTransform: 'uppercase', letterSpacing: '0.12em',
  background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
  display: 'inline-block', padding: '4px 12px', marginBottom: '20px',
}

export default function Testimonials() {
  return (
    <section id="testimonials" style={{ padding: '90px 5%', borderTop: '2px dashed #1a3322' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={sectionLabel}>USER_REPORTS</div>
        <h2 className="sec-title">FIELD REPORTS.</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {testimonials.map(t => (
            <div
              key={t.handle}
              className="retro-card"
              style={{
                borderColor: t.featured ? 'var(--lime)' : 'var(--muted)',
                boxShadow: t.featured ? '8px 8px 0 rgba(132,204,22,0.25)' : '8px 8px 0 rgba(140,163,145,0.15)',
                position: 'relative',
              }}
            >
              {t.featured && (
                <div style={{
                  position: 'absolute', top: '-2px', right: '20px',
                  background: 'var(--lime)', color: 'var(--bg-dark)',
                  fontFamily: "'Space Mono', monospace", fontWeight: 700,
                  fontSize: '0.65rem', padding: '3px 10px', letterSpacing: '0.08em',
                }}>TOP_PERFORMER</div>
              )}

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: `hsl(${t.hue}, 60%, 35%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: '0.85rem', color: '#fff',
                  border: '2px solid rgba(255,255,255,0.2)', flexShrink: 0,
                }}>{t.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{t.handle}</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.7rem', color: 'var(--muted)' }}>{t.role}</div>
                </div>
                <div style={{
                  fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                  border: '1px solid var(--muted)', color: 'var(--muted)',
                  padding: '2px 8px', borderRadius: '2px', whiteSpace: 'nowrap',
                }}>{t.platform}</div>
              </div>

              {/* Quote */}
              <blockquote style={{
                fontFamily: "'Space Mono', monospace", fontSize: '0.85rem', lineHeight: 1.75,
                color: 'var(--muted)', borderLeft: '3px solid var(--lime)',
                paddingLeft: '14px', margin: '0 0 20px',
              }}>"{t.quote}"</blockquote>

              {/* Footer */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '1px dashed #1a3322', paddingTop: '14px',
                fontFamily: "'Space Mono', monospace", fontSize: '0.75rem',
              }}>
                <span style={{ color: 'var(--muted)' }}>{t.stat}</span>
                <span style={{
                  background: 'var(--lime)', color: 'var(--bg-dark)', padding: '2px 10px',
                  fontWeight: 700, fontSize: '0.75rem',
                }}>VIRAL: {t.score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
