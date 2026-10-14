import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { GoogleLogin } from '@react-oauth/google'
import CaptionOverlay, { COLOR_COMBOS, FONT_FAMILIES } from './CaptionOverlay'

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
  { val:'last_word_box', label:'Last Word', sub:'Highlight box', preview:'Moment', weight:800, box:true },
  { val:'last_word_editorial', label:'Editorial', sub:'Italic highlight', preview:'Story', weight:700, box:true },
  { val:'last_word_ink', label:'Color Accent', sub:'Final word color', preview:'Accent', weight:800 },
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
  { val:'none',       label:'None',       sub:'No subtitles', preview:'—',    upper:false, weight:500 },
]

// Legacy gameplay uploads may predate automatic poster generation.  A video
// frame is a useful visual fallback while the API regenerates its JPEG, and
// avoids leaving a broken-image icon in the creator UI.
function GameplayThumbnail({ clip }) {
  const [imageFailed, setImageFailed] = useState(!clip.thumbnail_url)
  const mediaStyle = { width:'100%', height:'100%', objectFit:'cover', display:'block' }

  if (imageFailed) {
    return <video src={clip.video_url} muted autoPlay loop playsInline preload="metadata" style={mediaStyle} />
  }
  return <img src={clip.thumbnail_url} alt="" onError={() => setImageFailed(true)} style={mediaStyle} />
}

// ── Template live-preview renderer ──────────────────────────────
// Pure CSS over the existing video thumbnail — no server round-trip, no
// frame extraction, so it updates instantly as the user clicks a template.
// Approximates each template's actual ffmpeg filter-complex layout
// (see backend/app/pipeline/extractor.py) closely enough to preview it.
function TemplatePreviewBg({ template, thumbnail, barColor, gameplayUrl }) {
  const img = thumbnail || '/placeholder.png'
  const fgImg = (style) => (
    <img src={img} alt="" style={{
      position:'absolute', left:'50%', top:'50%',
      transform:'translate(-50%,-50%)',
      width:'100%', objectFit:'contain', ...style,
    }}/>
  )
  const bgBlur = (blurPx, scale, brightness = 1) => (
    <img src={img} alt="" style={{
      position:'absolute', inset:0, width:'100%', height:'100%',
      objectFit:'cover', filter:`blur(${blurPx}px) brightness(${brightness})`,
      transform:`scale(${scale})`,
    }}/>
  )

  if (template.startsWith('gameplay_')) {
    const is50 = template === 'gameplay_50_50';
    const topH = is50 ? '50%' : '40%';
    const botH = is50 ? '50%' : '60%';
    
    // For face-tracked, simulate center-crop
    const isFace = template === 'gameplay_face';
    const topStyle = isFace ? { objectFit: 'cover' } : { objectFit: 'contain' };
    
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: topH, width: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>
          {!isFace && <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(25px)' }} />}
          <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...topStyle }} />
        </div>
        <div style={{ height: botH, width: '100%', background: '#111', position: 'relative' }}>
          {gameplayUrl ? (
            <video src={gameplayUrl} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '0.8rem' }}>No Gameplay Selected</div>
          )}
        </div>
      </div>
    );
  }

  switch (template) {
    case 'blur_bg':
      return <>{bgBlur(18, 1.15)}{fgImg()}</>
    case 'glass':
      return <>{bgBlur(20, 1.15, 0.55)}{fgImg()}</>
    case 'zoom_blur':
      return <>{bgBlur(28, 1.3, 0.85)}{fgImg({ transform:'translate(-50%,-50%) scale(1.2)' })}</>
    case 'color_bars':
      // Merged: this one case now covers the old gradient/cinema/neon_frame
      // looks too — they were near-identical bar/frame variants. Pick the
      // look via the Frame Color swatch (e.g. black = old "cinema").
      return (
        <>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:'18%', background:barColor }}/>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'18%', background:barColor }}/>
          {fgImg({ top:'50%' })}
        </>
      )
    case 'full_screen':
      return <img src={img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
    case 'crop_fill':
    default:
      return <img src={img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
  }
}

// ── Caption colour swatch options ───────────────────────────────
const COLOR_OPTIONS = [
  { val:'rose_ink', label:'Rose + Ink', sub:'Soft highlight' },
  { val:'mint_ink', label:'Mint + Ink', sub:'Fresh highlight' },
  { val:'lavender_ink', label:'Lavender + Ink', sub:'Calm highlight' },
  { val:'butter_ink', label:'Butter + Ink', sub:'Warm highlight' },
  { val:'white_black',  label:'White + Black',  sub:'Classic' },
  { val:'yellow_black', label:'Yellow + Black', sub:'' },
  { val:'butter_yellow',         label:'Butter Yellow',     sub:'🔥 Trending' },
  { val:'hot_pink_black',        label:'Hot Pink + Black',  sub:'🔥 Trending' },
  { val:'electric_blue_white',   label:'Electric Blue',     sub:'🔥 Trending' },
  { val:'black_white',  label:'Black + White',  sub:'' },
  { val:'cyan_dark',    label:'Cyan + Dark',    sub:'' },
  { val:'orange_dark',  label:'Orange + Dark',  sub:'' },
  { val:'green_dark',   label:'Green + Dark',   sub:'' },
  { val:'red_white',    label:'Red + White',    sub:'' },
  { val:'pure_white',   label:'Pure White',     sub:'Clean' },
  { val:'gold_premium', label:'Gold Premium',   sub:'' },
  { val:'ice_blue',     label:'Ice Blue',       sub:'' },
]

// ── Title text colour swatches — independent of caption colours ─────
const TITLE_TEXT_COLOR_OPTIONS = [
  { val:'white',    label:'White',    hex:'#FFFFFF' },
  { val:'black',    label:'Black',    hex:'#000000' },
  { val:'yellow',   label:'Yellow',   hex:'#FFE600' },
  { val:'gold',     label:'Gold',     hex:'#FFD700' },
  { val:'red',      label:'Red',      hex:'#FF3B30' },
  { val:'ice_blue', label:'Ice Blue', hex:'#C8E5FF' },
  { val:'hot_pink', label:'Hot Pink', hex:'#FF1493' },
]

