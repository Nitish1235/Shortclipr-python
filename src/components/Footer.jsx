import { Link } from 'react-router-dom'
import Logo from './Logo'

const COLS = [
  {
    title: 'PRODUCT',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Showcase', href: '/#showcase' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'COMPANY',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Press Kit', href: '/press' },
      { label: 'Careers', href: '/careers' },
    ],
  },
  {
    title: 'LEGAL',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Contact Us', href: '/contact' },
      { label: 'DMCA', href: '/dmca' },
    ],
  },
]

const linkStyle = {
  fontFamily: "'Space Mono', monospace", fontSize: '0.8rem',
  color: 'var(--muted)', textDecoration: 'none', transition: 'color 0.2s',
  display: 'block',
}

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{
      padding: '50px 5% 30px', background: 'var(--bg-dark)',
      borderTop: '4px solid var(--lime)',
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Top row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto auto auto',
          gap: '48px', marginBottom: '48px',
        }}>
          {/* Brand */}
          <div>
            <Link to="/" className="logo" style={{ marginBottom: '12px', display: 'inline-flex' }}>
              <Logo size={40} />
              SHORTCLIPR<span style={{ color: 'var(--green)', opacity: 0.7, fontSize: '1.1rem' }}>.COM</span>
            </Link>
            <p style={{
              fontFamily: "'Space Mono', monospace", fontSize: '0.8rem',
              color: 'var(--muted)', lineHeight: 1.7, maxWidth: '220px', marginTop: '10px',
            }}>
              Long to Shorts.<br />No Editing Required.<br />No Credit Card.
            </p>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.title}>
              <div style={{
                fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: '0.75rem',
                color: 'var(--lime)', letterSpacing: '0.12em', marginBottom: '16px',
                textTransform: 'uppercase',
              }}>{col.title}</div>
              {col.links.map(link => (
                <div key={link.label} style={{ marginBottom: '10px' }}>
                  {link.href.startsWith('/') && !link.href.includes('#') ? (
                    <Link
                      to={link.href}
                      style={linkStyle}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--lime)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                    >{link.label}</Link>
                  ) : (
                    <a
                      href={link.href}
                      style={linkStyle}
                      onMouseEnter={e => e.target.style.color = 'var(--lime)'}
                      onMouseLeave={e => e.target.style.color = 'var(--muted)'}
                    >{link.label}</a>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px dashed #1a3322', paddingTop: '24px',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: '12px',
        }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--muted)' }}>
            C:\&gt; COPYRIGHT {year} SHORTCLIPR.COM — ALL RIGHTS RESERVED
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', gap: '20px' }}>
            <Link to="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--lime)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >Privacy</Link>
            <Link to="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--lime)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >Terms</Link>
            <Link to="/contact" style={{ color: 'var(--muted)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--lime)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >Contact</Link>
          </span>
          <span style={{
            fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--yellow)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            SYS_VER: 2.0.4 — UPTIME: 99.1% <span className="blink">█</span>
          </span>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          footer > div > div:first-child { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </footer>
  )
}

