export default function Ticker() {
  const items = [
    'AI_POWERED_CLIPPING','9:16_AUTO_REFRAME','BURN-IN_CAPTIONS',
    'MULTI-PLATFORM_EXPORT','VIRAL_HOOK_DETECTION','NO_WATERMARK_PRO',
    '4K_READY_OUTPUT','BATCH_PROCESSING',
  ]
  const doubled = [...items, ...items]

  return (
    <div style={{
      overflow: 'hidden', borderTop: '2px solid var(--lime)',
      borderBottom: '2px solid var(--lime)', background: 'var(--lime)',
      padding: '10px 0',
    }}>
      <div style={{
        display: 'flex', gap: '40px', width: 'max-content',
        animation: 'ticker 22s linear infinite',
        fontFamily: "'Space Mono', monospace", fontWeight: 700,
        fontSize: '0.85rem', color: 'var(--bg-dark)', letterSpacing: '0.06em',
      }}>
        {doubled.map((item, i) => (
          <span key={i}>● {item}</span>
        ))}
      </div>
      <style>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
