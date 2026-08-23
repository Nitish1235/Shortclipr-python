import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import BrainrotNav from './BrainrotNav'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const BRAIN = '#a855f7'
const BRAIN_DARK = '#7c3aed'

export default function BrainrotSettings() {
  const { user } = useAuth()

  const [pw, setPw]             = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState(null) // { type: 'ok'|'err', text }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (pw.length < 8) {
      setMsg({ type: 'err', text: 'Password must be at least 8 characters.' })
      return
    }
    if (pw !== pwConfirm) {
      setMsg({ type: 'err', text: 'Passwords do not match.' })
      return
    }
    setSaving(true)
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ type: 'err', text: data.detail || 'Failed to set password.' })
      } else {
        setMsg({ type: 'ok', text: 'Password set! You can now sign in with your email and this password.' })
        setPw('')
        setPwConfirm('')
      }
    } catch {
      setMsg({ type: 'err', text: 'Network error — please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div style={{ minHeight: '100vh', background: '#faf5ff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <BrainrotNav />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f0f0f', margin: 0, letterSpacing: '-0.03em' }}>
            Settings
          </h1>
          <p style={{ color: '#888', fontSize: '.9rem', marginTop: 6, marginBottom: 0 }}>
            Manage your account preferences
          </p>
        </div>

        {/* Account info */}
        <div style={{
          background: '#fff', borderRadius: 14,
          border: '2px solid #0f0f0f', boxShadow: `4px 4px 0 ${BRAIN}`,
          padding: '20px 24px', marginBottom: 20,
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f0f0f', margin: '0 0 16px' }}>Account</h2>
          <div className="br-account-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
            <LabeledField label="Name"  value={user?.full_name || '—'} />
            <LabeledField label="Email" value={user?.email || '—'} />
            <LabeledField label="Plan"  value={user?.brainrot_plan ? (user.brainrot_plan.charAt(0).toUpperCase() + user.brainrot_plan.slice(1)) : 'Free'} />
          </div>
        </div>

        {/* Set password */}
        <div style={{
          background: '#fff', borderRadius: 14,
          border: '2px solid #0f0f0f', boxShadow: `4px 4px 0 ${BRAIN}`,
          padding: '20px 24px',
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f0f0f', margin: '0 0 4px' }}>
            Email Password
          </h2>
          <p style={{ fontSize: '.82rem', color: '#888', margin: '0 0 20px', lineHeight: 1.5 }}>
            Set a password so you can sign in with your email address — useful when Google isn't handy.
            Your Google sign-in continues to work.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#555', marginBottom: 5 }}>
                New password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 44px 10px 14px', borderRadius: 8,
                    border: '1.5px solid #e5e5e5', fontSize: '.88rem', color: '#111',
                    outline: 'none', transition: 'border-color .15s',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = BRAIN}
                  onBlur={e => e.currentTarget.style.borderColor = '#e5e5e5'}
                />
                <button
                  type="button" onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '.72rem', color: '#999', fontWeight: 600, padding: 4,
                  }}
                >{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#555', marginBottom: 5 }}>
                Confirm password
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px', borderRadius: 8,
                  border: `1.5px solid ${pwConfirm && pw !== pwConfirm ? BRAIN : '#e5e5e5'}`,
                  fontSize: '.88rem', color: '#111',
                  outline: 'none', transition: 'border-color .15s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = BRAIN}
                onBlur={e => e.currentTarget.style.borderColor = (pwConfirm && pw !== pwConfirm) ? BRAIN : '#e5e5e5'}
              />
              {pwConfirm && pw !== pwConfirm && (
                <p style={{ fontSize: '.75rem', color: BRAIN, margin: '4px 0 0' }}>Passwords don't match</p>
              )}
            </div>

            {msg && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 500,
                background: msg.type === 'ok' ? '#f0fdf4' : '#fdf4ff',
                color: msg.type === 'ok' ? '#166534' : BRAIN_DARK,
                border: `1px solid ${msg.type === 'ok' ? '#bbf7d0' : 'rgba(168,85,247,0.3)'}`,
              }}>
                {msg.type === 'ok' ? '✓ ' : '✗ '}{msg.text}
              </div>
            )}

            <div className="br-submit-wrap">
              <button
                type="submit" disabled={saving}
                style={{
                  width: '100%', padding: '12px 24px', borderRadius: 8,
                  background: saving ? '#e5e5e5' : BRAIN,
                  color: saving ? '#aaa' : '#fff',
                  fontSize: '.88rem', fontWeight: 700,
                  border: `2px solid ${saving ? '#e5e5e5' : '#0f0f0f'}`,
                  cursor: saving ? 'default' : 'pointer',
                  boxShadow: saving ? 'none' : `2px 2px 0 #0f0f0f`,
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!saving) { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = `3px 3px 0 #0f0f0f` } }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = saving ? 'none' : `2px 2px 0 #0f0f0f` }}
              >
                {saving ? 'Saving…' : 'Set password →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    <style>{`
      @media (max-width: 600px) {
        .br-account-grid { grid-template-columns: 1fr !important; }
      }
    `}</style>
    </>
  )
}

function LabeledField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '.72rem', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: '.9rem', color: '#333', fontWeight: 500 }}>{value}</div>
    </div>
  )
}
