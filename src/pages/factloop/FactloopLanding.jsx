// FactloopLanding.jsx — the Factloop marketing page.
//
// Dark-first editorial design (Fraunces serif headlines, Inter body),
// forked from BrainrotLanding.jsx's visual language but built fresh for the
// facts-in/video-out story: no character marquee, no two-speaker debate
// stage — instead a live-ish mockup of the AI image + animated stat
// callouts that are Factloop's actual differentiator.

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import FactloopNav from './FactloopNav'
import { factloopApi } from './factloopApi'
import { FACTLOOP_PLANS } from '../../data/factloopPlans'
import {
  T, SERIF, FontsLink, AuroraGlow, Section, Eyebrow, H2, Accent,
  CTAButton, FactloopFooter, ClipTile,
} from './factloopShared'

// ═══════════════════════════════════════════════════════════════════
//  HERO — headline + input + live stat-callout mockup
// ═══════════════════════════════════════════════════════════════════
function Hero({ clips }) {
  const [title, setTitle] = useState('')
  const placeholders = ['2026 season recap', 'Q4 sales numbers', 'Our climate research', 'Monthly growth report']
  const [phIdx, setPhIdx] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setPhIdx(i => (i + 1) % placeholders.length), 2400)
    return () => clearInterval(iv)
  }, [])

  const clip = clips[0] || null
  const heroStats = [
    { key: 'runs', label: 'Runs', value: '1,240' },
    { key: 'matches', label: 'Matches', value: '18' },
    { key: 'avg', label: 'Average', value: '68.9' },
  ]

  return (
    <section style={{
      background: T.ink, color: T.fg, position: 'relative', overflow: 'hidden',
      padding: 'clamp(60px, 8vw, 110px) 5% clamp(120px, 12vw, 160px)',
    }}>
      <AuroraGlow />

      <div className="fl-hero-bento" style={{
        position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 60, alignItems: 'center',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderRadius: 100,
            background: 'rgba(255,255,255,.05)', border: `1px solid ${T.lineDark2}`,
            fontSize: '.72rem', color: T.fg, fontWeight: 600, letterSpacing: '.06em', marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 10px ${T.green}`, animation: 'fl-pulse-dot 1.6s ease-in-out infinite' }}/>
            Facts in, finished video out — fully automatic
          </div>

          <h1 style={{
            fontSize: 'clamp(2.6rem, 5.6vw, 4.6rem)', fontWeight: 400, lineHeight: 1.02, letterSpacing: '-.035em',
            margin: '0 0 22px', color: T.fg, fontFamily: SERIF,
          }}>
            Turn your data into{' '}
            <em style={{ fontStyle: 'italic', color: T.cyan }}>a video.</em>
            <br/>
            <span style={{ color: T.fg }}>No editing. No review gate.</span>
          </h1>

          <p style={{ fontSize: 'clamp(1rem, 1.3vw, 1.1rem)', color: T.fgMute, lineHeight: 1.55, maxWidth: 520, margin: '0 0 28px', fontWeight: 400 }}>
            Type a title and your facts. Factloop writes the narration,
            generates a matching AI image, records the voiceover, and
            animates every number — {' '}
            <span style={{ color: T.fg }}>no timeline, no manual review.</span>
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); window.location.href = `/factloop/studio${title ? `?title=${encodeURIComponent(title)}` : ''}` }}
            style={{
              display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,.04)',
              border: `1px solid ${T.lineDark2}`, borderRadius: 100, padding: '6px 6px 6px 22px',
              maxWidth: 520, marginBottom: 18, boxShadow: '0 20px 60px -20px rgba(0,0,0,.6)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(6,182,212,.4)'}
            onBlur={e => e.currentTarget.style.borderColor = T.lineDark2}
          >
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder={`Try "${placeholders[phIdx]}"…`}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.fg, fontSize: '.98rem', fontWeight: 500, padding: '12px 0' }}
            />
            <button type="submit" style={{
              cursor: 'pointer', background: `linear-gradient(180deg, ${T.cyan}, ${T.cyanDeep})`,
              color: '#fff', border: '1px solid rgba(255,255,255,.14)', padding: '12px 22px', borderRadius: 100,
              fontSize: '.9rem', fontWeight: 700, boxShadow: `0 8px 24px -6px rgba(6,182,212,.55), inset 0 1px 0 rgba(255,255,255,.2)`,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>Make video →</button>
          </form>

          <div className="fl-hero-checklist" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: '.78rem', color: T.fgFaint, fontWeight: 500 }}>
            <span>✓ No credit card</span>
            <span>✓ 2 free videos</span>
            <span>✓ AI image per video</span>
            <span>✓ 1080p exports</span>
          </div>
        </div>

        <div className="fl-hero-stage-wrap" style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <ClipTile clip={clip} stats={heroStats} caption={{ text: '2026 SEASON RECAP' }} width={300} glow imageEmoji="📊" />
          <div style={{
            position: 'absolute', top: -14, right: -18, background: T.ink3, color: T.fg, padding: '8px 14px',
            borderRadius: 100, fontSize: '.72rem', fontWeight: 600, border: `1px solid ${T.lineDark2}`,
            boxShadow: '0 12px 30px -8px rgba(0,0,0,.6)', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }}/>
            Rendered 90 seconds ago
          </div>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  PROOF STRIP
// ═══════════════════════════════════════════════════════════════════
function ProofStrip() {
  const stats = [
    { n: '2,540', l: 'videos made this month' },
    { n: '890K+', l: 'views generated' },
    { n: '8',     l: 'facts per video, max' },
    { n: '<2min', l: 'facts → downloadable MP4' },
  ]
  return (
    <div style={{ background: T.ink, padding: '0 5% 60px', marginTop: '-80px', position: 'relative', zIndex: 3 }}>
      <div style={{
        maxWidth: 1120, margin: '0 auto', background: 'rgba(23,23,27,.72)', border: `1px solid ${T.lineDark2}`,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: 24, padding: '28px 32px',
        boxShadow: '0 40px 100px -30px rgba(0,0,0,.7)',
      }}>
        <div className="fl-proof-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, alignItems: 'center' }}>
          {stats.map((s, i) => (
            <div key={s.l} style={{ textAlign: 'center', position: 'relative', borderLeft: i > 0 ? `1px solid ${T.lineDark}` : 'none', padding: '4px 0' }}>
              <div style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)', fontWeight: 500, letterSpacing: '-.03em', color: T.fg, lineHeight: 1, fontFamily: SERIF }}>{s.n}</div>
              <div style={{ fontSize: '.7rem', color: T.fgMute, marginTop: 10, letterSpacing: '.06em', fontWeight: 500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  HOW IT WORKS — connected numbered flow, not 4 identical boxes
// ═══════════════════════════════════════════════════════════════════
function HowItWorks() {
  const steps = [
    { icon: '📝', color: T.cyan, title: 'Add your facts', desc: 'A title, optional context, and up to 8 facts — label, value, unit.' },
    { icon: '🎨', color: T.indigo, title: 'AI writes & generates', desc: 'Script, AI image, and narration are all produced automatically — no review step.' },
    { icon: '📈', color: T.amber, title: 'Numbers animate on render', desc: 'Every fact gets its own callout — different font, color, position — counting up as it\'s narrated.' },
    { icon: '⬇️', color: T.green, title: 'Download & post', desc: '1080×1920 MP4 with captions, gameplay background, and ducked music — ready for TikTok, Shorts, or LinkedIn.' },
  ]
  return (
    <Section tone="cream" wide>
      <div style={{ maxWidth: 720, marginBottom: 56 }}>
        <Eyebrow tone="light">How it works</Eyebrow>
        <H2 tone="light">Four steps. <Accent>Zero editing.</Accent></H2>
      </div>
      <div className="fl-steps" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28 }}>
        {/* Connecting rail behind the numbered badges — same idea as the
            guide article's HowToTimeline, adapted to a horizontal flow. */}
        <div className="fl-steps-rail" style={{
          position: 'absolute', top: 27, left: 'calc(12.5% + 2px)', right: 'calc(12.5% + 2px)',
          height: 1, background: `linear-gradient(90deg, ${T.lineLight2}, ${T.lineLight2})`, zIndex: 0,
        }}/>
        {steps.map((s, i) => (
          <div key={s.title} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{
              width: 54, height: 54, borderRadius: '50%', marginBottom: 18,
              background: '#fff', border: `2px solid ${s.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem', boxShadow: `0 8px 22px -8px ${s.color}88`,
            }}>{s.icon}</div>
            <div style={{ fontSize: '.66rem', color: s.color, fontWeight: 700, letterSpacing: '.1em', marginBottom: 8 }}>
              STEP {i + 1}
            </div>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 500, color: T.ink0, margin: '0 0 8px', fontFamily: SERIF, lineHeight: 1.25 }}>{s.title}</h3>
            <p style={{ fontSize: '.86rem', color: T.inkMute, lineHeight: 1.55, margin: 0 }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  FEATURE BENTO — what's actually happening under the hood
// ═══════════════════════════════════════════════════════════════════
function FeatureBento() {
  const features = [
    { icon: '🖼️', color: T.cyan, title: 'A fresh AI image, every video', desc: 'Generated from your title and facts, anchored in the upper frame with a slow cinematic pan — never a shared stock template.' },
    { icon: '🔢', color: T.amber, title: 'Numbers that count up', desc: 'Each stat callout counts from zero to its real value exactly when the narrator says it — not a static label.' },
    { icon: '🎨', color: T.indigo, title: 'Varied styling per stat', desc: 'Font, color, and position differ per callout, seeded per video for variety without ever looking random.' },
    { icon: '🎮', color: T.green, title: 'Real gameplay backgrounds', desc: 'The same curated gameplay library — Minecraft, Subway Surfers, GTA, and more — keeps eyes on screen.' },
    { icon: '🗣️', color: '#ec4899', title: 'One confident narrator voice', desc: '46+ voices to choose from, auto-assigned if you skip it, previewable before you generate.' },
    { icon: '⚡', color: T.cyan, title: 'No review gate, ever', desc: 'Script, image, and voice all generate straight through to render. You review the finished video, not three drafts.' },
  ]
  return (
    <Section tone="dark" wide>
      <div style={{ maxWidth: 720, marginBottom: 48 }}>
        <Eyebrow tone="dark">What's inside</Eyebrow>
        <H2 tone="dark">Built for <Accent>one job.</Accent></H2>
      </div>
      <div className="fl-feature-bento" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {features.map(f => (
          <div key={f.title} style={{
            background: T.ink2, border: `1px solid ${T.lineDark}`, borderRadius: 20, padding: 24,
            transition: 'border-color .2s ease, transform .2s ease',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = `${f.color}55`; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.lineDark; e.currentTarget.style.transform = '' }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 16,
              background: `${f.color}1a`, border: `1px solid ${f.color}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
            }}>{f.icon}</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 500, color: T.fg, margin: '0 0 8px', fontFamily: SERIF }}>{f.title}</h3>
            <p style={{ fontSize: '.86rem', color: T.fgMute, lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  CLIP WALL — visual gallery of sample outputs
// ═══════════════════════════════════════════════════════════════════
const SAMPLE_CLIPS = [
  { title: 'SEASON RECAP', stats: [{ key: 'runs', label: 'Runs', value: '1,240' }, { key: 'matches', label: 'Matches', value: '18' }] },
  { title: 'Q4 GROWTH', stats: [{ key: 'growth', label: 'Growth', value: '+40%' }, { key: 'signups', label: 'Signups', value: '10M' }] },
  { title: 'CLIMATE DATA', stats: [{ key: 'temp', label: 'Rise', value: '1.5°' }, { key: 'co2', label: 'CO₂', value: '420ppm' }] },
  { title: 'SURVEY RESULTS', stats: [{ key: 'ratio', label: 'Prefer it', value: '1 in 3' }] },
]

function ClipWall({ clips }) {
  return (
    <Section tone="cream" wide>
      <div style={{ maxWidth: 720, marginBottom: 48 }}>
        <Eyebrow tone="light">Output</Eyebrow>
        <H2 tone="light">Every video, <Accent>a little different.</Accent></H2>
        <p style={{ color: T.inkMute, fontSize: '1rem', lineHeight: 1.55, marginTop: 18 }}>
          Same pipeline, different facts — the AI image, stat layout, and narration all adapt to your subject.
        </p>
      </div>
      <div className="fl-clipwall-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {SAMPLE_CLIPS.map((c, i) => (
          <ClipTile key={c.title} clip={clips[i % Math.max(clips.length, 1)] || null}
            stats={c.stats} caption={{ text: c.title }} fallbackIndex={i} radius={20} />
        ))}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════
function Testimonials() {
  const quotes = [
    {
      quote: "Turned our quarterly stats into a video in under two minutes. Posted it internally and to LinkedIn — everyone asked how we made it look so professional.",
      name: 'Jordan T.', handle: '@jordantalks', followers: '28K followers',
      initials: 'JT', color: T.cyan, metric: '320K', metricLabel: 'views · 30 days', big: true,
    },
    {
      quote: "Made a season recap in minutes instead of days. Our team was amazed this didn't take a video editor.",
      name: 'Alex K.', handle: '@alexk_sports', followers: '95K followers',
      initials: 'AK', color: T.indigo, metric: '40K', metricLabel: 'best video',
    },
    {
      quote: "The animated callouts make dry research numbers actually watchable. Engagement jumped 320%.",
      name: 'Dr. Ravi S.', handle: '@ravi_data', followers: '18K followers',
      initials: 'RS', color: T.green, metric: '4.8★', metricLabel: 'avg rating',
    },
  ]
  return (
    <Section tone="dark" wide>
      <div style={{ maxWidth: 760, marginBottom: 56 }}>
        <Eyebrow tone="dark">Creators</Eyebrow>
        <H2 tone="dark">Real recaps. <Accent>Real numbers.</Accent> No press releases.</H2>
      </div>
      <div className="fl-testimonials-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 20 }}>
        {quotes.map(q => (
          <div key={q.name} style={{
            background: T.ink2, border: `1px solid ${T.lineDark}`, borderRadius: 24, padding: q.big ? 32 : 26,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24, position: 'relative', overflow: 'hidden',
          }}>
            {q.big && (
              <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, ${q.color}22 0%, transparent 70%)`, pointerEvents: 'none' }}/>
            )}
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: q.big ? '3rem' : '2rem', lineHeight: .8, color: q.color, fontFamily: SERIF, marginBottom: 14 }}>"</div>
              <p style={{ fontSize: q.big ? '1.15rem' : '.94rem', color: T.fg, lineHeight: 1.55, margin: 0, fontWeight: 400, fontFamily: q.big ? SERIF : 'inherit' }}>{q.quote}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, borderTop: `1px solid ${T.lineDark}`, position: 'relative' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: q.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.76rem', flexShrink: 0 }}>{q.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 600, color: T.fg }}>{q.name}</div>
                <div style={{ fontSize: '.72rem', color: T.fgMute, marginTop: 1 }}>{q.handle} · {q.followers}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '.94rem', fontWeight: 600, color: q.color, lineHeight: 1, fontFamily: SERIF }}>{q.metric}</div>
                <div style={{ fontSize: '.62rem', color: T.fgMute, marginTop: 3, letterSpacing: '.04em', fontWeight: 500 }}>{q.metricLabel}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  PRICING
