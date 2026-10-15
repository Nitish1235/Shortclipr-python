// Older comparison URLs can still be reached from search results and links.
// Keep them useful without publishing unverified competitor limits or pricing.
// These pages are intentionally noindex until their competitor details receive
// the same source review as the featured comparisons.

const comparisons = [
  {
    slug: '2short', name: '2short.ai',
    angle: 'YouTube video clips',
    intro: 'If you are comparing 2short.ai with ShortClipr, start with a video you would actually publish from. Check which moments each workflow suggests, how much context the cut retains, and how easily you can finish the captions and portrait framing.',
    focus: 'Start with the same YouTube recording',
    focusText: 'A good comparison uses one representative episode or tutorial. Look beyond the first suggested clip: review its opening, ending, caption accuracy, and whether it makes sense without the full video.',
    question: 'Can I compare the workflows before paying?',
    answer: 'You can explore ShortClipr’s showcase, project setup, and caption controls before choosing a paid generation plan. Check 2short.ai’s current trial and export terms on its own site.',
  },
  {
    slug: 'munch', name: 'Munch',
    angle: 'repurposing long videos into social clips',
    intro: 'Munch and ShortClipr are both considered by teams turning longer recordings into short posts. The useful comparison is the finished clip: does it preserve the speaker’s point, fit a vertical frame, and need little cleanup before publishing?',
    focus: 'Judge the clip, not the highlight label',
    focusText: 'Run a representative interview, webinar, or podcast segment through the workflows you are considering. Review the actual cut, caption timing, and portrait composition before deciding which suggestions are ready to post.',
    question: 'Is ShortClipr meant for creators or marketing teams?',
    answer: 'ShortClipr is designed for people who need to find, review, caption, and export short clips from longer videos. Compare the project and review steps with your team’s own publishing process.',
  },
  {
    slug: 'riverside', name: 'Riverside',
    angle: 'turning recorded interviews and podcasts into clips',
    intro: 'If you record interviews or podcasts with Riverside, decide whether you want to keep clipping inside your recording workflow or use a dedicated clip workflow afterward. Compare the source handoff, moment selection, caption corrections, and final export.',
    focus: 'Follow the recording all the way to the post',
    focusText: 'Include the steps after recording: selecting a complete thought, checking the speaker crop, correcting names in captions, and preparing a vertical file for each destination.',
    question: 'Should I compare recording features here?',
    answer: 'This page focuses on making short clips from a completed recording. Check Riverside’s official product information for its current recording and editing features.',
  },
  {
    slug: 'spikes-studio', name: 'Spikes Studio',
    angle: 'finding short moments in longer recordings',
    intro: 'When comparing Spikes Studio and ShortClipr, use a source video with several possible clips. Look at how each workflow helps you choose a self-contained moment, refine the vertical frame, and finish the captions.',
    focus: 'Review several candidates from one source',
    focusText: 'One good suggestion can be luck. Compare a small batch and check whether the opening sets up the point, the ending resolves it, and the captions match what was said.',
    question: 'What makes a clip ready to publish?',
    answer: 'A strong candidate still needs a complete idea, readable framing, accurate captions, and a final watch on a phone-sized screen.',
  },
  {
    slug: 'vidyo', name: 'Vidyo.ai',
    angle: 'editing and repurposing videos for social channels',
    intro: 'Vidyo.ai and ShortClipr can appear on the same shortlist for social video work. Compare the exact job you need to finish: finding a moment in a longer source, shaping a vertical clip, reviewing captions, and getting a file ready to post.',
    focus: 'Separate clip creation from publishing needs',
    focusText: 'List the steps your team uses after export, including approvals and posting. Then compare each product’s current workflow against that list rather than relying on a headline feature count.',
    question: 'Does this comparison include Vidyo.ai’s current plans?',
    answer: 'Plan features and pricing change. Check the official Vidyo.ai product and pricing pages before purchasing; use the workflow checklist here to compare your own source.',
  },
  {
    slug: 'vizard', name: 'Vizard AI',
    angle: 'creating short clips from spoken videos',
    intro: 'If you are deciding between Vizard AI and ShortClipr, compare what happens after a suggested moment appears. The cut, portrait framing, caption corrections, and export process matter more than the number of suggestions alone.',
    focus: 'Inspect the full editing pass',
    focusText: 'Use the same interview, lesson, or webinar in both tools. Check whether the selected moment keeps enough context and how much work it takes to finish the on-screen text.',
    question: 'Which tool makes better clips?',
    answer: 'There is no reliable universal winner. Judge both on your own footage, including the opening, ending, caption accuracy, and mobile framing.',
  },
  {
    slug: 'vmaker', name: 'Vmaker AI',
    angle: 'editing and clipping existing videos',
    intro: 'Vmaker AI and ShortClipr approach video work from different starting points. If your goal is to turn a longer recording into several short posts, compare moment selection, caption review, portrait framing, and the effort needed to export each clip.',
    focus: 'Start from the outcome you need',
    focusText: 'A general video editor and a focused clip workflow may suit different tasks. Test a real long-form source and count the steps from upload or link to a reviewed, publishable short.',
    question: 'Is Vmaker AI only a clip maker?',
    answer: 'Check Vmaker AI’s current official product information for its full editing scope. This comparison focuses on the long-video-to-short-clip task.',
  },
  {
    slug: 'wisecut', name: 'Wisecut',
    angle: 'editing spoken video into concise clips',
    intro: 'When comparing Wisecut with ShortClipr, decide whether your main problem is polishing one recording or finding several complete short moments inside a longer one. Then check the actual cuts, captions, and vertical framing on your own footage.',
    focus: 'Decide what kind of editing you need',
    focusText: 'Try a long interview or tutorial. Note whether you need a shorter version of the whole recording, several standalone clips, or both; that choice should guide which workflow you evaluate.',
    question: 'Can I use ShortClipr for long-form repurposing?',
    answer: 'Yes. ShortClipr helps you explore clip candidates from longer video, review project and caption controls, and generate exports with a paid plan.',
  },
]

