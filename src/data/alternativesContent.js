// Programmatic SEO content for /alternatives/* pages.
// High commercial-intent queries ("X alternative", "X vs Y") with comparatively
// low competition — these convert better than generic tool pages.
// Stat claims here mirror the Comparison.jsx data already shown on the homepage.

const alternativesContent = {
  'opus-clip': {
    slug: 'opus-clip',
    name: 'Opus Clip',
    badge: 'ShortClipr vs Opus Clip',
    metaTitle: 'Opus Clip Alternative — Faster, No Watermark | ShortClipr',
    metaDescription:
      'Looking for an Opus Clip alternative? ShortClipr processes videos 3-5x faster, has no watermark on the free plan, prices per video instead of per minute, and supports videos up to 6 hours.',
    keywords:
      'opus clip alternative, opusclip alternative, alternative to opus clip, opus pro alternative, tools like opus clip',
    h1: 'The Opus Clip Alternative That Doesn’t Punish Long Videos',
    intro:
      'Opus Clip popularized AI clipping — but its per-minute credit system, 3-hour video cap, and watermarked free plan push power users toward alternatives. ShortClipr was built specifically to fix those three friction points, while matching (and in several cases beating) Opus Clip on raw clip quality.',
    rows: [
      { feature: 'Processing speed',     us: '< 3 min',        them: '5–12 min' },
      { feature: 'Free plan watermark',  us: '❌ None',         them: '✓ Watermarked' },
      { feature: 'Pricing model',        us: 'Per video',       them: 'Per minute of source' },
      { feature: 'Max video length',     us: 'Up to 6 hours',   them: 'Under 3 hours' },
      { feature: 'Caption styles',       us: '11 styles',       them: '4 styles' },
      { feature: 'Layout templates',     us: '9 templates',     them: '3 templates' },
      { feature: 'Batch ZIP export',     us: '✅ Yes',          them: '❌ No' },
      { feature: 'Language support',     us: '28 languages',    them: '20 languages' },
    ],
    why: [
      { title: 'Per-video, not per-minute pricing', desc: 'A 2-hour documentary costs the same as a 10-minute tutorial on ShortClipr. Opus Clip’s per-minute credit system means long-form creators burn through their plan fastest — exactly the people who benefit most from clipping.' },
      { title: 'No watermark on the free plan', desc: 'Opus Clip’s free tier stamps every export. ShortClipr’s free plan gives you 3 fully clean videos so you can judge the actual output quality before paying anything.' },
      { title: 'Built for marathon content', desc: 'Opus Clip caps out under 3 hours. ShortClipr processes up to 6 — covering full conference days, multi-hour podcasts, and livestream VODs that Opus Clip simply can’t ingest in one pass.' },
      { title: 'More creative range per clip', desc: '11 caption styles and 9 layout templates vs. Opus Clip’s 4 and 3 — your output has room to look distinct rather than templated.' },
    ],
    faqs: [
      { q: 'Is ShortClipr actually faster than Opus Clip?', a: 'Yes — ShortClipr typically processes a video in under 3 minutes regardless of length, versus Opus Clip’s reported 5-12 minute range, because we never download the full source file before clipping.' },
      { q: 'Does ShortClipr have a free plan like Opus Clip?', a: 'Yes, and unlike Opus Clip’s free tier, ShortClipr’s free plan exports are watermark-free — you get 3 full videos processed with no logo and no credit card required.' },
      { q: 'Can ShortClipr handle videos Opus Clip can’t?', a: 'Yes — ShortClipr supports source videos up to 6 hours long, well beyond Opus Clip’s roughly 3-hour ceiling, making it a better fit for podcasts, streams, and conference recordings.' },
      { q: 'How does pricing compare?', a: 'Opus Clip bills by minutes of source video consumed. ShortClipr bills per video processed — so longer source material doesn’t cost proportionally more, which favors podcasters and long-form creators.' },
    ],
  },

  klap: {
    slug: 'klap',
    name: 'Klap',
    badge: 'ShortClipr vs Klap',
    metaTitle: 'Klap Alternative — More Styles, No Per-Minute Limits | ShortClipr',
    metaDescription:
      'Searching for a Klap alternative? ShortClipr offers more caption styles and layout templates, supports longer source videos, and exports clean batch ZIPs — with a genuinely free starting plan.',
    keywords:
      'klap alternative, klap.app alternative, alternative to klap, tools like klap, klap ai alternative',
    h1: 'A Klap Alternative With More Room to Customize',
    intro:
      'Klap is a solid general-purpose clipping tool, but its caption and template options are limited, and its free tier ships with watermarks. ShortClipr leans harder into customization — more caption styles, more layouts, longer video support, and batch exporting that Klap doesn’t offer.',
    rows: [
      { feature: 'Processing speed',     us: '< 3 min',        them: '6–15 min' },
      { feature: 'Free plan watermark',  us: '❌ None',         them: '✓ Watermarked' },
      { feature: 'Pricing model',        us: 'Per video',       them: 'Per minute of source' },
      { feature: 'Max video length',     us: 'Up to 6 hours',   them: 'Under 2 hours' },
      { feature: 'Caption styles',       us: '11 styles',       them: '3 styles' },
      { feature: 'Layout templates',     us: '9 templates',     them: '2 templates' },
      { feature: 'Batch ZIP export',     us: '✅ Yes',          them: '❌ No' },
      { feature: 'Language support',     us: '28 languages',    them: '10 languages' },
    ],
    why: [
      { title: 'Significantly more style variety', desc: '11 caption styles and 9 layout templates vs. Klap’s 3 and 2 — useful if you’re posting daily and don’t want every clip to look identical.' },
      { title: 'Longer video support', desc: 'ShortClipr handles up to 6 hours of source video; Klap caps out closer to 2 — a meaningful difference for podcasters and streamers.' },
      { title: 'Batch ZIP downloads', desc: 'Generate a full batch and download every clip in one ZIP — a workflow Klap doesn’t currently support, which matters if you’re scheduling a week of content at once.' },
      { title: 'Wider language coverage', desc: '28 supported languages vs. Klap’s 10, useful for creators repurposing multilingual or international source content.' },
    ],
    faqs: [
      { q: 'What does ShortClipr do better than Klap?', a: 'More caption styles (11 vs 3), more layout templates (9 vs 2), longer max video length (6 hours vs roughly 2), and batch ZIP export — which Klap doesn’t offer.' },
      { q: 'Is ShortClipr cheaper than Klap?', a: 'ShortClipr bills per video processed rather than per minute of source, which tends to favor creators working with longer-form content — Klap’s per-minute model can become costly for multi-hour videos.' },
      { q: 'Does ShortClipr have a built-in editor like Klap?', a: 'Yes — generated clips open directly in ShortClipr’s editor where you can adjust captions, layout, and framing before export.' },
      { q: 'Can I try ShortClipr for free before switching from Klap?', a: 'Yes — the free plan processes 3 full videos with no watermark and no credit card, so you can compare clip quality directly against your existing Klap output.' },
    ],
  },

  vmaker: {
    slug: 'vmaker',
    name: 'Vmaker AI',
    badge: 'ShortClipr vs Vmaker',
    metaTitle: 'Vmaker AI Alternative — Faster AI Clipping | ShortClipr',
    metaDescription:
      'Comparing Vmaker AI alternatives? ShortClipr offers faster processing, topic-targeted clip search, virality scoring, and per-video pricing — with a clean, watermark-free free plan.',
    keywords:
      'vmaker alternative, vmaker ai alternative, alternative to vmaker, tools like vmaker, vmaker vs shortclipr',
    h1: 'A Vmaker AI Alternative Built for Speed and Targeting',
    intro:
      'Vmaker is a capable general video tool, but its AI clipping leans on generic highlight detection rather than understanding what your audience actually wants to see. ShortClipr adds topic-targeted clip search, explainable virality scoring, and a faster end-to-end pipeline.',
    rows: [
      { feature: 'Processing speed',         us: '< 3 min',     them: '6–10 min*' },
      { feature: 'Free plan watermark',      us: '❌ None',      them: '✓ Watermarked' },
      { feature: 'Topic / keyword targeting',us: '✅ Yes',       them: '❌ Generic detection' },
      { feature: 'Virality scoring',         us: '✅ 0–100 score', them: '❌ No' },
      { feature: 'Pricing model',            us: 'Per video',    them: 'Per minute of source' },
      { feature: 'Caption styles',           us: '11 styles',    them: '5 styles' },
      { feature: 'Batch ZIP export',         us: '✅ Yes',       them: '❌ No' },
    ],
    why: [
      { title: 'You can tell the AI what to look for', desc: 'Vmaker’s highlight detection is largely generic. ShortClipr lets you steer it — "find clips about pricing objections" or "the funniest exchanges" — instead of getting a one-size-fits-all set of cuts.' },
      { title: 'Every clip is scored and explained', desc: 'ShortClipr ranks clips by a 0-100 virality score based on hook strength, pacing, and payoff — so you know which ones to post first instead of guessing.' },
      { title: 'No per-minute penalty for long content', desc: 'Per-video pricing means a 3-hour podcast doesn’t cost dramatically more to process than a 10-minute clip — a real difference for long-form creators.' },
      { title: 'Cleaner free-tier output', desc: 'No watermark on free-plan exports, so you can actually evaluate clip quality before deciding to upgrade.' },
    ],
    faqs: [
      { q: 'Does ShortClipr work faster than Vmaker AI?', a: 'Generally yes — ShortClipr’s pipeline never downloads the full source video, which keeps processing under 3 minutes regardless of source length.' },
      { q: 'Can I tell ShortClipr which moments to prioritize?', a: 'Yes — topic and keyword search let you guide the AI toward specific subjects, guests, or themes, rather than relying on generic highlight detection.' },
      { q: 'Does Vmaker AI score clips for virality?', a: 'No — Vmaker focuses on highlight extraction without a ranking layer. ShortClipr scores every clip 0-100 so you can prioritize what to post first.' },
      { q: 'Is there a free way to compare the two?', a: 'Yes — ShortClipr’s free plan processes 3 full videos with no watermark, so you can directly compare clip selection and quality against Vmaker’s output.' },
    ],
  },
}

export default alternativesContent
export const alternativeSlugs = Object.keys(alternativesContent)

/* * Vmaker’s exact processing time isn’t independently published; figure shown
 * is an estimated range based on comparable general-purpose AI video tools and
 * should be reviewed/updated if Vmaker publishes official benchmarks. */
