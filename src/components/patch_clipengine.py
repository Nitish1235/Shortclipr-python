import re
from pathlib import Path

f_path = Path('f:/SAAS/git-shortclipr/Shortclipr-python/src/components/ClipEngine.jsx')
code = f_path.read_text('utf-8')

# 1. TemplatePreviewBg signature and logic
old_preview = '''function TemplatePreviewBg({ template, thumbnail, barColor }) {
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
  )'''

new_preview = '''function TemplatePreviewBg({ template, thumbnail, barColor, gameplayUrl }) {
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
    
    // For face-tracked, we'll just simulate it as a zoomed center-crop
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
'''

code = code.replace(old_preview, new_preview)

# 2. Add state inside ClipEngine component
old_state = '''  const [titleBg,       setTitleBg]       = useState('none')
  const [titleBgOpacity, setTitleBgOpacity] = useState(0.55)'''

new_state = '''  const [titleBg,       setTitleBg]       = useState('none')
  const [titleBgOpacity, setTitleBgOpacity] = useState(0.55)
  
  const [gameplayClips, setGameplayClips] = useState([])
  const [selectedGameplayId, setSelectedGameplayId] = useState('')'''

code = code.replace(old_state, new_state)

# 3. Add useEffect to fetch gameplay clips
old_effect = '''  // Restore pending URL after login
  useEffect(() => {'''

new_effect = '''  useEffect(() => {
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
  useEffect(() => {'''

code = code.replace(old_effect, new_effect)

# 4. Add templates to the templates list
old_templates = '''      { val:'glass',        label:'🪟 Glass',          sub:'Premium' },
      { val:'full_screen',  label:'📺 Full Screen',   sub:'No Bars · Full Fill' },
      // { val:'gameplay',  label:'🎮 Gameplay',       sub:'Gaming' }, // temporarily disabled, will rework
    ]'''

new_templates = '''      { val:'glass',        label:'🪟 Glass',          sub:'Premium' },
      { val:'full_screen',  label:'📺 Full Screen',   sub:'No Bars · Full Fill' },
      { val:'gameplay_50_50', label:'🎮 Gameplay 50/50', sub:'50% Split' },
      { val:'gameplay_40_60', label:'🎮 Gameplay 60%',   sub:'60% Gaming' },
      { val:'gameplay_face',  label:'🎯 Face Tracked',    sub:'Full Width' },
    ]'''

code = code.replace(old_templates, new_templates)

# 5. Add gameplay_clip_id to the payload
old_payload = '''      gateway_start: gatewayRange ? gatewayRange[0] : 0,
      gateway_end:   gatewayRange ? gatewayRange[1] : null,
      manual_clip_ranges: manualRanges.length ? manualRanges : null,
    }'''

new_payload = '''      gateway_start: gatewayRange ? gatewayRange[0] : 0,
      gateway_end:   gatewayRange ? gatewayRange[1] : null,
      manual_clip_ranges: manualRanges.length ? manualRanges : null,
      gameplay_clip_id: shortTemplate.startsWith('gameplay_') ? selectedGameplayId : null,
    }'''

code = code.replace(old_payload, new_payload)

# 6. Pass gameplayUrl to TemplatePreviewBg
old_preview_tag = '''<TemplatePreviewBg template={shortTemplate} thumbnail={videoData.thumbnail} barColor={barColor} />'''
new_preview_tag = '''<TemplatePreviewBg template={shortTemplate} thumbnail={videoData.thumbnail} barColor={barColor} gameplayUrl={gameplayClips.find(c => c.id === selectedGameplayId)?.video_url} />'''
code = code.replace(old_preview_tag, new_preview_tag)

# 7. Add Gameplay selector UI conditionally
old_ui = '''              {/* Extra controls if needed */}
              {shortTemplate === 'color_bars' && (
                <div style={{ marginTop:'12px', padding:'12px', background:'#f9f9f9', borderRadius:'8px', border:'1px solid #e5e5e5' }}>'''

new_ui = '''              {/* Extra controls if needed */}
              {shortTemplate.startsWith('gameplay_') && gameplayClips.length > 0 && (
                <div style={{ marginTop:'12px', padding:'12px', background:'#f9f9f9', borderRadius:'8px', border:'1px solid #e5e5e5' }}>
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color:'#555', textTransform:'uppercase', marginBottom:'8px' }}>Select Gameplay Background</div>
                  <div style={{ display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'4px' }}>
                    {gameplayClips.map(clip => (
                      <div key={clip.id} onClick={() => setSelectedGameplayId(clip.id)} style={{
                        width: '80px', flexShrink: 0, cursor: 'pointer',
                        border: selectedGameplayId === clip.id ? '2px solid #cf1322' : '2px solid transparent',
                        borderRadius: '6px', overflow: 'hidden', position: 'relative'
                      }}>
                        <img src={clip.thumbnail_url} alt={clip.title} style={{ width: '100%', height: '45px', objectFit: 'cover', display: 'block' }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {shortTemplate === 'color_bars' && (
                <div style={{ marginTop:'12px', padding:'12px', background:'#f9f9f9', borderRadius:'8px', border:'1px solid #e5e5e5' }}>'''

code = code.replace(old_ui, new_ui)

f_path.write_text(code, 'utf-8')
print("ClipEngine.jsx patched!")
