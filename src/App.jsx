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

// SEO landing pages
import ToolsIndex        from './pages/ToolsIndex'
import ToolLanding       from './pages/ToolLanding'
import AlternativesIndex from './pages/AlternativesIndex'
import AlternativeLanding from './pages/AlternativeLanding'

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
  if (!user) return <Navigate to="/" replace />
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
            {/* Public */}
            <Route path="/"                      element={<LandingPage />} />
            <Route path="/privacy"               element={<Privacy />} />
            <Route path="/terms"                 element={<Terms />} />
            <Route path="/contact"               element={<Contact />} />
            <Route path="/about"                 element={<About />} />
            <Route path="/changelog"             element={<Changelog />} />
            <Route path="/press"                 element={<PressKit />} />
            <Route path="/careers"               element={<Careers />} />
            <Route path="/dmca"                  element={<DMCA />} />
            <Route path="/payment/success"       element={<PaymentSuccess />} />

            {/* SEO programmatic landing pages */}
            <Route path="/tools"                 element={<ToolsIndex />} />
            <Route path="/tools/:slug"           element={<ToolLanding />} />
            <Route path="/alternatives"          element={<AlternativesIndex />} />
            <Route path="/alternatives/:slug"    element={<AlternativeLanding />} />

            {/* Protected — user must be logged in */}
            <Route path="/dashboard"             element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/clips"                 element={<ProtectedRoute><ClipsHistory /></ProtectedRoute>} />
            <Route path="/billing"               element={<ProtectedRoute><Billing /></ProtectedRoute>} />
            <Route path="/editor/:jobId/:clipId" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
            <Route path="/lab"                   element={<ProtectedRoute><Lab /></ProtectedRoute>} />

            {/* Admin — no separate auth guard on frontend, backend enforces admin check */}
            <Route path="/admin"                 element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}