// ── Title background swatches — "none" (default) = no box at all ───
const TITLE_BG_OPTIONS = [
  { val:'none',       label:'None',       hex:null },
  { val:'dark_gray',  label:'Dark Gray',  hex:'#1A1A1A' },
  { val:'light_gray', label:'Light Gray', hex:'#E5E5E5' },
  { val:'black',      label:'Black',      hex:'#000000' },
  { val:'white',      label:'White',      hex:'#FFFFFF' },
  { val:'brand_red',  label:'Brand Red',  hex:'#CF1322' },
]

// ── Caption font options ─────────────────────────────────────────
const FONT_OPTIONS = [
  { val:'montserrat', label:'Montserrat' },
  { val:'anton', label:'Anton' },
  { val:'bangers', label:'Bangers' },
  { val:'luckiest_guy', label:'Luckiest Guy' },
  { val:'permanent_marker', label:'Permanent Marker' },
  { val:'caveat', label:'Caveat (Cursive)' },
]

// Minutes gateway — mirrors backend MIN_GATEWAY_SECONDS (jobs.py / orchestrator.py)
const MIN_GATEWAY_GAP = 60

const CLIP_LENGTH_OPTIONS = [
  { val:'hooks', label:'<30s',   sub:'Hooks',     min:15, max:30 },
  { val:'mid',   label:'30-60s', sub:'Standard',  min:30, max:60 },
]

const CLIP_COUNT_OPTIONS = [
  { val:'3',  label:'3 Shorts',           sub:'' },
  { val:'5',  label:'5 Shorts',           sub:'' },
  { val:'10', label:'10 Shorts',          sub:'Max' },
]

// ── Lockable option button — used for Clip Length / Clip Count ──────
// Locked options show a lock badge; hovering shows a native tooltip via
// `title`, clicking shows an upgrade prompt instead of selecting.
function LockableButton({ active, locked, label, sub, onClick }) {
  return (
    <button
      className="ce-option-btn"
      onClick={locked ? () => alert('🔒 Choose a paid plan to generate clips.') : onClick}
      title={locked ? '🔒 Upgrade to a paid plan to unlock' : undefined}
      style={{
        flex:1, minWidth:'70px', padding:'8px 6px', borderRadius:'8px', textAlign:'center',
        position:'relative',
        background: locked ? '#f3f4f6' : (active ? '#cf1322' : '#f9f9f9'),
        color: locked ? '#aaa' : (active ? '#fff' : '#666'),
        border: locked ? '1.5px dashed #d1d5db' : (active ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5'),
        cursor: locked ? 'not-allowed' : 'pointer',
        fontSize:'0.75rem', fontWeight:700, lineHeight:1.3,
        transition:'all 0.15s',
      }}>
      {locked && <span style={{ position:'absolute', top:'2px', right:'4px', fontSize:'0.7rem' }}>🔒</span>}
      {label}<br/><span style={{ opacity:0.7, fontSize:'0.68rem', fontWeight:400 }}>{sub}</span>
    </button>
  )
}

// ── Minutes gateway — dual-handle range slider ──────────────────
// Two overlapping native <input type="range"> (classic dual-slider trick):
// each input's track is made transparent via CSS (.gw-thumb classes,
// injected once below) so only the round thumb is visible/clickable,
// letting both handles sit on the same track without fighting each other.
function MinutesGatewaySlider({ durationSeconds, value, onChange }) {
  const [start, end] = value
  const pct = v => Math.min(100, Math.max(0, (v / durationSeconds) * 100))

  return (
    <div style={{
      background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:'12px',
      padding:'14px 16px 12px',
    }}>
      <div style={{ position:'relative', height:'34px' }}>
        <div style={{
          position:'absolute', top:'50%', left:0, right:0, height:'8px',
          background:'#e5e5e5', borderRadius:'100px', transform:'translateY(-50%)',
          boxShadow:'inset 0 1px 2px rgba(0,0,0,0.1)',
        }}/>
        <div style={{
          position:'absolute', top:'50%', height:'8px',
          background:'linear-gradient(90deg,#cf1322,#ff6b6b)', borderRadius:'100px',
          transform:'translateY(-50%)', transition:'left .15s ease, width .15s ease',
          boxShadow:'0 1px 3px rgba(207,19,34,0.4)',
          left:`${pct(start)}%`, width:`${pct(end) - pct(start)}%`,
        }}/>
        <input
          type="range" className="gw-thumb"
          min={0} max={durationSeconds} step={1} value={start}
          onChange={e => onChange([Math.min(Number(e.target.value), end - MIN_GATEWAY_GAP), end])}
          style={{ position:'absolute', top:0, left:0, width:'100%', height:'34px', margin:0, background:'transparent' }}
        />
        <input
          type="range" className="gw-thumb"
          min={0} max={durationSeconds} step={1} value={end}
          onChange={e => onChange([start, Math.max(Number(e.target.value), start + MIN_GATEWAY_GAP)])}
          style={{ position:'absolute', top:0, left:0, width:'100%', height:'34px', margin:0, background:'transparent' }}
        />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'6px' }}>
        <span style={{ fontSize:'0.76rem', color:'#888', fontWeight:600 }}>{formatDuration(start)}</span>
        <span style={{
          fontWeight:800, color:'#fff', fontSize:'0.8rem',
          background:'#cf1322', padding:'4px 12px', borderRadius:'100px',
          boxShadow:'0 2px 5px rgba(207,19,34,0.35)',
        }}>{formatDuration(end - start)} selected</span>
        <span style={{ fontSize:'0.76rem', color:'#888', fontWeight:600 }}>{formatDuration(end)}</span>
      </div>
      <style>{`
        .gw-thumb { -webkit-appearance:none; appearance:none; pointer-events:none; }
        .gw-thumb::-webkit-slider-thumb {
          pointer-events:auto; -webkit-appearance:none;
          width:26px; height:26px; border-radius:50%;
          background:#cf1322; border:3px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.45); cursor:pointer; margin-top:4px;
          transition:transform .12s ease;
        }
        .gw-thumb::-webkit-slider-thumb:hover { transform:scale(1.12); }
        .gw-thumb::-webkit-slider-thumb:active { transform:scale(1.2); }
        .gw-thumb::-moz-range-thumb {
          pointer-events:auto; width:26px; height:26px; border-radius:50%;
          background:#cf1322; border:3px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.45); cursor:pointer;
          transition:transform .12s ease;
        }
        .gw-thumb::-moz-range-thumb:hover { transform:scale(1.12); }
        .gw-thumb::-webkit-slider-runnable-track { background:transparent; }
        .gw-thumb::-moz-range-track { background:transparent; }
      `}</style>
    </div>
  )
}

