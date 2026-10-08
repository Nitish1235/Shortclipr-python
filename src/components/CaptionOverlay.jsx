import { useEffect, useRef, useState } from 'react'

/* ──────────────────────────────────────────────────────────────
 * CaptionOverlay
 *
 * Client-side approximation of the FFmpeg/ASS caption styles used
 * at burn-time (see backend/app/pipeline/captions.py). Renders a
 * styled text overlay synced to a <video> element's playback time
 * (mode="synced") — or cycles through sample chunks for a static
 * live-preview panel (mode="static").
 *
 * This is a visual approximation for instant editing feedback —
 * the FFmpeg/ASS burn remains the source of truth for the export.
 * ────────────────────────────────────────────────────────────── */

// Mirrors COLOR_COMBOS in captions.py (ASS &HAABBGGRR → CSS hex/rgba)
export const COLOR_COMBOS = {
  rose_ink: { primary:'#FFFFFF', secondary:'#f2aeb7', outline:'#243644', back:'rgba(0,0,0,.6)', highlight:'#f2aeb7', highlightInk:'#243644' },
  mint_ink: { primary:'#FFFFFF', secondary:'#a5dcce', outline:'#243644', back:'rgba(0,0,0,.6)', highlight:'#a5dcce', highlightInk:'#243644' },
  lavender_ink: { primary:'#FFFFFF', secondary:'#bac4f0', outline:'#243644', back:'rgba(0,0,0,.6)', highlight:'#bac4f0', highlightInk:'#243644' },
  butter_ink: { primary:'#FFFFFF', secondary:'#eac897', outline:'#243644', back:'rgba(0,0,0,.6)', highlight:'#eac897', highlightInk:'#243644' },
  white_black:  { primary:'#FFFFFF', secondary:'#FFFF00', outline:'#000000', back:'rgba(0,0,0,0.6)',   highlight:'#FFFF00' },
  yellow_black: { primary:'#FFFF00', secondary:'#FFFFFF', outline:'#000000', back:'rgba(0,0,0,0.6)',   highlight:'#FFFFFF' },
  black_white:  { primary:'#000000', secondary:'#FF0000', outline:'#FFFFFF', back:'rgba(255,255,255,0.6)', highlight:'#FF0000' },
  green_dark:   { primary:'#00FF00', secondary:'#FFFFFF', outline:'#003200', back:'rgba(0,0,0,0.6)',   highlight:'#FFFFFF' },
  orange_dark:  { primary:'#FF8000', secondary:'#FFFFFF', outline:'#602000', back:'rgba(0,0,0,0.6)',   highlight:'#FFFFFF' },
  cyan_dark:    { primary:'#00FFFF', secondary:'#FFFFFF', outline:'#000080', back:'rgba(0,0,0,0.6)',   highlight:'#FFFFFF' },
  red_white:    { primary:'#FF0000', secondary:'#FFFF00', outline:'#FFFFFF', back:'rgba(0,0,0,0.6)',   highlight:'#FFFF00' },
  // Trending 2026 combos
  butter_yellow:        { primary:'#F8E16C', secondary:'#FFFFFF', outline:'#202020', back:'rgba(0,0,0,0.6)',   highlight:'#FFFFFF' },
  hot_pink_black:       { primary:'#FF1493', secondary:'#FFFFFF', outline:'#000000', back:'rgba(0,0,0,0.6)',   highlight:'#FFFFFF' },
  electric_blue_white:  { primary:'#0080FF', secondary:'#000000', outline:'#FFFFFF', back:'rgba(255,255,255,0.6)', highlight:'#000000' },
  // Clean, monochrome combos — no clashing accent outline
  pure_white:   { primary:'#FFFFFF', secondary:'#FFFFFF', outline:'#000000', back:'rgba(0,0,0,0.6)', highlight:'#FFFFFF' },
  gold_premium: { primary:'#FFD700', secondary:'#FFFFFF', outline:'#000000', back:'rgba(0,0,0,0.6)', highlight:'#FFD700' },
  ice_blue:     { primary:'#C8E5FF', secondary:'#FFFFFF', outline:'#101010', back:'rgba(0,0,0,0.6)', highlight:'#C8E5FF' },
}
export const DEFAULT_COLOR = 'white_black'

