import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'

const links = [
  ['YouTube to Shorts', '/youtube-shorts/tools/youtube-to-shorts-converter'],
  ['Podcast clips', '/youtube-shorts/tools/podcast-to-shorts'],
  ['Tools', '/youtube-shorts/tools'],
  ['Guides', '/youtube-shorts/guides'],
]

export default function SeoNavigation() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const goToPricing = event => {
    event.preventDefault()
    if (location.pathname === '/youtube-shorts') {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/youtube-shorts', { state: { scrollToSection: 'pricing' } })
    }
  }

  return (
    <nav className="cloud-nav seo-nav" aria-label="Main navigation">
      <Link className="cloud-brand" to="/youtube-shorts"><Logo size={28} /><span>ShortClipr</span></Link>
      <div className="cloud-nav-links seo-nav-links">
        {links.map(([label, href]) => <Link key={href} to={href}>{label}</Link>)}
        <a href="/youtube-shorts#pricing" onClick={goToPricing}>Pricing</a>
      </div>
      <div className="seo-nav-actions">
        <details className="seo-nav-menu">
          <summary aria-label="Open navigation menu">Menu</summary>
          <div>
            {links.map(([label, href]) => <Link key={href} to={href}>{label}</Link>)}
            <a href="/youtube-shorts#pricing" onClick={goToPricing}>Pricing</a>
          </div>
        </details>
        <Link className="cloud-button cloud-button-small" to={user ? '/youtube-shorts/dashboard' : '/youtube-shorts/login'}>
          {user ? 'Dashboard ↗' : 'Create clips ↗'}
        </Link>
      </div>
    </nav>
  )
}
