// FactloopGuidesIndex.jsx — the /factloop/guides landing.
//
// Fork of BrainrotGuidesIndex.jsx's editorial dark/cream shape, with the
// character-postcard hero replaced by fact-chip ClipTiles (factloopShared)
// since Factloop has no character roster.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FactloopNav from './FactloopNav'
import SEO, { SITE } from '../../components/SEO'
import factloopGuidesContent, { factloopGuideSlugs } from '../../data/factloopGuidesContent'
import factloopToolsContent, { factloopToolSlugs } from '../../data/factloopToolsContent'
import {
  T, SERIF, FontsLink, AuroraGlow, Section, Eyebrow, H2, Accent,
  CTAButton, GhostLink, Chip, FactloopFooter, ClipTile, GUIDE_MEDIA,
} from './factloopShared'
import { factloopApi } from './factloopApi'

function useFactloopGameplay() {
  const [clips, setClips] = useState([])
  useEffect(() => {
    let mounted = true
    factloopApi.gameplayClips().then(d => { if (mounted && d?.clips) setClips(d.clips) }).catch(() => {})
    return () => { mounted = false }
  }, [])
  return clips
}

const SAMPLE_STATS = [
  [{ key: 'runs', label: 'Runs', value: '1,240' }, { key: 'matches', label: 'Matches', value: '18' }],
  [{ key: 'growth', label: 'Growth', value: '+40%' }],
  [{ key: 'signups', label: 'Signups', value: '10M' }, { key: 'ratio', label: 'Retention', value: '1 in 3' }],
]

