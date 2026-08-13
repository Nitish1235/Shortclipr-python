import { Link } from 'react-router-dom'
import Logo from './Logo'

const COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Features',  href: '/youtube-shorts#features'      },
      { label: 'Pricing',   href: '/youtube-shorts#pricing'        },
      { label: 'Showcase',  href: '/youtube-shorts#showcase'       },
      { label: 'Changelog', href: '/changelog'       },
    ],
  },
  {
    title: 'Tools',
    links: [
      { label: 'YouTube to Shorts',    href: '/youtube-shorts/tools/youtube-to-shorts-converter'    },
      { label: 'Long Video to Shorts', href: '/youtube-shorts/tools/long-video-to-shorts-ai'        },
      { label: 'AI Clip Maker',        href: '/youtube-shorts/tools/ai-clip-maker'                  },
      { label: 'TikTok Clip Maker',    href: '/youtube-shorts/tools/tiktok-clip-maker'              },
      { label: 'Video to Reels',       href: '/youtube-shorts/tools/video-to-reels'                 },
      { label: 'Podcast to Shorts',    href: '/youtube-shorts/tools/podcast-to-shorts'              },
      { label: 'Webinar to Clips',     href: '/youtube-shorts/tools/webinar-to-clips'               },
      { label: 'Interview to Clips',   href: '/youtube-shorts/tools/interview-to-clips'             },
      { label: 'All tools →',          href: '/youtube-shorts/tools'                                },
    ],
  },
  {
    title: 'Guides',
    links: [
      { label: 'Long Videos → Shorts',   href: '/youtube-shorts/guides/how-to-turn-long-videos-into-shorts' },
      { label: 'Make Shorts Go Viral',   href: '/youtube-shorts/guides/how-to-make-youtube-shorts-go-viral' },
      { label: 'Best Caption Styles',    href: '/youtube-shorts/guides/best-caption-styles-for-short-form-video' },
      { label: 'Repurpose a Podcast',    href: '/youtube-shorts/guides/how-to-repurpose-a-podcast-into-clips' },
      { label: 'Shorts vs TikTok vs Reels', href: '/youtube-shorts/guides/youtube-shorts-vs-tiktok-vs-reels' },
      { label: 'AI Clipping Explained',  href: '/youtube-shorts/guides/ai-video-clipping-explained' },
      { label: 'All guides →',           href: '/youtube-shorts/guides' },
    ],
  },
  {
    title: 'Compare',
    links: [
      { label: 'vs Opus Clip',      href: '/youtube-shorts/alternatives/opus-clip'    },
      { label: 'vs Klap',           href: '/youtube-shorts/alternatives/klap'         },
      { label: 'vs 2short.ai',      href: '/youtube-shorts/alternatives/2short'       },
      { label: 'vs Vidyo / Quso',   href: '/youtube-shorts/alternatives/vidyo'        },
      { label: 'vs Munch',          href: '/youtube-shorts/alternatives/munch'        },
      { label: 'vs Riverside Clips',href: '/youtube-shorts/alternatives/riverside'    },
      { label: 'vs Spikes Studio',  href: '/youtube-shorts/alternatives/spikes-studio'},
      { label: 'vs Vizard AI',      href: '/youtube-shorts/alternatives/vizard'       },
      { label: 'All comparisons →', href: '/youtube-shorts/alternatives'              },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About',    href: '/about'   },
      { label: 'Contact',  href: '/contact' },
      { label: 'Press Kit',href: '/press'   },
      { label: 'Careers',  href: '/careers' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy',   href: '/privacy' },
      { label: 'Terms of Service', href: '/terms'   },
      { label: 'DMCA',             href: '/dmca'    },
    ],
  },
]

export default function Footer() {
  const year = new Date().getFullYear()

  const linkBase = {
    fontSize:'0.85rem', color:'#666', display:'block',
    marginBottom:'10px', transition:'color 0.15s',
    textDecoration:'none',
  }

  return (
    <footer style={{
      background:'#fff',
      borderTop:'1px solid #e5e5e5',
      padding:'60px 5% 32px',
    }}>
      <div style={{ maxWidth:'1100px', margin:'0 auto' }}>

        {/* Top row */}
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',
          gap:'40px', marginBottom:'56px',
        }}>

          {/* Brand */}
          <div>
            <Link to="/youtube-shorts" style={{ display:'inline-flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
              <Logo size={32}/>
              <span style={{ fontWeight:700, fontSize:'1rem', color:'#cf1322', letterSpacing:'-0.02em' }}>ShortClipr</span>
            </Link>
            <p style={{ fontSize:'0.85rem', color:'#999', lineHeight:1.7, maxWidth:'220px' }}>
              Long to Shorts.<br/>No Editing Required.<br/>No Credit Card.
            </p>
            {/* Red accent bar */}
            <div style={{ width:'40px', height:'3px', background:'#cf1322', marginTop:'20px', borderRadius:'2px' }}/>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.title}>
              <div style={{
                fontWeight:700, fontSize:'0.75rem', color:'#111',
                letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'18px',
              }}>{col.title}</div>
              {col.links.map(link => (
                <Link
                  key={link.label}
                  to={link.href}
                  style={linkBase}
                  onMouseEnter={e => e.currentTarget.style.color='#cf1322'}
                  onMouseLeave={e => e.currentTarget.style.color='#666'}
                >{link.label}</Link>
              ))}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ borderTop:'1px solid #e5e5e5', paddingTop:'24px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
          <span style={{ fontSize:'0.8rem', color:'#bbb' }}>
            © {year} ShortClipr — All rights reserved
          </span>
          <div style={{ display:'flex', gap:'20px' }}>
            {[['Privacy','/privacy'],['Terms','/terms'],['Contact','/contact']].map(([label,href]) => (
              <Link key={href} to={href} style={{ fontSize:'0.8rem', color:'#bbb', textDecoration:'none' }}
                onMouseEnter={e => e.currentTarget.style.color='#cf1322'}
                onMouseLeave={e => e.currentTarget.style.color='#bbb'}
              >{label}</Link>
            ))}
          </div>
          <span style={{ fontSize:'0.78rem', color:'#ddd' }}>v2.0.4</span>
        </div>
      </div>

      <style>{`
        @media(max-width:768px){
          footer div[style*="grid-template-columns"]{grid-template-columns:1fr 1fr !important;}
        }
      `}</style>
    </footer>
  )
}
