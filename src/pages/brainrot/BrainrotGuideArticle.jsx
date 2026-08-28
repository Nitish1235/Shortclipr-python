// BrainrotGuideArticle.jsx — a single /brainrot/guides/:slug page.
//
// Structure:
//   1. Cinematic dark hero — gameplay bg + characters silhouetted, article
//      title overlaid, meta chips.
//   2. Reading section on warm cream — editorial serif H2s, Fraunces.
//      Formula strip re-designed with big character portraits.
//   3. How-to timeline, takeaways glow card, hairline FAQ.
//   4. Visual related-tools & related-guides strips (ClipTiles, not chips).
//   5. Dark final CTA + shared footer.

import { useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotGuidesContent, { brainrotGuideSlugs } from '../../data/brainrotGuidesContent'
import brainrotToolsContent from '../../data/brainrotToolsContent'
import brainrotAlternativesContent from '../../data/brainrotAlternativesContent'
import {
  T, SERIF, FontsLink, AuroraGlow, Section, Eyebrow, H2, Accent,
  CTAButton, Chip, BrainrotFooter, ClipTile, GUIDE_MEDIA, useBrainrotMedia,
} from './brainrotShared'

// ═══════════════════════════════════════════════════════════════════
//  HERO — full-bleed dark, character+gameplay composite behind title
// ═══════════════════════════════════════════════════════════════════
function ArticleHero({ data, chars, clip, media }) {
  return (
    <section style={{
      position: 'relative', overflow: 'hidden',
      background: T.ink, color: T.fg,
      minHeight: 560,
      padding: 'clamp(80px, 8vw, 120px) 5% clamp(60px, 7vw, 90px)',
    }}>
      {/* Full-bleed gameplay backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        ...ClipTileBg(clip, media?.gameplay),
      }}/>
      {/* Dark scrim so text stays legible */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background:
          `linear-gradient(180deg, rgba(10,10,11,.6) 0%, rgba(10,10,11,.85) 70%, ${T.ink} 100%),` +
          `radial-gradient(ellipse 60% 40% at 20% 100%, rgba(255,48,73,.35) 0%, transparent 55%)`,
      }}/>
      {/* Autoplay gameplay video if we have one, at 30% opacity */}
      {clip?.gcs_path && (
        <video
          src={clip.gcs_path} autoPlay muted loop playsInline preload="metadata"
          style={{
            position: 'absolute', inset: 0, zIndex: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            opacity: .5, mixBlendMode: 'luminosity',
          }}
        />
      )}

      <div style={{
        position: 'relative', zIndex: 2,
        maxWidth: 1200, margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1.35fr .65fr',
        gap: 60, alignItems: 'end',
      }}
        className="br-article-hero"
      >
        {/* Left: title + meta */}
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
            <Chip tone="dark" accent>{data.category}</Chip>
            <Chip tone="dark">{data.badge}</Chip>
            <Chip tone="dark">{data.readTime}</Chip>
            <Chip tone="dark">{data.updated}</Chip>
          </div>

          <h1 style={{
            fontSize: 'clamp(2.4rem, 5.4vw, 4.2rem)',
            fontWeight: 400, letterSpacing: '-.035em', lineHeight: 1.04,
            margin: '0 0 24px', color: T.fg,
            fontFamily: SERIF,
            textShadow: '0 4px 30px rgba(0,0,0,.5)',
          }}>
            {data.h1}
          </h1>
          <p style={{
            fontSize: 'clamp(1rem, 1.3vw, 1.15rem)',
            color: 'rgba(245,245,247,.85)', lineHeight: 1.55,
            margin: 0, maxWidth: 620,
            textShadow: '0 2px 10px rgba(0,0,0,.4)',
          }}>{data.subhead}</p>

          {chars.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 28,
              padding: '10px 16px 10px 12px', borderRadius: 100,
              background: 'rgba(0,0,0,.5)',
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${T.lineDark2}`,
              width: 'fit-content',
            }}>
              <div style={{ display: 'flex' }}>
                {chars.slice(0, 2).map((ch, i) => (
                  <img key={ch.id} src={ch.image_url} alt=""
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      border: '2px solid rgba(0,0,0,.6)', objectFit: 'cover',
                      background: T.ink3, marginLeft: i > 0 ? -8 : 0,
                    }}
                    onError={e => e.currentTarget.style.display = 'none'}/>
                ))}
              </div>
              <div style={{ fontSize: '.78rem', color: T.fg, fontWeight: 500 }}>
                Starring {chars.map(c => c.name.split(' ')[0]).join(' & ')}
              </div>
            </div>
          )}
        </div>

        {/* Right: character postcard — floating */}
        <div style={{ display: 'flex', justifyContent: 'center' }}
          className="br-article-hero-tile"
        >
          <ClipTile
            characters={chars} clip={clip}
            width={240} glow
            caption={{ text: chars[0]?.name.split(' ')[0].toUpperCase() + ' SPEAKS' }}
          />
        </div>
      </div>
    </section>
  )
}
// helper — background style extraction for a raw div
function ClipTileBg(clip, cat) {
  if (clip?.thumbnail_url) return { background: `#000 url(${clip.thumbnail_url}) center/cover no-repeat` }
  const key = (clip?.category || cat || 'default').toLowerCase().replace(/\s+/g, '_')
  const BG = {
    minecraft: 'linear-gradient(180deg, #4a7c1e, #2d4a12)',
    subway_surfers: 'linear-gradient(180deg, #f97316 0%, #7c2d12 100%)',
    gta: 'radial-gradient(ellipse at 50% 100%, #7c3aed, #1e1b4b 100%)',
    fortnite: 'linear-gradient(160deg, #6d28d9 0%, #ec4899 100%)',
    parkour: 'linear-gradient(180deg, #0ea5e9, #0c4a6e)',
    rocket_league: 'radial-gradient(ellipse at 50% 90%, #f59e0b, #451a03)',
    default: T.ink,
  }
  return { background: BG[key] || BG.default }
}

// ═══════════════════════════════════════════════════════════════════
//  FORMULA — re-designed with real character portraits
// ═══════════════════════════════════════════════════════════════════
function FormulaStrip({ formula, charById }) {
  if (!formula) return null

  const items = formula.items.map(it => ({
    ...it,
    resolved: it.type === 'char' ? charById[it.id] : null,
  }))

  const cell = (it, i) => (
    <div key={i} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      minWidth: 110,
    }}>
      <div style={{
        width: 88, height: 88, borderRadius: 20,
        overflow: 'hidden', position: 'relative',
        background: it.type === 'char' ? T.ink3 : T.cream2,
        border: `1px solid ${T.lineLight2}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem',
        boxShadow: '0 8px 20px -6px rgba(0,0,0,.15)',
      }}>
        {it.type === 'char' && it.resolved
          ? <img src={it.resolved.image_url} alt={it.resolved.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => e.currentTarget.style.display = 'none'}/>
          : (it.type === 'char'
              ? <img src={`/brainrot-characters/${it.id}.webp`} alt={it.label}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => e.currentTarget.style.display = 'none'}/>
              : <span aria-hidden="true">{it.icon}</span>)
        }
      </div>
      <span style={{
        fontSize: '.76rem', fontWeight: 500,
        color: T.ink0, textAlign: 'center',
        maxWidth: 110, lineHeight: 1.3,
      }}>{it.label}</span>
    </div>
  )

  const op = (symbol) => (
    <div style={{
      fontSize: '1.6rem', color: T.red, fontWeight: 400,
      fontFamily: SERIF, fontStyle: 'italic',
      alignSelf: 'flex-start', paddingTop: 30,
    }}>{symbol}</div>
  )

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap',
      gap: 20, justifyContent: 'center',
      padding: '32px 24px',
      background: '#fff',
      border: `1px solid ${T.lineLight}`,
      borderRadius: 24,
      margin: '20px 0 44px',
      boxShadow: '0 20px 50px -20px rgba(0,0,0,.1)',
    }}
      role="img" aria-label={formula.alt}
    >
      {items.map((it, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {cell(it, i)}
          {i < items.length - 1 && op('+')}
        </div>
      ))}
      {op('=')}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 120,
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: 20,
          background: `linear-gradient(180deg, ${T.red}, ${T.redDeep})`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem', boxShadow: `0 12px 30px -8px rgba(255,48,73,.5)`,
        }}>
          <span aria-hidden="true">{formula.result.icon}</span>
        </div>
        <span style={{
          fontSize: '.76rem', fontWeight: 600, color: T.red,
          textAlign: 'center', maxWidth: 120, lineHeight: 1.3,
          letterSpacing: '.02em',
        }}>{formula.result.label}</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  ARTICLE BODY — cream editorial section
// ═══════════════════════════════════════════════════════════════════
function ArticleBody({ data, charById }) {
  return (
    <section style={{
      background: T.cream, color: T.ink0,
      padding: 'clamp(60px, 7vw, 100px) 5%',
    }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <FormulaStrip formula={data.formula} charById={charById} />

        <p style={{
          fontSize: '1.14rem', lineHeight: 1.75, color: T.ink0,
          margin: '0 0 44px', fontWeight: 400,
          fontFamily: SERIF, fontStyle: 'italic',
        }}>{data.intro}</p>

        {data.sections.map((sec, si) => (
          <div key={sec.h2} style={{ marginBottom: 44 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20,
            }}>
              <span style={{
                fontFamily: SERIF, color: T.red, fontStyle: 'italic',
                fontSize: '1.2rem', lineHeight: 1,
              }}>§ {String(si + 1).padStart(2, '0')}</span>
              <h2 style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1.15,
                margin: 0, color: T.ink0, fontFamily: SERIF,
              }}>{sec.h2}</h2>
            </div>
            {sec.body.map((p, i) => (
              <p key={i} style={{
                fontSize: '1rem', lineHeight: 1.75, color: '#2a2a2e',
                margin: '0 0 16px',
              }}>{p}</p>
            ))}
            {sec.list && (
              <ul style={{ margin: '20px 0 0', padding: 0, listStyle: 'none' }}>
                {sec.list.map((li, i) => (
                  <li key={i} style={{
                    position: 'relative', paddingLeft: 26,
                    fontSize: '.96rem', lineHeight: 1.65, color: '#2a2a2e',
                    marginBottom: 10,
                  }}>
                    <span style={{
                      position: 'absolute', left: 0, top: 10,
                      width: 12, height: 1, background: T.red,
                    }}/>
                    {li}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  HOW-TO TIMELINE — vertical, editorial
// ═══════════════════════════════════════════════════════════════════
function HowToTimeline({ howTo }) {
  if (!howTo) return null
  return (
    <Section tone="light">
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <Eyebrow tone="light">How to do it</Eyebrow>
        <H2 tone="light">{howTo.title}</H2>

        <ol style={{
          listStyle: 'none', margin: '40px 0 0', padding: 0,
          position: 'relative',
        }}>
          {/* Continuous rail */}
          <div style={{
            position: 'absolute', left: 22, top: 12, bottom: 12, width: 1,
            background: `linear-gradient(180deg, transparent, ${T.lineLight2} 10%, ${T.lineLight2} 90%, transparent)`,
          }}/>

          {howTo.steps.map((s, i) => (
            <li key={i} style={{
              position: 'relative', display: 'flex', gap: 22,
              padding: '18px 0',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#fff', color: T.ink0, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: '.94rem',
                border: `1px solid ${T.lineLight2}`,
                boxShadow: '0 4px 12px rgba(0,0,0,.06)',
                fontFamily: SERIF, position: 'relative', zIndex: 1,
              }}>{i + 1}</div>
              <div>
                <h3 style={{
                  fontSize: '1.08rem', fontWeight: 500,
                  color: T.ink0, margin: '10px 0 6px',
                  fontFamily: SERIF,
                }}>{s.title}</h3>
                <p style={{
                  fontSize: '.94rem', color: T.inkMute, lineHeight: 1.65,
                  margin: 0, maxWidth: 640,
                }}>{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  TAKEAWAYS — dark glow card, editorial
// ═══════════════════════════════════════════════════════════════════
function Takeaways({ takeaways }) {
  if (!takeaways?.length) return null
  return (
    <Section tone="dark">
      <div style={{
        maxWidth: 820, margin: '0 auto',
        background: T.ink2, border: `1px solid rgba(255,48,73,.25)`,
        borderRadius: 28, padding: 'clamp(32px, 5vw, 48px)',
        boxShadow: `0 30px 80px -20px rgba(255,48,73,.35), 0 0 0 1px rgba(255,48,73,.15)`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 300, height: 300, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(255,48,73,.3), transparent 70%)`,
          pointerEvents: 'none',
        }}/>
        <div style={{ position: 'relative' }}>
          <Eyebrow tone="dark">The gist</Eyebrow>
          <h2 style={{
            fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 500,
            letterSpacing: '-.02em', margin: '14px 0 28px',
            color: T.fg, fontFamily: SERIF,
          }}>Key takeaways</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {takeaways.map((t, i) => (
              <li key={i} style={{
                position: 'relative', paddingLeft: 34,
                fontSize: '1rem', lineHeight: 1.65, color: T.fg,
                marginBottom: 14,
              }}>
                <span style={{
                  position: 'absolute', left: 0, top: 2,
                  width: 22, height: 22, borderRadius: '50%',
                  background: `linear-gradient(180deg, ${T.red}, ${T.redDeep})`,
                  color: '#fff', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '.72rem', fontWeight: 800,
                  boxShadow: `0 4px 10px rgba(255,48,73,.4)`,
                }}>{i + 1}</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  FAQ — hairline accordion (open first item, single-open)
// ═══════════════════════════════════════════════════════════════════
function FAQ({ faqs }) {
  const [open, setOpen] = useState(0)
  if (!faqs?.length) return null
  return (
    <Section tone="cream">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 60, alignItems: 'start' }}
        className="br-faq-grid"
      >
        <div>
          <Eyebrow tone="light">FAQ</Eyebrow>
          <H2 tone="light">Common <Accent>questions.</Accent></H2>
        </div>
        <div>
          {faqs.map((it, i) => {
            const isOpen = open === i
            return (
              <div key={i} onClick={() => setOpen(isOpen ? -1 : i)} style={{
                borderTop: `1px solid ${T.lineLight}`,
                borderBottom: i === faqs.length - 1 ? `1px solid ${T.lineLight}` : 'none',
                padding: '20px 4px', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
                  <div style={{ fontWeight: 500, fontSize: '1rem', color: T.ink0, fontFamily: SERIF }}>
                    {it.q}
                  </div>
                  <span style={{
                    color: T.red, fontSize: '1.4rem', fontWeight: 300, lineHeight: 1,
                    transform: isOpen ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform .2s',
                  }}>+</span>
                </div>
                {isOpen && <div style={{
                  marginTop: 12, fontSize: '.94rem', color: T.inkMute, lineHeight: 1.65,
                  maxWidth: 620,
                }}>{it.a}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  RELATED — visual cards for tools + guides
// ═══════════════════════════════════════════════════════════════════
function Related({ relatedTools, relatedAlts, otherGuides, charById, clips }) {
  const clipByCat = (cat) => clips.find(cl => (cl.category || '').toLowerCase() === cat) || null

  return (
    <Section tone="dark" wide>
      <div style={{ marginBottom: 40 }}>
        <Eyebrow tone="dark">Keep going</Eyebrow>
        <H2 tone="dark">Where to <Accent>read next.</Accent></H2>
      </div>

      <div className="br-related-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16,
      }}>
        {otherGuides.slice(0, 3).map((slug, i) => {
          const g = brainrotGuidesContent[slug]
          const m = GUIDE_MEDIA[slug] || {}
          const chars = (m.charIds || []).map(id => charById[id]).filter(Boolean)
          const clip = clipByCat(m.gameplay)
          return (
            <Link key={slug} to={`/brainrot/guides/${slug}`} style={{
              background: T.ink2, border: `1px solid ${T.lineDark}`,
              borderRadius: 20, overflow: 'hidden',
              textDecoration: 'none', color: T.fg, display: 'flex', flexDirection: 'column',
              transition: 'transform .2s ease, border-color .2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(255,48,73,.3)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = T.lineDark }}
            >
              <ClipTile
                characters={chars} clip={clip}
                aspect="16 / 10" radius={0}
                fallbackIndex={i}
              />
              <div style={{ padding: 20 }}>
                <div style={{ fontSize: '.66rem', color: T.fgMute, letterSpacing: '.1em', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                  Guide · {g.readTime}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 500, color: T.fg, fontFamily: SERIF, lineHeight: 1.25 }}>
                  {g.h1.replace(/ — .+$/, '').replace(/: The Complete 2025 Guide$/, '')}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {(relatedTools.length > 0 || relatedAlts.length > 0) && (
        <div className="br-related-links" style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 32,
        }}>
          {relatedTools.map(s => (
            <Link key={s} to={`/brainrot/tools/${s}`} style={{
              fontSize: '.82rem', fontWeight: 500,
              color: T.fg, textDecoration: 'none',
              padding: '10px 16px', borderRadius: 100,
              background: 'rgba(255,255,255,.04)',
              border: `1px solid ${T.lineDark2}`,
            }}>Tool: {brainrotToolsContent[s].h1.replace(/ — .+$/, '').replace(/^Free /, '')}</Link>
          ))}
          {relatedAlts.map(s => (
            <Link key={s} to={`/brainrot/alternatives/${s}`} style={{
              fontSize: '.82rem', fontWeight: 500,
              color: T.fg, textDecoration: 'none',
              padding: '10px 16px', borderRadius: 100,
              background: 'rgba(255,48,73,.08)',
              border: `1px solid rgba(255,48,73,.3)`,
            }}>vs {brainrotAlternativesContent[s].name}</Link>
          ))}
        </div>
      )}
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  FINAL CTA
// ═══════════════════════════════════════════════════════════════════
function FinalCTA() {
  return (
    <section style={{
      background: T.ink, color: T.fg, position: 'relative', overflow: 'hidden',
      padding: 'clamp(80px, 10vw, 140px) 5%', textAlign: 'center',
    }}>
      <AuroraGlow />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,.05)',
          border: `1px solid ${T.lineDark2}`,
          padding: '6px 14px', borderRadius: 100,
          fontSize: '.72rem', color: T.fg, fontWeight: 600,
          letterSpacing: '.06em', marginBottom: 22,
        }}>
          <span style={{
            width: 6, height: 6, background: T.green, borderRadius: '50%',
            boxShadow: `0 0 8px ${T.green}`,
          }}/>
          You've read the guide. Now use it.
        </div>
        <h2 style={{
          fontSize: 'clamp(2.2rem, 5.2vw, 3.6rem)',
          fontWeight: 400, letterSpacing: '-.035em', lineHeight: 1.05,
          margin: '0 0 18px', fontFamily: SERIF,
        }}>
          Two clips are on <em style={{ fontStyle: 'italic', color: T.red }}>us.</em>
        </h2>
        <p style={{
          fontSize: '1.05rem', color: T.fgMute, lineHeight: 1.55,
          maxWidth: 520, margin: '0 auto 30px',
        }}>
          Put this guide into practice. Full character library, no credit
          card, cancel anytime.
        </p>
        <CTAButton to="/brainrot/studio" size="lg">Make my first clip →</CTAButton>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Page shell
// ═══════════════════════════════════════════════════════════════════
export default function BrainrotGuideArticle() {
  const { slug } = useParams()
  const data = brainrotGuidesContent[slug]
  const { characters, clips, charById } = useBrainrotMedia()

  // Everything below assumes `data` — guard first.
  if (!data) return <Navigate to="/brainrot/guides" replace />

  const media = GUIDE_MEDIA[slug] || {}
  const chars = (media.charIds || []).map(id => charById[id]).filter(Boolean)
  const clip = clips.find(cl => (cl.category || '').toLowerCase() === media.gameplay) || clips[0] || null

  const path = `/brainrot/guides/${data.slug}`

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: data.h1,
      description: data.metaDescription,
      author: { '@type': 'Organization', name: 'ShortClipr' },
      publisher: {
        '@type': 'Organization', name: 'ShortClipr',
        logo: { '@type': 'ImageObject', url: `${SITE}/og-image.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${path}` },
      articleSection: data.category,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.faqs.map(f => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Brainrot', item: `${SITE}/brainrot` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/brainrot/guides` },
        { '@type': 'ListItem', position: 3, name: data.h1, item: `${SITE}${path}` },
      ],
    },
  ]
  if (data.howTo) {
    schema.push({
      '@context': 'https://schema.org', '@type': 'HowTo',
      name: data.howTo.title,
      step: data.howTo.steps.map((s, i) => ({
        '@type': 'HowToStep', position: i + 1, name: s.title, text: s.desc,
      })),
    })
  }

  const otherGuides = brainrotGuideSlugs.filter(s => s !== data.slug).slice(0, 3)
  const relatedTools = (data.related || []).filter(s => brainrotToolsContent[s])
  const relatedAlts = (data.relatedAlt || []).filter(s => brainrotAlternativesContent[s])

  return (
    <div style={{
      background: T.ink, minHeight: '100vh',
      fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`,
    }}>
      <FontsLink />
      <SEO
        title={data.metaTitle} description={data.metaDescription}
        keywords={data.keywords} path={path} schema={schema}
      />
      <BrainrotNav />

      <ArticleHero data={data} chars={chars} clip={clip} media={media} />
      <ArticleBody data={data} charById={charById} />
      <HowToTimeline howTo={data.howTo} />
      <Takeaways takeaways={data.takeaways} />
      <FAQ faqs={data.faqs} />
      <Related
        relatedTools={relatedTools} relatedAlts={relatedAlts}
        otherGuides={otherGuides} charById={charById} clips={clips}
      />
      <FinalCTA />
      <BrainrotFooter />

      <style>{`
        @media (max-width: 980px) {
          .br-article-hero { grid-template-columns: 1fr !important; gap: 40px !important; }
          .br-article-hero-tile { justify-content: flex-start !important; }
          .br-faq-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
          .br-related-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
