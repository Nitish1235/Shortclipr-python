// factloopToolsContent.js — SEO tool-landing content for Factloop.
//
// Smaller initial set (3 pages) per the Factloop pivot plan, rather than a
// 1:1 rewrite of every Brainrot tool page — these are genuinely about the
// data-driven-video concept, not filler copy.

const factloopToolsContent = {
  'data-video-maker': {
    slug: 'data-video-maker',
    badge: 'Data Videos',
    metaTitle: 'Data Video Maker — Turn Facts Into Narrated Videos | ShortClipr',
    metaDescription:
      'Turn any set of facts or stats into a narrated, data-driven video in minutes. AI writes the script, generates an image, and animates every number as it\'s said.',
    keywords:
      'data video maker, stats video generator, fact video maker, data driven video, automatic video from data',
    h1: 'Data Video Maker — Facts In, Finished Video Out',
    subhead:
      'Type a title and a handful of facts. Factloop writes the narration, generates a matching AI image, records the voiceover, and animates every number as it\'s spoken — all over a real gameplay background, fully automatic.',
    heroStat: { value: '<2min', label: 'from facts to finished video' },
    steps: [
      { n: '01', title: 'Add your facts', desc: 'Title, a short optional context line, and up to 8 facts — each with a label, value, and optional unit.' },
      { n: '02', title: 'Pick the look', desc: 'Choose a gameplay background, a narrator voice, caption style, and music — all with live previews.' },
      { n: '03', title: 'Hit Generate', desc: 'One click reserves a credit and runs script writing, AI image generation, narration, and rendering back to back. No review step to slow you down.' },
      { n: '04', title: 'Download your video', desc: '1080×1920 MP4 with an up-centric AI image, animated stat callouts, burned captions, and a ducked music bed — ready to post.' },
    ],
    features: [
      { icon: '📊', title: 'Automatic script from your facts', desc: 'The narrator writes a punchy data recap from whatever facts you give it — no writing required.' },
      { icon: '🎨', title: 'A matching AI image, every time', desc: 'Each video gets its own AI-generated image, anchored in the upper part of the frame so it never fights with captions or stat callouts.' },
      { icon: '📈', title: 'Numbers that count up on screen', desc: 'Every stat gets its own animated callout — different position, font, and color — with a numeric count-up timed to the narration.' },
      { icon: '⚡', title: 'No review gate', desc: 'Script, image, and voice all generate automatically. You review the finished video, not three intermediate drafts.' },
    ],
    faqs: [
      { q: 'What kind of facts work best?', a: 'Anything with real numbers — sports stats, sales recaps, research findings, survey results, quarterly metrics. One fact per on-screen callout, so 3-6 facts usually makes the tightest video.' },
      { q: 'Do I need to write the script myself?', a: 'No — the narrator writes a full voiceover from your title, facts, and optional context. There\'s no script review step; it goes straight into narration and rendering.' },
      { q: 'Can I control how the video looks?', a: 'Yes — pick the gameplay background, narrator voice, caption style/color/position, and background music. The AI image and stat callout styling are generated automatically per video.' },
      { q: 'How long does a video take to generate?', a: 'Typically under two minutes end to end: script + AI image generate concurrently, then narration, then render.' },
    ],
  },

  'stat-callout-generator': {
    slug: 'stat-callout-generator',
    badge: 'Animated Stats',
    metaTitle: 'Stat Callout Generator — Animated Numbers for Video | ShortClipr',
    metaDescription:
      'Generate animated, count-up stat callouts for short-form video automatically — different font, color, and position per number, timed to your narration.',
    keywords:
      'stat callout generator, animated stats video, number count up video, data callout maker, animated infographic video',
    h1: 'Stat Callout Generator — Numbers That Actually Move',
    subhead:
      'Every fact you add gets its own animated on-screen callout: a deterministic font, color, and position, plus a numeric count-up synced to the moment the narrator says it out loud.',
    heroStat: { value: '8', label: 'animated stat callouts per video' },
    steps: [
      { n: '01', title: 'List your stats', desc: 'Label, value, and optional unit for each number you want called out — up to 8 per video.' },
      { n: '02', title: 'Factloop times each one', desc: 'The narration script tags every line with which stat it\'s about, so the callout appears exactly when that number is spoken.' },
      { n: '03', title: 'Numbers count up on render', desc: 'Instead of popping in fully-formed, each stat counts up to its real value — built with the same technique used for karaoke-style captions.' },
      { n: '04', title: 'Get a varied, non-repetitive layout', desc: 'Font, color, and screen position are deterministically varied per stat and per video, so numbers never look stacked or identical.' },
    ],
    features: [
      { icon: '🔢', title: 'Real count-up animation', desc: 'Not a static number — each stat visibly counts up to its final value as the narrator reaches it.' },
      { icon: '🎨', title: 'Varied styling per stat', desc: 'Font, color, and position differ per callout, seeded per video so results are consistent on reruns but never monotonous.' },
      { icon: '🕒', title: 'Synced to real narration timing', desc: 'Callouts are timed off the actual generated voiceover audio, not a guessed duration.' },
      { icon: '🖼️', title: 'Sits below an up-centric AI image', desc: 'Stat callouts occupy a dedicated zone beneath the AI-generated image, so nothing overlaps.' },
    ],
    faqs: [
      { q: 'How many stats can one video have?', a: 'Up to 8 facts per video, each becoming one narrated line with its own animated callout.' },
      { q: 'Do the numbers really animate, or is that just a still graphic?', a: 'They actually count up — several short, staggered on-screen updates step the displayed value up to the real number as the narrator says it.' },
      { q: 'Can I set the exact color or font for a stat?', a: 'Styling is generated automatically per stat and per video for variety; caption text style/color (the narration captions, not the stat callouts) is user-selectable.' },
      { q: 'Does this work for non-numeric facts?', a: 'Yes — a fact\'s value is shown as-is if it isn\'t numeric, just without the count-up animation.' },
    ],
  },

  'ai-image-video-generator': {
    slug: 'ai-image-video-generator',
    badge: 'AI Images',
    metaTitle: 'AI Image Video Generator — One Image, One Video | ShortClipr',
    metaDescription:
      'Generate a unique AI image for every video, automatically placed in the upper frame with a subtle Ken Burns pan — no stock photos, no manual image search.',
    keywords:
      'ai image video generator, ai generated video background, automatic ai image per video, ai visual generator for video',
    h1: 'AI Image Video Generator — A Custom Visual, Every Time',
    subhead:
      'No stock photo search, no manual upload. Factloop generates a fresh AI image for every video based on your title and facts, places it in the upper part of the frame, and gives it a slow cinematic pan.',
    heroStat: { value: '1', label: 'unique AI image generated per video' },
    steps: [
      { n: '01', title: 'Describe your subject', desc: 'Your title, facts, and optional context are all the image generator needs — no separate prompt writing.' },
      { n: '02', title: 'Image generates alongside your script', desc: 'The AI image and the narration script generate at the same time, so neither one waits on the other.' },
      { n: '03', title: 'Placed up-centric, not dead center', desc: 'The image sits in the upper part of the frame — around 30% down — leaving room below for animated stat callouts and captions.' },
      { n: '04', title: 'Subtle motion on render', desc: 'A slow, continuous Ken Burns-style zoom keeps the frame from feeling static for the length of the video.' },
    ],
    features: [
      { icon: '🖼️', title: 'Generated per video, not reused', desc: 'Every video gets its own image built from its own subject matter — never a shared stock template.' },
      { icon: '📐', title: 'Deliberately upper-framed', desc: 'Anchored around 30% down the canvas so it never collides with stat callouts or captions lower on screen.' },
      { icon: '🎥', title: 'Slow cinematic pan', desc: 'A gentle continuous zoom gives the still image a sense of motion without distracting from the narration.' },
      { icon: '🚫', title: 'No text or watermarks', desc: 'Prompts are built to explicitly avoid in-image text and watermarks, since captions are burned in separately.' },
    ],
    faqs: [
      { q: 'Can I upload my own image instead?', a: 'Not in this version — every video\'s image is generated automatically from your title, facts, and context.' },
      { q: 'Why is the image near the top instead of centered?', a: 'Centering it would collide with the animated stat callouts and narration captions, which live in the lower two-thirds of the frame.' },
      { q: 'What happens if the image takes a while to generate?', a: 'It generates concurrently with the narration script, so its time is hidden behind script-writing time rather than adding to it.' },
      { q: 'Does the image move or is it a static frame?', a: 'It has a slow, continuous zoom/pan applied for the length of the video — not fully static, not fast enough to distract.' },
    ],
  },
}

export const factloopToolSlugs = Object.keys(factloopToolsContent)
export default factloopToolsContent
