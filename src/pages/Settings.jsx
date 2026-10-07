import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function Settings() {
  const { user } = useAuth()

  const [pw, setPw]           = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null) // { type: 'ok'|'err', text }

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
    <AppLayout>
      <div className="studio-settings" style={{ padding: '32px 40px', maxWidth: 980, margin: '0 auto', width: '100%' }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111', margin: 0 }}>Settle into your space.</h1>
          <p style={{ color: '#888', fontSize: '.9rem', marginTop: 6, marginBottom: 0 }}>
            Your profile and account security, in one quiet corner.
          </p>
        </div>

        {/* Account info card */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1.5px solid #e5e5e5',
          padding: '20px 24px', marginBottom: 20,
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', margin: '0 0 16px' }}>Account</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
            <LabeledField label="Name" value={user?.full_name || '—'} />
            <LabeledField label="Email" value={user?.email || '—'} />
            <LabeledField label="Plan" value={user?.plan ? (user.plan.charAt(0).toUpperCase() + user.plan.slice(1)) : 'Free'} />
          </div>
        </div>

        {/* Set / change password card */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1.5px solid #e5e5e5',
          padding: '20px 24px',
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', margin: '0 0 4px' }}>
            Email Password
          </h2>
          <p style={{ fontSize: '.82rem', color: '#888', margin: '0 0 20px', lineHeight: 1.5 }}>
            Set a password so you can sign in with your email address — useful when you don't have Google handy.
            Your Google sign-in will continue to work.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* New password */}
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
                  onFocus={e => e.currentTarget.style.borderColor = '#cf1322'}
                  onBlur={e => e.currentTarget.style.borderColor = '#e5e5e5'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '.72rem', color: '#999', fontWeight: 600, padding: 4,
                  }}
                >{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>

            {/* Confirm password */}
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
                  border: `1.5px solid ${pwConfirm && pw !== pwConfirm ? '#cf1322' : '#e5e5e5'}`,
                  fontSize: '.88rem', color: '#111',
                  outline: 'none', transition: 'border-color .15s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#cf1322'}
                onBlur={e => e.currentTarget.style.borderColor = (pwConfirm && pw !== pwConfirm) ? '#cf1322' : '#e5e5e5'}
              />
              {pwConfirm && pw !== pwConfirm && (
                <p style={{ fontSize: '.75rem', color: '#cf1322', margin: '4px 0 0' }}>Passwords don't match</p>
              )}
            </div>

            {/* Feedback */}
            {msg && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: '.82rem', fontWeight: 500,
                background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
                color: msg.type === 'ok' ? '#166534' : '#991b1b',
                border: `1px solid ${msg.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
              }}>
                {msg.type === 'ok' ? '✓ ' : '✗ '}{msg.text}
              </div>
            )}

            {/* Submit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  background: saving ? '#e5e5e5' : '#cf1322',
                  color: saving ? '#aaa' : '#fff',
                  fontSize: '.88rem', fontWeight: 700, border: 'none',
                  cursor: saving ? 'default' : 'pointer',
                  boxShadow: saving ? 'none' : '2px 2px 0 #111',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!saving) { e.currentTarget.style.background = '#a10e1b'; e.currentTarget.style.boxShadow = '3px 3px 0 #111' } }}
                onMouseLeave={e => { if (!saving) { e.currentTarget.style.background = '#cf1322'; e.currentTarget.style.boxShadow = '2px 2px 0 #111' } }}
              >
                {saving ? 'Saving…' : 'Set password →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
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
