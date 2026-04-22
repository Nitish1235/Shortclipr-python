import { useState } from 'react'

const faqs = [
  {
    q: 'Which YouTube videos work best?',
    a: 'ShortClipr works on any public YouTube video. Talking-head content (interviews, podcasts, tutorials, vlogs) yields the best results since our AI can detect facial expressions and speech patterns. Cooking demos, review videos, and educational content also perform very well.',
  },
  {
    q: 'How long does processing take?',
    a: 'Average processing time is 3–8 minutes per video depending on length. A 1-hour video typically returns 5–10 scored clips in under 6 minutes. Pro users get priority queue access ensuring faster processing during peak hours.',
  },
  {
    q: 'Can I edit the clips after generation?',
    a: 'Yes. After clips are generated you can trim the exact start/end seconds, choose from 12 caption styles, change caption font & color, adjust the reframe crop zone, and add a custom intro/outro frame.',
  },
  {
    q: 'Are the clips copyright-safe to post?',
    a: 'You are responsible for ensuring you have rights to the source video. ShortClipr is designed for use with your own content or content where you hold a repurposing license.',
  },
  {
    q: 'Do you support languages other than English?',
    a: 'Yes — captions and viral-moment scoring support 28 languages including Spanish, French, German, Portuguese, Hindi, Japanese, and Korean. English and Spanish have the highest accuracy at 99%+.',
  },
]

const sectionLabel = {
  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
  textTransform: 'uppercase', letterSpacing: '0.12em',
  background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
  display: 'inline-block', padding: '4px 12px', marginBottom: '20px',
}

export default function FAQ() {
  const [open, setOpen] = useState(null)

  return (
    <section id="faq" style={{ padding: '90px 5%', borderTop: '2px dashed #1a3322' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <div style={sectionLabel}>FAQ.TXT</div>
        <h2 className="sec-title">QUESTIONS<br />ANSWERED.</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderBottom: '1px solid #1a3322' }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '20px 0', textAlign: 'left', gap: '16px',
                }}
              >
                <span style={{
                  fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: '1rem',
                  color: open === i ? 'var(--lime)' : 'var(--text)', transition: 'color 0.2s',
                }}>{faq.q}</span>
                <span style={{
                  color: 'var(--lime)', fontWeight: 700, fontSize: '1.1rem',
                  flexShrink: 0, transition: 'transform 0.3s',
                  transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}>▼</span>
              </button>
              {open === i && (
                <div style={{
                  paddingBottom: '20px', paddingLeft: '0',
                  fontFamily: "'Space Mono', monospace", fontSize: '0.88rem',
                  lineHeight: 1.75, color: 'var(--muted)',
                  borderLeft: '3px solid var(--lime)', paddingLeft: '16px',
                  animation: 'fadeIn 0.2s ease',
                }}>{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </section>
  )
}