// ── Manual Fixed-Width Clip Slider ──────────────────────────────────
function ManualClipSlider({ durationSeconds, windowSize, value, onChange }) {
  const maxStart = Math.max(0, durationSeconds - windowSize);
  const start = Math.min(Math.max(0, value), maxStart);
  
  const pctStart = (start / durationSeconds) * 100;
  const pctWidth = Math.min(100, (windowSize / durationSeconds) * 100);

  return (
    <div style={{
      background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:'12px',
      padding:'14px 16px 12px',
    }}>
      <div style={{ position:'relative', height:'34px' }}>
        <div style={{
          position:'absolute', top:'50%', left:0, right:0, height:'8px',
          background:'#e5e5e5', borderRadius:'100px', transform:'translateY(-50%)',
          boxShadow:'inset 0 1px 2px rgba(0,0,0,0.1)',
        }}/>
        <div style={{
          position:'absolute', top:'50%', height:'8px',
          background:'linear-gradient(90deg,#cf1322,#ff6b6b)', borderRadius:'100px',
          transform:'translateY(-50%)', transition:'left .15s ease',
          boxShadow:'0 1px 3px rgba(207,19,34,0.4)',
          left:`${pctStart}%`, width:`${pctWidth}%`,
          pointerEvents:'none'
        }}/>
        <input
          type="range" className="gw-thumb"
          min={0} max={maxStart} step={1} value={start}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position:'absolute', top:0, left:0, width:'100%', height:'34px', margin:0, background:'transparent', zIndex: 2, cursor: 'grab' }}
          onMouseDown={e => e.target.style.cursor = 'grabbing'}
          onMouseUp={e => e.target.style.cursor = 'grab'}
        />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'6px' }}>
        <span style={{ fontSize:'0.76rem', color:'#888', fontWeight:600 }}>{formatDuration(start)}</span>
        <span style={{
          fontWeight:800, color:'#b91c1c', fontSize:'0.75rem',
          background:'#fee2e2', padding:'4px 12px', borderRadius:'100px',
          border:'1.5px solid #fca5a5'
        }}>Exactly {windowSize}s window</span>
        <span style={{ fontSize:'0.76rem', color:'#888', fontWeight:600 }}>{formatDuration(start + windowSize)}</span>
      </div>
    </div>
  )
}

