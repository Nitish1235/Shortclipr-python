const testimonials = [
  {
    initials: 'JL', name: 'Jay Lee', handle: '@jayleedotco',
    role: 'Content Creator · 1.2M subs', platform: 'TikTok',
    color: '#cf1322', featured: false,
    quote: 'I used to spend 3 hours editing one clip. Now I queue 5 YouTube vids, go make coffee, and come back to 30 ready-to-post shorts. Upload frequency went from 3×/week to daily. Views tripled.',
    stat: '2.1M views last month',
    useCase: 'Podcast repurposing',
  },
  {
    initials: 'MK', name: 'Mia Koshiro', handle: '@miakoshiro',
    role: 'Podcast Host · 340K listeners', platform: 'Instagram Reels',
    color: '#e85d04', featured: true,
    quote: 'ShortClipr found a 47-second clip from episode 83 that I\'d have completely missed. That single clip did 800K Reels views and added 12K followers in a week. The AI genuinely finds stuff I overlook.',
    stat: '800K views from one clip',
    useCase: 'YouTube → Reels',
  },
  {
    initials: 'DV', name: 'Dev Raj', handle: '@devraj_builds',
    role: 'Tech YouTuber · 220K subs', platform: 'YouTube Shorts',
    color: '#7c3aed', featured: false,
    quote: 'The captions are better than what I was doing manually. Word Pop style with word-by-word highlight is exactly what the algorithm loves. Batch downloading all clips at once saves me hours every week.',
    stat: '730+ clips generated',
    useCase: 'Tutorial clips',
  },
  {
    initials: 'SR', name: 'Sofia Ruiz', handle: '@sofiabrandstrategy',
    role: 'Marketing Director · B2B SaaS', platform: 'LinkedIn',
    color: '#0369a1', featured: false,
    quote: 'We turned one 90-minute webinar into 22 LinkedIn video clips. That\'s our entire Q2 content calendar from a single recording session. ShortClipr pays for itself in the first week.',
    stat: '22 clips from 1 webinar',
    useCase: 'Webinar repurposing',
  },
  {
    initials: 'AB', name: 'Alex Brown', handle: '@alexcoachfit',
    role: 'Fitness Coach · 89K followers', platform: 'TikTok',
    color: '#059669', featured: false,
    quote: 'I was skeptical about AI picking the right moments — but it found motivational hooks I didn\'t even remember saying. My TikTok account went from 800 to 89K followers in 6 months just by consistently posting ShortClipr clips.',
    stat: '89K followers in 6 months',
    useCase: 'Coaching content',
  },
  {
    initials: 'NP', name: 'Nikhil Patel', handle: '@techwithtail',
    role: 'EdTech Creator · 156K subs', platform: 'YouTube Shorts',
    color: '#be185d', featured: false,
    quote: 'As a non-native English creator, the translation feature is a game changer. I post my Hindi tutorials in English Shorts and reach a global audience. ShortClipr handles the transcription and translation perfectly.',
    stat: '156K subscribers',
    useCase: 'Multi-language clips',
  },
]

export default function Testimonials() {
  return (
    <section id="testimonials" style={{ padding: '96px 0', background: '#fff' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ marginBottom: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>
              What creators say
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <h2 style={{
              fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
              fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em',
            }}>
              12,000+ creators can't be wrong.
            </h2>
            {/* Star rating */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '2px' }}>
                {[1,2,3,4,5].map(s => (
                  <span key={s} style={{ color: '#f59e0b', fontSize: '1.1rem' }}>★</span>
                ))}
              </div>
              <span style={{ fontWeight: 700, color: '#111', fontSize: '0.9rem' }}>4.8 / 5</span>
              <span style={{ color: '#aaa', fontSize: '0.8rem' }}>from 1,200+ reviews</span>
            </div>
          </div>
        </div>

        {/* Testimonial grid — 3 col */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
          {testimonials.map(t => (
            <div key={t.handle} style={{
              background: '#fff',
              border: t.featured ? '2px solid #cf1322' : '1px solid #e5e5e5',
              borderRadius: '14px', padding: '24px',
              boxShadow: t.featured ? '4px 4px 0 #cf1322' : 'none',
              display: 'flex', flexDirection: 'column', gap: '16px',
              position: 'relative',
              transition: 'box-shadow 0.2s, transform 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = t.featured ? '6px 6px 0 #cf1322' : '0 6px 24px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = t.featured ? '4px 4px 0 #cf1322' : 'none'; e.currentTarget.style.transform = '' }}
            >
              {t.featured && (
                <div style={{
                  position: 'absolute', top: '-12px', left: '20px',
                  background: '#cf1322', color: '#fff',
                  fontSize: '0.62rem', fontWeight: 800, padding: '3px 10px',
                  borderRadius: '100px', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>⭐ Top review</div>
              )}

              {/* Quote */}
              <div style={{ fontSize: '1.4rem', color: '#fecaca', lineHeight: 1 }}>"</div>
              <p style={{ fontSize: '0.875rem', color: '#333', lineHeight: 1.75, flex: 1, marginTop: '-10px' }}>
                {t.quote}
              </p>

              {/* Use case tag */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: '#f9f9f9', border: '1px solid #e5e5e5',
                borderRadius: '100px', padding: '3px 10px',
                fontSize: '0.68rem', fontWeight: 600, color: '#666',
                width: 'fit-content',
              }}>
                🎬 {t.useCase}
              </div>

              {/* Stat */}
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: '8px', padding: '8px 12px',
                fontSize: '0.78rem', fontWeight: 700, color: '#cf1322',
              }}>📈 {t.stat}</div>

              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '8px', borderTop: '1px solid #f0f0f0' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  background: t.color, color: '#fff', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.82rem', fontWeight: 800,
                }}>{t.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111' }}>{t.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.role}</div>
                </div>
                <div style={{
                  background: '#f4f4f4', color: '#666',
                  fontSize: '0.62rem', fontWeight: 700, padding: '3px 8px',
                  borderRadius: '6px', textTransform: 'uppercase', flexShrink: 0,
                }}>{t.platform}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media(max-width:900px){
          #testimonials div[style*="grid-template-columns: repeat(3"]{grid-template-columns:repeat(2,1fr) !important;}
        }
        @media(max-width:560px){
          #testimonials div[style*="grid-template-columns"]{grid-template-columns:1fr !important;}
        }
      `}</style>
    </section>
  )
}
