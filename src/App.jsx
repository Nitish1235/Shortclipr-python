import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'

// Layout
import Navigation    from './components/Navigation'
import Footer        from './components/Footer'

// Landing sections
import Hero              from './components/Hero'
import Ticker            from './components/Ticker'
import HowItWorks        from './components/HowItWorks'
import Features          from './components/Features'
import UseCases          from './components/UseCases'
import VideoShowcase     from './components/VideoShowcase'
import CreatorEarnings   from './components/CreatorEarnings'
import Comparison        from './components/Comparison'
import Testimonials      from './components/Testimonials'
import Pricing           from './components/Pricing'
import VisualHighlights  from './components/VisualHighlights'
import FAQ               from './components/FAQ'
import CTA               from './components/CTA'

// Pages
import Privacy        from './pages/Privacy'
import Terms          from './pages/Terms'
import Contact        from './pages/Contact'
import About          from './pages/About'
import PaymentSuccess from './pages/PaymentSuccess'
import Dashboard      from './pages/Dashboard'
import ClipsHistory   from './pages/ClipsHistory'
import Billing        from './pages/Billing'
import Changelog      from './pages/Changelog'
import PressKit       from './pages/PressKit'
import Careers        from './pages/Careers'
import DMCA           from './pages/DMCA'
import Editor         from './pages/Editor'
import Lab            from './pages/Lab'
import Admin          from './pages/Admin'
import AdminMarketingEditor from './pages/AdminMarketingEditor'
import BrainrotStudio  from './pages/brainrot/BrainrotStudio'

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
    <>
      <Navigation />
      <main>
        {/* 1. Hero — centered headline + URL input above fold */}
        <Hero />

        {/* 2. Dark feature ticker */}
        <Ticker />

        {/* 3. How it works */}
        <HowItWorks />

        {/* 4. Feature cards */}
        <Features />

        {/* 5. Use cases by creator type */}
        <UseCases />

        {/* 6. INFINITE VIDEO SHOWCASE — admin-curated clips from GCS */}
        <VideoShowcase />

        {/* 6b. Real creator earnings — YouTube Studio dashboards */}
        <CreatorEarnings />

        {/* 7. AI pipeline flow */}
        <VisualHighlights />

        {/* 8. Competitor comparison table */}
        <Comparison />

        {/* 9. Testimonials */}
        <Testimonials />

        {/* 10. Pricing */}
        <Pricing />

        {/* 11. SEO FAQ */}
        <FAQ />

        {/* 12. Final CTA */}
        <CTA />
      </main>
      <Footer />
    </>
  )
}

function ProtectedRoute({ children }) {
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
  if (!user) return <Navigate to="/youtube-shorts" replace />
  return children
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
            <Route path="/admin/marketing-editor" element={<ProtectedRoute><AdminMarketingEditor /></ProtectedRoute>} />

            {/* ── YouTube Shorts product ────────────────────────── */}
            <Route path="/youtube-shorts"                      element={<LandingPage />} />

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

            {/* ── Brainrot Clips Maker product ──────────────────── */}
            <Route path="/brainrot"          element={<Navigate to="/brainrot/studio" replace />} />
            <Route path="/brainrot/studio"   element={<ProtectedRoute><BrainrotStudio /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}
