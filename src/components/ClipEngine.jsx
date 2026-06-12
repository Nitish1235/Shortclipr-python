import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'
import CaptionOverlay, { COLOR_COMBOS } from './CaptionOverlay'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

// ── Shared input styles ───────────────────────────────────────────
const selectStyle = {
  background:'#fff', color:'#111',
  border:'1.5px solid #e5e5e5', borderRadius:'8px',
  padding:'9px 12px', fontSize:'0.85rem', fontWeight:500,
  outline:'none', cursor:'pointer', width:'100%',
  transition:'border-color 0.15s',
  fontFamily:'Space Grotesk, sans-serif',
}
const rowStyle = {
  display:'flex', alignItems:'center',
  justifyContent:'space-between', gap:'16px',
  padding:'12px 0',
  borderBottom:'1px solid #f0f0f0',
}
const labelStyle = {
  fontSize:'0.78rem', fontWeight:700, color:'#555',
  textTransform:'uppercase', letterSpacing:'0.1em',
  flexShrink:0, minWidth:'130px',
}
const sectionCard = {
  background:'#fff', border:'1.5px solid #e5e5e5', borderRadius:'12px',
  padding:'16px 18px 4px', marginBottom:'16px',
}
const sectionTitle = {
  fontSize:'0.78rem', fontWeight:800, color:'#111',
  textTransform:'uppercase', letterSpacing:'0.1em',
  marginBottom:'4px', display:'flex', alignItems:'center', gap:'6px',
}

// ── Caption style swatch options ────────────────────────────────
const STYLE_OPTIONS = [
  { val:'word_pop',   label:'Word Pop',   sub:'🔥 Trending', preview:'POP!',  upper:true,  weight:800 },
  { val:'hormozi',    label:'Hormozi',    sub:'Bold Box',     preview:'BOLD', upper:true,  weight:900, box:true },
  { val:'karaoke',    label:'Karaoke',    sub:'Colour Sweep', preview:'Sing', upper:false, weight:600 },
  { val:'mrbeast',    label:'MrBeast',    sub:'Giant',        preview:'WOW',  upper:true,  weight:900 },
  { val:'typewriter', label:'Typewriter', sub:'Reveal',       preview:'Type…', upper:false, weight:600 },
  { val:'slide',      label:'Slide In',   sub:'Motion',       preview:'SLIDE', upper:true, weight:800 },
  { val:'fade',       label:'Fade',       sub:'Smooth',       preview:'Fade', upper:false, weight:500 },
  { val:'zoom',       label:'Zoom',       sub:'Punchy',       preview:'Zoom', upper:false, weight:700 },
  { val:'shake',      label:'Shake',      sub:'Energy',       preview:'SHAKE', upper:true, weight:800 },
  { val:'neon',       label:'Neon Glow',  sub:'Glow',         preview:'Neon', upper:false, weight:700 },
  { val:'minimal',    label:'Minimal',    sub:'Clean',        preview:'Aa',   upper:false, weight:500 },
]

// ── Caption colour swatch options ───────────────────────────────
const COLOR_OPTIONS = [
  { val:'white_black',  label:'White + Black',  sub:'Classic' },
  { val:'yellow_black', label:'Yellow + Black', sub:'🔥 Trending' },
  { val:'black_white',  label:'Black + White',  sub:'' },
  { val:'cyan_dark',    label:'Cyan + Dark',    sub:'' },
  { val:'orange_dark',  label:'Orange + Dark',  sub:'' },
  { val:'green_dark',   label:'Green + Dark',   sub:'' },
  { val:'red_white',    label:'Red + White',    sub:'' },
]

