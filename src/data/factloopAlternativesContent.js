// factloopAlternativesContent.js — comparison-page content for Factloop.
//
// Smaller initial set (2 pages) per the pivot plan.

const factloopAlternativesContent = {
  'canva': {
    slug: 'canva',
    name: 'Canva',
    badge: 'ShortClipr vs Canva',
    metaTitle: 'Canva Alternative for Data Videos — Fully Automatic | ShortClipr',
    metaDescription:
      'Canva needs manual design work for every data video. Factloop generates the script, AI image, narration, and animated stat callouts automatically from your facts.',
    keywords:
      'canva alternative, canva alternative for data videos, automatic data video vs canva, canva video alternative',
    h1: 'A Canva Alternative Built to Automate Data Videos',
    intro:
      'Canva is a general-purpose design tool — great for manual templates, but every data video still means picking a template, typing in numbers by hand, and animating each element yourself. Factloop is purpose-built for one job: turn a title and a list of facts into a finished, narrated video with no manual design step at all.',
    rows: [
      { feature: 'Input',                   us: 'Title + facts list',    them: 'Blank template' },
      { feature: 'Script/narration',         us: '✅ AI-written & voiced', them: '❌ Manual, if at all' },
      { feature: 'Stat animation',           us: 'Automatic count-up',    them: 'Manual keyframing' },
      { feature: 'Visual per video',         us: 'AI-generated image',    them: 'Stock photo search' },
      { feature: 'Background footage',       us: 'Curated gameplay',      them: 'Not built-in' },
      { feature: 'Time to finished video',   us: '< 2 minutes',           them: '30-60+ minutes' },
      { feature: 'Design skill required',    us: 'None',                  them: 'Template/design familiarity' },
    ],
    why: [
      { title: 'No design step at all', desc: 'Type your facts in, and everything — script, visual, animation, audio — is generated. Canva still requires picking layouts and placing elements by hand.' },
      { title: 'Narration included', desc: 'Factloop writes and voices a full narration track automatically. Canva has no built-in voiceover writer for your specific numbers.' },
      { title: 'Numbers animate on their own', desc: 'Each stat gets a count-up animation timed to the narration with zero manual keyframing — in Canva, animating a changing number is a manual, per-element task.' },
      { title: 'Built for short-form vertical video', desc: 'Every output is a ready-to-post 1080×1920 video with captions and background footage baked in, not a static design exported to video.' },
    ],
    faqs: [
      { q: 'Is Factloop a replacement for Canva entirely?', a: 'No — Canva is a general design tool for all kinds of graphics. Factloop is narrowly focused on one thing: turning a set of facts into a narrated, animated video automatically.' },
      { q: 'Can I get the same animated count-up effect in Canva?', a: 'You can build something similar manually with Canva\'s animation tools, but it means keyframing each number yourself. Factloop generates it automatically for every fact you add.' },
      { q: 'Does Factloop include narration like Canva\'s voice tools?', a: 'Yes — narration is generated and voiced automatically as part of every video, timed to when each stat appears on screen.' },
      { q: 'Which is faster for a one-off data recap?', a: 'Factloop — a title and a handful of facts becomes a finished video in about two minutes with no manual layout work.' },
    ],
  },

  'manual-video-editing': {
    slug: 'manual-video-editing',
    name: 'Manual Video Editing',
    badge: 'ShortClipr vs Manual Editing',
    metaTitle: 'Automatic Data Videos vs Manual Editing | ShortClipr Factloop',
    metaDescription:
      'Skip the editing timeline entirely. Factloop turns a title and facts into a narrated, animated video automatically — no editor, no manual keyframing, no voice recording.',
    keywords:
      'automatic video vs manual editing, data video without editing, ai video generator alternative to editing software, no-edit video maker',
    h1: 'Skip the Editing Timeline Entirely',
    intro:
      'Traditional video editing software (Premiere, CapCut, DaVinci Resolve) gives you full manual control — timelines, keyframes, voice recording, stock footage search — but every data video starts from a blank project. Factloop removes the editing step: give it facts, get a finished video.',
    rows: [
      { feature: 'Voiceover',                us: 'AI-written & recorded', them: 'Record it yourself' },
      { feature: 'Visual asset',              us: 'AI-generated per video', them: 'Search/shoot footage' },
      { feature: 'Number animations',         us: 'Automatic count-up',    them: 'Manual keyframes' },
      { feature: 'Captions',                  us: 'Auto-burned, styled',   them: 'Manual timing' },
      { feature: 'Background music mixing',   us: 'Automatic ducking',    them: 'Manual audio mixing' },
      { feature: 'Skill required',            us: 'None',                 them: 'Editing software fluency' },
      { feature: 'Time for a 30-second video', us: '< 2 minutes',          them: '1-3+ hours' },
    ],
    why: [
      { title: 'No editing software to learn', desc: 'There\'s no timeline, no keyframes, no export settings to configure — a form with your facts is the entire interface.' },
      { title: 'No recording equipment needed', desc: 'The narration is written and voiced by AI — no microphone, no re-takes, no audio cleanup.' },
      { title: 'Consistent output every time', desc: 'Caption style, stat animation timing, and audio ducking all follow the same proven approach on every video, instead of being rebuilt by hand each time.' },
      { title: 'Minutes, not hours', desc: 'A 30-second data recap that takes an hour or more to cut by hand takes under two minutes end to end.' },
    ],
    faqs: [
      { q: 'Will this replace professional video editing entirely?', a: 'For fully custom, highly art-directed video, a human editor still has more control. For a fast, narrated data recap, Factloop\'s automatic pipeline is built to be the faster path.' },
      { q: 'Can I still customize the output?', a: 'Yes — gameplay background, narrator voice, caption style/color/position, and music are all selectable. The script, AI image, and stat animation are generated automatically.' },
      { q: 'Do I need any prior editing experience?', a: 'No — the entire interface is a form: a title, a list of facts, and a few style pickers.' },
      { q: 'What if I want to review the script before it renders?', a: 'Factloop is designed with no review gate — script, image, and narration all generate and render straight through. You review the finished video.' },
    ],
  },
}

export const factloopAlternativeSlugs = Object.keys(factloopAlternativesContent)
export default factloopAlternativesContent