// Mirrors FONT_OPTIONS in captions.py — CSS font-family strings.
// The actual @font-face files are loaded globally via index.html (Google Fonts CDN).
export const FONT_FAMILIES = {
  // Was '"Arial Black"' — didn't match what the backend actually burns in for
  // "default" (Liberation Sans, a plain metric-compatible Arial substitute,
  // not a heavy display face). Plain Arial/Helvetica is the accurate preview;
  // boldness still comes from `fontWeight: 800` below, matching the ASS Bold=1 flag.
  default:       'Arial, Helvetica, sans-serif',
  montserrat:    '"Montserrat", sans-serif',
  archivo_black: '"Archivo Black", sans-serif',
  anton:         '"Anton", sans-serif',
  bebas_neue:    '"Bebas Neue", sans-serif',
  poppins:       '"Poppins", sans-serif',
  jakarta:       '"Plus Jakarta Sans", sans-serif',
  bangers:            '"Bangers", cursive',
  luckiest_guy:       '"Luckiest Guy", cursive',
  permanent_marker:   '"Permanent Marker", cursive',
  caveat:             '"Caveat", cursive',
}
export const DEFAULT_FONT = 'default'

// Mirrors _POS in captions.py (PlayRes 1080x1920 → percentages + anchor)
const POSITIONS = {
  top_left:      { x:7.4,  y:11.5, tx:'0%',    ty:'0%'    },
  top_center:    { x:50,   y:11.5, tx:'-50%',  ty:'0%'    },
  top_right:     { x:92.6, y:11.5, tx:'-100%', ty:'0%'    },
  center_left:   { x:7.4,  y:50,   tx:'0%',    ty:'-50%'  },
  center:        { x:50,   y:50,   tx:'-50%',  ty:'-50%'  },
  center_right:  { x:92.6, y:50,   tx:'-100%', ty:'-50%'  },
  bottom_left:   { x:7.4,  y:89.6, tx:'0%',    ty:'-100%' },
  bottom_center: { x:50,   y:89.6, tx:'-50%',  ty:'-100%' },
  bottom_right:  { x:92.6, y:89.6, tx:'-100%', ty:'-100%' },
}

export function resolvePos(hAlign = 'center', vAlign = 'bottom') {
  const h = (hAlign || 'center').toLowerCase()
  const v = (vAlign || 'bottom').toLowerCase()
  const key = (v === 'center' && h === 'center') ? 'center' : `${v}_${h}`
  return POSITIONS[key] || POSITIONS.bottom_center
}

// Word-by-word animated styles use splitWords(); everything else uses splitPhrases()
const WORD_STYLES = new Set(['word_pop', 'typewriter', 'slide'])

const MIN_CHUNK_DUR = 0.12