export default function ClipEngine({ onJobCreated }) {
  const [url, setUrl]               = useState('')
  const [mode, setMode]             = useState('input') // input | login | config | processing
  const [videoData, setVideoData]   = useState(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [statusMsg, setStatusMsg]   = useState('Analyzing video...')
  const [urlFocused, setUrlFocused] = useState(false)

  // Config options
  const [lang,          setLang]          = useState('Auto / No translation')
  const [clipLen,       setClipLen]       = useState('Auto (<90s)')
  const [clipCount,     setClipCount]     = useState('10')
  const [captionStyle,  setCaptionStyle]  = useState('word_pop')
  const [colorCombo,    setColorCombo]    = useState('white_black')
  const [wordsPerLine,  setWordsPerLine]  = useState(2)
  const [shortTemplate, setShortTemplate] = useState('blur_bg')
  const [barColor,      setBarColor]      = useState('#0d0d0d')
  const [aspect,        setAspect]        = useState('9:16')

  const { user, loginWithGoogleToken } = useAuth()
  const navigate = useNavigate()

  // Restore pending URL after login
  useEffect(() => {
    const saved = sessionStorage.getItem('sc_pending_url')
    if (saved && user) {
      sessionStorage.removeItem('sc_pending_url')
      setUrl(saved)
    }
  }, [user])

  const handleFetchMetadata = async () => {
    if (!url.trim()) return
    const token = localStorage.getItem('sc_token')
    if (!token) {
      sessionStorage.setItem('sc_pending_url', url)
      setMode('login')
      return
    }
    setProcessing(true)
    try {
      const res = await fetch(`${API_BASE}/youtube/metadata`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error('Invalid YouTube URL or server error')
      setVideoData(await res.json())
      setMode('config')
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleExecute = async () => {
    if (!user) {
      sessionStorage.setItem('sc_pending_url', url)
      setMode('login')
      return
    }
    setMode('processing')
    setProcessing(true)
    setProgress(5)
    setStatusMsg('Connecting to processing queue…')
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({
          youtube_url: url,
          options:{
            clip_count:     parseInt(clipCount) || 10,
            language:       lang,
            style:          captionStyle,
            color:          colorCombo,
            words_per_line: wordsPerLine,
            short_template: shortTemplate,
            bar_color:      barColor,
            aspect:         aspect,
            h_align:'center', v_align:'bottom', quality:'1080p', topic:'',
          },
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Error submitting job')
      }
      setProgress(20)
      setStatusMsg('Job queued! Redirecting to dashboard…')
      setTimeout(() => {
        if (onJobCreated) onJobCreated()
        if (window.location.pathname !== '/dashboard') navigate('/dashboard')
        else { setMode('input'); setUrl(''); setProcessing(false); setProgress(0) }
      }, 1800)
    } catch (err) {
      setMode('config')
      setProcessing(false)
      alert(err.message)
    }
  }

  // ── RENDER ────────────────────────────────────────────────────────

  /* ── Input phase ── */
  if (mode === 'input') return (
    <div>
      <div style={{ display:'flex', gap:'0' }}>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleFetchMetadata()}
          onFocus={() => setUrlFocused(true)}
          onBlur={() => setUrlFocused(false)}
          placeholder="https://www.youtube.com/watch?v=..."
          style={{
            flex:1, padding:'13px 16px',
            border: urlFocused ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
            borderRight:'none', borderRadius:'8px 0 0 8px',
            fontSize:'0.9rem', outline:'none',
            background:'#f9f9f9', transition:'border-color 0.15s',
            minWidth:0,
          }}
        />
        <button
          onClick={handleFetchMetadata}
          disabled={processing}
          style={{
            background:'#cf1322', color:'#fff',
            border:'1.5px solid #cf1322',
            borderRadius:'0 8px 8px 0',
            padding:'13px 22px', fontWeight:700, fontSize:'0.88rem',
            cursor: processing ? 'wait' : 'pointer',
            whiteSpace:'nowrap', opacity: processing ? 0.7 : 1,
            transition:'background 0.15s',
          }}
          onMouseEnter={e => { if (!processing) e.currentTarget.style.background='#a10e1b' }}
          onMouseLeave={e => { e.currentTarget.style.background='#cf1322' }}
        >
          {processing ? 'Loading…' : 'Fetch Video →'}
        </button>
      </div>
      <p style={{ fontSize:'0.73rem', color:'#bbb', marginTop:'8px' }}>
        Paste any public YouTube URL — podcasts, tutorials, interviews, vlogs
      </p>
    </div>
  )

  /* ── Login gate ── */
  if (mode === 'login') return (
    <div style={{
      background:'#fef2f2', border:'1.5px solid #fecaca',
      borderRadius:'12px', padding:'28px', textAlign:'center',
    }}>
      <div style={{ fontSize:'2rem', marginBottom:'12px' }}>🔐</div>
      <h3 style={{ fontSize:'1rem', fontWeight:700, color:'#111', marginBottom:'8px' }}>
        Sign in to continue
      </h3>
      <p style={{ fontSize:'0.85rem', color:'#666', marginBottom:'24px' }}>
        Your video URL is saved. Sign in and we'll start processing immediately.
      </p>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:'16px' }}>
        <GoogleLogin
          onSuccess={async cr => {
            const ok = await loginWithGoogleToken(cr.credential)
            if (ok) {
              const pending = sessionStorage.getItem('sc_pending_url')
              if (pending) { sessionStorage.removeItem('sc_pending_url'); setUrl(pending) }
              setMode('input')
              if (window.location.pathname !== '/dashboard') window.location.href = '/dashboard'
              else setTimeout(() => handleFetchMetadata(), 200)
            }
          }}
          onError={() => {}}
          theme="filled_red" shape="rectangular" text="signin_with" size="large"
        />
      </div>
      <button onClick={() => setMode('input')} style={{
        background:'none', border:'none', cursor:'pointer',
        fontSize:'0.8rem', color:'#aaa', textDecoration:'underline',
      }}>← Back</button>
    </div>
  )

  /* ── Config phase ── */
  if (mode === 'config' && videoData) {
    const templates = [
      { val:'blur_bg',      label:'🌫 Blur BG',       sub:'Most Popular' },
      { val:'zoom_blur',    label:'🔍 Zoom Blur',     sub:'Dramatic' },
      { val:'glass',        label:'🪟 Glass',          sub:'Premium' },
      { val:'color_bars',   label:'🎨 Color Bars',    sub:'Branded' },
      { val:'gradient',     label:'🌈 Gradient',       sub:'Instagram' },
      { val:'cinema',       label:'🎬 Cinema',         sub:'Black Bars' },
      { val:'neon_frame',   label:'💡 Neon Frame',    sub:'Eye-catch' },
      { val:'split_screen', label:'⬛ Split Screen',  sub:'Dual Feed' },
      { val:'screenshare',  label:'🖥 Screenshare',   sub:'Tutorial' },
      { val:'gameplay',     label:'🎮 Gameplay',       sub:'Gaming' },
    ]

    return (
      <div>
        {/* Video preview card */}
        <div style={{
          display:'flex', gap:'16px', alignItems:'center',
          background:'#f9f9f9', border:'1px solid #e5e5e5',
          borderRadius:'10px', padding:'14px', marginBottom:'20px',
        }}>
          <img
            src={videoData.thumbnail || '/placeholder.png'}
            alt="thumbnail"
            style={{ width:'100px', aspectRatio:'16/9', objectFit:'cover', borderRadius:'6px', flexShrink:0 }}
          />
          <div style={{ minWidth:0 }}>
            <div style={{
              fontWeight:700, fontSize:'0.9rem', color:'#111', marginBottom:'4px',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>{videoData.title || 'Unknown Video'}</div>
            <div style={{ fontSize:'0.78rem', color:'#999' }}>
              {videoData.channel} · {formatDuration(videoData.duration)}
            </div>
            <div style={{
              display:'inline-block', marginTop:'6px',
              background:'#fef2f2', border:'1px solid #fecaca',
              borderRadius:'6px', padding:'2px 8px',
              fontSize:'0.7rem', fontWeight:600, color:'#cf1322',
            }}>Video loaded ✓</div>
          </div>
          <button onClick={() => setMode('input')} style={{
            marginLeft:'auto', background:'none', border:'none',
            cursor:'pointer', color:'#bbb', fontSize:'1rem', flexShrink:0,
          }}>✕</button>
        </div>

        {/* Config + Live Preview */}
        <div style={{ display:'flex', gap:'20px', flexWrap:'wrap', alignItems:'flex-start', marginBottom:'20px' }}>

          {/* Left: sectioned config */}
          <div style={{ flex:'1 1 360px', minWidth:0 }}>

            {/* 🎬 Source */}
            <div style={sectionCard}>
              <div style={sectionTitle}>🎬 Source</div>

              <div style={rowStyle}>
                <span style={labelStyle}>Language</span>
                <select style={selectStyle} value={lang} onChange={e => setLang(e.target.value)}
                  onFocus={e => e.target.style.borderColor='#cf1322'} onBlur={e => e.target.style.borderColor='#e5e5e5'}>
                  <option>Auto / No translation</option>
                  <option>English</option><option>Spanish</option>
                  <option>French</option><option>German</option>
                </select>
              </div>

              <div style={rowStyle}>
                <span style={labelStyle}>Clip Length</span>
                <select style={selectStyle} value={clipLen} onChange={e => setClipLen(e.target.value)}
                  onFocus={e => e.target.style.borderColor='#cf1322'} onBlur={e => e.target.style.borderColor='#e5e5e5'}>
                  <option>Auto (&lt;90s)</option>
                  <option>&lt;30s (Hooks)</option>
                  <option>30s – 60s</option>
                  <option>60s – 90s</option>
                </select>
              </div>

              <div style={{ ...rowStyle, borderBottom:'none' }}>
                <span style={labelStyle}>Clip Count</span>
                <select style={selectStyle} value={clipCount} onChange={e => setClipCount(e.target.value)}
                  onFocus={e => e.target.style.borderColor='#cf1322'} onBlur={e => e.target.style.borderColor='#e5e5e5'}>
                  <option value="5">5 Shorts</option>
                  <option value="10">10 Shorts (default)</option>
                  <option value="15">15 Shorts</option>
                  <option value="20">20 Shorts (max)</option>
                </select>
              </div>
            </div>

            {/* 💬 Captions */}
            <div style={sectionCard}>
              <div style={sectionTitle}>💬 Captions</div>

              {/* Caption style swatches */}
              <div style={{ padding:'10px 0 4px' }}>
                <span style={{ ...labelStyle, display:'block', marginBottom:'10px' }}>Caption Style</span>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
                  {STYLE_OPTIONS.map(opt => {
                    const combo = COLOR_COMBOS[colorCombo] || COLOR_COMBOS.white_black
                    const active = captionStyle === opt.val
                    return (
                      <button key={opt.val} onClick={() => setCaptionStyle(opt.val)} style={{
                        display:'flex', flexDirection:'column', alignItems:'center', gap:'6px',
                        padding:'10px 4px', borderRadius:'10px',
                        background: active ? '#fef2f2' : '#f9f9f9',
                        border: active ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                        cursor:'pointer', transition:'all 0.15s',
                      }}>
                        <span style={{
                          fontWeight: opt.weight, fontSize:'0.75rem',
                          textTransform: opt.upper ? 'uppercase' : 'none',
                          color: opt.box ? combo.highlight : combo.primary,
                          background: opt.box ? combo.back : 'transparent',
                          padding: opt.box ? '2px 8px' : 0,
                          borderRadius: opt.box ? '4px' : 0,
                          textShadow: opt.box ? 'none' : `0 0 2px ${combo.outline}, 0 1px 3px rgba(0,0,0,0.5)`,
                          fontFamily:'"Arial Black", Arial, sans-serif',
                          letterSpacing: opt.upper ? '0.04em' : 'normal',
                          whiteSpace:'nowrap',
                        }}>{opt.preview}</span>
                        <span style={{ fontSize:'0.66rem', fontWeight:700, color: active ? '#cf1322' : '#555' }}>{opt.label}</span>
                        <span style={{ fontSize:'0.6rem', color:'#aaa' }}>{opt.sub}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Caption colour swatches */}
              <div style={{ padding:'12px 0 4px' }}>
                <span style={{ ...labelStyle, display:'block', marginBottom:'10px' }}>Caption Colour</span>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
                  {COLOR_OPTIONS.map(opt => {
                    const combo = COLOR_COMBOS[opt.val]
                    const active = colorCombo === opt.val
                    return (
                      <button key={opt.val} onClick={() => setColorCombo(opt.val)} style={{
                        display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
                        padding:'8px 4px', borderRadius:'10px',
                        background: active ? '#fef2f2' : '#f9f9f9',
                        border: active ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                        cursor:'pointer', transition:'all 0.15s',
                      }}>
                        <span style={{
                          fontWeight:800, fontSize:'0.76rem',
                          color: combo.primary, background: combo.back,
                          padding:'2px 8px', borderRadius:'4px',
                          textShadow:`0 0 2px ${combo.outline}`,
                          fontFamily:'"Arial Black", Arial, sans-serif',
                        }}>Aa</span>
                        <span style={{ fontSize:'0.6rem', fontWeight:700, color: active ? '#cf1322' : '#555', textAlign:'center', lineHeight:1.2 }}>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Words per line */}
              <div style={{ ...rowStyle, borderBottom:'none' }}>
                <span style={labelStyle}>Words / Screen</span>
                <div style={{ display:'flex', gap:'8px', flex:1 }}>
                  {[
                    { val:1, label:'1 Word', sub:'Max Impact' },
                    { val:2, label:'2 Words', sub:'Balanced'  },
                    { val:3, label:'3 Words', sub:'Natural'   },
                  ].map(({ val, label, sub }) => (
                    <button key={val} onClick={() => setWordsPerLine(val)} style={{
                      flex:1, padding:'8px 6px', borderRadius:'8px',
                      background: wordsPerLine === val ? '#cf1322' : '#f9f9f9',
                      color: wordsPerLine === val ? '#fff' : '#666',
                      border: wordsPerLine === val ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                      cursor:'pointer', fontSize:'0.75rem', fontWeight:700, textAlign:'center',
                      transition:'all 0.15s',
                    }}>
                      {label}<br/><span style={{ opacity:0.7, fontSize:'0.68rem', fontWeight:400 }}>{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 📐 Layout */}
            <div style={sectionCard}>
              <div style={sectionTitle}>📐 Layout</div>

              {/* Aspect ratio */}
              <div style={rowStyle}>
                <span style={labelStyle}>Aspect Ratio</span>
                <div style={{ display:'flex', gap:'8px', flex:1 }}>
                  {[
                    { val:'9:16', label:'9:16', sub:'Shorts / Reels' },
                    { val:'16:9', label:'16:9', sub:'YouTube / X' },
                    { val:'1:1',  label:'1:1',  sub:'Square' },
                  ].map(({ val, label, sub }) => (
                    <button key={val} onClick={() => setAspect(val)} style={{
                      flex:1, padding:'8px 6px', borderRadius:'8px',
                      background: aspect === val ? '#cf1322' : '#f9f9f9',
                      color: aspect === val ? '#fff' : '#666',
                      border: aspect === val ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                      cursor:'pointer', fontSize:'0.75rem', fontWeight:700, textAlign:'center',
                      transition:'all 0.15s',
                    }}>
                      {label}<br/><span style={{ opacity:0.7, fontSize:'0.68rem', fontWeight:400 }}>{sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Short template */}
              <div style={{ padding:'12px 0' }}>
                <span style={{ ...labelStyle, display:'block', marginBottom:'10px' }}>Short Style</span>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'6px' }}>
                  {templates.map(({ val, label, sub }) => (
                    <button key={val} onClick={() => setShortTemplate(val)} style={{
                      padding:'8px 6px', borderRadius:'8px', textAlign:'center',
                      background: shortTemplate === val ? '#fef2f2' : '#f9f9f9',
                      color: shortTemplate === val ? '#cf1322' : '#555',
                      border: shortTemplate === val ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                      cursor:'pointer', fontSize:'0.72rem', fontWeight:600,
                      lineHeight:1.3, transition:'all 0.15s',
                    }}>
                      {label}<br/><span style={{ opacity:0.6, fontSize:'0.65rem', fontWeight:400 }}>{sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar/frame color picker */}
              {['color_bars','gradient','neon_frame'].includes(shortTemplate) && (
                <div style={{ ...rowStyle, borderBottom:'none' }}>
                  <span style={labelStyle}>Frame Color</span>
                  <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
                    {['#0d0d0d','#1a1a2e','#ffffff','#39ff14','#cf1322','#00cfff','#ff9900','#a855f7'].map(c => (
                      <button key={c} onClick={() => setBarColor(c)} style={{
                        width:'26px', height:'26px', background:c, borderRadius:'6px',
                        border: barColor === c ? '2.5px solid #111' : '1.5px solid #e5e5e5',
                        cursor:'pointer', flexShrink:0,
                      }}/>
                    ))}
                    <input type="color" value={barColor} onChange={e => setBarColor(e.target.value)} style={{
                      width:'26px', height:'26px', padding:0, border:'1.5px solid #e5e5e5',
                      background:'none', cursor:'pointer', borderRadius:'6px',
                    }}/>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: live preview */}
          <div style={{ flex:'0 0 200px', minWidth:'160px' }}>
            <div style={{ ...sectionTitle, marginBottom:'10px' }}>👀 Live Preview</div>
            <div style={{
              position:'relative', width:'100%',
              aspectRatio: aspect.replace(':','/'),
              background:'#111', borderRadius:'10px', overflow:'hidden',
              border:'2px solid #111', boxShadow:'3px 3px 0 #cf1322',
            }}>
              {videoData.thumbnail && (
                <img src={videoData.thumbnail} alt="" style={{
                  width:'100%', height:'100%', objectFit:'cover', opacity:0.55,
                }}/>
              )}
              <CaptionOverlay
                mode="static"
                previewText="YOUR CAPTION HERE"
                style={captionStyle}
                color={colorCombo}
                hAlign="center"
                vAlign="bottom"
                wordsPerLine={wordsPerLine}
              />
            </div>
            <p style={{ fontSize:'0.66rem', color:'#bbb', marginTop:'8px', textAlign:'center' }}>
              Live preview — updates as you adjust styles
            </p>
          </div>
        </div>

        {/* Submit */}
        <button onClick={handleExecute} disabled={processing} style={{
          width:'100%', background:'#cf1322', color:'#fff',
          border:'2px solid #111', borderRadius:'8px',
          padding:'15px', fontWeight:700, fontSize:'0.95rem', cursor:'pointer',
          boxShadow:'2px 2px 0 #111', transition:'transform 0.1s, box-shadow 0.1s',
          opacity: processing ? 0.7 : 1,
        }}
          onMouseEnter={e => { if (!processing) { e.currentTarget.style.transform='translate(-1px,-1px)'; e.currentTarget.style.boxShadow='3px 3px 0 #111' } }}
          onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 2px 0 #111' }}
        >
          {processing ? 'Submitting…' : '🚀 Generate Clips →'}
        </button>
      </div>
    )
  }

  /* ── Processing phase ── */
  if (mode === 'processing') return (
    <div style={{
      background:'#fef2f2', border:'1.5px solid #fecaca',
      borderRadius:'12px', padding:'28px', textAlign:'center',
    }}>
      <div style={{
        width:'48px', height:'48px', border:'3px solid #fecaca',
        borderTopColor:'#cf1322', borderRadius:'50%',
        margin:'0 auto 16px',
        animation:'spin 0.8s linear infinite',
      }}/>
      <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#111', marginBottom:'8px' }}>
        Processing your video
      </div>
      <div style={{ fontSize:'0.85rem', color:'#666', marginBottom:'20px' }}>
        {statusMsg}
      </div>
      {progress > 0 && (
        <div style={{ background:'#fecaca', borderRadius:'4px', height:'6px', overflow:'hidden' }}>
          <div style={{ width:`${progress}%`, height:'100%', background:'#cf1322', borderRadius:'4px', transition:'width 0.5s ease' }}/>
        </div>
      )}
      <p style={{ fontSize:'0.75rem', color:'#aaa', marginTop:'12px' }}>
        Keep this tab open. You'll be redirected automatically.
      </p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return null
}
