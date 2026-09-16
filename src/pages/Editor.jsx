import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Navigation from '../components/Navigation'
import CaptionOverlay, { FONT_FAMILIES } from '../components/CaptionOverlay'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const TEMPLATES = [
  { id:'crop_fill',    name:'Crop Fill'    }, // no zoom, face-aware native crop
  { id:'blur_bg',      name:'Blur BG'      },
  { id:'zoom_blur',    name:'Zoom Blur'    },
  { id:'glass',        name:'Glass'        },
  { id:'color_bars',   name:'Color Bars'   }, // merged: covers old Gradient/Cinema/Neon Frame looks — pick via bar colour
  { id:'full_screen',  name:'Full Screen'  }, // default — face-tracked crop, no bars, 100% fill
  // { id:'gameplay',  name:'Gameplay'     }, // temporarily disabled, will rework
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
  { val:'none',       label:'None',       sub:'No subtitles burned in' },
]

// Curated trending emoji — burned in via the Twemoji Mozilla colour-emoji
// font (bundled in backend/app/assets/fonts/, fontconfig-registered as a
// libass glyph fallback), so these render inline with title/caption text
// with zero extra positioning/sync work — no image-overlay system needed.
const TRENDING_EMOJI = [
  '🔥','💯','✅','❌','👀','💀','😂','🤣','❤️','👍',
  '👎','🚀','💰','⚡','🎯','😱','🤯','🙌','👏','💪',
  '🤔','🫡','✨','🎉','🔑','🧠','⚠️','📈','📉','🤑',
  '🙏','💸','🎬','👇','👆','➡️','😎','🆗','🤝','👑',
  '😭','🚨','💥','⭐','🥶',
]

const TITLE_TEXT_COLOR_OPTIONS = [
  { val:'white',    label:'White',    hex:'#FFFFFF' },
  { val:'black',    label:'Black',    hex:'#000000' },
  { val:'yellow',   label:'Yellow',   hex:'#FFE600' },
  { val:'gold',     label:'Gold',     hex:'#FFD700' },
  { val:'red',      label:'Red',      hex:'#FF3B30' },
  { val:'ice_blue', label:'Ice Blue', hex:'#C8E5FF' },
  { val:'hot_pink', label:'Hot Pink', hex:'#FF1493' },
]

const TITLE_BG_OPTIONS = [
  { val:'none',       label:'None',       hex:null },
  { val:'dark_gray',  label:'Dark Gray',  hex:'#1A1A1A' },
  { val:'light_gray', label:'Light Gray', hex:'#E5E5E5' },
  { val:'black',      label:'Black',      hex:'#000000' },
  { val:'white',      label:'White',      hex:'#FFFFFF' },
  { val:'brand_red',  label:'Brand Red',  hex:'#CF1322' },
]

const FONT_OPTIONS_LIST = [
  { val:'default',       label:'Default' },
  { val:'montserrat',    label:'Montserrat' },
  { val:'archivo_black', label:'Archivo Black' },
  { val:'anton',         label:'Anton' },
  { val:'bebas_neue',    label:'Bebas Neue' },
  { val:'poppins',       label:'Poppins' },
  { val:'jakarta',       label:'Plus Jakarta' },
  { val:'bangers',            label:'Bangers' },
  { val:'luckiest_guy',       label:'Luckiest Guy' },
  { val:'permanent_marker',   label:'Permanent Marker' },
  { val:'caveat',             label:'Caveat (Cursive)' },
]

