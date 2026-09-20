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
  const [watermarkY, setWatermarkY] = useState(75)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [isExpanded, setIsExpanded] = useState(true)

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
        setPages(data.pages && data.pages.length > 0 ? data.pages : DEFAULT_PAGES)
        setColor(data.color ?? '#FFFFFF')
        setWatermarkY(data.watermark_y ?? 75)
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
        body: JSON.stringify({ enabled, pages, color, watermark_y: watermarkY })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to save')
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
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
    return (
      <div style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
        color: '#666',
        marginBottom: '20px'
      }}>
        Loading Marketer CTA & Branding settings...
      </div>
    )
  }

  return (
    <div style={{
      background: '#18181b',
      border: '1.5px solid #27272a',
      borderRadius: '14px',
      color: '#fff',
      marginBottom: '24px',
      overflow: 'hidden',
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
    }}>

      {/* ── Header / Toggle bar ── */}
      <div
        onClick={() => setIsExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 22px',
          background: '#202024',
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid #2e2e33' : 'none',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #ff2d55, #cf1322)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            boxShadow: '0 2px 8px rgba(255,45,85,0.4)'
          }}>
            🏷️
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, color: '#f4f4f5' }}>
                Brand Watermark & End-CTA Settings
              </h2>
              <span style={{
                background: 'rgba(255, 45, 85, 0.15)',
                color: '#ff2d55',
                border: '1px solid rgba(255, 45, 85, 0.3)',
                padding: '1px 7px',
                borderRadius: '4px',
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.04em'
              }}>MARKETER TIER</span>
              {enabled && (
                <span style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  padding: '1px 7px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 700
                }}>CTA ACTIVE</span>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#a1a1aa', margin: '3px 0 0 0' }}>
              Customize persistent brand overlay & animated call-to-action for all generated clips
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '0.82rem', fontWeight: 600 }}>
          <span>{isExpanded ? '▲ Collapse' : '▼ Expand'}</span>
        </div>
      </div>

      {/* ── Expanded Content ── */}
      {isExpanded && (
        <div style={{ padding: '22px' }}>

          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>

            {/* ════ LEFT: Live 9:16 Preview Canvas ════ */}
            <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e4e4e7' }}>Live 9:16 Canvas</span>
                <span style={{ fontSize: '0.75rem', color: '#ff2d55', fontWeight: 600 }}>
                  {enabled ? `Page ${activePageIdx + 1}/${pages.length}` : 'CTA Disabled'}
                </span>
              </div>

              {/* Mobile Frame */}
              <div style={{
                width: '210px',
                aspectRatio: '9/16',
                background: '#09090b',
                border: '2px solid #3f3f46',
                borderRadius: '16px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 12px 30px rgba(0,0,0,0.5)'
              }}>
                
                {/* Persistent Watermark Preview (Logo + Brand Text) */}
                <div style={{
                  position: 'absolute',
                  top: `${watermarkY}%`,
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(0, 0, 0, 0.45)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '100px',
                  padding: '4px 10px',
                  opacity: 0.85,
                  zIndex: 10,
                  pointerEvents: 'none',
                  transition: 'top 0.15s ease-out'
                }}>
                  <img
                    src="/logo.png"
                    alt="Logo"
                    style={{ width: '16px', height: '16px', objectFit: 'contain' }}
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  <span style={{ fontSize: '9px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                    ShortClipr.com
                  </span>
                </div>

                {/* Animated CTA Pages Overlay */}
                {enabled && pages.map((page, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${page.x}%`,
                    top: `${page.y}%`,
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    width: '90%',
                    pointerEvents: 'none',
                    opacity: i === activePageIdx ? 1 : 0,
                    transition: 'opacity 0.2s ease-in-out',
                    zIndex: 5
                  }}>
                    {page.words.map((word, wIdx) => (
                      <div key={wIdx} style={{
                        color: color,
                        fontSize: `${Math.max(12, page.font_size / 7.5)}px`,
                        fontWeight: '900',
                        lineHeight: '1.1',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        textTransform: 'uppercase',
                        textShadow: '0 2px 8px rgba(0,0,0,0.8)'
                      }}>
                        {word}
                      </div>
                    ))}
                  </div>
                ))}

                {!enabled && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#52525b',
                    fontSize: '11px',
                    textAlign: 'center',
                    padding: '16px'
                  }}>
                    (Captions play here — CTA currently off)
                  </div>
                )}
              </div>

              {/* Dots navigation for CTA pages */}
              {enabled && pages.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                  {pages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePageIdx(i)}
                      style={{
                        width: i === activePageIdx ? '16px' : '6px',
                        height: '6px',
                        borderRadius: '3px',
                        background: i === activePageIdx ? '#ff2d55' : '#52525b',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'all 0.2s'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ════ RIGHT: Configuration Controls ════ */}
            <div style={{ flex: '1', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* ── CARD 1: Brand Logo & Watermark Settings ── */}
              <div style={{
                background: '#202024',
                border: '1px solid #2e2e33',
                borderRadius: '10px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>🏷️</span>
                    <strong style={{ fontSize: '0.88rem', color: '#f4f4f5' }}>Brand Logo & Watermark</strong>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#a1a1aa', background: '#27272a', padding: '2px 8px', borderRadius: '4px' }}>
                    Persistent (Start to End)
                  </span>
                </div>

                <p style={{ fontSize: '0.78rem', color: '#a1a1aa', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                  Controls the vertical position of your combined <strong>Logo + ShortClipr.com</strong> branding watermark across the video.
                </p>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#d4d4d8', marginBottom: '6px' }}>
                    <span>Vertical Position (Y-Axis)</span>
                    <span style={{ color: '#ff2d55', fontWeight: 700 }}>{watermarkY}% from top</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="92"
                    value={watermarkY}
                    onChange={e => setWatermarkY(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#ff2d55', cursor: 'pointer' }}
                  />

                  {/* Preset Buttons */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {[
                      { label: 'Top (18%)', val: 18 },
                      { label: 'Middle (50%)', val: 50 },
                      { label: 'Lower 3rd (75%)', val: 75 },
                      { label: 'Bottom (88%)', val: 88 },
                    ].map(p => (
                      <button
                        key={p.val}
                        onClick={() => setWatermarkY(p.val)}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          borderRadius: '5px',
                          border: watermarkY === p.val ? '1px solid #ff2d55' : '1px solid #3f3f46',
                          background: watermarkY === p.val ? 'rgba(255,45,85,0.15)' : '#27272a',
                          color: watermarkY === p.val ? '#ff2d55' : '#d4d4d8',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── CARD 2: End CTA Animation Settings ── */}
              <div style={{
                background: '#202024',
                border: '1px solid #2e2e33',
                borderRadius: '10px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>⚡</span>
                    <strong style={{ fontSize: '0.88rem', color: '#f4f4f5' }}>End-of-Video Animated CTA</strong>
                  </div>

                  {/* Toggle Switch */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ fontSize: '0.78rem', color: enabled ? '#4ade80' : '#a1a1aa', fontWeight: 600 }}>
                      {enabled ? 'ON' : 'OFF'}
                    </span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => setEnabled(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#ff2d55', cursor: 'pointer' }}
                    />
                  </label>
                </div>

                <p style={{ fontSize: '0.78rem', color: '#a1a1aa', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                  When enabled, replaces normal captions in the <strong>final 10 seconds</strong> with dynamic animated typography scenes.
                </p>

                {enabled && (
                  <div>
                    {/* Global CTA Options */}
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '14px', background: '#18181b', padding: '10px 14px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', color: '#a1a1aa' }}>Text Color:</span>
                        <input
                          type="color"
                          value={color}
                          onChange={e => setColor(e.target.value)}
                          style={{ width: '28px', height: '28px', cursor: 'pointer', background: 'transparent', border: 'none', borderRadius: '4px' }}
                        />
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#d4d4d8' }}>{color}</span>
                      </div>

                      <div style={{ marginLeft: 'auto' }}>
                        <button
                          onClick={addPage}
                          style={{
                            background: 'rgba(255,45,85,0.15)',
                            border: '1px solid rgba(255,45,85,0.3)',
                            color: '#ff2d55',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          + Add Page
                        </button>
                      </div>
                    </div>

                    {/* Per-Page Editor List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto', paddingRight: '4px' }}>
                      {pages.map((page, i) => {
                        const wordsLen = Math.max(1, page.words.length)
                        const approxTime = totalWords > 0 ? ((wordsLen / totalWords) * 10).toFixed(1) : 0
                        const isActive = i === activePageIdx

                        return (
                          <div
                            key={i}
                            onClick={() => setActivePageIdx(i)}
                            style={{
                              background: '#18181b',
                              padding: '12px',
                              borderRadius: '8px',
                              border: isActive ? '1px solid #ff2d55' : '1px solid #27272a',
                              boxShadow: isActive ? '0 0 12px rgba(255,45,85,0.2)' : 'none',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isActive ? '#ff2d55' : '#f4f4f5' }}>
                                Scene {i + 1}
                                <span style={{ color: '#71717a', fontWeight: 400, marginLeft: '6px', fontSize: '0.75rem' }}>
                                  (~{approxTime}s)
                                </span>
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); removePage(i) }}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', fontSize: '13px' }}
                                disabled={pages.length <= 1}
                              >✕</button>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                              {/* Words Area */}
                              <div style={{ flex: '1', minWidth: '120px' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', color: '#71717a', marginBottom: '3px' }}>Words (one per row)</label>
                                <textarea
                                  value={page.words.join('\n')}
                                  onChange={e => handlePageChange(i, 'words', e.target.value.split('\n'))}
                                  rows={3}
                                  style={{
                                    width: '100%',
                                    background: '#27272a',
                                    border: '1px solid #3f3f46',
                                    color: '#fff',
                                    padding: '6px',
                                    borderRadius: '5px',
                                    resize: 'vertical',
                                    fontFamily: 'monospace',
                                    fontSize: '0.8rem'
                                  }}
                                />
                              </div>

                              {/* Page Controls */}
                              <div style={{ flex: '1', minWidth: '130px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#71717a', marginBottom: '2px' }}>Animation</label>
                                  <select
                                    value={page.animation}
                                    onChange={e => handlePageChange(i, 'animation', e.target.value)}
                                    style={{
                                      width: '100%',
                                      background: '#27272a',
                                      border: '1px solid #3f3f46',
                                      color: '#fff',
                                      padding: '4px',
                                      borderRadius: '5px',
                                      fontSize: '0.78rem'
                                    }}
                                  >
                                    <option value="staggered_stack">Staggered Stack</option>
                                    <option value="massive_pop">Massive Pop</option>
                                    <option value="slide_fade">Slide & Fade</option>
                                    <option value="typewriter">Typewriter</option>
                                  </select>
                                </div>

                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#71717a', marginBottom: '2px' }}>
                                    <span>Font Size</span><span>{page.font_size}px</span>
                                  </div>
                                  <input
                                    type="range" min="40" max="300"
                                    value={page.font_size}
                                    onChange={e => handlePageChange(i, 'font_size', parseInt(e.target.value))}
                                    style={{ width: '100%', accentColor: '#ff2d55' }}
                                  />
                                </div>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#71717a', marginBottom: '2px' }}>
                                      <span>X</span><span>{page.x}%</span>
                                    </div>
                                    <input
                                      type="range" min="0" max="100"
                                      value={page.x}
                                      onChange={e => handlePageChange(i, 'x', parseInt(e.target.value))}
                                      style={{ width: '100%', accentColor: '#ff2d55' }}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#71717a', marginBottom: '2px' }}>
                                      <span>Y</span><span>{page.y}%</span>
                                    </div>
                                    <input
                                      type="range" min="0" max="100"
                                      value={page.y}
                                      onChange={e => handlePageChange(i, 'y', parseInt(e.target.value))}
                                      style={{ width: '100%', accentColor: '#ff2d55' }}
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
                )}
              </div>

              {/* Error Message */}
              {error && <div style={{ color: '#ef4444', fontSize: '0.82rem' }}>⚠️ {error}</div>}

              {/* Save Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  style={{
                    background: saveSuccess ? '#16a34a' : saving ? '#52525b' : 'linear-gradient(135deg, #ff2d55, #cf1322)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(255,45,85,0.3)',
                    transition: 'all 0.2s'
                  }}
                >
                  {saving ? 'Saving Changes...' : saveSuccess ? '✓ Saved Successfully!' : 'Save Branding & CTA Settings'}
                </button>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  )
}
