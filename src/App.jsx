import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'
import TikTokPixel from './components/TikTokPixel'
import SEO, { SITE } from './components/SEO'
import './landing-theme.css'
import './cloud-studio.css'

// Layout
import Footer        from './components/Footer'

// Landing sections
import VideoShowcase     from './components/VideoShowcase'
import MultipleShorts    from './components/MultipleShorts'
import SEOContentHub     from './components/SEOContentHub'
import Pricing           from './components/Pricing'
import FAQ               from './components/FAQ'
import CTA               from './components/CTA'
import CloudStudioLanding, { CloudNavigation } from './components/CloudStudioLanding'

// Pages
import Privacy        from './pages/Privacy'
import Terms          from './pages/Terms'
import Contact        from './pages/Contact'
import About          from './pages/About'
import PaymentSuccess from './pages/PaymentSuccess'
import Dashboard      from './pages/Dashboard'
import Login          from './pages/Login'
import Settings       from './pages/Settings'
import ClipsHistory   from './pages/ClipsHistory'
import Billing        from './pages/Billing'
import BrainrotBilling from './pages/brainrot/BrainrotBilling'
import Changelog      from './pages/Changelog'
import PressKit       from './pages/PressKit'
import Careers        from './pages/Careers'
import DMCA           from './pages/DMCA'
import Editor         from './pages/Editor'
import Lab            from './pages/Lab'
import Tutorial       from './pages/Tutorial'
import Admin          from './pages/Admin'
import AdminClips     from './pages/AdminClips'
import BrainrotStudio    from './pages/brainrot/BrainrotStudio'
import BrainrotLogin     from './pages/brainrot/BrainrotLogin'
import BrainrotSettings  from './pages/brainrot/BrainrotSettings'
import BrainrotLanding from './pages/brainrot/BrainrotLanding'
import BrainrotToolsIndex from './pages/brainrot/BrainrotToolsIndex'
import BrainrotToolLanding from './pages/brainrot/BrainrotToolLanding'
import BrainrotAlternativesIndex from './pages/brainrot/BrainrotAlternativesIndex'
import BrainrotAlternativeLanding from './pages/brainrot/BrainrotAlternativeLanding'
import BrainrotGuidesIndex from './pages/brainrot/BrainrotGuidesIndex'
import BrainrotGuideArticle from './pages/brainrot/BrainrotGuideArticle'

// Factloop imports
import FactloopStudio    from './pages/factloop/FactloopStudio'
import FactloopLogin     from './pages/factloop/FactloopLogin'
import FactloopSettings  from './pages/factloop/FactloopSettings'
import FactloopBilling   from './pages/factloop/FactloopBilling'
import FactloopLanding from './pages/factloop/FactloopLanding'
import FactloopToolsIndex from './pages/factloop/FactloopToolsIndex'
import FactloopToolLanding from './pages/factloop/FactloopToolLanding'
import FactloopAlternativesIndex from './pages/factloop/FactloopAlternativesIndex'
import FactloopAlternativeLanding from './pages/factloop/FactloopAlternativeLanding'
import FactloopGuidesIndex from './pages/factloop/FactloopGuidesIndex'
import FactloopGuideArticle from './pages/factloop/FactloopGuideArticle'

// SEO landing pages
import ToolsIndex        from './pages/ToolsIndex'
import ToolLanding       from './pages/ToolLanding'
import AlternativesIndex from './pages/AlternativesIndex'
import AlternativeLanding from './pages/AlternativeLanding'
import GuidesIndex       from './pages/GuidesIndex'
import GuideArticle      from './pages/GuideArticle'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy-client-id.apps.googleusercontent.com'

function LandingPage() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (location.state?.scrollToSection) {
      const id = location.state.scrollToSection
      // Clear state so page reload doesn't trigger scroll again
      navigate(location.pathname, { replace: true, state: {} })
      
      setTimeout(() => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' })
          if (id === 'hero') {
            const input = el.querySelector('input[type="url"]')
            if (input) input.focus()
          }
        }
      }, 100)
    }
  }, [location, navigate])

  return (
    <div className="youtube-shorts-landing">
      <SEO
        title="AI YouTube Shorts Maker — Turn Long Videos Into Short Clips | ShortClipr"
        description="Turn long YouTube videos, podcasts, interviews, and tutorials into ready-to-post YouTube Shorts, TikToks, and Instagram Reels. ShortClipr finds strong moments, reframes them for vertical video, and adds captions in minutes."
        keywords="AI YouTube Shorts maker, YouTube to Shorts, AI clip maker, long video to short clips, podcast to shorts, video to reels, TikTok clip maker"
        path="/youtube-shorts"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'ShortClipr',
          applicationCategory: 'VideoApplication',
          operatingSystem: 'Web',
          url: `${SITE}/youtube-shorts`,
          description: 'ShortClipr turns long-form YouTube videos into ready-to-post short clips with AI-selected moments, vertical reframing, and captions.',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free plan — 2 clips, no credit card required' },
        }}
      />
      <CloudNavigation />
      <main>
        <CloudStudioLanding />

        {/* Live admin-curated showcase, newest clips first */}
        <VideoShowcase />

        <MultipleShorts />

        <SEOContentHub />

        {/* 10. Pricing */}
        <Pricing />

        {/* 11. SEO FAQ */}
        <FAQ />

        {/* 12. Final CTA */}
        <CTA />
      </main>
      <Footer />
    </div>
  )
}

