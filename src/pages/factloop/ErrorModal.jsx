// ErrorModal.jsx — the one place a Factloop page shows a failure to the
// user. Never renders raw backend/exception text; only a friendlyError()
// shape ({ title, message, tips }), so nothing technical ever leaks into
// the UI. Self-contained (no theme import) so it drops into Studio, Login,
// and Settings identically.

const BRAIN = '#a855f7'
const INK = '#0f0f0f'

export default function ErrorModal({ error, onClose, onRetry }) {
  if (!error) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380,
        border: `2px solid ${INK}`, boxShadow: `6px 6px 0 ${BRAIN}`,
        padding: '26px 24px 22px',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        textAlign: 'center',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%', margin: '0 auto 14px',
          background: '#fdf4ff', border: `2px solid ${BRAIN}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.3rem', fontWeight: 800, color: BRAIN,
        }}>!</div>

        <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: INK, letterSpacing: '-.02em' }}>
          {error.title}
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: '.86rem', color: '#666', lineHeight: 1.5 }}>
          {error.message}
        </p>

        {error.tips?.length > 0 && (
          <ul style={{
            textAlign: 'left', margin: '0 0 18px', padding: '12px 16px',
            background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, listStyle: 'none',
          }}>
            {error.tips.map((t, i) => (
              <li key={i} style={{
                fontSize: '.8rem', color: '#555', lineHeight: 1.6,
                display: 'flex', gap: 8, marginBottom: i < error.tips.length - 1 ? 6 : 0,
              }}>
                <span style={{ color: BRAIN, fontWeight: 800, flexShrink: 0 }}>·</span>{t}
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {onRetry && (
            <button onClick={onRetry} style={{
              flex: 1, padding: '11px', borderRadius: 9, cursor: 'pointer',
              background: BRAIN, color: '#fff', border: `2px solid ${INK}`,
              fontWeight: 700, fontSize: '.85rem', boxShadow: `2px 2px 0 ${INK}`,
              fontFamily: 'inherit',
            }}>Try again</button>
          )}
          <button onClick={onClose} style={{
            flex: 1, padding: '11px', borderRadius: 9, cursor: 'pointer',
            background: '#fff', color: INK, border: '1.5px solid #e5e5e5',
            fontWeight: 700, fontSize: '.85rem', fontFamily: 'inherit',
          }}>Dismiss</button>
        </div>
      </div>
    </div>
  )
}
