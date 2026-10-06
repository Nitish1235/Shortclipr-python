import { useState } from 'react'

const audiences = [
  {
    id: 'podcasters',
    label: 'Podcasters',
    source: 'Long interviews and weekly episodes',
    title: 'Turn one conversation into a complete clip queue.',
    copy: 'Surface quotable answers, strong opinions, and story-driven moments without replaying the whole episode.',
    outputs: [
      ['Opening hook', 'A sharp answer that earns attention quickly'],
      ['Guest insight', 'A useful idea with enough context to stand alone'],
      ['Story moment', 'A personal section built for retention'],
    ],
  },
  {
    id: 'youtube',
    label: 'YouTubers',
    source: 'Tutorials, commentary, and long-form uploads',
    title: 'Give every upload a second life on short-form platforms.',
    copy: 'Pull clear lessons, surprising moments, and practical takeaways from the videos you already produced.',
    outputs: [
      ['Fast takeaway', 'The most useful result in under a minute'],
      ['Common mistake', 'A focused problem-and-solution clip'],
      ['Key reveal', 'The moment viewers are most likely to share'],
    ],
  },
  {
    id: 'educators',
    label: 'Educators',
    source: 'Courses, lectures, and coaching sessions',
    title: 'Make valuable ideas easier to discover and revisit.',
    copy: 'Break complex teaching into focused clips while preserving the explanation that makes each idea useful.',
    outputs: [
      ['Core concept', 'One clear idea explained without filler'],
      ['Worked example', 'A practical demonstration from the lesson'],
      ['Quick definition', 'A searchable answer to a common question'],
    ],
  },
  {
    id: 'teams',
    label: 'Marketing teams',
    source: 'Webinars, launches, and customer conversations',
    title: 'Extend every recording without extending the edit queue.',
    copy: 'Create a dependable stream of social content from the recordings already produced by your team.',
    outputs: [
      ['Problem statement', 'A clip that identifies the audience pain'],
      ['Product insight', 'A focused explanation of the solution'],
      ['Customer moment', 'A credible quote ready for social use'],
    ],
  },
]