export default function ClipEngine({ onJobCreated }) {
  const [url, setUrl]               = useState('')
  const [mode, setMode]             = useState('input') // input | login | config | processing
  const [videoData, setVideoData]   = useState(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [statusMsg, setStatusMsg]   = useState('Analyzing video...')
  const [urlFocused, setUrlFocused] = useState(false)
  
  // Library Paywall State
  const [libraryVideos] = useState([])
  const [loadingLibrary] = useState(false)

  // Config options
  const [lang,          setLang]          = useState('Auto / No translation')
  const [clipLen,       setClipLen]       = useState('hooks')
  const [clipCount,     setClipCount]     = useState('10')
  const [clipGenerationMethod, setClipGenerationMethod] = useState('auto')
  const [manualRanges,  setManualRanges]  = useState([])
  const [captionStyle,  setCaptionStyle]  = useState('word_pop')
  const [colorCombo,    setColorCombo]    = useState('white_black')
  const [wordsPerLine,  setWordsPerLine]  = useState(2)
  const [captionFont,   setCaptionFont]   = useState('montserrat')
  // Captions stay horizontally centered. This normalized Y value controls
  // their vertical centre in both the live preview and exported short.
  const [captionY,      setCaptionY]      = useState(0.80)
  // A multiplier keeps every caption style proportional while letting users
  // make subtitles more subtle or more prominent.
  const [captionScale,  setCaptionScale]  = useState(1)
  const [shortTemplate, setShortTemplate] = useState('zoom_blur')
  const [barColor,      setBarColor]      = useState('#0d0d0d')
  const [aspect,        setAspect]        = useState('9:16')
  const [titleEnabled,  setTitleEnabled]  = useState(false)
  const [titleColor,    setTitleColor]    = useState('white')
  const [titleBg,       setTitleBg]       = useState('none')
  const [titleBgOpacity, setTitleBgOpacity] = useState(0.55)
  
  const [gameplayClips, setGameplayClips] = useState([])
  const [selectedGameplayId, setSelectedGameplayId] = useState('')
  // "Minutes gateway" — [startSeconds, endSeconds] sub-window of the video
  // to actually process. null until video metadata loads (full video by
  // default — the gateway is opt-in, not required).
  const [gatewayRange,  setGatewayRange]  = useState(null)

  const { user, loginWithGoogleToken } = useAuth()
  const navigate = useNavigate()
  const isPaid = !!(user?.plan && user.plan !== 'free')

  useEffect(() => {
    fetch(API_BASE + '/gameplay/list')
      .then(res => res.json())
      .then(data => {
        if (data.clips && data.clips.length > 0) {
          setGameplayClips(data.clips)
          setSelectedGameplayId(data.clips[0].id)
        }
      })
      .catch(err => console.error(err))
  }, [])

  // Restore pending URL after login
  useEffect(() => {
    const saved = sessionStorage.getItem('sc_pending_url')
    if (saved && user) {
      sessionStorage.removeItem('sc_pending_url')
      setUrl(saved)
    }
  }, [user])

  // Minutes gateway: default to the FULL video whenever a new video loads.
  useEffect(() => {
    if (videoData?.duration > 0) setGatewayRange([0, videoData.duration])
  }, [videoData])

  useEffect(() => {
    if (videoData?.duration && clipCount) {
      const count = parseInt(clipCount, 10) || 3
      const baseStart = gatewayRange ? gatewayRange[0] : 0
      const baseEnd = gatewayRange ? gatewayRange[1] : videoData.duration
      
      const newRanges = []
      const clipLenOpt = CLIP_LENGTH_OPTIONS.find(o => o.val === clipLen) || CLIP_LENGTH_OPTIONS[0]
      const maxLen = clipLenOpt.max

      const maxPossibleStart = Math.max(baseStart, baseEnd - maxLen)
      const availableStartSpan = maxPossibleStart - baseStart
      const spacing = count > 1 ? availableStartSpan / (count - 1) : 0

      for (let i = 0; i < count; i++) {
        const start = baseStart + (i * spacing)
        const end = start + maxLen
        newRanges.push([Math.round(start), Math.round(end)])
      }
      setManualRanges(newRanges)
    }
  }, [videoData, clipCount, clipLen, gatewayRange])

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

    if (!isPaid) {
      // Free users can configure the full clip and caption experience. A
      // plan is only required at the point a generation would be started.
      navigate('/billing')
      return
    }

    setMode('processing')
    setProcessing(true)
    setProgress(5)
    setStatusMsg('Connecting to processing queue…')
    const clipLenOpt = CLIP_LENGTH_OPTIONS.find(o => o.val === clipLen)
      || CLIP_LENGTH_OPTIONS[0]
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/jobs`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({
          youtube_url: url,
          options:{
            clip_count:     Math.min(parseInt(clipCount) || 10, 10),
            min_duration:   clipLenOpt.min,
            max_duration:   clipLenOpt.max,
            language:       lang,
            style:          captionStyle,
            color:          colorCombo,
            words_per_line: wordsPerLine,
            font:           captionFont,
            caption_y:      captionY,
            caption_scale:  captionScale,
            short_template: shortTemplate,
            bar_color:      barColor,
            aspect:         aspect,
            hook_title_enabled: titleEnabled,
            title_color:        titleColor,
            title_bg:           titleBg,
            title_bg_opacity:   titleBgOpacity,
            h_align:'center', v_align:'bottom', quality:'1080p', topic:'',
            // Minutes gateway — sub-window of the video to process/bill.
            // Backend re-validates/re-clamps this against the real video
            // duration regardless (jobs.py) — see MIN_GATEWAY_SECONDS there.
            gateway_start: gatewayRange ? gatewayRange[0] : 0,
            gateway_end:   gatewayRange ? gatewayRange[1] : null,
            manual_clip_ranges: clipGenerationMethod === 'manual' ? manualRanges.map(r => ({ start: r[0], end: r[1] })) : null,
            gameplay_clip_id: shortTemplate.startsWith('gameplay_') ? selectedGameplayId : null,
          },
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Error submitting job')
      }
      const created = await res.json()
      setProgress(20)
      setStatusMsg('Job queued! Redirecting to dashboard…')
      setTimeout(() => {
        if (onJobCreated) onJobCreated(created.job_id)
        if (window.location.pathname !== '/youtube-shorts/dashboard') navigate('/youtube-shorts/dashboard')
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
              if (window.location.pathname !== '/youtube-shorts/dashboard') window.location.href = '/youtube-shorts/dashboard'
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
      { val:'crop_fill',    label:'✂ Crop Fill',      sub:'No Zoom' },
      { val:'blur_bg',      label:'🌫 Blur BG',       sub:'Most Popular' },
      { val:'zoom_blur',    label:'🔍 Zoom Blur',     sub:'Dramatic' },
      { val:'glass',        label:'🪟 Glass',          sub:'Premium' },
      { val:'full_screen',  label:'📺 Full Screen',   sub:'No Bars · Full Fill' },
      // Gameplay options only shown when admin has uploaded at least one clip
      ...(gameplayClips.length > 0 ? [
        { val:'gameplay_50_50', label:'🎮 Gameplay 50/50', sub:'50% Split' },
        { val:'gameplay_40_60', label:'🎮 Gameplay 60%',   sub:'60% Gaming' },
        { val:'gameplay_face',  label:'🎯 Face Tracked',    sub:'Full Width' },
      ] : []),
    ]

    return (
      <div className="ce-config-view"><div className="studio-config-intro"><span className="studio-eyebrow">NEW PROJECT</span><h2>One video. Many possibilities.</h2><p>Choose your moments, framing, and finishing touches.</p></div>
        {/* Video preview card */}
        <div className="ce-video-summary" style={{
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
        <div className="clip-engine-layout" style={{ display:'flex', gap:'20px', flexWrap:'wrap', alignItems:'flex-start', marginBottom:'20px' }}>

          {/* Left: sectioned config */}
          <div className="clip-engine-config" style={{ flex:'1 1 360px', minWidth:0 }}>

            {/* 01 · Clip settings */}
            <div className="ce-section-card ce-source-section" style={sectionCard}>
              <div style={sectionTitle}>01 · Clip settings</div>

              <div className="ce-control-row" style={rowStyle}>
                <span className="ce-row-label" style={labelStyle}>Language</span>
                <select style={selectStyle} value={lang} onChange={e => setLang(e.target.value)}
                  onFocus={e => e.target.style.borderColor='#cf1322'} onBlur={e => e.target.style.borderColor='#e5e5e5'}>
                  <option>Auto / No translation</option>
                  <option>English</option><option>Spanish</option>
                  <option>French</option><option>German</option>
                </select>
              </div>

              <div className="ce-control-row" style={{ ...rowStyle, flexWrap:'wrap' }}>
                <span className="ce-row-label" style={labelStyle}>Clip Length</span>
                <div className="ce-option-row" style={{ display:'flex', gap:'8px', flex:'1 1 auto', flexWrap:'wrap' }}>
                  {CLIP_LENGTH_OPTIONS.map(opt => {
                    const locked = false
                    return (
                      <LockableButton key={opt.val}
                        active={clipLen === opt.val} locked={locked}
                        label={opt.label} sub={opt.sub}
                        onClick={() => setClipLen(opt.val)}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="ce-control-row" style={{ ...rowStyle, flexWrap:'wrap' }}>
                <span className="ce-row-label" style={labelStyle}>Clip Count</span>
                <div className="ce-option-row" style={{ display:'flex', gap:'8px', flex:'1 1 auto', flexWrap:'wrap' }}>
                  {CLIP_COUNT_OPTIONS.map(opt => {
                    const locked = false
                    return (
                      <LockableButton key={opt.val}
                        active={clipCount === opt.val} locked={locked}
                        label={opt.label} sub={opt.sub}
                        onClick={() => setClipCount(opt.val)}
                      />
                    )
                  })}
                </div>
              </div>

              {/* ✂️ Minutes gateway — pick a sub-window of the video to
                  process instead of the whole thing. Only billed/analyzed
                  inside this window — narrowing it down can also let a
                  video that'd otherwise blow your per-video minute cap
                  through, since only the selected window is processed. */}
              {gatewayRange && videoData.duration > MIN_GATEWAY_GAP * 2 && (
                <div style={{ paddingTop:'14px', borderBottom:'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
                    <span style={{ fontSize:'1rem' }}>✂️</span>
                    <span style={{ fontSize:'0.92rem', fontWeight:800, color:'#111' }}>
                      Time Range <span style={{ color:'#cf1322' }}>(Minutes Gateway)</span>
                    </span>
                  </div>
                  <MinutesGatewaySlider
                    durationSeconds={videoData.duration}
                    value={gatewayRange}
                    onChange={setGatewayRange}
                  />
                  <p style={{ fontSize:'0.74rem', color:'#888', marginTop:'8px', lineHeight:1.6 }}>
                    This is the part of the video that will be analyzed after you choose a plan —{' '}
                    <strong style={{ color:'#cf1322' }}>{formatDuration(gatewayRange[1] - gatewayRange[0])}</strong>{' '}
                    from the selected source window.
                  </p>
                </div>
              )}
            </div>

            {/* ✂️ Clip Generation Method */}
            <div className="ce-section-card ce-generation-section" style={sectionCard}>
              <div style={sectionTitle}>⚙️ Generation Method</div>
              <div className="ce-generation-row" style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
                <button
                  className="ce-generation-btn"
                  onClick={() => setClipGenerationMethod('auto')}
                  style={{
                    flex:1, padding:'10px', borderRadius:'8px',
                    background: clipGenerationMethod === 'auto' ? '#cf1322' : '#f9f9f9',
                    color: clipGenerationMethod === 'auto' ? '#fff' : '#666',
                    border: clipGenerationMethod === 'auto' ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                    fontWeight:700, cursor:'pointer'
                  }}
                >
                  AI Generated (Auto)
                </button>
                <button
                  className="ce-generation-btn"
                  onClick={() => setClipGenerationMethod('manual')}
                  style={{
                    flex:1, padding:'10px', borderRadius:'8px',
                    background: clipGenerationMethod === 'manual' ? '#cf1322' : '#f9f9f9',
                    color: clipGenerationMethod === 'manual' ? '#fff' : '#666',
                    border: clipGenerationMethod === 'manual' ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                    fontWeight:700, cursor:'pointer'
                  }}
                >
                  Manual (Timeframes)
                </button>
              </div>

              {clipGenerationMethod === 'manual' && videoData && manualRanges.length > 0 && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {manualRanges.map((range, idx) => {
                    const clipLenOpt = CLIP_LENGTH_OPTIONS.find(o => o.val === clipLen) || CLIP_LENGTH_OPTIONS[0];
                    const wSize = clipLenOpt.max;
                    return (
                    <div key={idx}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#444', marginBottom: '6px' }}>
                        Short {idx + 1}
                      </div>
                      <ManualClipSlider
                        durationSeconds={videoData.duration}
                        windowSize={wSize}
                        value={range[0]}
                        onChange={(newStart) => {
                          const updated = [...manualRanges]
                          updated[idx] = [newStart, newStart + wSize]
                          setManualRanges(updated)
                        }}
                      />
                    </div>
                  )})}
                </div>
              )}
            </div>

            {/* 💬 Captions */}
            <div className="ce-section-card ce-captions-section" style={sectionCard}>
              <div style={sectionTitle}>💬 Captions</div>

              {/* Caption style swatches */}
              <div style={{ padding:'10px 0 4px' }}>
                <span className="ce-row-label" style={{ ...labelStyle, display:'block', marginBottom:'10px' }}>Caption Style</span>
                <div className="ce-caption-style-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
                  {STYLE_OPTIONS.map(opt => {
                    const combo = COLOR_COMBOS[colorCombo] || COLOR_COMBOS.white_black
                    const active = captionStyle === opt.val
                    return (
                      <button className="ce-choice-btn" key={opt.val} onClick={() => { setCaptionStyle(opt.val); if (opt.val.startsWith('last_word') && !colorCombo.endsWith('_ink')) setColorCombo('rose_ink') }} style={{
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

              {/* Caption colour swatches — irrelevant when style is "None" */}
              {captionStyle !== 'none' && (
              <div style={{ padding:'12px 0 4px' }}>
                <span className="ce-row-label" style={{ ...labelStyle, display:'block', marginBottom:'10px' }}>Caption Colour</span>
                <div className="ce-color-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
                  {COLOR_OPTIONS.map(opt => {
                    const combo = COLOR_COMBOS[opt.val]
                    const active = colorCombo === opt.val
                    return (
                      <button className="ce-choice-btn" key={opt.val} onClick={() => setColorCombo(opt.val)} style={{
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
              )}

              {/* Words per line */}
              {captionStyle !== 'none' && (
              <div className="ce-control-row" style={{ ...rowStyle, borderBottom:'none' }}>
                <span className="ce-row-label" style={labelStyle}>Words / Screen</span>
                <div className="ce-segment-row ce-words-grid" style={{ display:'flex', gap:'8px', flex:1 }}>
                  {[
                    { val:1, label:'1 Word', sub:'Max Impact' },
                    { val:2, label:'2 Words', sub:'Balanced'  },
                    { val:3, label:'3 Words', sub:'Natural'   },
                  ].map(({ val, label, sub }) => (
                    <button key={val} type="button" aria-pressed={wordsPerLine === val} className={`ce-choice-btn ce-words-btn${wordsPerLine === val ? ' is-active' : ''}`} onClick={() => setWordsPerLine(val)} style={{
                      flex:1, padding:'8px 6px', borderRadius:'8px',
                      background: wordsPerLine === val ? '#cf1322' : '#f9f9f9',
                      color: wordsPerLine === val ? '#fff' : '#666',
                      border: wordsPerLine === val ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                      cursor:'pointer', fontSize:'0.75rem', fontWeight:700, textAlign:'center',
                      transition:'all 0.15s',
                    }}>
                      <span className="ce-words-value">{label}</span>
                      <span className="ce-words-description">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Captions always stay horizontally centered; only their vertical placement is adjustable. */}
              {captionStyle !== 'none' && (
                <div className="ce-caption-position" style={{ padding:'14px 0 4px', borderTop:'1px solid #f0f0f0' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                    <div>
                      <span className="ce-row-label" style={labelStyle}>Caption Position</span>
                      <span style={{ display:'block', marginTop:3, color:'#8b9aa1', fontSize:'.68rem' }}>Centered horizontally</span>
                    </div>
                    <strong style={{ color:'#cf1322', fontSize:'.74rem' }}>{Math.round(captionY * 100)}%</strong>
                  </div>
                  <input
                    className="ce-caption-position-slider"
                    type="range"
                    min={15}
                    max={85}
                    value={Math.round(captionY * 100)}
                    onChange={e => setCaptionY(Number(e.target.value) / 100)}
                    aria-label="Vertical caption position"
                    style={{ width:'100%', accentColor:'#cf1322', cursor:'pointer' }}
                  />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, color:'#9aa8ae', fontSize:'.65rem', fontWeight:600 }}>
                    <span>Higher</span><span>Lower</span>
                  </div>
                </div>
              )}

              {captionStyle !== 'none' && (
                <div className="ce-caption-size" style={{ padding:'14px 0 4px', borderTop:'1px solid #f0f0f0' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                    <div>
                      <span className="ce-row-label" style={labelStyle}>Caption Size</span>
                      <span style={{ display:'block', marginTop:3, color:'#8b9aa1', fontSize:'.68rem' }}>Applies to the preview and exported clips</span>
                    </div>
                    <strong style={{ color:'#cf1322', fontSize:'.74rem' }}>{Math.round(captionScale * 100)}%</strong>
                  </div>
                  <input
                    className="ce-caption-size-slider"
                    type="range"
                    min={70}
                    max={140}
                    step={5}
                    value={Math.round(captionScale * 100)}
                    onChange={e => setCaptionScale(Number(e.target.value) / 100)}
                    aria-label="Caption size"
                    style={{ width:'100%', accentColor:'#cf1322', cursor:'pointer' }}
                  />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, color:'#9aa8ae', fontSize:'.65rem', fontWeight:600 }}>
                    <span>Smaller</span><span>Default</span><span>Larger</span>
                  </div>
                </div>
              )}

              {/* Caption font */}
              {captionStyle !== 'none' && (
              <div style={{ padding:'12px 0 4px', borderTop:'1px solid #f0f0f0' }}>
                <span className="ce-row-label" style={{ ...labelStyle, display:'block', marginBottom:'10px' }}>Font</span>
                <div className="ce-font-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }}>
                  {FONT_OPTIONS.map(opt => {
                    const active = captionFont === opt.val
                    return (
                      <button className="ce-choice-btn" key={opt.val} onClick={() => setCaptionFont(opt.val)} style={{
                        padding:'10px 8px', borderRadius:'10px', textAlign:'center',
                        background: active ? '#fef2f2' : '#f9f9f9',
                        border: active ? '1.5px solid #cf1322' : '1.5px solid #e5e5e5',
                        cursor:'pointer', transition:'all 0.15s',
                      }}>
                        <div style={{
                          fontFamily: FONT_FAMILIES[opt.val], fontWeight:800,
                          fontSize:'1rem', color: active ? '#cf1322' : '#333', marginBottom:'2px',
                        }}>Aa</div>
                        <div style={{ fontSize:'0.66rem', fontWeight:700, color: active ? '#cf1322' : '#555' }}>{opt.label}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              )}
            </div>

            {/* 🏷️ Title Card */}
            <div className="ce-section-card ce-title-section" style={sectionCard}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={sectionTitle}>🏷️ Title Card</div>
                <button className="ce-toggle" aria-label="Toggle title card" aria-pressed={titleEnabled} onClick={() => setTitleEnabled(p => !p)} style={{
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
              <p style={{ fontSize:'0.74rem', color:'#999', marginTop:'6px', lineHeight:1.5 }}>
                {titleEnabled
                  ? 'AI generates a short curiosity-gap title (with a matching trending emoji) and burns it in for the first few seconds.'
                  : 'None — clips will have no title card, only the captions above.'}
              </p>

              {titleEnabled && (
                <>
                  {/* Title text colour — independent of caption colour */}
                  <div style={{ marginTop:'14px' }}>
                    <span style={{ ...labelStyle, display:'block', marginBottom:'8px' }}>Title Text Colour</span>
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                      {TITLE_TEXT_COLOR_OPTIONS.map(opt => (
                        <button key={opt.val} onClick={() => setTitleColor(opt.val)} title={opt.label} style={{
                          width:'30px', height:'30px', borderRadius:'50%', background:opt.hex,
                          border: titleColor === opt.val ? '3px solid #cf1322' : '2px solid #e5e5e5',
                          boxShadow: opt.hex === '#FFFFFF' ? 'inset 0 0 0 1px #e5e5e5' : 'none',
                          cursor:'pointer',
                        }}/>
                      ))}
                    </div>
                  </div>

                  {/* Title background box — defaults to None */}
                  <div style={{ marginTop:'14px' }}>
                    <span style={{ ...labelStyle, display:'block', marginBottom:'8px' }}>Title Background</span>
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                      {TITLE_BG_OPTIONS.map(opt => (
                        <button key={opt.val} onClick={() => setTitleBg(opt.val)} title={opt.label} style={{
                          width:'30px', height:'30px', borderRadius:'50%',
                          background: opt.hex || 'repeating-linear-gradient(45deg, #f0f0f0, #f0f0f0 4px, #fff 4px, #fff 8px)',
                          border: titleBg === opt.val ? '3px solid #cf1322' : '2px solid #e5e5e5',
                          boxShadow: opt.hex === '#FFFFFF' ? 'inset 0 0 0 1px #e5e5e5' : 'none',
                          cursor:'pointer',
                        }}/>
                      ))}
                    </div>
                    <p style={{ fontSize:'0.7rem', color:'#bbb', marginTop:'6px' }}>
                      Rounded-corner box behind the title. "None" (default) is just clean text + outline.
                    </p>
                  </div>

                  {/* Opacity slider — only matters when a background is picked */}
                  {titleBg !== 'none' && (
                    <div style={{ marginTop:'14px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                        <span style={labelStyle}>Background Opacity</span>
                        <span style={{ fontSize:'0.78rem', fontWeight:800, color:'#cf1322' }}>{Math.round(titleBgOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100} value={Math.round(titleBgOpacity * 100)}
                        onChange={e => setTitleBgOpacity(Number(e.target.value) / 100)}
                        style={{ width:'100%', accentColor:'#cf1322', height:'18px' }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 📐 Layout */}
            <div className="ce-section-card ce-layout-section" style={sectionCard}>
              <div style={sectionTitle}>📐 Layout</div>

              {/* Aspect ratio */}
              <div className="ce-control-row" style={rowStyle}>
                <span className="ce-row-label" style={labelStyle}>Aspect Ratio</span>
                <div className="ce-segment-row" style={{ display:'flex', gap:'8px', flex:1 }}>
                  {[
                    { val:'9:16', label:'9:16', sub:'Shorts / Reels' },
                    { val:'16:9', label:'16:9', sub:'YouTube / X' },
                    { val:'1:1',  label:'1:1',  sub:'Square' },
                  ].map(({ val, label, sub }) => (
                    <button key={val} className="ce-choice-btn ce-aspect-btn" onClick={() => setAspect(val)} style={{
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
                <span className="ce-row-label" style={{ ...labelStyle, display:'block', marginBottom:'10px' }}>Short Style</span>
                <div className="ce-template-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'6px' }}>
                  {templates.map(({ val, label, sub }) => (
                    <button className="ce-choice-btn" key={val} onClick={() => setShortTemplate(val)} style={{
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

              {/* Gameplay picker */}
              {shortTemplate.startsWith('gameplay_') && gameplayClips.length > 0 && (
                <div className="ce-gameplay-picker ce-control-row" style={{ ...rowStyle, borderBottom:'none', flexDirection:'column', alignItems:'stretch', gap:'10px', paddingBottom:'14px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
                    <span style={{ ...labelStyle, display:'block', minWidth:0 }}>Gameplay Clip</span>
                    <span style={{ color:'#8b9aa1', fontSize:'.68rem', fontWeight:700, whiteSpace:'nowrap' }}>Choose a background</span>
                  </div>
                  <div className="ce-gameplay-rail" role="radiogroup" aria-label="Gameplay background" style={{ display:'flex', gap:'10px', overflowX:'auto', width:'100%', padding:'2px 2px 8px' }}>
                    {gameplayClips.map(clip => (
                      <button key={clip.id} type="button" role="radio" aria-checked={selectedGameplayId === clip.id} onClick={() => setSelectedGameplayId(clip.id)} style={{
                        width: '116px', flexShrink: 0, cursor: 'pointer', padding:0, textAlign:'left',
                        background:'#fff', border: selectedGameplayId === clip.id ? '2px solid #cf1322' : '2px solid #e5e5e5',
                        borderRadius: '9px', overflow: 'hidden', position: 'relative',
                        boxShadow: selectedGameplayId === clip.id ? '0 5px 14px rgba(207,19,34,.18)' : 'none',
                        transform: selectedGameplayId === clip.id ? 'translateY(-1px)' : 'none', transition:'all .15s ease',
                      }}>
                        <div style={{ position:'relative', background:'#111', height:'66px' }}>
                          <GameplayThumbnail clip={clip} />
                          {selectedGameplayId === clip.id && <span style={{ position:'absolute', top:5, right:5, display:'grid', placeItems:'center', width:18, height:18, borderRadius:'50%', background:'#cf1322', color:'#fff', fontSize:'.67rem', fontWeight:900 }}>✓</span>}
                        </div>
                        <span title={clip.title || 'Gameplay Clip'} style={{ display:'block', padding:'7px 8px 8px', color:'#333', fontSize:'.68rem', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{clip.title || 'Gameplay Clip'}</span>
                      </button>
                    ))}
                  </div>
                  <span style={{ color:'#8b9aa1', fontSize:'.66rem', lineHeight:1.4 }}>The selected clip plays beneath your source video in the live preview.</span>
                </div>
              )}

              {/* Bar/frame color picker */}
              {shortTemplate === 'color_bars' && (
                <div className="ce-control-row" style={{ ...rowStyle, borderBottom:'none' }}>
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

          {/* ─── Mobile Live Preview: fixed pill badge ─────────────────────
              On desktop this stays sticky to the right of config.
              On mobile (CSS class swap) it becomes a small fixed card
              in the top-right corner, appears with a slide-in after 0.3s
              via CSS animation, and has a subtle float/bob loop. */}
          <div className="clip-engine-preview" style={{
            flex:'0 0 200px', minWidth:'160px',
            position:'sticky', top:'20px', alignSelf:'flex-start',
          }}>
            <div className="pip-title" style={{ ...sectionTitle, marginBottom:'10px' }}>YOUR STYLE PREVIEW</div>
            <div style={{
              position:'relative', width:'100%',
              aspectRatio: aspect.replace(':','/'),
              background:'#111', borderRadius:'10px', overflow:'hidden',
              border:'2px solid #111', boxShadow:'3px 3px 0 #cf1322',
            }}>
              {videoData.thumbnail && (
                <TemplatePreviewBg template={shortTemplate} thumbnail={videoData.thumbnail} barColor={barColor} gameplayUrl={gameplayClips.find(c => c.id === selectedGameplayId)?.video_url} />
              )}
              <div style={{
                position:'absolute', left:0, right:0, bottom:0, height:'40%',
                background:'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
              }}/>
              <CaptionOverlay
                mode="static"
                previewText="YOUR CAPTION HERE"
                style={captionStyle}
                color={colorCombo}
                hAlign="center"
                vAlign="bottom"
                wordsPerLine={wordsPerLine}
                font={captionFont}
                captionY={captionY}
                captionScale={captionScale}
              />
              <div style={{
                position:'absolute', top:'6px', left:'6px',
                background:'rgba(0,0,0,0.55)', color:'#fff',
                fontSize:'0.6rem', fontWeight:700, padding:'2px 6px', borderRadius:'4px',
              }}>{templates.find(t => t.val === shortTemplate)?.label || shortTemplate}</div>
            </div>
            <p style={{ fontSize:'0.66rem', color:'#bbb', marginTop:'8px', textAlign:'center' }}>
              Live preview — updates as you adjust styles
            </p>
          </div>
        </div>

        {/* Submit */}
        <button className="ce-submit-btn" onClick={handleExecute} disabled={processing} style={{
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

  /* ── Paywall Library phase ── */
  if (mode === 'paywall_library') return (
    <div>
      <div style={{
        background:'#fff', border:'1.5px solid #e5e5e5',
        borderRadius:'12px', padding:'40px 20px', textAlign:'center',
        marginBottom: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}>
        <div style={{ fontSize:'2.5rem', marginBottom:'16px' }}>🚀</div>
        <h2 style={{ fontSize:'1.4rem', fontWeight:800, color:'#111', marginBottom:'12px', letterSpacing:'-0.02em' }}>
          Upgrade to Generate Captivating Shorts
        </h2>
        <p style={{ fontSize:'0.9rem', color:'#666', marginBottom:'24px', maxWidth:'500px', margin:'0 auto 24px', lineHeight: 1.6 }}>
          You've configured the perfect clip! <strong>Unlock our premium plans</strong> to generate your videos, apply trending captions, and grow your audience effortlessly.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          <div style={{ border: '1.5px solid #e5e5e5', borderRadius: '12px', padding: '16px', textAlign: 'left' }}>
             <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111', marginBottom: '4px' }}>Starter</div>
             <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111', marginBottom: '12px' }}>$10<span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 500}}>/mo</span></div>
             <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', color: '#555', lineHeight: 1.8 }}>
               <li>✓ 50 shorts/mo</li>
               <li>✓ HD vertical exports</li>
               <li>✓ MP4 download</li>
             </ul>
             <button onClick={() => navigate('/billing')} style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, marginTop: '16px', cursor: 'pointer', fontSize: '0.8rem' }}>Get Starter</button>
          </div>
          
          <div style={{ border: '1.5px solid #e5e5e5', borderRadius: '12px', padding: '16px', textAlign: 'left' }}>
             <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111', marginBottom: '4px' }}>Starter+</div>
             <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111', marginBottom: '12px' }}>$25<span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 500}}>/mo</span></div>
             <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', color: '#555', lineHeight: 1.8 }}>
               <li>✓ 180 shorts/mo</li>
               <li>✓ Faster processing</li>
               <li>✓ Caption styling</li>
             </ul>
             <button onClick={() => navigate('/billing')} style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, marginTop: '16px', cursor: 'pointer', fontSize: '0.8rem' }}>Get Starter+</button>
          </div>

           <div style={{ border: '2px solid #cf1322', borderRadius: '12px', padding: '16px', textAlign: 'left', position: 'relative', boxShadow: '0 4px 12px rgba(207,19,34,0.1)' }}>
             <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: '#cf1322', color: '#fff', padding: '2px 10px', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>MOST POPULAR</div>
             <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111', marginBottom: '4px' }}>Pro</div>
             <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#cf1322', marginBottom: '12px' }}>$45<span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 500}}>/mo</span></div>
             <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', color: '#555', lineHeight: 1.8 }}>
               <li>✓ 350 shorts/mo</li>
               <li>✓ Priority queue</li>
               <li>✓ Batch download</li>
             </ul>
             <button onClick={() => navigate('/billing')} style={{ width: '100%', padding: '10px', background: '#cf1322', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, marginTop: '16px', cursor: 'pointer', fontSize: '0.8rem' }}>Get Pro</button>
          </div>

          <div style={{ border: '1.5px solid #e5e5e5', borderRadius: '12px', padding: '16px', textAlign: 'left' }}>
             <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111', marginBottom: '4px' }}>Pro+</div>
             <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111', marginBottom: '12px' }}>$79<span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 500}}>/mo</span></div>
             <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.75rem', color: '#555', lineHeight: 1.8 }}>
               <li>✓ 700 shorts/mo</li>
               <li>✓ Everything in Pro</li>
               <li>✓ API access</li>
             </ul>
             <button onClick={() => navigate('/billing')} style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, marginTop: '16px', cursor: 'pointer', fontSize: '0.8rem' }}>Get Pro+</button>
          </div>
        </div>
        
        <button onClick={() => setMode('config')} style={{
          background:'none', border:'none', cursor:'pointer',
          fontSize:'0.85rem', color:'#aaa', textDecoration:'underline', fontWeight: 600
        }}>← Back to clip settings</button>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111', marginBottom: '8px' }}>Latest Generated Clips</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>See what's possible. These clips were generated by our users recently.</p>
      </div>

      {loadingLibrary ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#aaa', fontSize: '0.9rem' }}>
           Loading library videos...
        </div>
      ) : libraryVideos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#aaa', fontSize: '0.9rem', background: '#f9f9f9', borderRadius: '12px', border: '1px solid #e5e5e5' }}>
           No clips to show yet. Be the first to generate!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {libraryVideos.map((v) => (
                <div key={v.id} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                   <div style={{ position: 'relative', background: '#000', paddingTop: '177.77%' }}>
                      <video 
                        src={v.video_url} autoPlay loop muted playsInline poster={v.thumbnail_url}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                         👁 {v.views}
                      </div>
                      <div style={{ position: 'absolute', bottom: '12px', right: '12px', background: '#cf1322', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                         💰 {v.earnings}
                      </div>
                   </div>
                   <div style={{ padding: '16px' }}>
                     <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.title}
                     </div>
                   </div>
                </div>
            ))}
            
            <div 
              onClick={() => navigate('/billing')}
              style={{ 
                background: '#fafafa', border: '2px dashed #e5e5e5', borderRadius: '12px', 
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                flexDirection: 'column', cursor: 'pointer', padding: '20px', textAlign: 'center', 
                minHeight: '250px', transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cf1322'; e.currentTarget.style.background = '#fef2f2' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e5e5'; e.currentTarget.style.background = '#fafafa' }}
            >
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>✨</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111', marginBottom: '8px' }}>+1,000s more clips</div>
                <div style={{ fontSize: '0.85rem', color: '#666', lineHeight: 1.5 }}>
                   Upgrade your plan right now to start generating unlimited viral shorts
                </div>
                <button style={{ background: '#cf1322', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, marginTop: '20px', cursor: 'pointer' }}>
                  View Plans
                </button>
            </div>
        </div>
      )}
    </div>
  )

  return null
}
