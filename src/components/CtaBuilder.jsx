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
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_URL}/auth/cta-settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setEnabled(data.enabled ?? false)
        setIsExpanded(data.enabled ?? false)
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
    setSaveSuccess(false)
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
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
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
    setActivePageIdx(index)
  }

  const addPage = () => {
    setPages([...pages, { words: ['NEW', 'PAGE'], animation: 'staggered_stack', x: 50, y: 50, font_size: 120 }])
    setActivePageIdx(pages.length)
  }

  const removePage = (index) => {
    setPages(pages.filter((_, i) => i !== index))
    if (activePageIdx >= index && activePageIdx > 0) {
      setActivePageIdx(activePageIdx - 1)
    }
  }

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
      color: '#fff',
      marginTop: '24px',
      overflow: 'hidden'
    }}>

      {/* ── Collapsible Header ── */}
      <button
        onClick={() => setIsExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1rem' }}>🎬</span>
          <h2 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>End-of-Video CTA Animation</h2>
          {enabled && (
            <span style={{
              background: 'rgba(255, 45, 85, 0.2)',
              color: '#ff2d55',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 'bold',
              letterSpacing: '0.05em'
            }}>ACTIVE</span>
          )}
        </div>
        <span style={{ fontSize: '0.85rem', color: '#888' }}>{isExpanded ? '▲ Minimize' : '▼ Expand'}</span>
      </button>

      {/* ── Expanded Body ── */}
      {isExpanded && (
        <div style={{ padding: '24px' }}>

          {/* Enable toggle + description */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <p style={{ color: '#aaa', margin: 0, fontSize: '0.875rem' }}>
              Replaces the final 10 seconds of captions with a high-impact animated call-to-action.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>Enable Animation</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#ff2d55' }}
              />
            </label>
          </div>

          {/* Main layout: Preview + Controls */}
          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>

            {/* LEFT: Preview Canvas */}
            <div style={{ flex: '1', minWidth: '240px' }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#ccc', fontWeight: 600 }}>
                Preview <span style={{ color: '#ff2d55' }}>(Page {activePageIdx + 1})</span>
              </h3>
              <div style={{
                width: '100%',
                maxWidth: '220px',
                aspectRatio: '9/16',
                background: '#000',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '10px',
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
                    opacity: i === activePageIdx ? 1 : 0,
                    transition: 'opacity 0.2s ease-in-out'
                  }}>
                    {page.words.map((word, wIdx) => (
                      <div key={wIdx} style={{
                        color: color,
                        fontSize: `${page.font_size / 7}px`,
                        fontWeight: '900',
                        lineHeight: '1.15',
                        fontFamily: 'sans-serif',
                        textTransform: 'uppercase'
                      }}>
                        {word}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Page nav dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' }}>
                {pages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePageIdx(i)}
                    style={{
                      width: i === activePageIdx ? '18px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      background: i === activePageIdx ? '#ff2d55' : 'rgba(255,255,255,0.3)',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 0.2s ease'
                    }}
                  />
                ))}
              </div>

              {/* Color picker */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', color: '#ccc', fontSize: '0.85rem' }}>Text Color</label>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{ width: '100%', height: '36px', cursor: 'pointer', background: 'transparent', border: 'none' }}
                />
              </div>
            </div>

            {/* RIGHT: Page Controls */}
            <div style={{ flex: '2', minWidth: '280px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '0.9rem', margin: 0, color: '#ccc', fontWeight: 600 }}>Pages ({pages.length})</h3>
                <button
                  onClick={addPage}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.82rem'
                  }}
                >
                  + Add Page
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
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
                        padding: '14px',
                        borderRadius: '8px',
                        border: isActive ? '1px solid #ff2d55' : '1px solid rgba(255,255,255,0.06)',
                        boxShadow: isActive ? '0 0 10px rgba(255,45,85,0.15)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <strong style={{ fontSize: '0.88rem' }}>
                          Page {i + 1}
                          <span style={{ color: '#888', fontWeight: 'normal', marginLeft: '6px' }}>~{approxTime}s</span>
                        </strong>
                        <button
                          onClick={(e) => { e.stopPropagation(); removePage(i) }}
                          style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', padding: '2px 6px' }}
                          disabled={pages.length <= 1}
                        >✕</button>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        {/* Words */}
                        <div style={{ flex: '1', minWidth: '130px' }}>
                          <label style={{ display: 'block', fontSize: '0.78em', color: '#aaa', marginBottom: '4px' }}>Words (one per line)</label>
                          <textarea
                            value={page.words.join('\n')}
                            onChange={e => handlePageChange(i, 'words', e.target.value.split('\n'))}
                            style={{
                              width: '100%', height: '72px',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#fff', padding: '6px', borderRadius: '4px',
                              resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85em'
                            }}
                          />
                        </div>

                        {/* Controls */}
                        <div style={{ flex: '1', minWidth: '130px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78em', color: '#aaa', marginBottom: '3px' }}>Animation</label>
                            <select
                              value={page.animation}
                              onChange={e => handlePageChange(i, 'animation', e.target.value)}
                              style={{
                                width: '100%', background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#fff', padding: '5px', borderRadius: '4px', fontSize: '0.82em'
                              }}
                            >
                              <option value="staggered_stack">Staggered Stack</option>
                              <option value="massive_pop">Massive Pop</option>
                              <option value="slide_fade">Slide & Fade</option>
                              <option value="typewriter">Typewriter</option>
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78em', color: '#aaa', marginBottom: '3px' }}>
                              <span>Font Size</span><span>{page.font_size}px</span>
                            </label>
                            <input type="range" min="40" max="300" value={page.font_size}
                              onChange={e => handlePageChange(i, 'font_size', parseInt(e.target.value))}
                              style={{ width: '100%' }} />
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78em', color: '#aaa', marginBottom: '3px' }}>
                                <span>X</span><span>{page.x}%</span>
                              </label>
                              <input type="range" min="0" max="100" value={page.x}
                                onChange={e => handlePageChange(i, 'x', parseInt(e.target.value))}
                                style={{ width: '100%' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78em', color: '#aaa', marginBottom: '3px' }}>
                                <span>Y</span><span>{page.y}%</span>
                              </label>
                              <input type="range" min="0" max="100" value={page.y}
                                onChange={e => handlePageChange(i, 'y', parseInt(e.target.value))}
                                style={{ width: '100%' }} />
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

          {/* Footer: error + save */}
          {error && <div style={{ color: '#ff4444', marginTop: '16px', fontSize: '0.85rem' }}>{error}</div>}
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={saveSettings}
              disabled={saving}
              style={{
                background: saveSuccess ? '#16a34a' : saving ? '#555' : '#ff2d55',
                color: '#fff', border: 'none',
                padding: '9px 22px', borderRadius: '6px',
                fontSize: '0.9rem', fontWeight: 'bold',
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.3s'
              }}
            >
              {saving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save CTA Settings'}
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
