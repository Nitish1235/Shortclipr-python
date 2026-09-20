import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const DEFAULT_PAGES = [
  { words: ['TURN', 'LONG', 'VIDEOS'], animation: 'staggered_stack', x: 50, y: 50, font_size: 120 },
  { words: ['INTO'], animation: 'massive_pop', x: 50, y: 50, font_size: 220 },
  { words: ['SHORTS'], animation: 'massive_pop', x: 50, y: 50, font_size: 220 },
  { words: ['NO', 'EDITING', 'REQUIRED'], animation: 'staggered_stack', x: 50, y: 50, font_size: 120 },
]

export default function CtaBuilder() {
  const [enabled, setEnabled] = useState(false)
  const [pages, setPages] = useState([])
  const [color, setColor] = useState('#FFFFFF')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activePageIdx, setActivePageIdx] = useState(0) // Track which page is being previewed

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_URL}/auth/cta-settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setEnabled(data.enabled ?? false)
        setPages(data.pages && data.pages.length > 0 ? data.pages : DEFAULT_PAGES)
        setColor(data.color ?? '#FFFFFF')
      }
    } catch (err) {
      console.error('Failed to fetch CTA settings', err)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_URL}/auth/cta-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled, pages, color })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to save')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePageChange = (index, field, value) => {
    const newPages = [...pages]
    newPages[index] = { ...newPages[index], [field]: value }
    setPages(newPages)
    setActivePageIdx(index) // Switch preview to the edited page
  }

  const addPage = () => {
    setPages([...pages, { words: ['NEW', 'PAGE'], animation: 'staggered_stack', x: 50, y: 50, font_size: 120 }])
    setActivePageIdx(pages.length) // Auto-focus the newly added page
  }

  const removePage = (index) => {
    setPages(pages.filter((_, i) => i !== index))
    if (activePageIdx >= index && activePageIdx > 0) {
      setActivePageIdx(activePageIdx - 1)
    }
  }

  // Calculate approximate timings
  const totalWords = pages.reduce((acc, p) => acc + Math.max(1, p.words.length), 0)

  if (loading) {
    return <div style={{ padding: '20px', color: '#fff' }}>Loading CTA settings...</div>
  }

  return (
    <div style={{
      background: 'rgba(20, 20, 20, 0.7)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '24px',
      color: '#fff',
      marginTop: '24px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>End-of-Video CTA Animation</h2>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <span>Enable Animation</span>
          <input 
            type="checkbox" 
            checked={enabled} 
            onChange={e => setEnabled(e.target.checked)}
            style={{ width: '20px', height: '20px', accentColor: '#ff2d55' }}
          />
        </label>
      </div>

      <p style={{ color: '#aaa', marginBottom: '24px' }}>
        Replaces the final 10 seconds of captions with a high-impact animated call-to-action.
      </p>

      {enabled && (
        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
          
          {/* Left: Preview Canvas */}
          <div style={{ flex: '1', minWidth: '300px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#ccc' }}>
              Preview <span style={{ color: '#ff2d55', fontSize: '0.9em' }}>(Page {activePageIdx + 1})</span>
            </h3>
            <div style={{
              width: '100%',
              maxWidth: '360px',
              aspectRatio: '9/16',
              background: '#000',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '12px',
              position: 'relative',
              overflow: 'hidden',
              margin: '0 auto'
            }}>
              {pages.map((page, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: `${page.x}%`,
                  top: `${page.y}%`,
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  width: '100%',
                  pointerEvents: 'none',
                  opacity: i === activePageIdx ? 1 : 0, // Only show the active page
                  transition: 'opacity 0.2s ease-in-out'
                }}>
                  {page.words.map((word, wIdx) => (
                    <div key={wIdx} style={{
                      color: color,
                      fontSize: `${page.font_size / 6}px`, // scale down for preview
                      fontWeight: '900',
                      lineHeight: '1.1',
                      fontFamily: 'sans-serif',
                      textTransform: 'uppercase'
                    }}>
                      {word}
                    </div>
                  ))}
                  <div style={{
                    position: 'absolute',
                    top: '-25px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '12px',
                    color: '#ff2d55',
                    background: 'rgba(0,0,0,0.8)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap'
                  }}>
                    Pg {i + 1}
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#ccc' }}>Global Text Color</label>
              <input 
                type="color" 
                value={color} 
                onChange={e => setColor(e.target.value)}
                style={{ width: '100%', height: '40px', cursor: 'pointer', background: 'transparent', border: 'none' }}
              />
            </div>
          </div>

          {/* Right: Controls */}
          <div style={{ flex: '2', minWidth: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: '#ccc' }}>Pages ({pages.length})</h3>
              <button 
                onClick={addPage}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                + Add Page
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
              {pages.map((page, i) => {
                const wordsLen = Math.max(1, page.words.length)
                const approxTime = totalWords > 0 ? ((wordsLen / totalWords) * 10).toFixed(1) : 0
                const isActive = i === activePageIdx
                
                return (
                  <div 
                    key={i} 
                    onClick={() => setActivePageIdx(i)}
                    style={{ 
                      background: 'rgba(0,0,0,0.4)', 
                      padding: '16px', 
                      borderRadius: '8px', 
                      border: isActive ? '1px solid #ff2d55' : '1px solid rgba(255,255,255,0.05)',
                      boxShadow: isActive ? '0 0 10px rgba(255, 45, 85, 0.2)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <strong>Page {i + 1} <span style={{ color: '#888', fontSize: '0.9em', fontWeight: 'normal' }}> (~{approxTime}s)</span></strong>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removePage(i); }}
                        style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', padding: '4px' }}
                        disabled={pages.length <= 1}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                      <div style={{ flex: '1', minWidth: '150px' }}>
                        <label style={{ display: 'block', fontSize: '0.85em', color: '#aaa', marginBottom: '4px' }}>Words (One per line)</label>
                        <textarea 
                          value={page.words.join('\n')}
                          onChange={e => handlePageChange(i, 'words', e.target.value.split('\n'))}
                          style={{
                            width: '100%',
                            height: '80px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#fff',
                            padding: '8px',
                            borderRadius: '4px',
                            resize: 'vertical',
                            fontFamily: 'monospace'
                          }}
                        />
                      </div>
                      
                      <div style={{ flex: '1', minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85em', color: '#aaa', marginBottom: '4px' }}>Animation</label>
                          <select 
                            value={page.animation}
                            onChange={e => handlePageChange(i, 'animation', e.target.value)}
                            style={{
                              width: '100%',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#fff',
                              padding: '6px',
                              borderRadius: '4px'
                            }}
                          >
                            <option value="staggered_stack">Staggered Stack</option>
                            <option value="massive_pop">Massive Pop</option>
                            <option value="slide_fade">Slide & Fade</option>
                            <option value="typewriter">Typewriter</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: '#aaa', marginBottom: '4px' }}>
                            <span>Font Size</span>
                            <span>{page.font_size}px</span>
                          </label>
                          <input 
                            type="range" min="40" max="300" 
                            value={page.font_size}
                            onChange={e => handlePageChange(i, 'font_size', parseInt(e.target.value))}
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: '#aaa', marginBottom: '4px' }}>
                              <span>X Pos</span><span>{page.x}%</span>
                            </label>
                            <input 
                              type="range" min="0" max="100" 
                              value={page.x}
                              onChange={e => handlePageChange(i, 'x', parseInt(e.target.value))}
                              style={{ width: '100%' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: '#aaa', marginBottom: '4px' }}>
                              <span>Y Pos</span><span>{page.y}%</span>
                            </label>
                            <input 
                              type="range" min="0" max="100" 
                              value={page.y}
                              onChange={e => handlePageChange(i, 'y', parseInt(e.target.value))}
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#ff4444', marginTop: '16px' }}>{error}</div>}

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          onClick={saveSettings}
          disabled={saving}
          style={{
            background: saving ? '#555' : '#ff2d55',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : 'Save CTA Settings'}
        </button>
      </div>

    </div>
  )
}