// Mirrors _split_phrases() — equal-time chunks of `wpl` words
export function splitPhrases(cap, wpl = 3) {
  const words = (cap.text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const groups = []
  for (let i = 0; i < words.length; i += wpl) groups.push(words.slice(i, i + wpl))
  const durEach = Math.max(cap.end - cap.start, 0.05) / groups.length
  return groups.map((grp, i) => {
    const start = cap.start + i * durEach
    const end   = i === groups.length - 1 ? cap.end : start + durEach
    return { start, end, text: grp.join(' ') }
  })
}

// Mirrors _split_words() — character-weighted chunks of `wpl` words
export function splitWords(cap, wpl = 1) {
  const words = (cap.text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const chunks = []
  for (let i = 0; i < words.length; i += wpl) chunks.push(words.slice(i, i + wpl))
  if (chunks.length === 1) return [{ start: cap.start, end: cap.end, text: chunks[0].join(' ') }]

  const totalChars = words.reduce((s, w) => s + w.length, 0) || 1
  const totalDur   = Math.max(cap.end - cap.start, MIN_CHUNK_DUR * chunks.length)

  let raw = chunks.map(c => (c.reduce((s, w) => s + w.length, 0) / totalChars) * totalDur)
  if (raw.some(d => d < MIN_CHUNK_DUR)) {
    raw = raw.map(d => Math.max(d, MIN_CHUNK_DUR))
    const totalRaw = raw.reduce((a, b) => a + b, 0)
    if (totalRaw > totalDur) {
      const scale = totalDur / totalRaw
      raw = raw.map(d => d * scale)
    }
  }

  let t = cap.start
  return chunks.map((chunk, i) => {
    const end = i === chunks.length - 1 ? cap.end : t + raw[i]
    const res = { start: t, end, text: chunk.join(' ') }
    t = end
    return res
  })
}

const KEYFRAMES = `
@keyframes capFade  { from { opacity:0 } to { opacity:1 } }
@keyframes capPop   { 0% { transform:scale(0.8) } 60% { transform:scale(1.15) } 100% { transform:scale(1) } }
@keyframes capSlide { from { transform:translateX(-120px); opacity:0 } to { transform:translateX(0); opacity:1 } }
@keyframes capZoom  { from { transform:scale(0.5); opacity:0 } to { transform:scale(1); opacity:1 } }
@keyframes capShake {
  0%   { transform:rotate(0deg) }
  25%  { transform:rotate(-2deg) }
  50%  { transform:rotate(2deg) }
  75%  { transform:rotate(-1deg) }
  100% { transform:rotate(0deg) }
}
`

/** Build the rendered text node(s) + wrapper style/animation for one style. */
function renderChunk({ style, combo, highlightColor, phrase, chunk, chunks, idx, time, fontFamily }) {
  const base = {
    fontFamily,
    fontWeight: 800,
    color: combo.primary,
    textShadow: `0 0 3px ${combo.outline}, 0 2px 4px rgba(0,0,0,0.85)`,
    padding: '2px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  }

  switch (style) {
    case 'last_word_box':
    case 'last_word_editorial':
    case 'last_word_ink': {
      const words = chunk.text.split(/\s+/).filter(Boolean)
      const last = words.pop()
      const box = style !== 'last_word_ink'
      return {
        node: <>{words.join(' ')}{words.length > 0 && ' '}<span style={{
          color: box ? (combo.highlightInk || '#243644') : combo.highlight,
          background: box ? combo.highlight : 'transparent',
          padding: box ? '0 .08em' : 0,
        }}>{last}</span></>,
        wrapStyle: { ...base, textShadow:'none', fontStyle:style === 'last_word_editorial' ? 'italic' : 'normal' },
      }
    }
    case 'word_pop':
      return { text: chunk.text.toUpperCase(), wrapStyle: { ...base, animation: 'capPop 0.28s ease both' } }

    case 'slide':
      return { text: chunk.text.toUpperCase(), wrapStyle: { ...base, animation: 'capSlide 0.32s ease-out both' } }

    case 'typewriter': {
      const accumulated = chunks.slice(0, idx + 1).map(c => c.text).join(' ')
      return { text: accumulated, wrapStyle: { ...base, fontWeight: 600 } }
    }

    case 'zoom':
      return { text: chunk.text, wrapStyle: { ...base, fontWeight: 700, animation: 'capZoom 0.3s ease both' } }

    case 'shake':
      return { text: chunk.text.toUpperCase(), wrapStyle: { ...base, animation: 'capShake 0.4s ease both' } }

    case 'fade':
      return { text: chunk.text, wrapStyle: { ...base, fontWeight: 500, animation: 'capFade 0.4s ease both' } }

    case 'karaoke': {
      const words = splitWords(phrase, 1)
      const activeIdx = words.findIndex(w => time >= w.start && time < w.end)
      const phraseWords = phrase.text.trim().split(/\s+/).filter(Boolean)
      return {
        wrapStyle: { ...base, fontWeight: 600 },
        node: (
          <>
            {phraseWords.map((w, i) => (
              <span key={i} style={{ color: i === activeIdx ? (highlightColor || combo.highlight) : combo.primary }}>
                {w}{i < phraseWords.length - 1 ? ' ' : ''}
              </span>
            ))}
          </>
        ),
      }
    }

    case 'hormozi':
      return {
        text: chunk.text.toUpperCase(),
        wrapStyle: {
          ...base, fontSize: '1.15em', background: combo.back,
          color: highlightColor || combo.highlight, padding: '6px 14px',
          textShadow: 'none', letterSpacing: '0.04em',
        },
      }

    case 'mrbeast':
      return {
        text: chunk.text.toUpperCase(),
        wrapStyle: { ...base, fontSize: '1.4em', animation: 'capPop 0.28s ease both' },
      }

    case 'neon':
      return {
        text: chunk.text, wrapStyle: {
          ...base,
          textShadow: `0 0 6px ${combo.primary}, 0 0 12px ${combo.primary}, 0 2px 4px rgba(0,0,0,0.7)`,
        },
      }

    case 'none':
      return { text: '', wrapStyle: { display: 'none' } }

    default: // minimal
      return { text: chunk.text, wrapStyle: { ...base, fontWeight: 500 } }
  }
}

function findActivePhrase(captionsData, time) {
  return captionsData.find(c => time >= c.start && time < c.end) || null
}

export default function CaptionOverlay({
  mode = 'synced',           // 'synced' | 'static'
  videoRef,
  captionsData = [],
  previewText = 'YOUR CAPTION HERE',
  style = 'minimal',
  color = DEFAULT_COLOR,
  hAlign = 'center',
  vAlign = 'bottom',
  wordsPerLine = 3,
  highlightColor,
  font = DEFAULT_FONT,
  captionY = null,
}) {
  const [time, setTime] = useState(0)
  const [demoIdx, setDemoIdx] = useState(0)

  // Synced mode — follow the <video> element's playback time
  useEffect(() => {
    if (mode !== 'synced') return
    const video = videoRef?.current
    if (!video) return
    const onTimeUpdate = () => setTime(video.currentTime)
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [mode, videoRef])

  // Static mode — cycle through demo chunks for a live preview
  const demoPhrase = { start: 0, end: 3, text: previewText }
  const isWordStyle = WORD_STYLES.has(style)
  const demoChunks = isWordStyle ? splitWords(demoPhrase, wordsPerLine) : splitPhrases(demoPhrase, wordsPerLine)

  useEffect(() => {
    if (mode !== 'static' || demoChunks.length < 2) return
    setDemoIdx(0)
    const id = setInterval(() => {
      setDemoIdx(i => (i + 1) % demoChunks.length)
    }, 1100)
    return () => clearInterval(id)
  }, [mode, style, wordsPerLine, previewText]) // eslint-disable-line react-hooks/exhaustive-deps

  const combo = COLOR_COMBOS[color] || COLOR_COMBOS[DEFAULT_COLOR]
  const pos   = Number.isFinite(captionY)
    ? { x:50, y:Math.max(0, Math.min(1, captionY)) * 100, tx:'-50%', ty:'-50%' }
    : resolvePos(hAlign, vAlign)

  let phrase, chunks, idx, activeTime
  if (mode === 'static') {
    phrase = demoPhrase
    chunks = demoChunks
    idx    = Math.min(demoIdx, Math.max(chunks.length - 1, 0))
    activeTime = chunks[idx]?.start ?? 0
  } else {
    phrase = findActivePhrase(captionsData, time)
    if (!phrase) return null
    chunks = isWordStyle ? splitWords(phrase, wordsPerLine) : splitPhrases(phrase, wordsPerLine)
    idx = chunks.findIndex(c => time >= c.start && time < c.end)
    if (idx === -1) idx = time < (chunks[0]?.start ?? 0) ? 0 : chunks.length - 1
    activeTime = time
  }

  if (!chunks.length) return null
  const chunk = chunks[idx]
  if (!chunk) return null

  const fontFamily = FONT_FAMILIES[font] || FONT_FAMILIES[DEFAULT_FONT]
  const { text, node, wrapStyle } = renderChunk({
    style, combo, highlightColor, phrase, chunk, chunks, idx, time: activeTime, fontFamily,
  })

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div style={{
        position: 'absolute',
        left: `${pos.x}%`, top: `${pos.y}%`,
        transform: `translate(${pos.tx}, ${pos.ty})`,
        maxWidth: '92%', textAlign: 'center', pointerEvents: 'none',
        display: 'flex', justifyContent: 'center', flexWrap: 'wrap',
      }}>
        <span key={`${idx}-${chunk.start}`} style={wrapStyle}>
          {node || text}
        </span>
      </div>
    </>
  )
}
