import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const faqs = [
  {
    q: 'What is ShortClipr and how does it work?',
    a: 'Paste a YouTube URL — our AI transcribes, scores viral moments, reframes to 9:16, burns in captions, and delivers ready-to-post clips in minutes. No editing software needed.',
  },
  {
    q: 'Is ShortClipr better than OpusClip?',
    a: 'ShortClipr is noticeably faster (we never download the full source video), has no watermarks on the free plan, uses per-video pricing (not confusing per-minute), and offers 11 caption styles vs OpusClip\'s 4.',
  },
  {
    q: 'How long does it take to generate clips?',
    a: 'Typically 5–10 minutes per video, depending on length and clip count. Stream extraction means we never download the full source file — a 3-hour podcast usually returns 10+ clips in that window.',
  },
  {
    q: 'Can I use ShortClipr for free?',
    a: 'Yes — the free plan includes 2 clips, 720p output, and a preview on the platform. No credit card is required.',
  },
  {
    q: 'Which YouTube videos work best?',
    a: 'Talking-head content performs best: interviews, podcasts, tutorials, and vlogs. Minimum recommended length is 5 minutes; optimal is 20 minutes to 3 hours.',
  },
  {
    q: 'Does ShortClipr support other languages?',
    a: '28 languages supported for transcription and captions, including Spanish, French, German, Hindi, Japanese, and Arabic. English and Spanish accuracy is 99%+.',
  },
  {
    q: 'How do I download my clips?',
    a: 'Every clip has a Download button — click it for a single clip, or select multiple clips and use "Download all" for a bulk ZIP. All clips are 1080p MP4, captioned, and ready to upload anywhere.',
  },
]

export default function FAQ() {
  const [open, setOpen] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  const handleStartFree = (e) => {
    e.preventDefault()
    if (location.pathname === '/youtube-shorts') {
      const el = document.getElementById('hero')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        const input = el.querySelector('input[type="url"]')
        if (input) input.focus()
      }
    } else {
      navigate('/youtube-shorts', { state: { scrollToSection: 'hero' } })
    }
  }

  return (
    <section id="faq" className="cloud-faq" style={{ padding: '96px 0', background: '#f9f9f9' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>FAQ</span>
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em', marginBottom: '8px' }}>
            Common questions.
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#888' }}>
            Still stuck? <a href="/contact" style={{ color: '#cf1322', fontWeight: 600 }}>Email us</a> — we reply within 24 hours.
          </p>
        </div>

        {/* FAQ items */}
        <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e5e5e5', borderRadius: '16px', overflow: 'hidden' }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderBottom: i < faqs.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: '100%', background: open === i ? '#fef9f9' : 'none',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '18px 22px', textAlign: 'left', gap: '16px',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.4, color: open === i ? '#cf1322' : '#0f0f0f', transition: 'color 0.2s' }}>
                  {faq.q}
                </span>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: open === i ? '#cf1322' : '#f4f4f4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.2s',
                }}>
                  <span style={{
                    color: open === i ? '#fff' : '#666', fontSize: '0.7rem', fontWeight: 800,
                    transform: open === i ? 'rotate(180deg)' : 'rotate(0)',
                    display: 'inline-block', transition: 'transform 0.25s',
                  }}>▼</span>
                </div>
              </button>
              {open === i && (
                <div style={{ padding: '0 22px 18px', fontSize: '0.875rem', lineHeight: 1.75, color: '#555', animation: 'slideDown 0.2s ease' }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div style={{ marginTop: '28px', textAlign: 'center' }}>
          <a href="/youtube-shorts" onClick={handleStartFree} style={{
            display: 'inline-block',
            background: '#cf1322', color: '#fff',
            border: '2px solid #111', borderRadius: '8px',
            padding: '11px 26px', fontWeight: 700, fontSize: '0.88rem',
            boxShadow: '2px 2px 0 #111', textDecoration: 'none',
            transition: 'transform 0.1s, box-shadow 0.1s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = '3px 3px 0 #111' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '2px 2px 0 #111' }}
          >Start free — paste a URL →</a>
        </div>

        {/* Internal link cluster — SEO link equity to tool + alternatives pages */}
        <div style={{ marginTop: '40px', borderTop: '1px solid #e8e8e8', paddingTop: '28px' }}>
          <p style={{ fontSize: '0.78rem', color: '#bbb', textAlign: 'center', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Explore ShortClipr</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
            {[
              { label: 'YouTube to Shorts',    href: '/youtube-shorts/tools/youtube-to-shorts-converter'    },
              { label: 'Podcast to Shorts',    href: '/youtube-shorts/tools/podcast-to-shorts'              },
              { label: 'TikTok Clip Maker',    href: '/youtube-shorts/tools/tiktok-clip-maker'              },
              { label: 'Video to Reels',       href: '/youtube-shorts/tools/video-to-reels'                 },
              { label: 'Webinar to Clips',     href: '/youtube-shorts/tools/webinar-to-clips'               },
              { label: 'Opus Clip Alternative',href: '/youtube-shorts/alternatives/opus-clip'               },
              { label: '2short.ai Alternative',href: '/youtube-shorts/alternatives/2short'                  },
              { label: 'Riverside Alternative',href: '/youtube-shorts/alternatives/riverside'               },
              { label: 'Munch Alternative',    href: '/youtube-shorts/alternatives/munch'                   },
              { label: 'Vizard Alternative',   href: '/youtube-shorts/alternatives/vizard'                  },
            ].map(({ label, href }) => (
              <a key={href} href={href} style={{
                fontSize: '0.78rem', color: '#999', textDecoration: 'none',
                padding: '4px 10px', borderRadius: '4px', border: '1px solid #e5e5e5',
                transition: 'color 0.15s, border-color 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = '#cf1322'; e.currentTarget.style.borderColor = '#cf1322' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#999'; e.currentTarget.style.borderColor = '#e5e5e5' }}
              >{label}</a>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </section>
  )
}
