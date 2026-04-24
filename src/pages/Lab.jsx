import React, { useState } from 'react'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function Lab() {
  const [url, setUrl] = useState('')
  const [client, setClient] = useState('ANDROID_VR')
  const [useProxy, setUseProxy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('handshake')

  const runHandshake = async () => {
    if (!url) return alert('Enter a URL')
    setLoading(true)
    setResults(null)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/testing/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_or_id: url, client, use_proxy: useProxy })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Audit failed')
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const runResolver = async () => {
    if (!url) return alert('Enter a URL')
    setLoading(true)
    setResults(null)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/testing2/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_or_id: url, client: 'JDOWNLOADER' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Solver failed')
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg-dark)', minHeight: '100vh', color: 'var(--text)' }}>
      <Navigation />
      
      <div style={{ paddingTop: '120px', paddingBottom: '60px', width: '90%', maxWidth: '1200px', margin: '0 auto' }}>
        <header style={{ marginBottom: '40px', borderBottom: '2px solid var(--lime)', paddingBottom: '20px' }}>
          <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: '2.5rem', color: 'var(--lime)', margin: 0, letterSpacing: '-0.02em' }}>
            [ SYSTEM DIAGNOSTICS LAB ]
          </h1>
          <p style={{ color: 'var(--muted)', fontFamily: "'Space Mono', monospace", marginTop: '8px' }}>
            Handshake stabilization and link decryption matrix.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '40px' }}>
          {/* Controls */}
          <aside>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ border: '1px solid #333', padding: '20px', background: 'rgba(255,255,255,0.02)' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '8px', fontWeight: 700 }}>TARGET_URL</label>
                <input 
                  type="text" 
                  value={url} 
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  style={{ 
                    width: '100%', background: '#000', border: '1px solid #444', color: 'var(--lime)',
                    padding: '12px', fontFamily: "'Space Mono', monospace", fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button 
                  onClick={() => setActiveTab('handshake')}
                  style={{ 
                    padding: '15px', textAlign: 'left', fontFamily: "'Space Mono', monospace", fontWeight: 700,
                    background: activeTab === 'handshake' ? 'var(--lime)' : 'transparent',
                    color: activeTab === 'handshake' ? '#000' : 'var(--muted)',
                    border: activeTab === 'handshake' ? 'none' : '1px solid #333',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  01. HANDSHAKE_AUDIT
                </button>
                <button 
                  onClick={() => setActiveTab('resolver')}
                  style={{ 
                    padding: '15px', textAlign: 'left', fontFamily: "'Space Mono', monospace", fontWeight: 700,
                    background: activeTab === 'resolver' ? 'var(--yellow)' : 'transparent',
                    color: activeTab === 'resolver' ? '#000' : 'var(--muted)',
                    border: activeTab === 'resolver' ? 'none' : '1px solid #333',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  02. RESOLVER_BYPASS
                </button>
              </div>

              {activeTab === 'handshake' && (
                <div style={{ border: '1px solid #333', padding: '20px', background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '8px', fontWeight: 700 }}>IDENTITY_PROFILE</label>
                  <select 
                    value={client} 
                    onChange={(e) => setClient(e.target.value)}
                    style={{ 
                      width: '100%', background: '#000', border: '1px solid #444', color: 'var(--lime)',
                      padding: '12px', fontFamily: "'Space Mono', monospace"
                    }}
                  >
                    <option value="ANDROID_VR">ANDROID_VR (Golden)</option>
                    <option value="TV">TV (No-PoToken)</option>
                    <option value="IOS">IOS (Stealth)</option>
                    <option value="MWEB">MWEB (Fallback)</option>
                    <option value="HEADLESS">PLAYWRIGHT (Headless)</option>
                  </select>
                <div style={{ border: '1px solid #333', padding: '20px', background: 'rgba(255,255,255,0.02)', marginTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={useProxy}
                      onChange={(e) => setUseProxy(e.target.checked)}
                      style={{ accentColor: 'var(--lime)' }}
                    />
                    <span style={{ fontSize: '0.75rem', fontFamily: "'Space Mono', monospace", fontWeight: 700, color: 'var(--yellow)' }}>
                      USE_PROXYSCRAPE
                    </span>
                  </label>
                </div>
              </div>
            )}

              <button 
                onClick={activeTab === 'handshake' ? runHandshake : runResolver}
                disabled={loading}
                style={{ 
                  background: activeTab === 'handshake' ? 'var(--lime)' : 'var(--yellow)',
                  color: '#000', fontWeight: 900, padding: '18px', border: 'none',
                  fontFamily: "'Space Mono', monospace", cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '4px 4px 0 #000, 4px 4px 0 2px var(--text)',
                  opacity: loading ? 0.5 : 1
                }}
              >
                {loading ? 'INITIALIZING...' : 'EXECUTE_TEST'}
              </button>
            </div>
          </aside>

          {/* Result Viewport */}
          <main style={{ position: 'relative' }}>
            <div className="crt-container" style={{ 
              background: '#050a05', border: '2px solid #222', borderRadius: '4px',
              height: '600px', overflowY: 'auto', padding: '30px', position: 'relative',
              boxShadow: 'inset 0 0 50px rgba(0,0,0,0.8)'
            }}>
              {/* Scanlines Overlay */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
                zIndex: 2, backgroundSize: '100% 2px, 3px 100%', pointerEvents: 'none'
              }} />
              
              <div style={{ position: 'relative', zIndex: 3, fontFamily: "'Space Mono', monospace", fontSize: '0.85rem' }}>
                {!results && !error && !loading && (
                  <div style={{ color: '#2a4d2a', textAlign: 'center', marginTop: '150px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🛰️</div>
                    <div>AWAITING COMMAND...</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '10px', opacity: 0.5 }}>READY_FOR_HANDSHAKE</div>
                  </div>
                )}

                {loading && (
                  <div style={{ color: 'var(--lime)' }}>
                    <div>[ SYSTEM ] CONNECTING TO CLUSTER...</div>
                    <div className="blink" style={{ marginTop: '10px' }}>_ LOADING DATA MATRIX...</div>
                  </div>
                )}

                {error && (
                  <div style={{ color: '#ff5555' }}>
                    <div>[ ERROR ] OPERATION FAILED</div>
                    <div style={{ marginTop: '20px', background: 'rgba(255,0,0,0.1)', padding: '15px', border: '1px solid #ff5555' }}>
                      {error}
                    </div>
                  </div>
                )}

                {results && (
                  <div>
                    <div style={{ color: 'var(--lime)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>[ OK ] AUDIT_COMPLETE</span>
                      <span>{new Date().toLocaleTimeString()}</span>
                    </div>

                    {results.logs && (
                      <div style={{ marginBottom: '25px', borderLeft: '2px solid #2a4d2a', paddingLeft: '15px' }}>
                        <div style={{ color: '#2a4d2a', fontSize: '0.7rem', marginBottom: '10px' }}>// EXECUTION_LOGS</div>
                        {results.logs.map((log, i) => (
                          <div key={i} style={{ color: log.includes('ERROR') || log.includes('BLOCK') ? '#ff5555' : '#4ade80', fontSize: '0.75rem', marginBottom: '4px' }}>
                            {log}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ color: '#2a4d2a', fontSize: '0.7rem', marginBottom: '10px' }}>// RAW_DATA_OUTPUT</div>
                    <pre style={{ color: '#4ade80', whiteSpace: 'pre-wrap', wordBreak: 'break-all', opacity: 0.8 }}>
                      {JSON.stringify(results.results, null, 2)}
                    </pre>

                    {results.results?.streams && (
                      <div style={{ marginTop: '30px', padding: '20px', border: '1px solid var(--lime)', background: 'rgba(74, 222, 128, 0.05)' }}>
                        <div style={{ color: 'var(--lime)', fontWeight: 700, marginBottom: '10px' }}>[ QUICK_VIEW ]</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                          <div>VIDEO_URL: <span style={{ color: results.results.streams.has_video_url ? 'var(--green)' : 'red' }}>{results.results.streams.has_video_url ? 'FOUND' : 'MISSING'}</span></div>
                          <div>AUDIO_URL: <span style={{ color: results.results.streams.has_audio_url ? 'var(--green)' : 'red' }}>{results.results.streams.has_audio_url ? 'FOUND' : 'MISSING'}</span></div>
                          <div>CAPTIONS: <span style={{ color: results.results.captions_found > 0 ? 'var(--green)' : 'red' }}>{results.results.captions_found} LANGUAGES</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Corner Accents */}
            <div style={{ position: 'absolute', top: -5, left: -5, width: 20, height: 20, borderTop: '2px solid var(--lime)', borderLeft: '2px solid var(--lime)' }} />
            <div style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderTop: '2px solid var(--lime)', borderRight: '2px solid var(--lime)' }} />
            <div style={{ position: 'absolute', bottom: -5, left: -5, width: 20, height: 20, borderBottom: '2px solid var(--lime)', borderLeft: '2px solid var(--lime)' }} />
            <div style={{ position: 'absolute', bottom: -5, right: -5, width: 20, height: 20, borderBottom: '2px solid var(--lime)', borderRight: '2px solid var(--lime)' }} />
          </main>
        </div>
      </div>

      <Footer />

      <style>{`
        .blink { animation: blink 1s step-end infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .crt-container::-webkit-scrollbar { width: 6px; }
        .crt-container::-webkit-scrollbar-track { background: #000; }
        .crt-container::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }
        .crt-container::-webkit-scrollbar-thumb:hover { background: #333; }
      `}</style>
    </div>
  )
}
