import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navigation from '../components/Navigation'
import CaptionOverlay from '../components/CaptionOverlay'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const TEMPLATES = [
  { id:'blur_bg',      name:'Blur BG'      },
  { id:'zoom_blur',    name:'Zoom Blur'    },
  { id:'glass',        name:'Glass'        },
  { id:'color_bars',   name:'Color Bars'   },
  { id:'gradient',     name:'Gradient'     },
  { id:'cinema',       name:'Cinema'       },
  { id:'neon_frame',   name:'Neon Frame'   },
  { id:'split_screen', name:'Split Screen' },
  { id:'screenshare',  name:'Screenshare'  },
  { id:'gameplay',     name:'Gameplay'     },
]

const CAPTION_STYLES = [
  { val:'minimal',    label:'Minimal',    sub:'Clean single-line captions' },
  { val:'fade',       label:'Fade',       sub:'Smooth fade-in per line' },
  { val:'word_pop',   label:'Word Pop',   sub:'Each word pops as it’s spoken' },
  { val:'typewriter', label:'Typewriter', sub:'Characters type in sequentially' },
  { val:'slide',      label:'Slide',      sub:'Lines slide in from the side' },
  { val:'zoom',       label:'Zoom',       sub:'Words zoom in for emphasis' },
  { val:'shake',      label:'Shake',      sub:'Punchy shake on the active word' },
  { val:'karaoke',    label:'Karaoke',    sub:'1 word at a time — max engagement' },
  { val:'hormozi',    label:'Hormozi',    sub:'Bold caps with high-contrast highlight' },
  { val:'mrbeast',    label:'MrBeast',    sub:'Big bouncy text, bright highlight' },
  { val:'neon',       label:'Neon',       sub:'Glowing neon outline' },
]

const COLOR_COMBOS = [
  { val:'white_black',  label:'White / Black'  },
  { val:'yellow_black', label:'Yellow / Black' },
  { val:'black_white',  label:'Black / White'  },
  { val:'green_dark',   label:'Green / Dark'   },
  { val:'orange_dark',  label:'Orange / Dark'  },
  { val:'cyan_dark',    label:'Cyan / Dark'    },
  { val:'red_white',    label:'Red / White'    },
]

const H_ALIGNS       = ['left', 'center', 'right']
const V_ALIGNS       = ['top', 'center', 'bottom']
const WORDS_PER_LINE = [1, 2, 3]

const formatTimestamp = (seconds) => {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const rem = (s % 60).toFixed(1)
  return `${String(m).padStart(2, '0')}:${rem.padStart(4, '0')}`
}

// ── Shared styles ────────────────────────────────────────────────
const tabBtn = (active) => ({
  flex:1, padding:'14px',
  background: active ? '#cf1322' : '#fff',
  color: active ? '#fff' : '#666',
  border:'none', borderBottom: active ? '2px solid #cf1322' : '2px solid #e5e5e5',
  fontWeight:700, fontSize:'0.82rem', cursor:'pointer',
  transition:'all 0.15s',
})

const labelStyle = {
  fontSize:'0.72rem', fontWeight:700, color:'#555',
  textTransform:'uppercase', letterSpacing:'0.1em',
  display:'block', marginBottom:'10px',
}

