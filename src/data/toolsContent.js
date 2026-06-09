// Programmatic SEO content for /tools/* landing pages.
// Each entry targets a distinct, real search query (validated via SERP research,
// e.g. "youtube long video to short", "long video to shorts ai", "transcript to clips").
// Copy is unique per page — same template, different angle/voice — to avoid
// thin/duplicate-content penalties.

const toolsContent = {
  'youtube-long-video-to-short': {
    slug: 'youtube-long-video-to-short',
    badge: 'YouTube → Shorts',
    metaTitle: 'YouTube Long Video to Short — Free AI Converter | ShortClipr',
    metaDescription:
      'Turn any long YouTube video into short, viral-ready clips automatically. Paste a link, get 10+ scored vertical Shorts with captions in under 3 minutes. Free to start, no watermark.',
    keywords:
      'youtube long video to short, convert long youtube video to shorts, youtube video to short clips, long video to short converter, youtube shorts from long video',
    h1: 'Turn a Long YouTube Video Into Shorts — Automatically',
    subhead:
      'Paste any YouTube URL. ShortClipr’s AI watches the whole video, finds the moments people actually stop scrolling for, and exports them as ready-to-post vertical Shorts — captions, reframing, and a virality score included.',
    heroStat: { value: '< 3 min', label: 'to go from a 2-hour video to 10 clips' },
    steps: [
      { n: '01', title: 'Paste the YouTube link', desc: 'No upload, no download. We pull the video directly via the source — even 4-6 hour streams and podcasts.' },
      { n: '02', title: 'AI finds the short-worthy moments', desc: 'Our model reads the transcript, tone, and pacing to flag hooks, punchlines, and payoffs — not just "loud" timestamps.' },
      { n: '03', title: 'Get scored, captioned, reframed clips', desc: 'Each clip arrives in 9:16, with burned-in captions in your chosen style and a 0-100 virality score so you know what to post first.' },
    ],
    features: [
      { icon: '🔗', title: 'Link-in, clips-out', desc: 'No file uploads or storage limits — works straight from a YouTube URL, including long-form podcasts and livestream VODs up to 6 hours.' },
      { icon: '🎯', title: 'Topic & keyword targeting', desc: 'Tell the AI what to look for ("clips about pricing", "funny moments") instead of getting a random grab-bag of timestamps.' },
      { icon: '✍️', title: '11 caption styles, 28 languages', desc: 'Auto-generated, word-perfect captions that match your brand — burned in and ready to post on any platform.' },
      { icon: '📊', title: 'Virality scoring', desc: 'Every clip is ranked by hook strength, pacing, and payoff so you spend your posting time on the ones likeliest to land.' },
    ],
    faqs: [
      { q: 'Can I really convert a YouTube video to Shorts for free?', a: 'Yes — ShortClipr’s free plan converts your first 3 videos into Shorts with no watermark and no credit card required. Paid plans unlock longer videos and batch exports.' },
      { q: 'How long can the source video be?', a: 'ShortClipr handles videos up to 6 hours long — long enough for full podcasts, conference talks, and multi-hour streams, which most converters can’t process in one pass.' },
      { q: 'Will the Shorts have captions automatically?', a: 'Yes. Every clip is exported with burned-in captions generated from the video’s own audio — choose from 11 styles and 28 languages before you export.' },
      { q: 'Do I need to download the original video first?', a: 'No. Just paste the YouTube URL — ShortClipr fetches and processes the video on our end, so there’s nothing to download, store, or upload.' },
    ],
  },

  'long-video-to-shorts-ai': {
    slug: 'long-video-to-shorts-ai',
    badge: 'AI Repurposing',
    metaTitle: 'Long Video to Shorts AI — Auto-Generate Viral Clips | ShortClipr',
    metaDescription:
      'AI that converts long-form video into short-form clips automatically — finds the hooks, reframes to 9:16, adds captions, and scores each clip for virality. Try it free.',
    keywords:
      'long video to shorts ai, ai video to short converter, long form to short form ai, ai shorts generator, convert long video to short clips with ai',
    h1: 'The AI That Turns Long Videos Into Shorts For You',
    subhead:
      'You don’t need an editor — you need an AI that has actually watched the video. ShortClipr analyzes transcript, audio energy, and pacing to surface the segments worth clipping, then formats, captions, and ranks them automatically.',
    heroStat: { value: '10-15', label: 'scored clips from a single 2-3 hour video' },
    steps: [
      { n: '01', title: 'Drop in your long-form video', desc: 'YouTube link or direct upload — podcasts, webinars, interviews, lectures, streams.' },
      { n: '02', title: 'AI does the watching, reading, and ranking', desc: 'It reads the transcript for hooks and payoffs, listens for energy shifts, and shortlists the segments most likely to perform.' },
      { n: '03', title: 'Export ready-to-post vertical clips', desc: 'Each one comes pre-reframed to 9:16, captioned, and scored — pick the top 3 and post.' },
    ],
    features: [
      { icon: '🧠', title: 'Context-aware moment detection', desc: 'Goes beyond audio-spike detection — understands sarcasm, story arcs, and setup-payoff structure so it doesn’t clip the wrong half of a joke.' },
      { icon: '🖼️', title: 'Smart 9:16 reframing', desc: 'Automatically tracks faces and on-screen action so subjects stay centered when converting widescreen footage to vertical.' },
      { icon: '⚡', title: 'Minutes, not hours', desc: 'What takes a human editor 3-4 hours per long-form video, ShortClipr does in under 3 minutes — at 5x the speed of comparable AI tools.' },
      { icon: '🗂️', title: 'Batch export', desc: 'Download every generated clip as a single ZIP — something most AI shorts generators still don’t offer.' },
    ],
    faqs: [
      { q: 'How does the AI decide which parts to turn into Shorts?', a: 'It combines transcript analysis (hooks, questions, punchlines, strong claims), audio-energy detection, and pacing signals — then ranks every candidate segment with a virality score so you see *why* it was chosen.' },
      { q: 'Is this different from just auto-detecting loud moments?', a: 'Yes. Tools that only detect volume spikes miss quiet, high-impact moments (a surprising stat, a calm but emotional story). ShortClipr reads the actual transcript and context, not just the waveform.' },
      { q: 'Can I guide what the AI looks for?', a: 'Yes — use topic or keyword search to tell the AI exactly what kind of moment to prioritize, e.g. "clips where they talk about pricing" or "the funniest exchanges".' },
      { q: 'What formats do I get the clips in?', a: 'Every clip exports in 9:16 vertical with burned-in captions, ready to post directly to TikTok, Instagram Reels, and YouTube Shorts — or as a batch ZIP for scheduling tools.' },
    ],
  },

  'youtube-to-shorts-converter': {
    slug: 'youtube-to-shorts-converter',
    badge: 'Free Converter',
    metaTitle: 'YouTube to Shorts Converter (Free) — No Watermark | ShortClipr',
    metaDescription:
      'Free YouTube to Shorts converter with no watermark on the free plan. Paste a link, get AI-picked highlight clips reframed to 9:16 with captions — ready to post in minutes.',
    keywords:
      'youtube to shorts converter, youtube to shorts converter free, free youtube shorts maker, convert youtube video to shorts no watermark, youtube clip generator',
    h1: 'YouTube to Shorts Converter — Free, No Watermark',
    subhead:
      'Most "free" converters slap a logo on every export. ShortClipr’s free plan gives you 3 full videos’ worth of clean, watermark-free Shorts — so you can actually judge the output before paying for anything.',
    heroStat: { value: '0', label: 'watermarks on the free plan' },
    steps: [
      { n: '01', title: 'Paste your YouTube link', desc: 'Works with regular uploads, premieres, podcasts, and livestream replays.' },
      { n: '02', title: 'Pick your style', desc: 'Choose a caption style, layout template, and (optionally) a topic to focus on.' },
      { n: '03', title: 'Download or publish directly', desc: 'Export individually, as a ZIP, or push straight to TikTok / Reels / Shorts from the editor.' },
    ],
    features: [
      { icon: '🚫', title: 'No watermark, even on free', desc: 'Free-plan exports are fully clean — what you see is exactly what you can post, with no upsell hidden in the output.' },
      { icon: '💳', title: 'Per-video pricing', desc: 'Paid plans charge per video processed, not per minute of source — so a 2-hour documentary costs the same as a 10-minute clip.' },
      { icon: '🎨', title: '9 layout templates, 11 caption styles', desc: 'More formatting variety than Opus Clip, Klap, or Vidyo — so your clips don’t all look like they came from the same factory.' },
      { icon: '🌍', title: '28-language support', desc: 'Generate captions and translate clips for international audiences without leaving the tool.' },
    ],
    faqs: [
      { q: 'Is the YouTube to Shorts converter actually free?', a: 'Yes — your first 3 videos are processed free, with no watermark and no credit card required. After that, plans are billed per video rather than per minute.' },
      { q: 'Will my exported clips have a ShortClipr logo on them?', a: 'No. Unlike most "free" converters, ShortClipr does not place a watermark on free-plan exports — the clips are export-ready as-is.' },
      { q: 'Can I publish directly to TikTok, Reels, and Shorts?', a: 'Yes — once your clips are generated you can export them individually, download a batch ZIP, or publish directly from the built-in editor.' },
      { q: 'What video lengths does the converter support?', a: 'Up to 6 hours of source video — well beyond the 2-3 hour caps most competing converters impose.' },
    ],
  },

  'ai-clip-maker': {
    slug: 'ai-clip-maker',
    badge: 'AI Editor',
    metaTitle: 'AI Clip Maker — Auto-Generate & Edit Viral Clips | ShortClipr',
    metaDescription:
      'AI clip maker that finds, cuts, captions, and scores your best moments automatically — then lets you fine-tune in a built-in editor. From raw footage to posted clip in minutes.',
    keywords:
      'ai clip maker, ai video clip generator, automatic clip maker, ai clipping tool, viral clip maker ai',
    h1: 'The AI Clip Maker That Edits While You Watch',
    subhead:
      'Most "AI clip makers" hand you a folder of random cuts and call it done. ShortClipr scores every clip, explains why it was chosen, and drops you straight into an editor so you can adjust framing, captions, and pacing before you post.',
    heroStat: { value: '11', label: 'caption styles + 9 layout templates built in' },
    steps: [
      { n: '01', title: 'Feed it your raw footage', desc: 'YouTube link or direct upload — interviews, talks, gameplay, vlogs, webinars.' },
      { n: '02', title: 'AI cuts, scores, and explains', desc: 'Each candidate clip comes with a virality score and the reasoning behind the cut — hook strength, pacing, payoff.' },
      { n: '03', title: 'Fine-tune in the built-in editor', desc: 'Trim, re-caption, swap layout templates, or adjust the crop — all without leaving the browser.' },
    ],
    features: [
      { icon: '✂️', title: 'Cut + edit in one flow', desc: 'No exporting to a separate editor — review, adjust, and finalize clips in the same interface they were generated in.' },
      { icon: '🧮', title: 'Explainable scoring', desc: 'See *why* a clip was ranked the way it was, so you learn what makes your content clip-worthy over time.' },
      { icon: '🎛️', title: 'Granular style controls', desc: '11 caption styles and 9 layout templates vs. the 3-5 most competitors offer — your clips can actually look distinct from everyone else’s.' },
      { icon: '📦', title: 'Batch ZIP export', desc: 'Generate a full batch of clips and download them all at once — ideal for scheduling a week of posts in one sitting.' },
    ],
    faqs: [
      { q: 'How is this different from a basic auto-clipping tool?', a: 'Basic tools just slice at fixed intervals or volume spikes. ShortClipr’s AI clip maker reads context (transcript, structure, pacing), scores each candidate, and gives you an editor to refine the result — not just a dump of raw cuts.' },
      { q: 'Can I edit the clips after the AI generates them?', a: 'Yes — every generated clip opens directly in ShortClipr’s built-in editor, where you can trim, re-caption, change layout templates, and adjust framing.' },
      { q: 'Does it work with non-YouTube footage?', a: 'Yes — paste a YouTube link or upload your own video file directly. The AI clipping pipeline works the same either way.' },
      { q: 'How many clips does it generate per video?', a: 'Typically 10-15 scored candidates from a 1-3 hour video, ranked so you can prioritize the strongest ones first.' },
    ],
  },

  'youtube-transcript-to-clips': {
    slug: 'youtube-transcript-to-clips',
    badge: 'Transcript-Powered',
    metaTitle: 'YouTube Transcript to Clips — Turn Words Into Shorts | ShortClipr',
    metaDescription:
      'ShortClipr reads the full transcript of any YouTube video to find the strongest hooks, quotes, and stories — then turns those exact moments into captioned, ready-to-post Shorts.',
    keywords:
      'youtube transcript to clips, transcript analyzer youtube, turn transcript into video clips, youtube transcript clip finder, transcript based video editor',
    h1: 'From Transcript to Clip — Without the Manual Scrubbing',
    subhead:
      'Scrubbing through a 2-hour transcript hunting for the one good quote is the slowest part of repurposing. ShortClipr reads the entire transcript, flags the lines worth clipping, and jumps straight to cutting — so you go from "what did they say?" to a finished Short in one pass.',
    heroStat: { value: '1 pass', label: 'from full transcript to finished, captioned clip' },
    steps: [
      { n: '01', title: 'AI reads the full transcript', desc: 'Every word of the video is analyzed for hooks, strong claims, stories, and quotable lines — not just timestamps with high volume.' },
      { n: '02', title: 'Best lines become clip candidates', desc: 'The transcript moments that score highest for hook strength and clarity are matched back to their video timestamps automatically.' },
      { n: '03', title: 'Clips are cut, captioned, and ranked', desc: 'Each candidate is exported as a 9:16 clip with synced captions pulled straight from that transcript segment — word-accurate, no re-typing.' },
    ],
    features: [
      { icon: '📝', title: 'Full-transcript understanding', desc: 'Goes through the entire spoken content — not a sample — so a great line buried at minute 87 gets found just as reliably as one in the intro.' },
      { icon: '🔍', title: 'Search by topic or keyword', desc: 'Want clips where they mention a specific product, name, or theme? Tell the AI and it filters the transcript for exactly that.' },
      { icon: '🔤', title: 'Caption sync from source text', desc: 'Captions are generated directly from the transcript that produced the clip — so wording matches what was actually said, not a re-transcription.' },
      { icon: '🌐', title: '28-language transcript support', desc: 'Works across multilingual content — find and clip strong moments even in non-English source videos.' },
    ],
    faqs: [
      { q: 'Does ShortClipr actually read the transcript, or just detect loud moments?', a: 'It reads the full transcript — analyzing wording, structure, and context to find hooks, quotes, and stories, then matches those back to exact video timestamps. Volume-based detection alone misses quiet but powerful moments.' },
      { q: 'Can I search the transcript for a specific topic?', a: 'Yes — use topic or keyword search to have the AI prioritize transcript segments about a specific subject, person, or theme rather than scanning the whole video generically.' },
      { q: 'Will the captions match what was actually said?', a: 'Yes — captions are generated from the same transcript text used to identify the clip, so the on-screen wording matches the source audio precisely.' },
      { q: 'Does this work on videos in other languages?', a: 'Yes — transcript analysis and caption generation support 28 languages, so you can repurpose multilingual content the same way.' },
    ],
  },

  'podcast-to-shorts': {
    slug: 'podcast-to-shorts',
    badge: 'Podcast Repurposing',
    metaTitle: 'Podcast to Shorts AI — Auto-Clip Episodes for Social | ShortClipr',
    metaDescription:
      'Turn full podcast episodes into short-form clips automatically. ShortClipr finds the best stories, debates, and quotes in long episodes and exports them as captioned vertical Shorts.',
    keywords:
      'podcast to shorts, podcast clips ai, turn podcast into shorts, podcast video repurposing tool, ai podcast clipper',
    h1: 'Turn a 2-Hour Podcast Into a Week of Shorts',
    subhead:
      'You recorded the conversation — let the AI do the post-production grind. ShortClipr scans full episodes for the stories, hot takes, and quotable exchanges that travel well on social, then exports them as captioned, vertical, ready-to-schedule clips.',
    heroStat: { value: 'up to 6 hrs', label: 'of source audio/video supported per episode' },
    steps: [
      { n: '01', title: 'Drop in the episode', desc: 'YouTube link, video file, or recorded video-podcast — long-form interviews and roundtables included.' },
      { n: '02', title: 'AI finds the social-ready moments', desc: 'Debate exchanges, surprising admissions, punchy one-liners, and full mini-stories get flagged and scored.' },
      { n: '03', title: 'Export a week’s worth of clips at once', desc: 'Batch-download captioned, vertically-framed clips and schedule them across the week — no separate editing pass required.' },
    ],
    features: [
      { icon: '🎙️', title: 'Built for long conversations', desc: 'Handles up to 6 hours of source audio/video — long enough for marathon interview formats most tools choke on.' },
      { icon: '👥', title: 'Multi-speaker aware framing', desc: 'Smart 9:16 reframing follows whoever’s talking, so two- and three-person conversations stay watchable in vertical format.' },
      { icon: '🏷️', title: 'Topic-targeted clipping', desc: 'Pull every clip about a specific guest, story, or subject from a long episode using keyword/topic search.' },
      { icon: '📤', title: 'Batch export for scheduling', desc: 'Download a whole week’s worth of clips as one ZIP and load them straight into your scheduling tool of choice.' },
    ],
    faqs: [
      { q: 'How many clips can I get from one podcast episode?', a: 'Typically 10-15 scored clips from a 2-3 hour episode, covering the strongest individual moments — stories, debates, quotes, and punchlines — ranked by likely performance.' },
      { q: 'Does it handle multi-person conversations well?', a: 'Yes — the smart 9:16 reframing tracks who’s speaking so multi-guest conversations stay framed correctly when converted to vertical video.' },
      { q: 'Can I focus the AI on a specific guest or topic?', a: 'Yes — keyword and topic search let you tell the AI to prioritize segments about a particular guest, story, or subject rather than scanning generically.' },
      { q: 'What’s the maximum episode length supported?', a: 'Up to 6 hours of source video or audio-as-video — enough for the longest marathon interview formats.' },
    ],
  },
}

export default toolsContent
export const toolSlugs = Object.keys(toolsContent)
