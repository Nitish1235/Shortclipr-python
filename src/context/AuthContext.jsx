import { createContext, useContext, useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = async (token) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
        return data
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
    }
    return null
  }

  useEffect(() => {
    const token = localStorage.getItem('sc_token')
    if (token) {
      fetchUser(token).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const loginWithGoogleToken = async (googleIdToken) => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: googleIdToken })
      })
      
      if (!res.ok) throw new Error('Failed to authenticate with backend')
      
      const session = await res.json()
      localStorage.setItem('sc_token', session.access_token)
      setUser(session.user)
      return true
    } catch (err) {
      console.error('Login error:', err)
      return false
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('sc_token')
    setUser(null)
    window.location.href = '/youtube-shorts' // Force hard redirect home to clear all state safely
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogleToken, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
