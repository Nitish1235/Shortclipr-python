import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navigation from '../components/Navigation'
import { useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const TEMPLATES = [
  { id: 'full', name: 'FULL_SCREEN' },
  { id: 'blurred', name: 'BLURRED_EDGES' },
  { id: 'facecam', name: 'FACECAM_OVERLAY' },
  { id: 'gameplay', name: 'GAMEPLAY_CAM' },
  { id: 'split', name: 'SPLIT_SCREEN' },
]

export default function Editor() {
  const { jobId, clipId } = useParams()
  const navigate = useNavigate()

  const [isAdvanced, setIsAdvanced] = useState(false)
  const [activeTab, setActiveTab] = useState('templates')
  // New UI state for subtitle editing
  const [showSubtitleEditor, setShowSubtitleEditor] = useState(false)
  const [subtitlePosition, setSubtitlePosition] = useState({ x: 0.5, y: 0.9 })
  const { user, logout } = useAuth()
  const userPlan = user?.plan || 'free'
  const previewRef = useRef(null)
  const [isSaving, setIsSaving] = useState(false)

  // Template State
  const [aspect, setAspect] = useState('9:16')
  const [selectedTemplate, setSelectedTemplate] = useState('full')
  
  // Caption State
  const [captionPacing, setCaptionPacing] = useState('karaoke')
  const [highlightColor, setHighlightColor] = useState('#84cc16')
  const [showCaptions, setShowCaptions] = useState(true)
  const [transcriptBlocks, setTranscriptBlocks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchClipData = async () => {
      try {
        const token = localStorage.getItem('sc_token')
        const res = await fetch(`${API_BASE}/jobs/${jobId}/clips/${clipId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.status === 401) {
          logout()
          return
        }
        if (!res.ok) throw new Error('Failed to fetch clip data')
        const data = await res.json()
        
        // Map backend response to state
        if (data.transcript) setTranscriptBlocks(data.transcript)
        if (data.subtitle_position) setSubtitlePosition(data.subtitle_position)
        if (data.template) setSelectedTemplate(data.template)
        if (data.aspect_ratio) setAspect(data.aspect_ratio)
      } catch (err) {
        console.error('Error fetching clip:', err)
        // Fallback to dummy data for now if backend fails, to avoid breaking UI during dev
        setTranscriptBlocks([
          { id: 1, start: '00:00.0', end: '00:03.5', text: 'Welcome to this viral clip that will definitely pop off.' },
          { id: 2, start: '00:03.5', end: '00:07.2', text: 'Notice how the text bounds and highlights dynamically.' },
          { id: 3, start: '00:07.2', end: '00:10.0', text: 'Subscribe for more massive insights tomorrow!' },
        ])
      } finally {
        setLoading(false)
      }
    }
    fetchClipData()
  }, [jobId, clipId])

  const handleTextUpdate = (id, newText) => {
    setTranscriptBlocks(prev => prev.map(block => block.id === id ? { ...block, text: newText } : block))
  }

  const handleSave = async () => {
     // Build payload including subtitlePosition
     const payload = {
       aspect,
       template: selectedTemplate,
       captionPacing,
       highlightColor,
       subtitlePosition,
       transcript: transcriptBlocks,
     }
     try {
       setIsSaving(true)
       const token = localStorage.getItem('sc_token')
       const res = await fetch(`${API_BASE}/jobs/${jobId}/clips/${clipId}/config`, {
         method: 'POST',
         headers: { 
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${token}`
         },
         body: JSON.stringify(payload),
       })
       if (res.status === 401) {
         logout()
         return
       }
       if (!res.ok) throw new Error('Save failed')
       alert('Configuration saved successfully')
       navigate('/dashboard')
     } catch (e) {
       console.error(e)
       alert('Error saving configuration')
     } finally {
       setIsSaving(false)
     }
   }

  return (
    <>
      <Navigation />
      <div style={{ paddingTop: '80px', height: '100vh', display: 'flex', flexDirection: 'column', background: '#000', color: 'var(--text)' }}>
        
        {/* Editor Toolbar */}
        <div style={{ padding: '16px 5%', borderBottom: '2px solid var(--lime)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'Space Mono', monospace" }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>EDITOR_NODE :: </span>
            <span style={{ fontWeight: 800 }}>JOB_{jobId?.slice(0,6).toUpperCase()} / CLIP_{clipId}</span>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: '1px solid var(--muted)', color: 'var(--muted)', padding: '8px 16px', fontFamily: "'Space Mono', monospace", cursor: 'pointer' }}>
              [ ABORT ]
            </button>
            <button onClick={handleSave} style={{ background: isSaving ? 'var(--muted)' : 'var(--lime)', border: 'none', color: '#000', padding: '8px 16px', fontWeight: 800, fontFamily: "'Space Mono', monospace", cursor: 'pointer' }} disabled={userPlan !== 'pro' || isSaving} title={userPlan !== 'pro' ? 'Upgrade to Pro to generate with subtitle positioning' : ''}>
              {isSaving ? 'UPLOADING...' : (isAdvanced ? 'RENDER_CHANGES.EXE' : 'GENERATE_PRO_VIDEO.EXE')}
              {userPlan !== 'pro' && <span style={{ marginLeft: 4 }}>🔒</span>}
            </button>
            <button onClick={() => setIsAdvanced(prev => !prev)} style={{ background: isAdvanced ? 'var(--lime)' : 'none', border: '1px solid var(--muted)', color: isAdvanced ? '#000' : 'var(--muted)', padding: '8px 12px', fontFamily: "'Space Mono', monospace", cursor: 'pointer' }}>
              {isAdvanced ? 'SWITCH TO QUICK MODE' : 'SWITCH TO ADVANCED EDITING'}
            </button>
            <button onClick={() => setShowSubtitleEditor(prev => !prev)} style={{ background: showSubtitleEditor ? 'var(--lime)' : 'none', border: '1px solid var(--muted)', color: showSubtitleEditor ? '#000' : 'var(--muted)', padding: '8px 12px', fontFamily: "'Space Mono', monospace", cursor: 'pointer' }}>
              {showSubtitleEditor ? 'HIDE SUBTITLE EDIT' : 'EDIT SUBTITLES'}
            </button>
          </div>
        </div>

        {/* Modular Split Screen */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* LEFT: Video Preview Pane */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050d08', borderRight: '2px solid var(--muted)', padding: '24px', position: 'relative' }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, fontFamily: "'Space Mono', monospace", color: 'var(--lime)' }}>
                [ FETCHING_CLIP_DATA... ]
              </div>
            )}
            <div 
              ref={previewRef}
              style={{ 
                width: '100%', maxWidth: '380px', aspectRatio: aspect.replace(':', '/'), background: '#1a1a1a', 
                position: 'relative', border: '1px solid var(--lime)', boxShadow: '0 0 40px rgba(132, 204, 22, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
              }}
            >
              <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--muted)', opacity: 0.5 }}>[ VIDEO_STREAM_UNLINKED ]</span>
              <span style={{ position: 'absolute', top: 12, right: 12, background: 'red', color: 'white', padding: '2px 6px', fontSize: '10px', fontWeight: 900 }}>REC</span>
              
              {/* Dummy Caption Rendering Layer */}
              {showCaptions && (
                <div style={{ position: 'absolute', bottom: '15%', width: '90%', textAlign: 'center' }}>
                  <span style={{ 
                    fontFamily: "'Inter', sans-serif", fontSize: '1.4rem', fontWeight: 800, 
                    color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.8)', padding: '4px',
                  }}>
                    VIRAL <span style={{ color: highlightColor }}>CAPTIONS</span> RENDER_TEST
                  </span>
                </div>
              )}
              {/* Subtitle Position Preview (draggable) */}
              {showSubtitleEditor && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${subtitlePosition.x * 100}%`,
                    top: `${subtitlePosition.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    color: highlightColor,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '1.2rem',
                    cursor: 'move',
                    userSelect: 'none',
                  }}
                  onMouseDown={e => {
                    e.preventDefault()
                    if (!previewRef.current) return
                    
                    const rect = previewRef.current.getBoundingClientRect()
                    
                    const onMove = ev => {
                      const newX = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
                      const newY = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height))
                      setSubtitlePosition({ x: newX, y: newY })
                    }
                    
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                    }
                    
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }}
                >
                  SAMPLE SUBTITLE
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Confguration Controls */}
          <div style={{ width: '500px', background: '#000', display: 'flex', flexDirection: 'column' }}>
            
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--muted)' }}>
              <button 
                onClick={() => setActiveTab('templates')}
                style={{ flex: 1, padding: '16px', background: activeTab === 'templates' ? 'var(--lime)' : '#000', color: activeTab === 'templates' ? '#000' : 'var(--muted)', border: 'none', fontFamily: "'Space Mono', monospace", fontWeight: 700, cursor: 'pointer' }}
              >
                LAYOUTS
              </button>
              <button 
                onClick={() => setActiveTab('captions')}
                style={{ flex: 1, padding: '16px', background: activeTab === 'captions' ? 'var(--lime)' : '#000', color: activeTab === 'captions' ? '#000' : 'var(--muted)', border: 'none', fontFamily: "'Space Mono', monospace", fontWeight: 700, cursor: 'pointer' }}
              >
                PRO_CAPTIONS
              </button>
            </div>

            {/* Tab Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              
              {activeTab === 'templates' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  <div>
                    <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.8rem', display: 'block', marginBottom: '12px' }}>ASPECT_RATIO_TARGET</span>
                    <select 
                      value={aspect} onChange={e => setAspect(e.target.value)}
                      style={{ width: '100%', background: '#1a1a1a', border: '1px solid var(--muted)', color: 'white', padding: '12px', fontFamily: "'Inter', sans-serif" }}
                    >
                      <option value="9:16">Portrait 9:16 (TikTok, Shorts, IG Reels)</option>
                      <option value="16:9">Landscape 16:9 (YouTube, X)</option>
                      <option value="1:1">Square 1:1 (Facebook, LinkedIn)</option>
                    </select>
                  </div>

                  <div>
                    <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.8rem', display: 'block', marginBottom: '12px' }}>APPLY_TEMPLATE_MATRIX</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {TEMPLATES.map(tpl => (
                        <div 
                          key={tpl.id} 
                          onClick={() => setSelectedTemplate(tpl.id)}
                          style={{
                            background: '#1a1a1a', height: '140px', border: selectedTemplate === tpl.id ? '2px solid var(--lime)' : '1px solid #333',
                            borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            boxShadow: selectedTemplate === tpl.id ? 'inset 0 0 15px rgba(132, 204, 22, 0.2)' : 'none',
                            position: 'relative', overflow: 'hidden', gap: '8px'
                          }}
                        >
                          {/* CSS Wireframe */}
                          <div style={{ width: '40px', height: '70px', border: '1px solid currentColor', color: selectedTemplate === tpl.id ? 'var(--lime)' : 'var(--muted)', position: 'relative', background: '#000' }}>
                            {tpl.id === 'full' && <div style={{ position: 'absolute', inset: 2, background: 'currentColor', opacity: 0.3 }} />}
                            {tpl.id === 'blurred' && <div style={{ position: 'absolute', inset: 6, background: 'currentColor', opacity: 0.3, boxShadow: '0 0 8px currentColor' }} />}
                            {tpl.id === 'facecam' && (
                              <>
                                <div style={{ position: 'absolute', inset: 0, background: 'currentColor', opacity: 0.1 }} />
                                <div style={{ position: 'absolute', top: 4, right: 4, width: '12px', height: '12px', border: '1px solid currentColor', background: '#000' }} />
                              </>
                            )}
                            {tpl.id === 'gameplay' && (
                              <>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%', borderBottom: '1px solid currentColor', background: 'currentColor', opacity: 0.2 }} />
                                <div style={{ position: 'absolute', bottom: 4, left: 4, width: '16px', height: '12px', border: '1px solid currentColor', background: '#000' }} />
                              </>
                            )}
                            {tpl.id === 'split' && (
                              <>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '48%', borderBottom: '1px dashed currentColor', background: 'currentColor', opacity: 0.2 }} />
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '48%', background: 'currentColor', opacity: 0.2 }} />
                              </>
                            )}
                          </div>

                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.65rem', color: selectedTemplate === tpl.id ? 'var(--lime)' : 'var(--muted)', textAlign: 'center', textTransform: 'uppercase' }}>
                            {tpl.name.replace('_', ' ')}
                          </span>
                          {selectedTemplate === tpl.id && <div style={{ position: 'absolute', top: 5, right: 5, fontSize: '10px' }}>[ SELECTED ]</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'captions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  
                  {/* Pacing Settings */}
                  <div>
                    <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.8rem', display: 'block', marginBottom: '8px' }}>TEXT_PACING_ALGORITHM</span>
                    <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '16px', lineHeight: 1.4 }}>
                      Choose how captions appear on screen. Karaoke style creates highly engaging, fast-paced viral videos.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: captionPacing === 'karaoke' ? 'rgba(132, 204, 22, 0.1)' : '#1a1a1a', border: captionPacing === 'karaoke' ? '1px solid var(--lime)' : '1px solid #333', padding: '16px', cursor: 'pointer' }}>
                        <input type="radio" value="karaoke" checked={captionPacing === 'karaoke'} onChange={() => setCaptionPacing('karaoke')} style={{ marginTop: '4px' }} />
                        <div>
                          <div style={{ fontWeight: 800, color: '#fff', marginBottom: '4px' }}>Fast Karaoke (1 Word at a time)</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            "Bouncing text" effect. One word displays per millisecond, keeping viewer attention locked in. Great for TikTok!
                          </div>
                        </div>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: captionPacing === 'chunks' ? 'rgba(132, 204, 22, 0.1)' : '#1a1a1a', border: captionPacing === 'chunks' ? '1px solid var(--lime)' : '1px solid #333', padding: '16px', cursor: 'pointer' }}>
                        <input type="radio" value="chunks" checked={captionPacing === 'chunks'} onChange={() => setCaptionPacing('chunks')} style={{ marginTop: '4px' }} />
                        <div>
                          <div style={{ fontWeight: 800, color: '#fff', marginBottom: '4px' }}>Standard Phrases (3-4 Words)</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            Sentence blocks appear statically. Best for slower podcasts or highly technical explanations.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                  {/* Subtitle Position Controls (visible when editor toggled) */}
                  {showSubtitleEditor && (
                    <div style={{ marginTop: '24px' }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.8rem', display: 'block', marginBottom: '8px' }}>SUBTITLE POSITION (X / Y)</span>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round(subtitlePosition.x * 100)}
                          onChange={e => setSubtitlePosition({ ...subtitlePosition, x: e.target.value / 100 })}
                          style={{ flex: 1, background: 'var(--lime)', cursor: 'pointer' }}
                        />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round(subtitlePosition.y * 100)}
                          onChange={e => setSubtitlePosition({ ...subtitlePosition, y: e.target.value / 100 })}
                          style={{ flex: 1, background: 'var(--lime)', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Highlighting */}
                  <div>
                    <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.8rem', display: 'block', marginBottom: '12px' }}>HIGHLIGHT_COLOR_HEX</span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {['#84cc16', '#fbbf24', '#f43f5e', '#38bdf8', '#ffffff'].map(color => (
                        <div 
                          key={color} onClick={() => setHighlightColor(color)}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', background: color, border: highlightColor === color ? '3px solid white' : '1px solid #333', cursor: 'pointer' }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Transcript Timeline */}
                  <div>
                    <span style={{ fontFamily: "'Space Mono', monospace", color: 'var(--lime)', fontSize: '0.8rem', display: 'block', marginBottom: '12px' }}>TRANSCRIPT_TIMELINE_EDITOR</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {transcriptBlocks.map(block => (
                        <div key={block.id} style={{ display: 'flex', gap: '12px' }}>
                          <div style={{ fontFamily: "'Space Mono', monospace", color: 'var(--muted)', fontSize: '0.65rem', width: '60px', paddingTop: '8px' }}>
                            {block.start}<br/>|<br/>{block.end}
                          </div>
                          <textarea 
                            value={block.text}
                            onChange={(e) => handleTextUpdate(block.id, e.target.value)}
                            style={{ flex: 1, background: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '12px', minHeight: '60px', fontFamily: "'Inter', sans-serif", fontSize: '0.9rem', resize: 'vertical' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
