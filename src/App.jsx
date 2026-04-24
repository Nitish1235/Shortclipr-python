import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navigation from './components/Navigation'
import Hero from './components/Hero'
import Ticker from './components/Ticker'
import HowItWorks from './components/HowItWorks'
import Features from './components/Features'
import Showcase from './components/Showcase'
import Testimonials from './components/Testimonials'
import Pricing from './components/Pricing'
import FAQ from './components/FAQ'
import CTA from './components/CTA'
import Footer from './components/Footer'
import VisualHighlights from './components/VisualHighlights'
import workflowImg from './assets/retro_workflow_diagram_1776835196805.png'

import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Contact from './pages/Contact'
import About from './pages/About'
import PaymentSuccess from './pages/PaymentSuccess'
import Dashboard from './pages/Dashboard'
import Changelog from './pages/Changelog'
import PressKit from './pages/PressKit'
import Careers from './pages/Careers'
import DMCA from './pages/DMCA'
import Editor from './pages/Editor'
import Lab from './pages/Lab'


// You must set this in your frontend/.env
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy-client-id.apps.googleusercontent.com'

function LandingPage() {
  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <Ticker />
        <HowItWorks />
        <Features />
        <Showcase />
        <VisualHighlights />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      {/* Workflow illustration */}
      <section style={{ padding: '60px 5%', textAlign: 'center' }}>
        <img
          src={workflowImg}
          alt="Workflow illustration"
          style={{ maxWidth: '100%', height: 'auto', border: '2px solid var(--lime)', borderRadius: '8px' }}
        />
      </section>
      <Footer />
    </>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ background: '#000', color: '#4ade80', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Mono', monospace" }}>[ VERIFYING SESSION... ]</div>
  if (!user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/about" element={<About />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/press" element={<PressKit />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/dmca" element={<DMCA />} />
            <Route path="/payment/success" element={<PaymentSuccess />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/editor/:jobId/:clipId" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
            <Route path="/lab" element={<ProtectedRoute><Lab /></ProtectedRoute>} />

          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}