// `fallback` is where a logged-out visitor gets bounced to. Defaults to
// /youtube-shorts since that's correct for every YT-Shorts protected route
// (dashboard, clips, editor, lab, billing, admin) — but it must NOT be
// hardcoded, because this same component also guards /brainrot/studio.
// Without an explicit fallback there, a logged-out user clicking any
// brainrot CTA ("Get started", "Make a clip", etc.) would land on the
// YouTube-Shorts dashboard instead of back on the brainrot product they
// were actually trying to use — see the /brainrot/studio route below,
// which passes fallback="/brainrot".
function ProtectedRoute({ children, fallback = '/youtube-shorts' }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{
      background: '#fff', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '16px',
    }}>
      <div style={{
        width: '36px', height: '36px',
        border: '3px solid #fecaca', borderTopColor: '#cf1322',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }}/>
      <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 500 }}>Loading…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (!user) return <Navigate to={fallback} replace />
  return children
}

// ── Brainrot kill switch ──────────────────────────────────────────
// Flip to false to bring the whole product back — nothing else needs to
// change, every original route below is still intact. Matching flag on
// the backend: backend/app/api/brainrot.py's BRAINROT_OFFLINE (blocks the
// API itself; this flag only blocks the frontend routes/links — flip both
// together, since one without the other leaves either a dead UI in front
// of a live API, or a working UI whose every call 503s).
const BRAINROT_OFFLINE = true

function BrainrotOfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      fontFamily: `'Inter', system-ui, -apple-system, sans-serif`,
      textAlign: 'center', padding: 24, background: '#fff', color: '#111',
    }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>Brainrot is temporarily unavailable</h1>
      <p style={{ color: '#888', maxWidth: 420, margin: 0, fontSize: '.92rem' }}>
        We've taken it offline for now. Check back soon.
      </p>
      <a href="/youtube-shorts" style={{ marginTop: 12, color: '#cf1322', fontWeight: 600, fontSize: '.9rem' }}>
        Go to ShortClipr →
      </a>
    </div>
  )
}

// ── Factloop kill switch ──────────────────────────────────────────
// Flip to false to bring the whole product online. Matching flag on
// the backend: backend/app/api/factloop.py's FACTLOOP_OFFLINE.
const FACTLOOP_OFFLINE = true

function FactloopOfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      fontFamily: `'Inter', system-ui, -apple-system, sans-serif`,
      textAlign: 'center', padding: 24, background: '#fff', color: '#111',
    }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>Factloop is temporarily unavailable</h1>
      <p style={{ color: '#888', maxWidth: 420, margin: 0, fontSize: '.92rem' }}>
        We've taken it offline for now. Check back soon.
      </p>
      <a href="/youtube-shorts" style={{ marginTop: 12, color: '#cf1322', fontWeight: 600, fontSize: '.9rem' }}>
        Go to ShortClipr →
      </a>
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <TikTokPixel />
          <Routes>
            {/* Root — client-side safety net; nginx 301s the actual HTTP request */}
            <Route path="/"                      element={<Navigate to="/youtube-shorts" replace />} />

            {/* Company-wide / account-level — not product-specific, stay at root */}
            <Route path="/privacy"               element={<Privacy />} />
            <Route path="/terms"                 element={<Terms />} />
            <Route path="/contact"               element={<Contact />} />
            <Route path="/about"                 element={<About />} />
            <Route path="/changelog"             element={<Changelog />} />
            <Route path="/press"                 element={<PressKit />} />
            <Route path="/careers"               element={<Careers />} />
            <Route path="/dmca"                  element={<DMCA />} />
            <Route path="/payment/success"       element={<PaymentSuccess />} />
            <Route path="/billing"               element={<ProtectedRoute><Billing /></ProtectedRoute>} />

            {/* Admin — no separate auth guard on frontend, backend enforces admin check */}
            <Route path="/admin"                 element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/admin/clips"           element={<ProtectedRoute><AdminClips /></ProtectedRoute>} />

            {/* ── YouTube Shorts product ────────────────────────── */}
            <Route path="/youtube-shorts"                      element={<LandingPage />} />
            <Route path="/youtube-shorts/login"                element={<Login />} />

            {/* SEO programmatic landing pages */}
            <Route path="/youtube-shorts/tools"                 element={<ToolsIndex />} />
            <Route path="/youtube-shorts/tools/:slug"           element={<ToolLanding />} />
            <Route path="/youtube-shorts/alternatives"          element={<AlternativesIndex />} />
            <Route path="/youtube-shorts/alternatives/:slug"    element={<AlternativeLanding />} />
            <Route path="/youtube-shorts/guides"                element={<GuidesIndex />} />
            <Route path="/youtube-shorts/guides/:slug"          element={<GuideArticle />} />

            {/* Protected — user must be logged in */}
            <Route path="/youtube-shorts/dashboard"             element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/youtube-shorts/clips"                 element={<ProtectedRoute><ClipsHistory /></ProtectedRoute>} />
            <Route path="/youtube-shorts/editor/:jobId/:clipId" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
            <Route path="/youtube-shorts/lab"                   element={<ProtectedRoute><Lab /></ProtectedRoute>} />
            <Route path="/youtube-shorts/settings"              element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/youtube-shorts/tutorial"              element={<ProtectedRoute><Tutorial /></ProtectedRoute>} />

            {/* ── Brainrot Clips Maker product — OFFLINE, see BRAINROT_OFFLINE above ── */}
            {BRAINROT_OFFLINE ? (
              <Route path="/brainrot/*" element={<BrainrotOfflinePage />} />
            ) : (
              <>
                <Route path="/brainrot"          element={<BrainrotLanding />} />

                {/* Brainrot SEO pages */}
                <Route path="/brainrot/tools"                element={<BrainrotToolsIndex />} />
                <Route path="/brainrot/tools/:slug"           element={<BrainrotToolLanding />} />
                <Route path="/brainrot/alternatives"          element={<BrainrotAlternativesIndex />} />
                <Route path="/brainrot/alternatives/:slug"    element={<BrainrotAlternativeLanding />} />
                <Route path="/brainrot/guides"                element={<BrainrotGuidesIndex />} />
                <Route path="/brainrot/guides/:slug"          element={<BrainrotGuideArticle />} />

                {/* Auth */}
                <Route path="/brainrot/login"    element={<BrainrotLogin />} />

                {/* Protected — user must be logged in */}
                <Route path="/brainrot/studio"   element={<ProtectedRoute fallback="/brainrot/login"><BrainrotStudio /></ProtectedRoute>} />
                <Route path="/brainrot/billing"  element={<ProtectedRoute fallback="/brainrot"><BrainrotBilling /></ProtectedRoute>} />
                <Route path="/brainrot/settings" element={<ProtectedRoute fallback="/brainrot"><BrainrotSettings /></ProtectedRoute>} />
              </>
            )}

            {/* ── Factloop product — OFFLINE, see FACTLOOP_OFFLINE above ── */}
            {FACTLOOP_OFFLINE ? (
              <Route path="/factloop/*" element={<FactloopOfflinePage />} />
            ) : (
              <>
                <Route path="/factloop"          element={<FactloopLanding />} />

                {/* Factloop SEO pages */}
                <Route path="/factloop/tools"                element={<FactloopToolsIndex />} />
                <Route path="/factloop/tools/:slug"           element={<FactloopToolLanding />} />
                <Route path="/factloop/alternatives"          element={<FactloopAlternativesIndex />} />
                <Route path="/factloop/alternatives/:slug"    element={<FactloopAlternativeLanding />} />
                <Route path="/factloop/guides"                element={<FactloopGuidesIndex />} />
                <Route path="/factloop/guides/:slug"          element={<FactloopGuideArticle />} />

                {/* Auth */}
                <Route path="/factloop/login"    element={<FactloopLogin />} />

                {/* Protected — user must be logged in */}
                <Route path="/factloop/studio"   element={<ProtectedRoute fallback="/factloop/login"><FactloopStudio /></ProtectedRoute>} />
                <Route path="/factloop/billing"  element={<ProtectedRoute fallback="/factloop"><FactloopBilling /></ProtectedRoute>} />
                <Route path="/factloop/settings" element={<ProtectedRoute fallback="/factloop"><FactloopSettings /></ProtectedRoute>} />
              </>
            )}
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}