function GuidesHero({ clips }) {
  const c = (i) => clips[i % Math.max(clips.length, 1)] || null
  const tiles = [
    { slug: 'how-to-make-data-videos', clip: c(0), stats: SAMPLE_STATS[0], rotate: -6, offsetX: -60, offsetY: 20 },
    { slug: 'best-facts-for-data-recaps', clip: c(1), stats: SAMPLE_STATS[1], rotate: 0, offsetX: 0, offsetY: 0, glow: true },
    { slug: 'data-video-vs-traditional-shorts', clip: c(2), stats: SAMPLE_STATS[2], rotate: 6, offsetX: 60, offsetY: 20 },
  ]

  return (
    <section style={{
      background: T.ink, color: T.fg, position: 'relative', overflow: 'hidden',
      padding: 'clamp(80px, 9vw, 140px) 5% clamp(80px, 9vw, 120px)',
    }}>
      <AuroraGlow />
      <div className="fl-guides-hero" style={{
        position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 60, alignItems: 'center',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '6px 14px', borderRadius: 100, background: 'rgba(255,255,255,.05)',
            border: `1px solid ${T.lineDark2}`, fontSize: '.72rem', color: T.fg, fontWeight: 600,
            letterSpacing: '.06em', marginBottom: 22,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.cyan, boxShadow: `0 0 10px ${T.cyan}` }}/>
            {factloopGuideSlugs.length} guides · updated regularly
          </div>

          <h1 style={{
            fontSize: 'clamp(2.6rem, 5.6vw, 4.4rem)', fontWeight: 400, lineHeight: 1.02,
            letterSpacing: '-.035em', margin: '0 0 20px', color: T.fg, fontFamily: SERIF,
          }}>
            The Factloop <em style={{ fontStyle: 'italic', color: T.cyan }}>playbook.</em>
            <br/>Everything we learned turning facts into video.
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 1.3vw, 1.1rem)', color: T.fgMute, lineHeight: 1.55, maxWidth: 520, margin: '0 0 30px' }}>
            Picking facts that land, choosing a narrator voice, and when a data
            video is the right format at all — the honest mechanics of what
            actually works.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <CTAButton to="/factloop/studio" size="lg">Try the studio →</CTAButton>
            <GhostLink to="#all-guides">Browse guides ↓</GhostLink>
          </div>
        </div>

        <div className="fl-guides-hero-fan" style={{ position: 'relative', height: 460, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {tiles.map((t, i) => (
            <div key={i} style={{
              position: 'absolute', transform: `translate(${t.offsetX}px, ${t.offsetY}px) rotate(${t.rotate}deg)`,
              zIndex: i === 1 ? 3 : 2, transition: 'transform .3s ease',
            }}>
              <ClipTile as="link" to={`/factloop/guides/${t.slug}`} clip={t.clip} stats={t.stats}
                width={i === 1 ? 220 : 190} glow={t.glow} fallbackIndex={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturedGuide({ slug, clips }) {
  const g = factloopGuidesContent[slug]
  const m = GUIDE_MEDIA[slug] || {}
  const clip = clips.find(cl => (cl.category || '').toLowerCase() === m.gameplay) || clips[0] || null

  return (
    <Section tone="dark" wide style={{ paddingTop: 40 }}>
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Eyebrow tone="dark">Start here</Eyebrow>
          <H2 tone="dark" style={{ maxWidth: 720 }}>The one guide we <Accent>tell everyone</Accent> to read first.</H2>
        </div>
      </div>

      <Link to={`/factloop/guides/${g.slug}`} style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderRadius: 28, overflow: 'hidden',
        background: T.ink2, border: `1px solid ${T.lineDark2}`, textDecoration: 'none', color: T.fg,
        boxShadow: '0 40px 100px -20px rgba(0,0,0,.6)',
      }}
        className="fl-featured-guide"
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(6,182,212,.35)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.lineDark2 }}
      >
        <div style={{ position: 'relative', minHeight: 420 }}>
          <ClipTile clip={clip} stats={SAMPLE_STATS[0]} aspect="auto" width="100%" height="100%" radius={0} />
        </div>
        <div style={{ padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 28 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <Chip tone="dark" accent>{g.category}</Chip>
              <Chip tone="dark">{g.readTime}</Chip>
              <Chip tone="dark">{g.updated}</Chip>
            </div>
            <h3 style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)', fontWeight: 500, letterSpacing: '-.025em', lineHeight: 1.1, margin: '0 0 16px', fontFamily: SERIF, color: T.fg }}>
              {g.h1}
            </h3>
            <p style={{ fontSize: '1rem', color: T.fgMute, lineHeight: 1.6, margin: 0 }}>{g.subhead}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 20, borderTop: `1px solid ${T.lineDark}` }}>
            <span style={{ fontSize: '.86rem', fontWeight: 600, color: T.cyan, display: 'inline-flex', alignItems: 'center', gap: 6 }}>Read guide →</span>
          </div>
        </div>
      </Link>
    </Section>
  )
}

function GuidesGrid({ slugs, clips }) {
  const clipByCat = (cat) => clips.find(cl => (cl.category || '').toLowerCase() === cat) || null
  return (
    <Section id="all-guides" tone="cream" wide>
      <div style={{ maxWidth: 720, marginBottom: 48 }}>
        <Eyebrow tone="light">Library</Eyebrow>
        <H2 tone="light">Every guide, <Accent>by topic.</Accent></H2>
      </div>
      <div className="fl-guides-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {slugs.map((slug, idx) => {
          const g = factloopGuidesContent[slug]
          const m = GUIDE_MEDIA[slug] || {}
          const clip = clipByCat(m.gameplay)
          return (
            <Link key={slug} to={`/factloop/guides/${slug}`} style={{
              display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${T.lineLight}`,
              borderRadius: 24, overflow: 'hidden', textDecoration: 'none', color: T.ink0,
              transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,.04)',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0,0,0,.15)'; e.currentTarget.style.borderColor = 'rgba(6,182,212,.25)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.04)'; e.currentTarget.style.borderColor = T.lineLight }}
            >
              <ClipTile clip={clip} stats={SAMPLE_STATS[idx % SAMPLE_STATS.length]} aspect="4 / 3" radius={0} fallbackIndex={idx}
                extra={
                  <div style={{
                    position: 'absolute', top: 12, right: 12, zIndex: 8, background: 'rgba(0,0,0,.6)', color: '#fff',
                    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: '5px 11px', borderRadius: 100,
                    fontSize: '.66rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', border: '1px solid rgba(255,255,255,.15)',
                  }}>{m.tag || g.category}</div>
                }
              />
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                <div style={{ fontSize: '.72rem', color: T.inkMute, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{g.category}</span>
                  <span style={{ width: 3, height: 3, background: T.inkMute, borderRadius: '50%' }}/>
                  <span>{g.readTime}</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1.25, color: T.ink0, margin: 0, fontFamily: SERIF }}>
                  {g.h1.replace(/: The Complete 2026 Guide$/, '')}
                </h3>
                <p style={{ fontSize: '.9rem', color: T.inkMute, lineHeight: 1.55, margin: 0, flex: 1 }}>
                  {g.subhead.slice(0, 130)}{g.subhead.length > 130 ? '…' : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, paddingTop: 14, borderTop: `1px solid ${T.lineLight}` }}>
                  <span style={{ fontSize: '.78rem', fontWeight: 600, color: T.cyan }}>Read →</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Section>
  )
}

function ToolsStrip({ clips }) {
  return (
    <Section tone="dark" wide>
      <div style={{ marginBottom: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Eyebrow tone="dark">Ready to make one?</Eyebrow>
          <H2 tone="dark">Skip the reading, <Accent>use the tool.</Accent></H2>
        </div>
        <Link to="/factloop/tools" style={{ color: T.fg, textDecoration: 'none', fontSize: '.88rem', fontWeight: 600, padding: '10px 18px', borderRadius: 100, border: `1px solid ${T.lineDark2}` }}>All tools →</Link>
      </div>
      <div className="fl-tools-strip" style={{ display: 'grid', gridTemplateColumns: `repeat(${factloopToolSlugs.length}, 1fr)`, gap: 16 }}>
        {factloopToolSlugs.map((slug, i) => {
          const t = factloopToolsContent[slug]
          const clip = clips[(i + 2) % Math.max(clips.length, 1)] || null
          return (
            <Link key={slug} to={`/factloop/tools/${slug}`} style={{
              display: 'flex', flexDirection: 'column', background: T.ink2, border: `1px solid ${T.lineDark}`,
              borderRadius: 20, overflow: 'hidden', textDecoration: 'none', color: T.fg,
              transition: 'transform .2s ease, border-color .2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(6,182,212,.3)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = T.lineDark }}
            >
              <ClipTile clip={clip} stats={SAMPLE_STATS[i % SAMPLE_STATS.length]} aspect="16 / 10" radius={0} fallbackIndex={i + 3} />
              <div style={{ padding: 18 }}>
                <div style={{ fontSize: '.66rem', color: T.fgMute, letterSpacing: '.1em', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Tool</div>
                <div style={{ fontSize: '.98rem', fontWeight: 500, color: T.fg, fontFamily: SERIF, lineHeight: 1.25 }}>
                  {t.h1.replace(/ — .+$/, '')}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Section>
  )
}

function FinalCTA() {
  return (
    <section style={{ background: T.ink, color: T.fg, position: 'relative', overflow: 'hidden', padding: 'clamp(80px, 10vw, 140px) 5%', textAlign: 'center' }}>
      <AuroraGlow />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.05)',
          border: `1px solid ${T.lineDark2}`, padding: '6px 14px', borderRadius: 100,
          fontSize: '.72rem', color: T.fg, fontWeight: 600, letterSpacing: '.06em', marginBottom: 22,
        }}>
          <span style={{ width: 6, height: 6, background: T.green, borderRadius: '50%', boxShadow: `0 0 8px ${T.green}` }}/>
          You've read the guide. Now use it.
        </div>
        <h2 style={{ fontSize: 'clamp(2.2rem, 5.2vw, 3.6rem)', fontWeight: 400, letterSpacing: '-.035em', lineHeight: 1.05, margin: '0 0 18px', fontFamily: SERIF }}>
          Two videos are on <em style={{ fontStyle: 'italic', color: T.cyan }}>us.</em>
        </h2>
        <p style={{ fontSize: '1.05rem', color: T.fgMute, lineHeight: 1.55, maxWidth: 520, margin: '0 auto 30px' }}>
          Put this guide into practice. No credit card, cancel anytime.
        </p>
        <CTAButton to="/factloop/studio" size="lg">Make my first video →</CTAButton>
      </div>
    </section>
  )
}

export default function FactloopGuidesIndex() {
  const clips = useFactloopGameplay()
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'ShortClipr Factloop Guides',
    url: `${SITE}/factloop/guides`,
    description: 'Guides on making data-driven videos with Factloop: picking facts, choosing a narrator voice, and format comparisons.',
    hasPart: factloopGuideSlugs.map(s => ({
      '@type': 'WebPage', name: factloopGuidesContent[s].h1, url: `${SITE}/factloop/guides/${s}`,
    })),
  }

  return (
    <div style={{ background: T.ink, minHeight: '100vh', fontFamily: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` }}>
      <FontsLink />
      <SEO
        title="Factloop Guides — How to Make Data-Driven Videos | ShortClipr"
        description="Guides on making data-driven videos: picking facts that land, choosing a narrator voice, and when the format is the right fit."
        keywords="data video guides, how to make data videos, stat video tutorial, data storytelling guide"
        path="/factloop/guides"
        schema={schema}
      />
      <FactloopNav />

      <GuidesHero clips={clips} />
      <FeaturedGuide slug={factloopGuideSlugs[0]} clips={clips} />
      <GuidesGrid slugs={factloopGuideSlugs} clips={clips} />
      <ToolsStrip clips={clips} />
      <FinalCTA />
      <FactloopFooter />

      <style>{`
        @media (max-width: 980px) {
          .fl-guides-hero { grid-template-columns: 1fr !important; gap: 40px !important; }
          .fl-featured-guide { grid-template-columns: 1fr !important; }
          .fl-guides-grid { grid-template-columns: 1fr !important; }
          .fl-tools-strip { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}
