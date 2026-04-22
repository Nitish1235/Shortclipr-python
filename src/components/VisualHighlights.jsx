import img1 from '../assets/retro_viral_extraction_1776835143234.png'
import img2 from '../assets/retro_subtitles_editing_1776835726124.png'
import img3 from '../assets/retro_long_to_short_1776835124440.png'
import img4 from '../assets/retro_multi_layout_1776835161037.png'
import img5 from '../assets/retro_3_steps_1776835104752.png'

const sectionLabel = {
  fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', color: 'var(--lime)',
  textTransform: 'uppercase', letterSpacing: '0.12em',
  background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.25)',
  display: 'inline-block', padding: '4px 12px', marginBottom: '20px',
}

export default function VisualHighlights() {
  return (
    <section id="visual-highlights" style={{ padding: '90px 5%', borderTop: '2px dashed #1a3322' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <div style={sectionLabel}>SYSTEM_DEMONSTRATION</div>
        <h2 className="sec-title" style={{ marginBottom: '60px' }}>SEE IT IN ACTION.</h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '80px',
        }}>
          {/* Main feature showcase - How it works */}
          <div>
            <img 
              src={img5} 
              alt="How to Use Shortclipr in 3 Steps" 
              style={{ width: '100%', maxWidth: '1000px', height: 'auto', borderRadius: '16px', border: '1px solid #333' }} 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '40px' }}>
            <img 
              src={img3} 
              alt="Long Video to Shorts" 
              style={{ width: '100%', height: 'auto', borderRadius: '16px', border: '1px solid #333' }} 
            />
            <img 
              src={img1} 
              alt="Viral Clips Extraction" 
              style={{ width: '100%', height: 'auto', borderRadius: '16px', border: '1px solid #333' }} 
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '40px' }}>
             <img 
              src={img4} 
              alt="Multi-Layout Support" 
              style={{ width: '100%', height: 'auto', borderRadius: '16px', border: '1px solid #333' }} 
            />
            <img 
              src={img2} 
              alt="Dynamic Subtitles Editing" 
              style={{ width: '100%', height: 'auto', borderRadius: '16px', border: '1px solid #333' }} 
            />
          </div>
        </div>
      </div>
    </section>
  )
}