export const accessibleAlternativesContent = Object.fromEntries(comparisons.map(item => [item.slug, {
  slug: item.slug,
  name: item.name,
  badge: `ShortClipr and ${item.name}`,
  metaTitle: `${item.name} Alternative? Compare Clip Workflows | ShortClipr`,
  metaDescription: `Compare ShortClipr and ${item.name} for ${item.angle}. Use a practical checklist for source video, clip review, captions, and exports.`,
  h1: `ShortClipr and ${item.name}: compare the clip workflow`,
  intro: item.intro,
  rows: [
    { feature: 'Starting source', us: 'YouTube link or video upload', them: `Check ${item.name}’s current source options` },
    { feature: 'Clip selection', us: 'Review suggested moments from a longer video', them: 'Compare suggestions on the same source' },
    { feature: 'Portrait framing and captions', us: 'Review the layout and caption controls', them: 'Check the current editor on your footage' },
    { feature: 'Generation and downloads', us: 'Paid plan required', them: 'Check current plan and trial terms' },
  ],
  why: [
    { title: item.focus, desc: item.focusText },
    { title: 'Compare the whole cost of a finished post', desc: 'Include the time spent correcting captions, adjusting framing, exporting, and publishing. Check each product’s current official plan terms before paying.' },
  ],
  faqs: [
    { q: item.question, a: item.answer },
    { q: 'Can I generate clips for free in ShortClipr?', a: 'You can explore the workflow, showcase clips, and project controls before paying. Generating and downloading clips from your own video requires a paid plan.' },
    { q: `What is the best way to compare ShortClipr with ${item.name}?`, a: 'Use the same representative source video, then judge the completeness of the cut, caption accuracy, portrait framing, and the steps required to finish and publish.' },
  ],
}]))
