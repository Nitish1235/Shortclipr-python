// Social proof + feature ticker — between hero and how-it-works
const items = [
  { text: '🎬 Real ShortClipr showcase clips'       },
  { text: '⚡ Minutes, not hours'                    },
  { text: '🎬 11 caption styles'                    },
  { text: '📐 Auto 9:16 reframe'                    },
  { text: '🌍 28 languages supported'               },
  { text: '📊 Virality score per clip'               },
  { text: '🔥 Viral score for every clip'           },
  { text: '📦 Batch process 20 videos'             },
  { text: '🧭 Explore the workflow before choosing a plan' },
  { text: '🎙️ Works with podcasts & interviews'    },
  { text: '📱 TikTok · Reels · Shorts · LinkedIn'  },
  { text: '🏆 Best OpusClip alternative'           },
]

const doubled = [...items, ...items]

export default function Ticker() {
  return (
    <div style={{
      overflow: 'hidden',
      borderTop: '1px solid #e5e5e5',
      borderBottom: '1px solid #e5e5e5',
      background: '#0f0f0f',
      padding: '14px 0',
    }}>
      <div style={{
        display: 'flex',
        width: 'max-content',
        animation: 'marquee 32s linear infinite',
        gap: '0',
      }}>
        {doubled.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center',
            gap: '10px', padding: '0 28px',
            borderRight: '1px solid #333',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: '0.8rem', fontWeight: 600,
              color: '#e5e5e5', whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}>{item.text}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
  )
}
