import { useState } from 'react'

const stages = [
  {
    id: 'listen',
    number: '01',
    label: 'Understand',
    title: 'Turn the full conversation into searchable context.',
    copy: 'ShortClipr maps the transcript, speakers, pacing, and topic changes so promising moments are evaluated with the surrounding context intact.',
  },
  {
    id: 'select',
    number: '02',
    label: 'Select',
    title: 'Compare the moments most likely to hold attention.',
    copy: 'Candidate clips are ranked by opening strength, clarity, emotion, and how well each moment works on its own.',
  },
  {
    id: 'frame',
    number: '03',
    label: 'Reframe',
    title: 'Adapt the scene for vertical viewing.',
    copy: 'The important subject stays visible as the source is reframed from landscape into a clean 9:16 composition.',
  },
  {
    id: 'finish',
    number: '04',
    label: 'Finish',
    title: 'Add captions and prepare the clip for review.',
    copy: 'Captions, timing, format, and export details come together in a clip you can preview before downloading or publishing.',
  },
]

function StageVisual({ stage }) {
  if (stage.id === 'listen') {
    return (
      <div className="pipeline-transcript">
        <div className="pipeline-window-bar"><span /><span /><span /><b>Transcript map</b></div>
        <div className="pipeline-audio"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <p><span>00:18</span> The thing most creators miss is not the edit. It is finding the sentence that makes somebody stop.</p>
        <p className="muted"><span>00:27</span> Once that moment is clear, the rest of the clip becomes much easier to shape.</p>
      </div>
    )
  }

  if (stage.id === 'select') {
    return (
      <div className="pipeline-selection">
        <div className="pipeline-window-bar"><span /><span /><span /><b>Candidate moments</b></div>
        <div className="pipeline-candidate featured"><b>Strong opening claim</b><span>00:18 - 00:57</span><em>94</em></div>
        <div className="pipeline-candidate"><b>Practical explanation</b><span>04:12 - 04:54</span><em>87</em></div>
        <div className="pipeline-candidate"><b>Closing takeaway</b><span>11:08 - 11:43</span><em>82</em></div>
        <small>Ranked for clarity, hook strength, and standalone context</small>
      </div>
    )
  }

  if (stage.id === 'frame') {
    return (
      <div className="pipeline-reframe">
        <div className="pipeline-landscape"><img src="/assets/showcase_interview.png" alt="" /><span>16:9 source</span></div>
        <div className="pipeline-reframe-line"><span /></div>
        <div className="pipeline-portrait"><img src="/assets/showcase_interview.png" alt="" /><span>9:16 clip</span></div>
      </div>
    )
  }

  return (
    <div className="pipeline-finish">
      <div className="pipeline-finished-video">
        <img src="/assets/showcase_interview.png" alt="" />
        <strong>THE SENTENCE THAT MAKES SOMEONE STOP</strong>
      </div>
      <div className="pipeline-export-list">
        <div><span>Format</span><b>Vertical 9:16</b></div>
        <div><span>Captions</span><b>Applied</b></div>
        <div><span>Duration</span><b>39 seconds</b></div>
        <div className="ready"><span>Status</span><b>Ready to review</b></div>
      </div>
    </div>
  )
}
export default function VisualHighlights() {
  const [activeId, setActiveId] = useState(stages[0].id)
  const active = stages.find((stage) => stage.id === activeId) ?? stages[0]

  return (
    <section id="pipeline" className="pipeline-v2">
      <div className="pipeline-v2-inner">
        <div className="pipeline-v2-heading">
          <span>Inside ShortClipr</span>
          <h2>Watch one moment become a finished short.</h2>
          <p>Explore each stage yourself. Nothing auto-advances or competes for attention.</p>
        </div>

        <div className="pipeline-v2-workspace">
          <div className="pipeline-v2-tabs" role="tablist" aria-label="AI clipping stages">
            {stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={active.id === stage.id}
                className={active.id === stage.id ? 'active' : ''}
                onClick={() => setActiveId(stage.id)}
              >
                <span>{stage.number}</span>
                <div><strong>{stage.label}</strong><small>{stage.title}</small></div>
              </button>
            ))}
          </div>

          <div className="pipeline-v2-stage" role="tabpanel">
            <div className="pipeline-v2-copy">
              <span>Stage {active.number}</span>
              <h3>{active.title}</h3>
              <p>{active.copy}</p>
            </div>
            <StageVisual stage={active} />
          </div>
        </div>
      </div>

      <style>{`
        .pipeline-v2 { padding:96px 0; color:#fff; background:#0f0f0f; }
        .pipeline-v2-inner { max-width:1100px; margin:0 auto; padding:0 5%; }
        .pipeline-v2-heading { max-width:760px; margin:0 auto 48px; text-align:center; }
        .pipeline-v2-heading > span { color:#ef3344; font-size:.72rem; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }
        .pipeline-v2-heading h2 { margin:13px 0 12px; color:#fff; font-size:clamp(2rem,4.4vw,3.4rem); line-height:1.04; letter-spacing:-.035em; }
        .pipeline-v2-heading p { margin:0; color:#898989; line-height:1.65; }
        .pipeline-v2-workspace { display:grid; grid-template-columns:300px minmax(0,1fr); overflow:hidden; background:#171717; border:1px solid #303030; border-radius:8px; }
        .pipeline-v2-tabs { padding:10px; border-right:1px solid #303030; }
        .pipeline-v2-tabs button { display:grid; grid-template-columns:32px minmax(0,1fr); width:100%; padding:17px 14px; color:#777; background:transparent; border:0; border-bottom:1px solid #292929; border-radius:5px; font:inherit; text-align:left; cursor:pointer; gap:10px; }
        .pipeline-v2-tabs button:last-child { border-bottom:0; }
        .pipeline-v2-tabs button > span { padding-top:2px; color:#666; font-size:.66rem; font-weight:800; }
        .pipeline-v2-tabs button strong, .pipeline-v2-tabs button small { display:block; }
        .pipeline-v2-tabs button strong { margin-bottom:5px; color:#ddd; font-size:.83rem; }
        .pipeline-v2-tabs button small { overflow:hidden; color:#777; font-size:.66rem; line-height:1.45; text-overflow:ellipsis; white-space:nowrap; }
        .pipeline-v2-tabs button.active { background:#242424; }
        .pipeline-v2-tabs button.active > span { color:#ef3344; }
        .pipeline-v2-tabs button.active strong { color:#fff; }
        .pipeline-v2-stage { display:grid; grid-template-columns:minmax(210px,.7fr) minmax(340px,1fr); min-height:480px; align-items:center; padding:42px; gap:34px; }
        .pipeline-v2-copy > span { color:#ef3344; font-size:.7rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
        .pipeline-v2-copy h3 { margin:13px 0; color:#fff; font-size:clamp(1.7rem,3vw,2.55rem); line-height:1.08; letter-spacing:-.025em; }
        .pipeline-v2-copy p { margin:0; color:#999; line-height:1.7; }
        .pipeline-transcript, .pipeline-selection { overflow:hidden; background:#f5f5f2; border-radius:7px; color:#222; }
        .pipeline-window-bar { display:flex; align-items:center; padding:11px 13px; background:#e9e9e6; border-bottom:1px solid #d6d6d2; gap:5px; }
        .pipeline-window-bar > span { width:7px; height:7px; background:#bdbdb9; border-radius:50%; }
        .pipeline-window-bar b { margin-left:auto; color:#777; font-size:.62rem; }
        .pipeline-audio { display:flex; height:72px; align-items:center; padding:14px 18px 4px; gap:5px; }
        .pipeline-audio i { flex:1; height:35%; background:#bababa; border-radius:2px; }
        .pipeline-audio i:nth-child(3n) { height:72%; background:#cf1322; }
        .pipeline-audio i:nth-child(4n) { height:52%; }
        .pipeline-transcript p { margin:0; padding:14px 18px; font-size:.78rem; line-height:1.6; border-top:1px solid #dededb; }
        .pipeline-transcript p span { margin-right:8px; color:#cf1322; font-size:.64rem; font-weight:800; }
        .pipeline-transcript p.muted { color:#888; }
        .pipeline-selection { padding-bottom:12px; }
        .pipeline-candidate { display:grid; grid-template-columns:1fr auto 34px; align-items:center; margin:10px 12px 0; padding:13px; background:#fff; border:1px solid #dedede; border-radius:5px; gap:10px; }
        .pipeline-candidate.featured { border-color:#cf1322; box-shadow:inset 3px 0 0 #cf1322; }
        .pipeline-candidate b { font-size:.72rem; }
        .pipeline-candidate span { color:#888; font-size:.62rem; }
        .pipeline-candidate em { display:grid; width:30px; height:26px; place-items:center; color:#111; background:#f8e59c; border-radius:3px; font-size:.64rem; font-style:normal; font-weight:800; }
        .pipeline-selection > small { display:block; padding:12px 14px 0; color:#888; font-size:.6rem; }
        .pipeline-reframe { display:flex; align-items:center; justify-content:center; min-height:310px; padding:22px; background:#f5f5f2; border-radius:7px; gap:14px; }
        .pipeline-landscape, .pipeline-portrait { position:relative; overflow:hidden; background:#222; border-radius:5px; }
        .pipeline-landscape { width:58%; aspect-ratio:16/9; }
        .pipeline-portrait { width:26%; aspect-ratio:9/16; border:2px solid #cf1322; }
        .pipeline-landscape img, .pipeline-portrait img, .pipeline-finished-video img { display:block; width:100%; height:100%; object-fit:cover; }
        .pipeline-landscape span, .pipeline-portrait span { position:absolute; bottom:7px; left:7px; padding:3px 5px; color:#fff; background:rgba(0,0,0,.72); border-radius:3px; font-size:.55rem; font-weight:700; }
        .pipeline-reframe-line { width:28px; height:1px; background:#aaa; }
        .pipeline-reframe-line span { display:block; width:8px; height:8px; margin:-4px 0 0 auto; border-top:1px solid #aaa; border-right:1px solid #aaa; transform:rotate(45deg); }
        .pipeline-finish { display:grid; grid-template-columns:145px minmax(0,1fr); align-items:center; min-height:310px; padding:22px; background:#f5f5f2; border-radius:7px; gap:22px; }
        .pipeline-finished-video { position:relative; overflow:hidden; aspect-ratio:9/15; background:#222; border-radius:6px; }
        .pipeline-finished-video strong { position:absolute; right:8px; bottom:36px; left:8px; color:#fff; font-size:.64rem; line-height:1.15; text-align:center; text-shadow:0 2px 4px #000; }
        .pipeline-export-list div { display:flex; justify-content:space-between; padding:11px 0; border-bottom:1px solid #ddd; gap:12px; }
        .pipeline-export-list span { color:#888; font-size:.68rem; }
        .pipeline-export-list b { color:#333; font-size:.7rem; }
        .pipeline-export-list .ready b { color:#08754f; }
        @media(max-width:800px){
          .pipeline-v2-workspace { grid-template-columns:1fr; }
          .pipeline-v2-tabs { display:flex; overflow-x:auto; padding:8px; border-right:0; border-bottom:1px solid #303030; scrollbar-width:none; }
          .pipeline-v2-tabs::-webkit-scrollbar { display:none; }
          .pipeline-v2-tabs button { min-width:130px; grid-template-columns:24px 1fr; border-right:1px solid #292929; border-bottom:0; }
          .pipeline-v2-tabs button small { display:none; }
          .pipeline-v2-stage { grid-template-columns:1fr; min-height:0; padding:28px 20px 20px; }
        }
        @media(max-width:520px){
          .pipeline-v2 { padding:72px 0; }
          .pipeline-v2-heading { margin-bottom:32px; }
          .pipeline-finish { grid-template-columns:105px 1fr; padding:16px; gap:14px; }
          .pipeline-candidate { grid-template-columns:1fr 30px; }
          .pipeline-candidate span { display:none; }
        }
      `}</style>
    </section>
  )
}
