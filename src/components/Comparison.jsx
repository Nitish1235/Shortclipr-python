import { Link } from 'react-router-dom'

const rows = [
  {
    feature: 'Processing speed',
    us:       '5–10 min',
    opus:     '10–20 min',
    klap:     '12–25 min',
    vidyo:    '15–30 min',
  },
  {
    feature: 'Free plan watermarks',
    us:       '❌ None',
    opus:     '✓ Watermarked',
    klap:     '✓ Watermarked',
    vidyo:    '✓ Watermarked',
  },
  {
    feature: 'Pricing model',
    us:       'Per video',
    opus:     'Per minute',
    klap:     'Per minute',
    vidyo:    'Per minute',
  },
  {
    feature: 'Caption styles',
    us:       '11 styles',
    opus:     '4 styles',
    klap:     '3 styles',
    vidyo:    '5 styles',
  },
  {
    feature: 'Layout templates',
    us:       '9 templates',
    opus:     '3 templates',
    klap:     '2 templates',
    vidyo:    '4 templates',
  },
  {
    feature: 'Batch ZIP download',
    us:       '✅ Yes',
    opus:     '❌ No',
    klap:     '❌ No',
    vidyo:    '❌ No',
  },
  {
    feature: 'Video length support',
    us:       'Up to 6 hrs',
    opus:     '< 3 hrs',
    klap:     '< 2 hrs',
    vidyo:    '< 4 hrs',
  },
  {
    feature: 'Language support',
    us:       '28 languages',
    opus:     '20 languages',
    klap:     '10 languages',
    vidyo:    '15 languages',
  },
]

export default function Comparison() {
  const cols = [
    { key: 'us',   label: 'ShortClipr', highlight: true  },
    { key: 'opus', label: 'OpusClip',   highlight: false },
    { key: 'klap', label: 'Klap',       highlight: false },
    { key: 'vidyo',label: 'Vidyo.ai',   highlight: false },
  ]

  const thStyle = (highlight) => ({
    padding: '16px 20px',
    textAlign: 'center',
    fontWeight: 800,
    fontSize: '0.88rem',
    background: highlight ? '#cf1322' : '#f9f9f9',
    color: highlight ? '#fff' : '#555',
    borderRadius: highlight ? '10px 10px 0 0' : '0',
    letterSpacing: '-0.01em',
    position: 'relative',
  })

  const tdStyle = (highlight, isLast) => ({
    padding: '14px 20px',
    textAlign: 'center',
    fontSize: '0.875rem',
    fontWeight: highlight ? 700 : 400,
    color: highlight ? '#cf1322' : '#666',
    background: highlight ? '#fef7f7' : '#fff',
    borderBottom: isLast ? 'none' : '1px solid #f0f0f0',
    borderLeft: highlight ? '2px solid #fecaca' : '1px solid #f0f0f0',
    borderRight: highlight ? '2px solid #fecaca' : '1px solid #f0f0f0',
  })

  return (
    <section id="comparison" style={{ padding: '96px 0', background: '#f9f9f9' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 5%' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cf1322', textTransform: 'uppercase', letterSpacing: '0.22em' }}>
              vs the competition
            </span>
            <div style={{ width: '28px', height: '2px', background: '#cf1322' }}/>
          </div>
          <h2 style={{
            fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
            fontWeight: 800, color: '#0f0f0f', letterSpacing: '-0.04em', marginBottom: '14px',
          }}>
            Why creators switch to ShortClipr
          </h2>
          <p style={{ fontSize: '1rem', color: '#666', maxWidth: '500px', margin: '0 auto', lineHeight: 1.7 }}>
            Faster processing, no watermarks on free plan, fair per-video pricing.
            The best OpusClip alternative — and the best Klap alternative.
          </p>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', borderRadius: '16px', boxShadow: '0 4px 32px rgba(0,0,0,0.06)', border: '1px solid #e5e5e5' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
            <thead>
              <tr>
                <th style={{
                  padding: '16px 20px', textAlign: 'left',
                  background: '#f9f9f9', fontWeight: 700,
                  fontSize: '0.82rem', color: '#aaa',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  borderBottom: '1px solid #e5e5e5',
                }}>Feature</th>
                {cols.map(c => (
                  <th key={c.key} style={thStyle(c.highlight)}>
                    {c.highlight && (
                      <div style={{
                        position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                        background: '#0f0f0f', color: '#fff',
                        fontSize: '0.6rem', fontWeight: 800, padding: '2px 10px',
                        borderRadius: '100px', whiteSpace: 'nowrap',
                        letterSpacing: '0.08em',
                      }}>BEST VALUE</div>
                    )}
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.feature}>
                  <td style={{
                    padding: '14px 20px', fontSize: '0.875rem',
                    fontWeight: 600, color: '#333',
                    borderBottom: i < rows.length - 1 ? '1px solid #f0f0f0' : 'none',
                    background: '#fff',
                  }}>{row.feature}</td>
                  {cols.map(c => (
                    <td key={c.key} style={tdStyle(c.highlight, i === rows.length - 1)}>
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom note — SEO text + internal links to full comparison pages */}
        <p style={{
          textAlign: 'center', fontSize: '0.78rem', color: '#bbb',
          marginTop: '20px', lineHeight: 1.6,
        }}>
          ShortClipr is the fastest AI shorts generator and the best free alternative to{' '}
          <Link to="/alternatives/opus-clip" style={{ color: '#cf1322', textDecoration: 'underline', textUnderlineOffset: '3px' }}>OpusClip</Link>,{' '}
          <Link to="/alternatives/klap" style={{ color: '#cf1322', textDecoration: 'underline', textUnderlineOffset: '3px' }}>Klap</Link>, and{' '}
          <Link to="/alternatives/vmaker" style={{ color: '#cf1322', textDecoration: 'underline', textUnderlineOffset: '3px' }}>Vmaker AI</Link>.{' '}
          Create TikTok clips, Instagram Reels, and YouTube Shorts from any long-form video in minutes — see the{' '}
          <Link to="/alternatives" style={{ color: '#cf1322', textDecoration: 'underline', textUnderlineOffset: '3px' }}>full feature-by-feature comparison</Link>.
        </p>
      </div>
    </section>
  )
}