export default function UseCases() {
  const [activeId, setActiveId] = useState(audiences[0].id)
  const active = audiences.find((audience) => audience.id === activeId) ?? audiences[0]

  return (
    <section id="use-cases" className="use-cases-v2">
      <div className="use-cases-v2-inner">
        <div className="use-cases-v2-heading">
          <div>
            <span>Who it's for</span>
            <h2>Built around the content you already create.</h2>
          </div>
          <p>Choose your workflow to see the moments ShortClipr helps you turn into publishable clips.</p>
        </div>

        <div className="use-cases-v2-tabs" role="tablist" aria-label="Creator workflows">
          {audiences.map((audience, index) => (
            <button
              key={audience.id}
              type="button"
              role="tab"
              aria-selected={active.id === audience.id}
              className={active.id === audience.id ? 'active' : ''}
              onClick={() => setActiveId(audience.id)}
            >
              <small>{String(index + 1).padStart(2, '0')}</small>
              <strong>{audience.label}</strong>
            </button>
          ))}
        </div>

        <div className="use-cases-v2-panel" role="tabpanel">
          <div className="use-cases-v2-copy">
            <span>{active.source}</span>
            <h3>{active.title}</h3>
            <p>{active.copy}</p>
          </div>

          <div className="use-cases-v2-output">
            <div className="use-cases-v2-output-head">
              <span>Suggested clip set</span>
              <b>Ready to review</b>
            </div>
            {active.outputs.map(([title, description], index) => (
              <div className="use-cases-v2-output-row" key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{title}</strong><small>{description}</small></div>
                <i>{38 + index * 9}s</i>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .use-cases-v2 { padding:96px 0; background:#f8f8f6; }
        .use-cases-v2-inner { max-width:1100px; margin:0 auto; padding:0 5%; }
        .use-cases-v2-heading { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr); gap:56px; align-items:end; margin-bottom:42px; }
        .use-cases-v2-heading > div > span { color:#cf1322; font-size:.72rem; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }
        .use-cases-v2-heading h2 { max-width:700px; margin:12px 0 0; color:#111; font-size:clamp(2rem,4vw,3.2rem); line-height:1.05; letter-spacing:-.03em; }
        .use-cases-v2-heading > p { margin:0; color:#666; line-height:1.7; }
        .use-cases-v2-tabs { display:grid; grid-template-columns:repeat(4,1fr); border-bottom:1px solid #d7d7d4; }
        .use-cases-v2-tabs button { display:flex; align-items:center; justify-content:center; gap:9px; min-width:0; padding:15px 10px; color:#777; background:transparent; border:0; border-bottom:3px solid transparent; font:inherit; cursor:pointer; }
        .use-cases-v2-tabs button small { color:#aaa; font-size:.62rem; font-weight:800; }
        .use-cases-v2-tabs button strong { font-size:.82rem; white-space:nowrap; }
        .use-cases-v2-tabs button.active { color:#111; border-bottom-color:#cf1322; }
        .use-cases-v2-tabs button.active small { color:#cf1322; }
        .use-cases-v2-panel { display:grid; grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr); margin-top:26px; overflow:hidden; background:#fff; border:1px solid #dededb; border-radius:8px; }
        .use-cases-v2-copy { display:flex; min-height:350px; flex-direction:column; justify-content:center; padding:48px; border-right:1px solid #e5e5e5; }
        .use-cases-v2-copy > span { color:#cf1322; font-size:.7rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
        .use-cases-v2-copy h3 { margin:14px 0; color:#111; font-size:clamp(1.65rem,3vw,2.5rem); line-height:1.08; letter-spacing:-.025em; }
        .use-cases-v2-copy p { margin:0; color:#666; line-height:1.7; }
        .use-cases-v2-output { align-self:center; margin:34px; border:1px solid #dedede; border-radius:7px; overflow:hidden; }
        .use-cases-v2-output-head { display:flex; justify-content:space-between; padding:13px 16px; color:#666; background:#f6f6f4; border-bottom:1px solid #dedede; font-size:.7rem; }
        .use-cases-v2-output-head b { color:#08754f; }
        .use-cases-v2-output-row { display:grid; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; padding:15px 16px; border-bottom:1px solid #ededed; gap:10px; }
        .use-cases-v2-output-row:last-child { border-bottom:0; }
        .use-cases-v2-output-row > span { color:#aaa; font-size:.66rem; }
        .use-cases-v2-output-row div { min-width:0; }
        .use-cases-v2-output-row strong, .use-cases-v2-output-row small { display:block; }
        .use-cases-v2-output-row strong { margin-bottom:3px; color:#222; font-size:.8rem; }
        .use-cases-v2-output-row small { overflow:hidden; color:#888; font-size:.68rem; text-overflow:ellipsis; white-space:nowrap; }
        .use-cases-v2-output-row i { color:#777; font-size:.68rem; font-style:normal; }
        @media(max-width:720px){
          .use-cases-v2 { padding:72px 0; }
          .use-cases-v2-heading { grid-template-columns:1fr; gap:18px; margin-bottom:30px; }
          .use-cases-v2-tabs { overflow-x:auto; grid-template-columns:none; grid-auto-flow:column; grid-auto-columns:max-content; justify-content:start; scrollbar-width:none; }
          .use-cases-v2-tabs::-webkit-scrollbar { display:none; }
          .use-cases-v2-tabs button { padding:13px 16px; }
          .use-cases-v2-panel { grid-template-columns:1fr; }
          .use-cases-v2-copy { min-height:0; padding:30px 24px; border-right:0; border-bottom:1px solid #e5e5e5; }
          .use-cases-v2-output { margin:16px; }
        }
      `}</style>
    </section>
  )
}
