import { Link } from 'react-router-dom'
import Logo from './Logo'

const COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Features',  href: '/#features'      },
      { label: 'Pricing',   href: '/#pricing'        },
      { label: 'Showcase',  href: '/#showcase'       },
      { label: 'Changelog', href: '/changelog'       },
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
          display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr 1fr',
          gap:'48px', marginBottom:'56px',
        }}>

          {/* Brand */}
          <div>
            <Link to="/" style={{ display:'inline-flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
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