export default function Editor() {
  const { jobId, clipId } = useParams()
  const navigate          = useNavigate()
  const { user, logout }  = useAuth()
  const userPlan          = user?.plan || 'free'
  const previewRef        = useRef(null)
  const videoRef          = useRef(null)

  const [activeTab,          setActiveTab]          = useState('templates')
  const [showSubtitleEditor, setShowSubtitleEditor] = useState(false)
  const [subtitlePosition,   setSubtitlePosition]   = useState({ x:0.5, y:0.9 })
  const [isSaving,           setIsSaving]           = useState(false)
  const [isRendering,        setIsRendering]        = useState(false)
  const [loading,            setLoading]            = useState(true)

  const [aspect,            setAspect]            = useState('9:16')
  const [selectedTemplate,  setSelectedTemplate]  = useState('blur_bg')
  const [captionStyle,      setCaptionStyle]      = useState('karaoke')
  const [colorCombo,        setColorCombo]        = useState('white_black')
  const [hAlign,            setHAlign]            = useState('center')
  const [vAlign,            setVAlign]            = useState('bottom')
  const [wordsPerLine,      setWordsPerLine]      = useState(2)
  const [highlightColor,    setHighlightColor]    = useState('#cf1322')
  const [showCaptions,      setShowCaptions]      = useState(true)
  const [transcriptBlocks,  setTranscriptBlocks]  = useState([])
  const [isAdvanced,        setIsAdvanced]        = useState(false)
  const [clipUrl,           setClipUrl]           = useState('')
  const [thumbnailUrl,      setThumbnailUrl]      = useState('')
  const [rawVideoUrl,       setRawVideoUrl]       = useState('')
  const [captionsData,      setCaptionsData]      = useState([])

  useEffect(() => {
    const fetchClipData = async () => {
      try {
        const token = localStorage.getItem('sc_token')
        const res   = await fetch(`${API_BASE}/jobs/${jobId}/clips`, {
          headers:{ Authorization:`Bearer ${token}` },
        })
        if (res.status === 401) { logout(); return }
        if (!res.ok) throw new Error('Failed to fetch clip data')
        const data = await res.json()
        const clip = (data.clips || []).find(c => c.clip_id === clipId)
        if (!clip) throw new Error('Clip not found')

        setClipUrl(clip.video_url || '')
        setThumbnailUrl(clip.thumbnail_url || '')
        setRawVideoUrl(clip.raw_video_url || '')
        setCaptionsData(Array.isArray(clip.captions_data) ? clip.captions_data : [])

        const cfg = clip.editor_config || {}
        if (cfg.aspect)           setAspect(cfg.aspect)
        if (cfg.template)         setSelectedTemplate(cfg.template)
        if (cfg.style)            setCaptionStyle(cfg.style)
        if (cfg.color)            setColorCombo(cfg.color)
        if (cfg.h_align)          setHAlign(cfg.h_align)
        if (cfg.v_align)          setVAlign(cfg.v_align)
        if (cfg.words_per_line)   setWordsPerLine(cfg.words_per_line)
        if (cfg.highlightColor)   setHighlightColor(cfg.highlightColor)
        if (cfg.subtitlePosition) setSubtitlePosition(cfg.subtitlePosition)

        if (Array.isArray(cfg.transcript) && cfg.transcript.length) {
          setTranscriptBlocks(cfg.transcript)
        } else {
          setTranscriptBlocks([{
            id: 1,
            start: '00:00.0',
            end: formatTimestamp(clip.duration),
            text: clip.transcript_snippet || '',
          }])
        }
      } catch (e) {
        console.error('Failed to load clip:', e)
      } finally { setLoading(false) }
    }
    fetchClipData()
  }, [jobId, clipId])

  const handleTextUpdate = (id, val) =>
    setTranscriptBlocks(prev => prev.map(b => b.id === id ? { ...b, text:val } : b))

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const token = localStorage.getItem('sc_token')
      const res   = await fetch(`${API_BASE}/editor/save/${jobId}/${clipId}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({
          aspect,
          template: selectedTemplate,
          style: captionStyle,
          color: colorCombo,
          h_align: hAlign,
          v_align: vAlign,
          words_per_line: wordsPerLine,
          highlightColor,
          subtitlePosition,
          transcript: transcriptBlocks,
        }),
      })
      if (res.status === 401) { logout(); return }
      if (!res.ok) throw new Error('Save failed')
      alert('Configuration saved successfully')
      navigate('/dashboard')
    } catch (e) { alert('Error saving configuration') }
    finally     { setIsSaving(false) }
  }

  const handleRender = async () => {
    if (!rawVideoUrl) return handleSave()
    setIsRendering(true)
    try {
      const token = localStorage.getItem('sc_token')
      const res   = await fetch(`${API_BASE}/editor/render/${jobId}/${clipId}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({
          style: captionStyle,
          color: colorCombo,
          h_align: hAlign,
          v_align: vAlign,
          words_per_line: wordsPerLine,
          highlightColor,
        }),
      })
      if (res.status === 401) { logout(); return }
      if (!res.ok) throw new Error('Render failed')
      const data = await res.json()
      setClipUrl(data.video_url)
      alert('Captions rendered — your download is ready.')
    } catch (e) { alert('Error rendering captions') }
    finally     { setIsRendering(false) }
  }

  // ── Paywall ──────────────────────────────────────────────────────
  if (userPlan === 'free') return (
    <>
      <Navigation />
      <main style={{ background:'#f9f9f9', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 5%' }}>
        <div style={{
          background:'#fff', border:'2px solid #111', borderRadius:'16px',
          boxShadow:'6px 6px 0 #cf1322', maxWidth:'460px', width:'100%',
          padding:'40px', textAlign:'center',
        }}>
          <div style={{ fontSize:'3rem', marginBottom:'16px' }}>🔒</div>
          <div style={{
            display:'inline-block', background:'#fef2f2', border:'1px solid #fecaca',
            borderRadius:'100px', padding:'3px 12px', fontSize:'0.7rem', fontWeight:700,
            color:'#cf1322', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:'14px',
          }}>Paid Feature</div>
          <h1 style={{ fontSize:'1.4rem', fontWeight:700, color:'#111', marginBottom:'12px' }}>
            Editor requires a paid plan
          </h1>
          <p style={{ fontSize:'0.875rem', color:'#666', lineHeight:1.7, marginBottom:'28px' }}>
            The clip editor — caption styles, templates, position controls, colour combos —
            is available on paid plans. Free accounts get <strong style={{ color:'#cf1322' }}>3 free generations</strong> to preview ShortClipr.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'24px', textAlign:'left' }}>
            {[
              { name:'Starter', price:'$10/mo', desc:'100 shorts · Editor · Downloads'   },
              { name:'Pro',     price:'$45/mo', desc:'500 shorts · Everything · Priority' },
            ].map(p => (
              <div key={p.name} style={{
                border:'1px solid #e5e5e5', borderRadius:'10px', padding:'14px 16px',
                display:'flex', justifyContent:'space-between', alignItems:'center',
              }}>
                <div>
                  <div style={{ fontWeight:700, color:'#111' }}>{p.name}</div>
                  <div style={{ fontSize:'0.75rem', color:'#999', marginTop:'2px' }}>{p.desc}</div>
                </div>
                <span style={{ fontWeight:700, color:'#cf1322' }}>{p.price}</span>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
            <a href="/" style={{
              background:'#cf1322', color:'#fff', border:'2px solid #111',
              borderRadius:'8px', padding:'11px 24px', fontWeight:700, fontSize:'0.875rem',
              boxShadow:'2px 2px 0 #111', display:'inline-block',
            }}>Upgrade now →</a>
            <button onClick={() => navigate('/dashboard')} style={{
              background:'transparent', border:'1.5px solid #e5e5e5', borderRadius:'8px',
              color:'#666', padding:'11px 18px', cursor:'pointer', fontWeight:600, fontSize:'0.875rem',
            }}>← Back</button>
          </div>
        </div>
      </main>
    </>
  )

  // ── Main Editor ──────────────────────────────────────────────────
  return (
    <>
      <Navigation />
      <div style={{ paddingTop:'70px', height:'100vh', display:'flex', flexDirection:'column', background:'#f9f9f9' }}>

        {/* Toolbar */}
        <div style={{
          padding:'12px 5%', background:'#fff',
          borderBottom:'1px solid #e5e5e5',
          display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap',
        }}>
          <div>
            <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#111' }}>
              Clip Editor
            </div>
            <div style={{ fontSize:'0.72rem', color:'#999' }}>
              Job {jobId?.slice(0,6).toUpperCase()} / Clip {clipId}
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <button onClick={() => setShowSubtitleEditor(p => !p)} style={{
              background: showSubtitleEditor ? '#fef2f2' : 'transparent',
              border: showSubtitleEditor ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
              borderRadius:'8px', color: showSubtitleEditor ? '#cf1322' : '#666',
              padding:'8px 14px', cursor:'pointer', fontWeight:600, fontSize:'0.8rem',
            }}>
              {showSubtitleEditor ? '✏ Subtitle On' : '✏ Edit Subtitles'}
            </button>
            <button onClick={() => setIsAdvanced(p => !p)} style={{
              background: isAdvanced ? '#fef2f2' : 'transparent',
              border: isAdvanced ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
              borderRadius:'8px', color: isAdvanced ? '#cf1322' : '#666',
              padding:'8px 14px', cursor:'pointer', fontWeight:600, fontSize:'0.8rem',
            }}>
              {isAdvanced ? 'Quick Mode' : 'Advanced'}
            </button>
            <button onClick={() => navigate('/dashboard')} style={{
              background:'transparent', border:'1.5px solid #e5e5e5', borderRadius:'8px',
              color:'#666', padding:'8px 16px', cursor:'pointer', fontWeight:600, fontSize:'0.8rem',
            }}>← Back</button>
            <button onClick={handleRender} disabled={isSaving || isRendering} style={{
              background:'#cf1322', color:'#fff',
              border:'2px solid #111', borderRadius:'8px',
              padding:'9px 20px', fontWeight:700, fontSize:'0.85rem',
              cursor: (isSaving || isRendering) ? 'wait' : 'pointer',
              boxShadow:'2px 2px 0 #111', opacity: (isSaving || isRendering) ? 0.7 : 1,
              transition:'transform 0.1s, box-shadow 0.1s',
            }}
              onMouseEnter={e => { if (!isSaving && !isRendering) { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' }}}
              onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
            >
              {isRendering ? 'Rendering…' : (isSaving ? 'Saving…' : (isAdvanced ? 'Render Changes →' : 'Generate Video →'))}
            </button>
          </div>
        </div>

        {/* Split layout */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

          {/* Left: Video preview */}
          <div style={{
            flex:1, display:'flex', alignItems:'center', justifyContent:'center',
            background:'#1a1a1a', borderRight:'1px solid #e5e5e5', padding:'24px', position:'relative',
          }}>
            {loading && (
              <div style={{
                position:'absolute', inset:0,
                background:'rgba(0,0,0,0.6)', display:'flex',
                alignItems:'center', justifyContent:'center', zIndex:10, flexDirection:'column', gap:'12px',
              }}>
                <div style={{ width:'32px', height:'32px', border:'3px solid rgba(255,255,255,0.2)', borderTopColor:'#cf1322', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                <span style={{ color:'#fff', fontSize:'0.85rem' }}>Loading clip…</span>
              </div>
            )}
            <div ref={previewRef} style={{
              width:'100%', maxWidth:'320px',
              aspectRatio: aspect.replace(':','/'),
              background:'#111', position:'relative',
              border:'2px solid #cf1322', borderRadius:'8px',
              boxShadow:'0 0 30px rgba(207,19,34,0.2)',
              display:'flex', alignItems:'center', justifyContent:'center',
              overflow:'hidden',
            }}>
              {/* Video */}
              {clipUrl ? (
                <video
                  ref={videoRef}
                  src={rawVideoUrl || clipUrl}
                  poster={thumbnailUrl || undefined}
                  controls
                  style={{ width:'100%', height:'100%', objectFit:'contain' }}
                />
              ) : (
                <span style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.8rem', textAlign:'center', padding:'20px' }}>
                  {loading ? 'Loading…' : 'Video preview unavailable'}
                </span>
              )}
              {/* REC badge */}
              <div style={{ position:'absolute', top:'10px', left:'10px', background:'#cf1322', color:'#fff', fontSize:'0.6rem', fontWeight:900, padding:'2px 7px', borderRadius:'4px', letterSpacing:'0.05em' }}>REC</div>
              {/* Aspect label */}
              <div style={{ position:'absolute', top:'10px', right:'10px', background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:'0.6rem', padding:'2px 7px', borderRadius:'4px' }}>{aspect}</div>
              {/* Caption overlay */}
              {showCaptions && (
                rawVideoUrl && captionsData.length > 0 ? (
                  <CaptionOverlay
                    synced
                    videoRef={videoRef}
                    captionsData={captionsData}
                    style={captionStyle}
                    color={colorCombo}
                    hAlign={hAlign}
                    vAlign={vAlign}
                    wordsPerLine={wordsPerLine}
                    highlightColor={highlightColor}
                  />
                ) : (
                  <div style={{
                    position:'absolute', bottom:'18%', width:'90%', textAlign:'center',
                  }}>
                    <span style={{
                      fontWeight:800, fontSize:'1.2rem', color:'#fff',
                      textShadow:'0 2px 6px rgba(0,0,0,0.9)', padding:'4px',
                    }}>
                      VIRAL <span style={{ color:highlightColor }}>CAPTIONS</span>
                    </span>
                  </div>
                )
              )}
              {/* Draggable subtitle position */}
              {showSubtitleEditor && (
                <div style={{
                  position:'absolute',
                  left:`${subtitlePosition.x * 100}%`,
                  top:`${subtitlePosition.y * 100}%`,
                  transform:'translate(-50%,-50%)',
                  color:highlightColor, fontWeight:800, fontSize:'0.9rem',
                  cursor:'move', userSelect:'none',
                  background:'rgba(0,0,0,0.5)', padding:'3px 8px', borderRadius:'4px',
                  border:'1px dashed rgba(255,255,255,0.4)',
                }} onMouseDown={e => {
                  e.preventDefault()
                  if (!previewRef.current) return
                  const rect = previewRef.current.getBoundingClientRect()
                  const onMove = ev => setSubtitlePosition({
                    x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
                    y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
                  })
                  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                  window.addEventListener('mousemove', onMove)
                  window.addEventListener('mouseup', onUp)
                }}>
                  DRAG ME
                </div>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div style={{ width:'460px', background:'#fff', display:'flex', flexDirection:'column', borderLeft:'1px solid #e5e5e5' }}>

            {/* Tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid #e5e5e5' }}>
              <button style={tabBtn(activeTab === 'templates')} onClick={() => setActiveTab('templates')}>Layouts</button>
              <button style={tabBtn(activeTab === 'captions')} onClick={() => setActiveTab('captions')}>Captions</button>
            </div>

            {/* Tab body */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

              {/* ── Templates tab ── */}
              {activeTab === 'templates' && (
                <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

                  <div>
                    <span style={labelStyle}>Aspect Ratio</span>
                    <select value={aspect} onChange={e => setAspect(e.target.value)} style={{
                      width:'100%', background:'#f9f9f9', border:'1.5px solid #e5e5e5',
                      borderRadius:'8px', padding:'10px 14px', fontSize:'0.875rem',
                      outline:'none', cursor:'pointer',
                    }}
                      onFocus={e => e.target.style.borderColor='#cf1322'}
                      onBlur={e => e.target.style.borderColor='#e5e5e5'}
                    >
                      <option value="9:16">Portrait 9:16 — TikTok, Shorts, IG Reels</option>
                      <option value="16:9">Landscape 16:9 — YouTube, X</option>
                      <option value="1:1">Square 1:1 — Facebook, LinkedIn</option>
                    </select>
                  </div>

                  <div>
                    <span style={labelStyle}>Layout Template</span>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                      {TEMPLATES.map(tpl => (
                        <button key={tpl.id} onClick={() => setSelectedTemplate(tpl.id)} style={{
                          padding:'14px 10px', borderRadius:'10px', textAlign:'center',
                          background: selectedTemplate === tpl.id ? '#fef2f2' : '#f9f9f9',
                          border: selectedTemplate === tpl.id ? '2px solid #cf1322' : '1.5px solid #e5e5e5',
                          color: selectedTemplate === tpl.id ? '#cf1322' : '#555',
                          cursor:'pointer', fontSize:'0.8rem', fontWeight:600,
                          transition:'all 0.15s',
                        }}>
                          {tpl.name}
                          {selectedTemplate === tpl.id && <div style={{ fontSize:'0.65rem', marginTop:'3px', opacity:0.7 }}>Selected ✓</div>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Caption toggle */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderTop:'1px solid #f0f0f0' }}>
                    <span style={{ fontSize:'0.875rem', fontWeight:600, color:'#111' }}>Show Captions</span>
                    <button onClick={() => setShowCaptions(p => !p)} style={{
                      background: showCaptions ? '#cf1322' : '#e5e5e5',
                      border:'none', borderRadius:'100px', width:'44px', height:'24px',
                      cursor:'pointer', position:'relative', transition:'background 0.2s',
                    }}>
                      <span style={{
                        position:'absolute', top:'3px', width:'18px', height:'18px',
                        background:'#fff', borderRadius:'50%', transition:'left 0.2s',
                        left: showCaptions ? '23px' : '3px',
                      }}/>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Captions tab ── */}
              {activeTab === 'captions' && (
                <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

                  {/* Caption style */}
                  <div>
                    <span style={labelStyle}>Caption Style</span>
                    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                      {CAPTION_STYLES.map(o => (
                        <label key={o.val} style={{
                          display:'flex', alignItems:'flex-start', gap:'12px',
                          background: captionStyle === o.val ? '#fef2f2' : '#f9f9f9',
                          border: captionStyle === o.val ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                          borderRadius:'10px', padding:'14px', cursor:'pointer',
                        }}>
                          <input type="radio" value={o.val} checked={captionStyle === o.val} onChange={() => setCaptionStyle(o.val)} style={{ marginTop:'2px' }}/>
                          <div>
                            <div style={{ fontWeight:700, fontSize:'0.875rem', color:'#111', marginBottom:'3px' }}>{o.label}</div>
                            <div style={{ fontSize:'0.78rem', color:'#666' }}>{o.sub}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Color combo */}
                  <div>
                    <span style={labelStyle}>Caption Colors</span>
                    <select value={colorCombo} onChange={e => setColorCombo(e.target.value)} style={{
                      width:'100%', background:'#f9f9f9', border:'1.5px solid #e5e5e5',
                      borderRadius:'8px', padding:'10px 14px', fontSize:'0.875rem',
                      outline:'none', cursor:'pointer',
                    }}
                      onFocus={e => e.target.style.borderColor='#cf1322'}
                      onBlur={e => e.target.style.borderColor='#e5e5e5'}
                    >
                      {COLOR_COMBOS.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                    </select>
                  </div>

                  {/* Position */}
                  <div style={{ display:'flex', gap:'10px' }}>
                    <div style={{ flex:1 }}>
                      <span style={labelStyle}>Horizontal</span>
                      <select value={hAlign} onChange={e => setHAlign(e.target.value)} style={{
                        width:'100%', background:'#f9f9f9', border:'1.5px solid #e5e5e5',
                        borderRadius:'8px', padding:'10px 14px', fontSize:'0.875rem',
                        outline:'none', cursor:'pointer',
                      }}>
                        {H_ALIGNS.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
                      </select>
                    </div>
                    <div style={{ flex:1 }}>
                      <span style={labelStyle}>Vertical</span>
                      <select value={vAlign} onChange={e => setVAlign(e.target.value)} style={{
                        width:'100%', background:'#f9f9f9', border:'1.5px solid #e5e5e5',
                        borderRadius:'8px', padding:'10px 14px', fontSize:'0.875rem',
                        outline:'none', cursor:'pointer',
                      }}>
                        {V_ALIGNS.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Words per line */}
                  <div>
                    <span style={labelStyle}>Words Per Line</span>
                    <div style={{ display:'flex', gap:'10px' }}>
                      {WORDS_PER_LINE.map(n => (
                        <button key={n} onClick={() => setWordsPerLine(n)} style={{
                          flex:1, padding:'10px', borderRadius:'8px', textAlign:'center',
                          background: wordsPerLine === n ? '#fef2f2' : '#f9f9f9',
                          border: wordsPerLine === n ? '2px solid #cf1322' : '1.5px solid #e5e5e5',
                          color: wordsPerLine === n ? '#cf1322' : '#555',
                          cursor:'pointer', fontSize:'0.85rem', fontWeight:600,
                        }}>{n}</button>
                      ))}
                    </div>
                  </div>

                  {/* Highlight color */}
                  <div>
                    <span style={labelStyle}>Highlight Color</span>
                    <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
                      {['#cf1322','#f59e0b','#22c55e','#38bdf8','#a855f7','#ffffff'].map(c => (
                        <button key={c} onClick={() => setHighlightColor(c)} style={{
                          width:'32px', height:'32px', background:c, borderRadius:'50%',
                          border: highlightColor === c ? '3px solid #111' : '2px solid #e5e5e5',
                          cursor:'pointer', boxShadow: highlightColor === c ? '0 0 0 3px rgba(0,0,0,0.1)' : 'none',
                        }}/>
                      ))}
                    </div>
                  </div>

                  {/* Subtitle position sliders */}
                  {showSubtitleEditor && (
                    <div>
                      <span style={labelStyle}>Subtitle Position</span>
                      <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                        {[['Horizontal (X)', 'x'], ['Vertical (Y)', 'y']].map(([label, axis]) => (
                          <div key={axis}>
                            <div style={{ fontSize:'0.75rem', color:'#666', marginBottom:'5px' }}>{label}: {Math.round(subtitlePosition[axis] * 100)}%</div>
                            <input type="range" min={0} max={100} value={Math.round(subtitlePosition[axis] * 100)}
                              onChange={e => setSubtitlePosition(p => ({ ...p, [axis]: e.target.value / 100 }))}
                              style={{ width:'100%', accentColor:'#cf1322' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transcript timeline */}
                  <div>
                    <span style={labelStyle}>Transcript Editor</span>
                    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                      {transcriptBlocks.map(block => (
                        <div key={block.id} style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
                          <div style={{ fontSize:'0.65rem', color:'#aaa', width:'55px', paddingTop:'10px', lineHeight:1.5, flexShrink:0, fontFamily:'monospace' }}>
                            {block.start}<br/>↓<br/>{block.end}
                          </div>
                          <textarea
                            value={block.text}
                            onChange={e => handleTextUpdate(block.id, e.target.value)}
                            style={{
                              flex:1, background:'#f9f9f9', color:'#111',
                              border:'1.5px solid #e5e5e5', borderRadius:'8px',
                              padding:'10px 12px', minHeight:'60px', fontSize:'0.875rem',
                              resize:'vertical', outline:'none', fontFamily:'Space Grotesk, sans-serif',
                            }}
                            onFocus={e => e.target.style.borderColor='#cf1322'}
                            onBlur={e => e.target.style.borderColor='#e5e5e5'}
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