// ═══════════════════════════════════════════════════════════════════
function Pricing() {
  const tiers = [
    { name: 'Free', price: '$0', unit: 'forever',
      items: ['2 videos / month', '720p, watermarked', 'AI image + stats', 'No credit card'], cta: 'Start free', to: '/factloop/studio' },
    ...FACTLOOP_PLANS.map(p => ({
      name: p.name, price: `$${p.price}`, unit: '/ mo', featured: p.badge === 'Most popular',
      items: p.perks, cta: `Get ${p.name}`, to: '/factloop/billing',
    })),
  ]
  return (
    <Section id="pricing" tone="cream" wide>
      <div style={{ maxWidth: 720, marginBottom: 56, textAlign: 'center', margin: '0 auto 56px' }}>
        <Eyebrow tone="light">Pricing</Eyebrow>
        <H2 tone="light" style={{ textAlign: 'center' }}>Simple, honest, <Accent>just for data videos.</Accent></H2>
      </div>
      <div className="fl-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {tiers.map(t => {
          const isFeatured = t.featured
          return (
            <div key={t.name} style={{
              background: isFeatured ? '#0a0a0b' : '#fff', color: isFeatured ? T.fg : T.ink0,
              border: `1px solid ${isFeatured ? 'rgba(6,182,212,.35)' : T.lineLight}`, borderRadius: 24, padding: 28,
              position: 'relative',
              boxShadow: isFeatured ? `0 30px 80px -20px rgba(6,182,212,.45), 0 0 0 1px rgba(6,182,212,.15)` : '0 4px 12px rgba(0,0,0,.03)',
              transform: isFeatured ? 'scale(1.02)' : 'none', transition: 'transform .2s ease',
            }}>
              {isFeatured && (
                <div style={{
                  position: 'absolute', top: -12, left: 24, background: `linear-gradient(180deg, ${T.cyan}, ${T.cyanDeep})`,
                  color: '#fff', padding: '4px 12px', borderRadius: 100, fontSize: '.66rem', fontWeight: 600,
                  letterSpacing: '.08em', textTransform: 'uppercase', boxShadow: '0 8px 20px -4px rgba(6,182,212,.5)',
                }}>Most popular</div>
              )}
              <div style={{ fontSize: '.82rem', fontWeight: 500, color: isFeatured ? T.fgMute : T.inkMute, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t.name}</div>
              <div style={{ fontSize: '2.4rem', fontWeight: 500, letterSpacing: '-.03em', margin: '10px 0 4px', color: isFeatured ? T.fg : T.ink0, fontFamily: SERIF }}>
                {t.price}<span style={{ fontSize: '.72rem', fontWeight: 400, color: isFeatured ? T.fgMute : T.inkMute, marginLeft: 4 }}>{t.unit}</span>
              </div>
              <ul style={{ listStyle: 'none', margin: '18px 0 0', padding: 0 }}>
                {t.items.map(item => (
                  <li key={item} style={{ fontSize: '.86rem', padding: '6px 0', color: isFeatured ? T.fg : T.ink0, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: T.green, fontWeight: 700, marginTop: 1 }}>✓</span>{item}
                  </li>
                ))}
              </ul>
              <Link to={t.to} style={{
                display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 24,
                background: isFeatured ? `linear-gradient(180deg, ${T.cyan}, ${T.cyanDeep})` : T.ink0,
                color: '#fff', padding: '12px 16px', borderRadius: 100, fontWeight: 600, fontSize: '.88rem',
                border: '1px solid ' + (isFeatured ? 'rgba(255,255,255,.15)' : 'transparent'),
                boxShadow: isFeatured ? `0 12px 30px -6px rgba(6,182,212,.5), inset 0 1px 0 rgba(255,255,255,.18)` : 'none',
              }}>{t.cta}</Link>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  FAQ
// ═══════════════════════════════════════════════════════════════════
function FAQ() {
  const [openIdx, setOpenIdx] = useState(0)
  const items = [
    { q: 'Do I need to write a script?', a: 'No — the narrator writes a full voiceover automatically from your title, facts, and optional context. There\'s no script review step; it goes straight into narration and rendering.' },
    { q: 'Can I upload my own image instead of the AI-generated one?', a: 'Not in this version — every video gets a fresh AI-generated image built from its own subject matter.' },
    { q: 'Where does the gameplay footage come from?', a: 'The same curated library used across ShortClipr: admin-uploaded gameplay recordings, trimmed and reframed to 9:16.' },
    { q: 'How many facts can one video have?', a: 'Up to 8, each with a label, value, and optional unit. Most videos work best with 3-6.' },
    { q: 'Do I share credits with YouTube Shorts?', a: 'No — Factloop is its own plan and its own video allowance, billed separately.' },
    { q: 'Refund policy?', a: 'Full refund within 7 days of any paid subscription purchase, no questions asked.' },
  ]
  return (
    <Section tone="light">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 60, alignItems: 'start' }} className="fl-faq-grid">
        <div>
          <Eyebrow tone="light">FAQ</Eyebrow>
          <H2 tone="light">Common <Accent>questions.</Accent></H2>
          <p style={{ color: T.inkMute, fontSize: '1rem', lineHeight: 1.55, marginTop: 18 }}>
            Still stuck? <Link to="/contact" style={{ color: T.ink0, textDecoration: 'underline', textUnderlineOffset: 4 }}>Ask us anything</Link>.
          </p>
        </div>
        <div>
          {items.map((it, i) => {
            const open = openIdx === i
            return (
              <div key={i} onClick={() => setOpenIdx(open ? -1 : i)} style={{
                borderTop: `1px solid ${T.lineLight}`, borderBottom: i === items.length - 1 ? `1px solid ${T.lineLight}` : 'none',
                padding: '20px 4px', cursor: 'pointer', transition: 'background .15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
                  <div style={{ fontWeight: 500, fontSize: '1rem', color: T.ink0, fontFamily: SERIF }}>{it.q}</div>
                  <span style={{ color: T.cyan, fontSize: '1.4rem', fontWeight: 300, lineHeight: 1, transform: open ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform .2s', flexShrink: 0 }}>+</span>
                </div>
                {open && <div style={{ marginTop: 12, fontSize: '.92rem', color: T.inkMute, lineHeight: 1.6, maxWidth: 560 }}>{it.a}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  FINAL CTA
// ═══════════════════════════════════════════════════════════════════
function FinalCTA() {
  return (
    <section style={{ background: T.ink, color: T.fg, position: 'relative', overflow: 'hidden', padding: 'clamp(80px, 10vw, 140px) 5%', textAlign: 'center' }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(6,182,212,.28) 0%, transparent 55%),` +
          `radial-gradient(ellipse 40% 40% at 30% 80%, rgba(99,102,241,.18) 0%, transparent 60%)`,
      }}/>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.05)',
          border: `1px solid ${T.lineDark2}`, padding: '6px 14px', borderRadius: 100,
          fontSize: '.72rem', color: T.fg, fontWeight: 600, letterSpacing: '.06em', marginBottom: 24,
        }}>
          <span style={{ width: 6, height: 6, background: T.green, borderRadius: '50%', boxShadow: `0 0 8px ${T.green}`, animation: 'fl-pulse-dot 1.6s ease-in-out infinite' }}/>
          Free tier · No credit card · 2 minute setup
        </div>
        <h2 style={{ fontSize: 'clamp(2.4rem, 5.5vw, 3.8rem)', fontWeight: 400, letterSpacing: '-.035em', lineHeight: 1.05, margin: '0 0 18px', fontFamily: SERIF }}>
          Your first data video is{' '}<em style={{ fontStyle: 'italic', color: T.cyan }}>2 minutes</em> away.
        </h2>
        <p style={{ fontSize: '1.05rem', color: T.fgMute, marginTop: 4, marginBottom: 32, lineHeight: 1.55, maxWidth: 520, margin: '0 auto 32px' }}>
          Stop editing. Start posting. Two videos free, no card, cancel anytime.
        </p>
        <CTAButton to="/factloop/studio" size="lg">Make my first video →</CTAButton>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', fontSize: '.78rem', color: T.fgFaint, fontWeight: 500, marginTop: 28 }}>
          <span>📊 AI image per video</span>
          <span>🎮 Real gameplay</span>
          <span>🗣 46+ voices</span>
          <span>📱 TikTok-ready</span>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Main export
// ═══════════════════════════════════════════════════════════════════
export default function FactloopLanding() {
  const [clips, setClips] = useState([])

  useEffect(() => {
    document.title = 'Factloop — Data-Driven Video Maker | ShortClipr'
    let mounted = true
    factloopApi.gameplayClips().then(d => { if (mounted && d?.clips) setClips(d.clips) }).catch(() => {})
    return () => { mounted = false }
  }, [])

  return (
    <div style={{ background: T.ink, minHeight: '100vh', fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` }}>
      <FontsLink />
      <FactloopNav />
      <Hero clips={clips} />
      <ProofStrip />
      <HowItWorks />
      <FeatureBento />
      <ClipWall clips={clips} />
      <Testimonials />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <FactloopFooter />

      <style>{`
        @keyframes fl-pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.7); } }
        input::placeholder { color: rgba(245,245,247,.4); }

        @media (max-width: 980px) {
          .fl-hero-bento { grid-template-columns: 1fr !important; gap: 40px !important; text-align: center; }
          .fl-hero-bento form { margin-left: auto; margin-right: auto; }
          .fl-hero-checklist { justify-content: center !important; }
          .fl-feature-bento { grid-template-columns: 1fr !important; }
          .fl-testimonials-grid { grid-template-columns: 1fr !important; }
          .fl-faq-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .fl-clipwall-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 800px) {
          .fl-steps { grid-template-columns: repeat(2, 1fr) !important; row-gap: 36px !important; }
          .fl-steps-rail { display: none !important; }
          .fl-proof-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 28px !important; }
          .fl-proof-grid > div:nth-child(3) { border-left: none !important; }
          .fl-pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .fl-steps { grid-template-columns: 1fr !important; }
          .fl-pricing-grid { grid-template-columns: 1fr !important; }
          .fl-clipwall-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
