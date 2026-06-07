import { useState } from 'react'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function Lab() {
  const [url,       setUrl]       = useState('')
  const [client,    setClient]    = useState('ANDROID_VR')
  const [useProxy,  setUseProxy]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [results,   setResults]   = useState(null)
  const [error,     setError]     = useState(null)
  const [activeTab, setActiveTab] = useState('handshake')

  const runHandshake = async () => {
    if (!url) return alert('Enter a URL')
    setLoading(true); setResults(null); setError(null)
    try {
      const res  = await fetch(`${API_BASE}/testing/debug`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ url_or_id:url, client, use_proxy:useProxy }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Audit failed')
      setResults(data)
    } catch (err) { setError(err.message) }
    finally       { setLoading(false) }
  }

  const runResolver = async () => {
    if (!url) return alert('Enter a URL')
    setLoading(true); setResults(null); setError(null)
    try {
      const res  = await fetch(`${API_BASE}/testing2/solve`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ url_or_id:url, client:'JDOWNLOADER' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Solver failed')
      setResults(data)
    } catch (err) { setError(err.message) }
    finally       { setLoading(false) }
  }

  const inputBase = {
    width:'100%', background:'#fff', border:'1.5px solid #e5e5e5',
    borderRadius:'8px', padding:'10px 14px', fontSize:'0.875rem',
    color:'#111', outline:'none', fontFamily:'Space Grotesk, sans-serif',
    transition:'border-color 0.15s', boxSizing:'border-box',
  }
  const tabBtnStyle = (active, color='#cf1322') => ({
    padding:'12px 14px', textAlign:'left', fontWeight:700, fontSize:'0.82rem',
    background: active ? color : 'transparent',
    color: active ? '#fff' : '#555',
    border: active ? 'none' : '1px solid #e5e5e5',
    borderRadius:'8px', cursor:'pointer', transition:'all 0.15s',
  })

  return (
    <div style={{ background:'#f9f9f9', minHeight:'100vh' }}>
      <Navigation />

      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'100px 5% 60px' }}>

        {/* Header */}
        <div style={{ marginBottom:'36px' }}>
          <div style={{
            display:'inline-block', background:'#fef2f2', border:'1px solid #fecaca',
            borderRadius:'100px', padding:'3px 12px', fontSize:'0.7rem', fontWeight:700,
            color:'#cf1322', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:'12px',
          }}>Internal Lab</div>
          <h1 style={{ fontSize:'1.8rem', fontWeight:700, color:'#111', letterSpacing:'-0.03em', marginBottom:'6px' }}>
            System Diagnostics
          </h1>
          <p style={{ color:'#999', fontSize:'0.9rem' }}>Handshake stabilization and link decryption matrix.</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'28px' }}>

          {/* Controls sidebar */}
          <aside style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

            {/* URL input */}
            <div style={{ background:'#fff', border:'1px solid #e5e5e5', borderRadius:'12px', padding:'16px' }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'8px' }}>Target URL</label>
              <input
                type="text" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                style={inputBase}
                onFocus={e => e.target.style.borderColor='#cf1322'}
                onBlur={e => e.target.style.borderColor='#e5e5e5'}
              />
            </div>

            {/* Tab switcher */}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <button onClick={() => setActiveTab('handshake')} style={tabBtnStyle(activeTab==='handshake','#cf1322')}>
                01. Handshake Audit
              </button>
              <button onClick={() => setActiveTab('resolver')} style={tabBtnStyle(activeTab==='resolver','#ca8a04')}>
                02. Resolver Bypass
              </button>
            </div>

            {/* Handshake options */}
            {activeTab === 'handshake' && (
              <div style={{ background:'#fff', border:'1px solid #e5e5e5', borderRadius:'12px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' }}>
                <div>
                  <label style={{ fontSize:'0.72rem', fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:'8px' }}>Identity Profile</label>
                  <select value={client} onChange={e => setClient(e.target.value)} style={inputBase}
                    onFocus={e => e.target.style.borderColor='#cf1322'} onBlur={e => e.target.style.borderColor='#e5e5e5'}>
                    <option value="ANDROID_VR">ANDROID_VR (Golden)</option>
                    <option value="TV">TV (No-PoToken)</option>
                    <option value="IOS">IOS (Stealth)</option>
                    <option value="MWEB">MWEB (Fallback)</option>
                    <option value="HEADLESS">PLAYWRIGHT (Headless)</option>
                    <option value="APIFY_HTML_SPOOF">APIFY_HTML_SPOOF</option>
                  </select>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, color:'#333' }}>
                  <input type="checkbox" checked={useProxy} onChange={e => setUseProxy(e.target.checked)} style={{ accentColor:'#cf1322', width:'16px', height:'16px' }}/>
                  Use ProxyScrape
                </label>
              </div>
            )}

            {/* Run button */}
            <button
              onClick={activeTab === 'handshake' ? runHandshake : runResolver}
              disabled={loading}
              style={{
                background: loading ? '#e5e5e5' : '#cf1322',
                color: loading ? '#aaa' : '#fff',
                border:'2px solid #111', borderRadius:'8px',
                padding:'14px', fontWeight:700, fontSize:'0.9rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow:'2px 2px 0 #111',
                transition:'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' }}}
              onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
            >
              {loading ? 'Running…' : 'Execute Test →'}
            </button>
          </aside>

          {/* Results panel */}
          <main>
            <div style={{
              background:'#111', borderRadius:'12px',
              border:'1px solid #222',
              height:'580px', overflowY:'auto', padding:'24px',
              fontFamily:'monospace', fontSize:'0.82rem',
            }}>
              {!results && !error && !loading && (
                <div style={{ color:'#444', textAlign:'center', marginTop:'120px' }}>
                  <div style={{ fontSize:'2.5rem', marginBottom:'16px' }}>🛰️</div>
                  <div style={{ color:'#555' }}>Awaiting command…</div>
                  <div style={{ fontSize:'0.7rem', marginTop:'8px', color:'#333' }}>Ready for handshake</div>
                </div>
              )}

              {loading && (
                <div style={{ color:'#cf1322' }}>
                  <div>[ SYSTEM ] Connecting to cluster…</div>
                  <div style={{ marginTop:'8px', color:'#aaa' }}>Loading data matrix…</div>
                </div>
              )}

              {error && (
                <div>
                  <div style={{ color:'#ef4444', marginBottom:'12px' }}>[ ERROR ] Operation failed</div>
                  <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', padding:'14px', color:'#fca5a5' }}>
                    {error}
                  </div>
                </div>
              )}

              {results && (
                <div>
                  <div style={{ color:'#22c55e', marginBottom:'16px', display:'flex', justifyContent:'space-between' }}>
                    <span>[ OK ] Audit complete</span>
                    <span style={{ color:'#555' }}>{new Date().toLocaleTimeString()}</span>
                  </div>

                  {results.logs && (
                    <div style={{ marginBottom:'20px', borderLeft:'2px solid #1a3a1a', paddingLeft:'14px' }}>
                      <div style={{ color:'#555', fontSize:'0.7rem', marginBottom:'8px' }}>// Execution logs</div>
                      {results.logs.map((log, i) => (
                        <div key={i} style={{ color: log.includes('ERROR') || log.includes('BLOCK') ? '#ef4444' : '#4ade80', fontSize:'0.75rem', marginBottom:'4px' }}>
                          {log}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ color:'#555', fontSize:'0.7rem', marginBottom:'8px' }}>// Raw output</div>
                  <pre style={{ color:'#4ade80', whiteSpace:'pre-wrap', wordBreak:'break-all', opacity:0.85 }}>
                    {JSON.stringify(results.results, null, 2)}
                  </pre>

                  {results.results?.streams && (
                    <div style={{ marginTop:'24px', padding:'16px', border:'1px solid #1a3a1a', borderRadius:'8px', background:'rgba(74,222,128,0.05)' }}>
                      <div style={{ color:'#22c55e', fontWeight:700, marginBottom:'10px' }}>Quick View</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', fontSize:'0.78rem', color:'#aaa' }}>
                        <div>Video URL: <span style={{ color:results.results.streams.has_video_url ? '#22c55e' : '#ef4444' }}>{results.results.streams.has_video_url ? 'Found' : 'Missing'}</span></div>
                        <div>Audio URL: <span style={{ color:results.results.streams.has_audio_url ? '#22c55e' : '#ef4444' }}>{results.results.streams.has_audio_url ? 'Found' : 'Missing'}</span></div>
                        <div>Captions: <span style={{ color:results.results.captions_found > 0 ? '#22c55e' : '#ef4444' }}>{results.results.captions_found} languages</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  )
}