const COLOR_COMBOS = [
  { val:'white_black',  label:'White / Black'  },
  { val:'yellow_black', label:'Yellow / Black' },
  { val:'pure_white',           label:'Pure White (clean)' },
  { val:'gold_premium',         label:'Gold Premium'       },
  { val:'ice_blue',             label:'Ice Blue'           },
  { val:'butter_yellow',        label:'Butter Yellow'      },
  { val:'hot_pink_black',       label:'Hot Pink / Black'   },
  { val:'electric_blue_white',  label:'Electric Blue'      },
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
  const titleInputRef     = useRef(null)

  const [activeTab,          setActiveTab]          = useState('templates')
  const [showSubtitleEditor, setShowSubtitleEditor] = useState(false)
  const [subtitlePosition,   setSubtitlePosition]   = useState({ x:0.5, y:0.9 })
  const [isSaving,           setIsSaving]           = useState(false)
  const [isRendering,        setIsRendering]        = useState(false)
  const [loading,            setLoading]            = useState(true)

  const [aspect,            setAspect]            = useState('9:16')
  const [selectedTemplate,  setSelectedTemplate]  = useState('full_screen')
  const [captionStyle,      setCaptionStyle]      = useState('karaoke')
  const [colorCombo,        setColorCombo]        = useState('white_black')
  const [hAlign,            setHAlign]            = useState('center')
  const [vAlign,            setVAlign]            = useState('bottom')
  const [wordsPerLine,      setWordsPerLine]      = useState(2)
  const [captionFont,      setCaptionFont]       = useState('default')
  const [highlightColor,    setHighlightColor]    = useState('#cf1322')
  const [showCaptions,      setShowCaptions]      = useState(true)
  const [transcriptBlocks,  setTranscriptBlocks]  = useState([])
  const [isAdvanced,        setIsAdvanced]        = useState(false)
  const [clipUrl,           setClipUrl]           = useState('')
  const [thumbnailUrl,      setThumbnailUrl]      = useState('')
  const [rawVideoUrl,       setRawVideoUrl]       = useState('')
  const [captionsData,      setCaptionsData]      = useState([])
  const [titleText,         setTitleText]         = useState('')
  const [titlePermanent,    setTitlePermanent]    = useState(false)
  const [titleEnabled,      setTitleEnabled]      = useState(true)
  const [titleColor,        setTitleColor]        = useState('white')
  const [titleBg,           setTitleBg]           = useState('none')
  const [titleBgOpacity,    setTitleBgOpacity]    = useState(0.55)

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
        if (cfg.font)             setCaptionFont(cfg.font)
        if (cfg.highlightColor)   setHighlightColor(cfg.highlightColor)
        if (cfg.subtitlePosition) setSubtitlePosition(cfg.subtitlePosition)
        setTitleText(cfg.hook_title ?? clip.top_title ?? '')
        if (cfg.title_permanent)  setTitlePermanent(cfg.title_permanent)
        if (cfg.hook_title_enabled === false) setTitleEnabled(false)
        if (cfg.title_color)     setTitleColor(cfg.title_color)
        if (cfg.title_bg)        setTitleBg(cfg.title_bg)
        if (cfg.title_bg_opacity !== undefined) setTitleBgOpacity(cfg.title_bg_opacity)

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

  // Insert an emoji at the current cursor position in the title textarea
  // (falls back to appending at the end if the field isn't focused).
  const insertEmoji = (emoji) => {
    const el = titleInputRef.current
    if (!el) { setTitleText(prev => prev + emoji); return }
    const start = el.selectionStart ?? titleText.length
    const end   = el.selectionEnd ?? titleText.length
    const next  = titleText.slice(0, start) + emoji + titleText.slice(end)
    setTitleText(next)
    requestAnimationFrame(() => {
      el.focus()
      const caret = start + emoji.length
      el.setSelectionRange(caret, caret)
    })
  }

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
          font: captionFont,
          highlightColor,
          subtitlePosition,
          transcript: transcriptBlocks,
          hook_title: titleEnabled ? titleText : '',
          title_permanent: titlePermanent,
          hook_title_enabled: titleEnabled,
          title_color: titleColor,
          title_bg: titleBg,
          title_bg_opacity: titleBgOpacity,
        }),
      })
      if (res.status === 401) { logout(); return }
      if (!res.ok) throw new Error('Save failed')
      alert('Configuration saved successfully')
      navigate('/youtube-shorts/dashboard')
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
          font: captionFont,
          highlightColor,
          hook_title: titleEnabled ? titleText : '',
          title_permanent: titlePermanent,
          hook_title_enabled: titleEnabled,
          title_color: titleColor,
          title_bg: titleBg,
          title_bg_opacity: titleBgOpacity,
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
              { name:'Starter', price:'$10/mo', desc:'50 shorts · Editor · Downloads'   },
              { name:'Pro',     price:'$45/mo', desc:'350 shorts · Everything · Priority' },
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
            <a href="/youtube-shorts" style={{
              background:'#cf1322', color:'#fff', border:'2px solid #111',
              borderRadius:'8px', padding:'11px 24px', fontWeight:700, fontSize:'0.875rem',
              boxShadow:'2px 2px 0 #111', display:'inline-block',
            }}>Upgrade now →</a>
            <button onClick={() => navigate('/youtube-shorts/dashboard')} style={{
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
            <button onClick={() => navigate('/youtube-shorts/dashboard')} style={{
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
                  controlsList="nodownload"
                  onContextMenu={e => e.preventDefault()}
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
                    font={captionFont}
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
              <button style={tabBtn(activeTab === 'title')} onClick={() => setActiveTab('title')}>Title</button>
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

                  {/* Font */}
                  <div>
                    <span style={labelStyle}>Font</span>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                      {FONT_OPTIONS_LIST.map(opt => (
                        <button key={opt.val} onClick={() => setCaptionFont(opt.val)} style={{
                          padding:'10px 8px', borderRadius:'8px', textAlign:'center',
                          background: captionFont === opt.val ? '#fef2f2' : '#f9f9f9',
                          border: captionFont === opt.val ? '2px solid #cf1322' : '1.5px solid #e5e5e5',
                          cursor:'pointer',
                        }}>
                          <div style={{
                            fontFamily: FONT_FAMILIES[opt.val], fontWeight:800, fontSize:'1rem',
                            color: captionFont === opt.val ? '#cf1322' : '#333', marginBottom:'2px',
                          }}>Aa</div>
                          <div style={{ fontSize:'0.7rem', fontWeight:600, color: captionFont === opt.val ? '#cf1322' : '#666' }}>{opt.label}</div>
                        </button>
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

              {/* ── Title tab ── */}
              {activeTab === 'title' && (
                <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

                  {/* Enable / None toggle */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', borderBottom:'1px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontSize:'0.875rem', fontWeight:600, color:'#111' }}>Title Card</div>
                      <div style={{ fontSize:'0.75rem', color:'#999', marginTop:'2px' }}>
                        {titleEnabled ? 'On — a title card will be burned in.' : 'None — no title card on this clip.'}
                      </div>
                    </div>
                    <button onClick={() => setTitleEnabled(p => !p)} style={{
                      background: titleEnabled ? '#cf1322' : '#e5e5e5',
                      border:'none', borderRadius:'100px', width:'44px', height:'24px',
                      cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0,
                    }}>
                      <span style={{
                        position:'absolute', top:'3px', width:'18px', height:'18px',
                        background:'#fff', borderRadius:'50%', transition:'left 0.2s',
                        left: titleEnabled ? '23px' : '3px',
                      }}/>
                    </button>
                  </div>

                  <div style={{ opacity: titleEnabled ? 1 : 0.45, pointerEvents: titleEnabled ? 'auto' : 'none' }}>
                    <span style={labelStyle}>Title Text</span>
                    <textarea
                      ref={titleInputRef}
                      value={titleText}
                      onChange={e => setTitleText(e.target.value)}
                      disabled={!titleEnabled}
                      placeholder="e.g. THE TRUTH ABOUT PASSIVE INCOME"
                      style={{
                        width:'100%', background:'#f9f9f9', color:'#111',
                        border:'1.5px solid #e5e5e5', borderRadius:'8px',
                        padding:'12px 14px', minHeight:'70px', fontSize:'0.9rem',
                        fontWeight:600, resize:'vertical', outline:'none',
                        fontFamily:'Space Grotesk, sans-serif',
                      }}
                      onFocus={e => e.target.style.borderColor='#cf1322'}
                      onBlur={e => e.target.style.borderColor='#e5e5e5'}
                    />
                    <p style={{ fontSize:'0.75rem', color:'#999', marginTop:'8px', lineHeight:1.5 }}>
                      Burned in as a bold title card with its own text/background
                      colours below — independent of your caption colour.
                    </p>

                    {/* Trending emoji picker — inserts at cursor position */}
                    <div style={{ marginTop:'12px' }}>
                      <span style={{ ...labelStyle, fontSize:'0.66rem' }}>Trending Emoji</span>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'6px' }}>
                        {TRENDING_EMOJI.map(e => (
                          <button key={e} type="button" disabled={!titleEnabled}
                            onClick={() => insertEmoji(e)}
                            style={{
                              width:'32px', height:'32px', fontSize:'1.05rem',
                              background:'#f9f9f9', border:'1.5px solid #e5e5e5',
                              borderRadius:'7px', cursor: titleEnabled ? 'pointer' : 'not-allowed',
                              display:'flex', alignItems:'center', justifyContent:'center',
                            }}
                          >{e}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Permanent toggle */}
                  <div style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0',
                    borderTop:'1px solid #f0f0f0', borderBottom:'1px solid #f0f0f0',
                    opacity: titleEnabled ? 1 : 0.45, pointerEvents: titleEnabled ? 'auto' : 'none',
                  }}>
                    <div>
                      <div style={{ fontSize:'0.875rem', fontWeight:600, color:'#111' }}>Show title for entire clip</div>
                      <div style={{ fontSize:'0.75rem', color:'#999', marginTop:'2px' }}>
                        Off = first ~2.6s only. On = stays on screen the whole clip.
                      </div>
                    </div>
                    <button onClick={() => setTitlePermanent(p => !p)} style={{
                      background: titlePermanent ? '#cf1322' : '#e5e5e5',
                      border:'none', borderRadius:'100px', width:'44px', height:'24px',
                      cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0,
                    }}>
                      <span style={{
                        position:'absolute', top:'3px', width:'18px', height:'18px',
                        background:'#fff', borderRadius:'50%', transition:'left 0.2s',
                        left: titlePermanent ? '23px' : '3px',
                      }}/>
                    </button>
                  </div>

                  {titleEnabled && !titleText.trim() && (
                    <p style={{ fontSize:'0.78rem', color:'#cf1322', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', padding:'10px 12px' }}>
                      Add title text above, then hit Render to burn it in.
                    </p>
                  )}

                  {/* Title text colour — independent of caption colour */}
                  <div style={{ opacity: titleEnabled ? 1 : 0.45, pointerEvents: titleEnabled ? 'auto' : 'none' }}>
                    <span style={labelStyle}>Title Text Colour</span>
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'6px' }}>
                      {TITLE_TEXT_COLOR_OPTIONS.map(opt => (
                        <button key={opt.val} onClick={() => setTitleColor(opt.val)} title={opt.label} style={{
                          width:'32px', height:'32px', borderRadius:'50%', background:opt.hex,
                          border: titleColor === opt.val ? '3px solid #cf1322' : '2px solid #e5e5e5',
                          boxShadow: opt.hex === '#FFFFFF' ? 'inset 0 0 0 1px #e5e5e5' : 'none',
                          cursor:'pointer',
                        }}/>
                      ))}
                    </div>
                  </div>

                  {/* Title background box — defaults to None */}
                  <div style={{ opacity: titleEnabled ? 1 : 0.45, pointerEvents: titleEnabled ? 'auto' : 'none' }}>
                    <span style={labelStyle}>Title Background</span>
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'6px' }}>
                      {TITLE_BG_OPTIONS.map(opt => (
                        <button key={opt.val} onClick={() => setTitleBg(opt.val)} title={opt.label} style={{
                          width:'32px', height:'32px', borderRadius:'50%',
                          background: opt.hex || 'repeating-linear-gradient(45deg, #f0f0f0, #f0f0f0 4px, #fff 4px, #fff 8px)',
                          border: titleBg === opt.val ? '3px solid #cf1322' : '2px solid #e5e5e5',
                          boxShadow: opt.hex === '#FFFFFF' ? 'inset 0 0 0 1px #e5e5e5' : 'none',
                          cursor:'pointer',
                        }}/>
                      ))}
                    </div>
                    <p style={{ fontSize:'0.72rem', color:'#bbb', marginTop:'6px' }}>
                      Rounded-corner box behind the title text. "None" (default) is clean text + outline only.
                    </p>
                  </div>

                  {/* Opacity slider — only matters when a background is picked */}
                  {titleEnabled && titleBg !== 'none' && (
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                        <span style={labelStyle}>Background Opacity</span>
                        <span style={{ fontSize:'0.8rem', fontWeight:800, color:'#cf1322' }}>{Math.round(titleBgOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100} value={Math.round(titleBgOpacity * 100)}
                        onChange={e => setTitleBgOpacity(Number(e.target.value) / 100)}
                        style={{ width:'100%', accentColor:'#cf1322', height:'18px' }}
                      />
                    </div>
                  )}
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
