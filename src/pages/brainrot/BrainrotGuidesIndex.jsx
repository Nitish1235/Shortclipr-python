// BrainrotGuidesIndex.jsx — the /brainrot/guides landing.
//
// Design language: dark-first editorial, matching the redesigned
// BrainrotLanding.jsx. Each guide card gets a real ClipTile — the guide's
// mapped characters composited over a gameplay category background — so
// the grid actually looks like a shelf of clips, not a docs sidebar.

import { Link } from 'react-router-dom'
import BrainrotNav from './BrainrotNav'
import SEO, { SITE } from '../../components/SEO'
import brainrotGuidesContent, { brainrotGuideSlugs } from '../../data/brainrotGuidesContent'
import brainrotToolsContent, { brainrotToolSlugs } from '../../data/brainrotToolsContent'
import {
  T, SERIF, FontsLink, AuroraGlow, Section, Eyebrow, H2, Accent,
  CTAButton, GhostLink, Chip, BrainrotFooter, ClipTile, GUIDE_MEDIA, useBrainrotMedia,
} from './brainrotShared'

// ═══════════════════════════════════════════════════════════════════
//  HERO — dark, editorial, uses a live-ish preview reel on the right
// ═══════════════════════════════════════════════════════════════════
function GuidesHero({ characters, clips, charById }) {
  // Three postcards in a stacked fan — visually establishes "we have real
  // characters + real gameplay + a system for this".
  const c = (i) => clips[i % Math.max(clips.length, 1)] || null

  const tiles = [
    {
      slug: 'how-to-make-brainrot-clips',
      chars: ['dougie-blunt', 'marla-blunt'],
      clip: c(0), caption: { text: 'IMESSAGE > 💬' },
      rotate: -6, offsetX: -60, offsetY: 20,
    },
    {
      slug: 'best-brainrot-character-combos',
      chars: ['krungar', 'elowen-mistvale'],
      clip: c(1), caption: { text: 'HAUGHTY 👑' },
      rotate: 0, offsetX: 0, offsetY: 0, glow: true,
    },
    {
      slug: 'brainrot-clip-ideas',
      chars: ['glorp'],
      clip: c(2), caption: { text: 'ONLY IN OHIO 🌽', color: '#ff4dd8' },
      rotate: 6, offsetX: 60, offsetY: 20,
    },
  ]

  return (
    <section style={{
      background: T.ink, color: T.fg,
      position: 'relative', overflow: 'hidden',
      padding: 'clamp(80px, 9vw, 140px) 5% clamp(80px, 9vw, 120px)',
    }}>
      <AuroraGlow />

      <div className="br-guides-hero" style={{
        position: 'relative', zIndex: 1,
        maxWidth: 1240, margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 60, alignItems: 'center',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '6px 14px', borderRadius: 100,
            background: 'rgba(255,255,255,.05)',
            border: `1px solid ${T.lineDark2}`,
            fontSize: '.72rem', color: T.fg, fontWeight: 600,
            letterSpacing: '.06em', marginBottom: 22,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: T.red,
              boxShadow: `0 0 10px ${T.red}`,
            }}/>
            {brainrotGuideSlugs.length} guides · updated weekly
          </div>

          <h1 style={{
            fontSize: 'clamp(2.6rem, 5.6vw, 4.4rem)',
            fontWeight: 400, lineHeight: 1.02, letterSpacing: '-.035em',
            margin: '0 0 20px', color: T.fg,
            fontFamily: SERIF,
          }}>
            The brainrot <em style={{ fontStyle: 'italic', color: T.red }}>playbook.</em>
            <br/>
            Everything we learned building the tool.
          </h1>
          <p style={{
            fontSize: 'clamp(1rem, 1.3vw, 1.1rem)',
            color: T.fgMute, lineHeight: 1.55, maxWidth: 520, margin: '0 0 30px',
          }}>
            Topic selection, character casting, TTS voice pairing, gameplay
            choice, caption styles, posting cadence — the honest mechanics
            of what actually performs on TikTok.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <CTAButton to="/brainrot/studio" size="lg">Try the studio →</CTAButton>
            <GhostLink to="#all-guides">Browse guides ↓</GhostLink>
          </div>
        </div>

        {/* Right: fanned stack of clip postcards */}
        <div className="br-guides-hero-fan" style={{
          position: 'relative', height: 460,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {tiles.map((t, i) => {
            const chars = t.chars.map(id => charById[id]).filter(Boolean)
            return (
              <div key={i} style={{
                position: 'absolute',
                transform: `translate(${t.offsetX}px, ${t.offsetY}px) rotate(${t.rotate}deg)`,
                zIndex: i === 1 ? 3 : 2,
                transition: 'transform .3s ease',
              }}>
                <ClipTile
                  as="link" to={`/brainrot/guides/${t.slug}`}
                  characters={chars} clip={t.clip}
                  caption={t.caption}
                  width={i === 1 ? 220 : 190}
                  glow={t.glow}
                  fallbackIndex={i}
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Featured guide — the biggest, uses the mapped clip as background
// ═══════════════════════════════════════════════════════════════════
function FeaturedGuide({ slug, charById, clips }) {
  const g = brainrotGuidesContent[slug]
  const m = GUIDE_MEDIA[slug] || {}
  const chars = (m.charIds || []).map(id => charById[id]).filter(Boolean)
  const clip = clips.find(cl => (cl.category || '').toLowerCase() === m.gameplay) || clips[0] || null

  return (
    <Section tone="dark" wide style={{ paddingTop: 40 }}>
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Eyebrow tone="dark">Start here</Eyebrow>
          <H2 tone="dark" style={{ maxWidth: 720 }}>The one guide we <Accent>tell everyone</Accent> to read first.</H2>
        </div>
      </div>

      <Link to={`/brainrot/guides/${g.slug}`} style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
        borderRadius: 28, overflow: 'hidden',
        background: T.ink2, border: `1px solid ${T.lineDark2}`,
        textDecoration: 'none', color: T.fg,
        boxShadow: '0 40px 100px -20px rgba(0,0,0,.6)',
      }}
        className="br-featured-guide"
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,48,73,.35)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.lineDark2 }}
      >
        {/* Left: cinematic image panel with character composite over gameplay */}
        <div style={{ position: 'relative', minHeight: 420 }}>
          <ClipTile
            characters={chars} clip={clip}
            aspect="auto"
            width="100%" height="100%"
            radius={0}
            caption={{ text: 'RIZZ: MAXED 💀' }}
          />
        </div>

        {/* Right: article summary + meta */}
        <div style={{ padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 28 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <Chip tone="dark" accent>{g.category}</Chip>
              <Chip tone="dark">{g.readTime}</Chip>
              <Chip tone="dark">{g.updated}</Chip>
            </div>
            <h3 style={{
              fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)',
              fontWeight: 500, letterSpacing: '-.025em', lineHeight: 1.1,
              margin: '0 0 16px', fontFamily: SERIF, color: T.fg,
            }}>{g.h1}</h3>
            <p style={{ fontSize: '1rem', color: T.fgMute, lineHeight: 1.6, margin: 0 }}>
              {g.subhead}
            </p>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 20, borderTop: `1px solid ${T.lineDark}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {chars.slice(0, 2).map(ch => (
                <img key={ch.id} src={ch.image_url} alt=""
                  style={{
                    width: 38, height: 38, borderRadius: '50%',
                    border: `2px solid ${T.ink2}`, objectFit: 'cover',
                    background: T.ink3,
                  }}
                  onError={e => e.currentTarget.style.display = 'none'}/>
              ))}
              <div style={{ fontSize: '.78rem', color: T.fgFaint }}>
                Featuring {chars.map(c => c.name.split(' ')[0]).join(' & ')}
              </div>
            </div>
            <span style={{
              fontSize: '.86rem', fontWeight: 600, color: T.red,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              Read guide →
            </span>
          </div>
        </div>
      </Link>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  All guides grid — each card uses ClipTile as its visual identity
// ═══════════════════════════════════════════════════════════════════
function GuidesGrid({ slugs, charById, clips }) {
  const clipByCat = (cat) => clips.find(cl => (cl.category || '').toLowerCase() === cat) || null

  return (
    <Section id="all-guides" tone="cream" wide>
      <div style={{ maxWidth: 720, marginBottom: 48 }}>
        <Eyebrow tone="light">Library</Eyebrow>
        <H2 tone="light">Every guide, <Accent>by topic.</Accent></H2>
        <p style={{ color: T.inkMute, fontSize: '1.02rem', lineHeight: 1.55, marginTop: 18 }}>
          Each guide's characters and gameplay footage are picked to match
          what the guide actually teaches — so you can see the format before
          you read about it.
        </p>
      </div>

      <div className="br-guides-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20,
      }}>
        {slugs.map((slug, idx) => {
          const g = brainrotGuidesContent[slug]
          const m = GUIDE_MEDIA[slug] || {}
          const chars = (m.charIds || []).map(id => charById[id]).filter(Boolean)
          const clip = clipByCat(m.gameplay)

          return (
            <Link key={slug} to={`/brainrot/guides/${slug}`} style={{
              display: 'flex', flexDirection: 'column',
              background: '#fff', border: `1px solid ${T.lineLight}`,
              borderRadius: 24, overflow: 'hidden',
              textDecoration: 'none', color: T.ink0,
              transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,.04)',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0,0,0,.15)'
                e.currentTarget.style.borderColor = 'rgba(255,48,73,.25)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.04)'
                e.currentTarget.style.borderColor = T.lineLight
              }}
            >
              {/* Visual header — real characters over gameplay */}
              <div style={{ position: 'relative' }}>
                <ClipTile
                  characters={chars} clip={clip}
                  aspect="4 / 3"
                  radius={0}
                  fallbackIndex={idx}
                  extra={
                    <div style={{
                      position: 'absolute', top: 12, right: 12, zIndex: 8,
                      background: 'rgba(0,0,0,.6)', color: '#fff',
                      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                      padding: '5px 11px', borderRadius: 100,
                      fontSize: '.66rem', fontWeight: 700,
                      letterSpacing: '.1em', textTransform: 'uppercase',
                      border: '1px solid rgba(255,255,255,.15)',
                    }}>
                      {m.tag || g.category}
                    </div>
                  }
                />
              </div>

              {/* Text panel */}
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                <div style={{
                  fontSize: '.72rem', color: T.inkMute, fontWeight: 600,
                  letterSpacing: '.08em', textTransform: 'uppercase',
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <span>{g.category}</span>
                  <span style={{ width: 3, height: 3, background: T.inkMute, borderRadius: '50%' }}/>
                  <span>{g.readTime}</span>
                </div>
                <h3 style={{
                  fontSize: '1.2rem', fontWeight: 500,
                  letterSpacing: '-.02em', lineHeight: 1.25,
                  color: T.ink0, margin: 0,
                  fontFamily: SERIF,
                }}>{g.h1.replace(/ — .+$/, '').replace(/: The Complete 2025 Guide$/, '')}</h3>
                <p style={{
                  fontSize: '.9rem', color: T.inkMute, lineHeight: 1.55,
                  margin: 0, flex: 1,
                }}>
                  {g.subhead.slice(0, 130)}{g.subhead.length > 130 ? '…' : ''}
                </p>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 8, paddingTop: 14, borderTop: `1px solid ${T.lineLight}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: -6 }}>
                    {chars.slice(0, 2).map((ch, i) => (
                      <img key={ch.id} src={ch.image_url} alt=""
                        style={{
                          width: 26, height: 26, borderRadius: '50%',
                          border: `2px solid #fff`, objectFit: 'cover',
                          background: T.cream, marginLeft: i > 0 ? -8 : 0,
                        }}
                        onError={e => e.currentTarget.style.display = 'none'}/>
                    ))}
                  </div>
                  <span style={{
                    fontSize: '.78rem', fontWeight: 600, color: T.red,
                  }}>Read →</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Tools cross-link strip — visual cards, not text pills
// ═══════════════════════════════════════════════════════════════════
function ToolsStrip({ charById, clips }) {
  const toolSlugs = brainrotToolSlugs.slice(0, 4)
  return (
    <Section tone="dark" wide>
      <div style={{ marginBottom: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Eyebrow tone="dark">Ready to make one?</Eyebrow>
          <H2 tone="dark">Skip the reading, <Accent>use the tool.</Accent></H2>
        </div>
        <Link to="/brainrot/tools" style={{
          color: T.fg, textDecoration: 'none', fontSize: '.88rem', fontWeight: 600,
          padding: '10px 18px', borderRadius: 100, border: `1px solid ${T.lineDark2}`,
        }}>All tools →</Link>
      </div>

      <div className="br-tools-strip" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
      }}>
        {toolSlugs.map((slug, i) => {
          const t = brainrotToolsContent[slug]
          const chars = i < 2
            ? [charById['dougie-blunt'], charById['marla-blunt']].filter(Boolean)
            : [charById['glorp']].filter(Boolean)
          const clip = clips[(i + 2) % Math.max(clips.length, 1)] || null
          return (
            <Link key={slug} to={`/brainrot/tools/${slug}`} style={{
              display: 'flex', flexDirection: 'column',
              background: T.ink2, border: `1px solid ${T.lineDark}`,
              borderRadius: 20, overflow: 'hidden',
              textDecoration: 'none', color: T.fg,
              transition: 'transform .2s ease, border-color .2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(255,48,73,.3)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = T.lineDark }}
            >
              <ClipTile
                characters={chars} clip={clip}
                aspect="16 / 10" radius={0}
                fallbackIndex={i + 3}
              />
              <div style={{ padding: 18 }}>
                <div style={{ fontSize: '.66rem', color: T.fgMute, letterSpacing: '.1em', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
                  Tool
                </div>
                <div style={{ fontSize: '.98rem', fontWeight: 500, color: T.fg, fontFamily: SERIF, lineHeight: 1.25 }}>
                  {t.h1.replace(/ — .+$/, '').replace(/^Free /, '')}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Final CTA (identical language to landing)
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
          Free tier · No card · 60s setup
        </div>
        <h2 style={{
          fontSize: 'clamp(2.2rem, 5.2vw, 3.6rem)',
          fontWeight: 400, letterSpacing: '-.035em', lineHeight: 1.05,
          margin: '0 0 18px', fontFamily: SERIF,
        }}>
          Reading is fine. <em style={{ fontStyle: 'italic', color: T.red }}>Shipping</em> is better.
        </h2>
        <p style={{
          fontSize: '1.05rem', color: T.fgMute, lineHeight: 1.55,
          maxWidth: 520, margin: '0 auto 30px',
        }}>
          Two clips free, full character library, no card, cancel anytime.
        </p>
        <CTAButton to="/brainrot/studio" size="lg">Make my first clip →</CTAButton>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Page shell
// ═══════════════════════════════════════════════════════════════════
export default function BrainrotGuidesIndex() {
  const { characters, clips, charById } = useBrainrotMedia()

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'ShortClipr Brainrot Guides — Make Better Clips',
      url: `${SITE}/brainrot/guides`,
      description: 'In-depth guides on making brainrot clips, picking topics, using TTS voices, comparing formats, and growing your TikTok with character debate content.',
      hasPart: brainrotGuideSlugs.map(s => ({
        '@type': 'Article',
        headline: brainrotGuidesContent[s].h1,
        url: `${SITE}/brainrot/guides/${s}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Brainrot', item: `${SITE}/brainrot` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/brainrot/guides` },
      ],
    },
  ]

  const featuredSlug = 'how-to-make-brainrot-clips'
  const restSlugs = brainrotGuideSlugs.filter(s => s !== featuredSlug)

  return (
    <div style={{
      background: T.ink, minHeight: '100vh',
      fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`,
    }}>
      <FontsLink />
      <SEO
        title="Brainrot Guides — How to Make Clips, Pick Topics, Grow Your TikTok | ShortClipr"
        description="Free guides on making brainrot clips: how to pick topics that go viral, use TTS voices, choose gameplay backgrounds, and grow a TikTok account with character debate content."
        keywords="brainrot guides, how to make brainrot clips, brainrot tips, tiktok brainrot guide, character clip tutorial, brainrot content strategy"
        path="/brainrot/guides"
        schema={schema}
      />
      <BrainrotNav />

      <GuidesHero characters={characters} clips={clips} charById={charById} />
      <FeaturedGuide slug={featuredSlug} charById={charById} clips={clips} />
      <GuidesGrid slugs={restSlugs} charById={charById} clips={clips} />
      <ToolsStrip charById={charById} clips={clips} />
      <FinalCTA />
      <BrainrotFooter />

      <style>{`
        @media (max-width: 980px) {
          .br-guides-hero { grid-template-columns: 1fr !important; gap: 40px !important; text-align: center; }
          .br-guides-hero-fan { height: 380px !important; }
          .br-featured-guide { grid-template-columns: 1fr !important; }
          .br-featured-guide > div:first-child { min-height: 320px !important; }
          .br-guides-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .br-tools-strip { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 620px) {
          .br-guides-grid { grid-template-columns: 1fr !important; }
          .br-tools-strip { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
