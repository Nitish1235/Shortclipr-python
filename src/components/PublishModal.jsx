import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function PublishModal({ selectedClips, onClose, onComplete }) {
  const [metadata, setMetadata] = useState(
    selectedClips.map(clip => ({
      clip_id: clip.id,
      video_url: clip.video_url,
      title: `Short: ${new Date().toLocaleDateString()}`,
      description: 'Check out this epic short! #shorts #viral',
      tags: ['shorts', 'ai', 'video']
    }))
  )
  const [publishing, setPublishing] = useState(false)
  const [platform, setPlatform] = useState('youtube') // youtube or tiktok (scaffolded)

  const handleUpdateField = (index, field, value) => {
    const updated = [...metadata]
    updated[index][field] = value
    setMetadata(updated)
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const token = localStorage.getItem('sc_token')
      const endpoint = platform === 'youtube' ? '/social/publish/youtube' : '/social/publish/tiktok'
      
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(metadata)
      })

      if (!res.ok) throw new Error('Publishing failed')
      
      const result = await res.json()
      alert(`SUCCESS: Published ${result.results?.length || 0} clips to ${platform.toUpperCase()}.`)
      onComplete()
    } catch (err) {
      alert(`SYS_ERROR: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        background: '#050d08', border: '3px solid var(--lime)', width: '90%', maxWidth: '800px',
        maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 30px rgba(132, 204, 22, 0.2)'
      }}>
        <div style={{ background: 'var(--lime)', color: '#000', padding: '10px 20px', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
          <span>BULK_PUBLISH_MODULE :: {selectedClips.length} CLIPS SELECTED</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontWeight: 800, cursor: 'pointer' }}>[X]</button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: '20px', display: 'flex', gap: '20px' }}>
             <button 
               onClick={() => setPlatform('youtube')}
               style={{ 
                 flex: 1, padding: '10px', 
                 background: platform === 'youtube' ? 'var(--lime)' : 'transparent',
                 color: platform === 'youtube' ? '#000' : 'var(--lime)',
                 border: '1px solid var(--lime)', fontWeight: 700, cursor: 'pointer'
               }}
             >YOUTUBE SHORTS</button>
             {/* TikTok button hidden as per request or just disabled if you want to show scaffold */}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {metadata.map((item, idx) => (
              <div key={item.clip_id} style={{ display: 'flex', gap: '20px', borderBottom: '1px solid #1a3322', paddingBottom: '20px' }}>
                <video src={item.video_url} style={{ width: '120px', aspectRatio: '9/16', background: '#000' }} muted />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input 
                    type="text" 
                    value={item.title} 
                    onChange={e => handleUpdateField(idx, 'title', e.target.value)}
                    placeholder="Video Title"
                    style={{ background: '#000', border: '1px solid var(--muted)', color: 'var(--lime)', padding: '8px', fontFamily: "'Space Mono', monospace" }}
                  />
                  <textarea 
                    value={item.description}
                    onChange={e => handleUpdateField(idx, 'description', e.target.value)}
                    placeholder="Description & Hashtags"
                    style={{ background: '#000', border: '1px solid var(--muted)', color: 'var(--text)', padding: '8px', minHeight: '80px', fontFamily: "'Space Mono', monospace" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px', borderTop: '2px solid var(--lime)', display: 'flex', justifyContent: 'flex-end', gap: '20px' }}>
          <button onClick={onClose} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>[ CANCEL ]</button>
          <button 
            onClick={handlePublish}
            disabled={publishing}
            style={{ 
              background: 'var(--lime)', color: '#000', padding: '10px 30px', 
              fontWeight: 800, border: 'none', cursor: 'pointer',
              opacity: publishing ? 0.5 : 1
            }}
          >
            {publishing ? 'DISPATCHING...' : 'CONFIRM_BULK_PUBLISH.EXE 🚀'}
          </button>
        </div>
      </div>
    </div>
  )
}
