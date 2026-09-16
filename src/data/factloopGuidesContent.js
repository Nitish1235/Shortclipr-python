// factloopGuidesContent.js — long-form guide content for Factloop.
//
// Smaller initial set (4 guides) per the pivot plan, genuinely about the
// data-driven-video concept rather than a mass port of Brainrot's 10 guides.
// `formula.items` are icon-only (no `type: 'char'` items — Factloop has no
// character roster).

const factloopGuidesContent = {
  'how-to-make-data-videos': {
    slug: 'how-to-make-data-videos',
    category: 'Getting Started',
    badge: 'Complete Guide',
    readTime: '7 min read',
    updated: 'Updated 2026',
    metaTitle: 'How to Make Data Videos (2026 Guide) — Facts, Narration, Stats | ShortClipr',
    metaDescription:
      'Step-by-step guide to turning any set of facts into a narrated, animated video — writing facts well, picking a background, and what makes stat callouts land.',
    keywords:
      'how to make data videos, data video tutorial, turn stats into video, fact video guide, automatic video from data',
    h1: 'How to Make Data Videos: The Complete 2026 Guide',
    subhead:
      'The format is simple: a title, a handful of facts, and a background — everything else is automatic. This guide walks through picking facts that land, choosing a look, and what happens after you hit Generate.',
    intro:
      'Data-driven recap videos are one of the fastest-growing short-form formats — a confident narrator walking through real numbers, with each stat popping onto the screen as it\'s mentioned, over motion that keeps the eye engaged. The format works because it turns something usually dry (a stat sheet, a quarterly summary, a research finding) into something watchable in under thirty seconds. Making one used to mean a spreadsheet, a design tool, and a video editor. Now it takes a form and about two minutes.',
    formula: {
      alt: 'A title plus a list of facts plus a gameplay background equals a narrated data video',
      items: [
        { type: 'icon', icon: '📝', label: 'Title + facts' },
        { type: 'icon', icon: '🎮', label: 'Gameplay background' },
        { type: 'icon', icon: '🖼️', label: 'AI-generated image' },
      ],
      result: { icon: '📊', label: 'Narrated data video' },
    },
    sections: [
      {
        h2: 'What makes a data video work',
        body: [
          'The format has four layers working together. The gameplay footage provides continuous, satisfying motion that keeps viewers watching even before the narration starts. The AI-generated image, anchored in the upper part of the frame, gives the subject a face without needing a photographer or stock search. The animated stat callouts turn abstract numbers into something that visibly happens on screen — a count-up, not a static label. The narration ties it all together, explaining what the numbers mean in plain language.',
          'The best data videos pick facts that tell a small story: a beginning number, a middle number, and a standout final number. Random unrelated stats feel like a list being read aloud; a sequence that builds toward a point feels like an actual recap.',
        ],
        list: [
          'Gameplay footage keeps eyes on screen during the intro before the first stat lands.',
          'An up-centric AI image gives the subject a visual identity without a photo shoot.',
          'Animated, counting stat callouts make numbers feel like events, not labels.',
          'A confident narration voice ties the numbers into a story, not a list.',
          'A short, sequenced set of facts (3-6) reads as a recap; a long unsorted list reads as a spreadsheet.',
        ],
      },
      {
        h2: 'Choosing facts that actually land',
        body: [
          'Not every number is worth a callout. The best facts have a clear label ("Runs", "Matches", "Revenue") and a value that means something on its own — a big number, a surprising ratio, or a milestone. Vague or overly technical labels ("Q3 YoY delta") force the narrator into awkward phrasing and don\'t read well as an on-screen chip.',
          'Order matters too. Leading with your most impressive number can undercut the ones that follow — a light build-up, then a strong final stat, usually lands better than front-loading the biggest number.',
        ],
      },
      {
        h2: 'Picking a background and voice',
        body: [
          'The gameplay background is chosen independently of your facts — it\'s there for motion and watch-time, not literal relevance. Pick whatever category matches the energy you want; a fast-paced background suits a punchy recap, a calmer one suits a more measured narration.',
          'The narrator voice is a single, consistent voice for the whole video — there\'s no dialogue or back-and-forth to cast for. Preview a few before generating; the right tone (energetic vs. measured) changes how the numbers land more than people expect.',
        ],
      },
    ],
    howTo: {
      title: 'Make your first data video',
      steps: [
        { title: 'Write your title and optional context', desc: 'One clear sentence for the subject, plus an optional line of framing for the narrator.' },
        { title: 'Add 3-6 facts', desc: 'Label, value, and optional unit for each — ordered so the strongest number lands near the end.' },
        { title: 'Pick a background, voice, captions, and music', desc: 'All previewable before you spend a credit.' },
        { title: 'Hit Generate', desc: 'One credit is reserved and the whole pipeline — script, image, narration, render — runs automatically, no review step.' },
      ],
    },
    takeaways: [
      'Pick 3-6 facts that build toward a point, not a random list of numbers.',
      'The AI image and gameplay background exist for visual interest — the facts carry the story.',
      'Order your strongest stat near the end, not first.',
      'There\'s no script review step — the whole pipeline runs straight through once you hit Generate.',
    ],
    faqs: [
      { q: 'How many facts should one video have?', a: 'Most videos work best with 3-6 facts — enough to build a small story without feeling like a read-aloud spreadsheet. Up to 8 are supported per video.' },
      { q: 'Do I need to write the narration myself?', a: 'No — the narrator writes a full script from your title, facts, and optional context automatically, with no review step before it renders.' },
      { q: 'Can I edit the script before it renders?', a: 'Not in this version — Factloop is designed to go straight from facts to finished video with no manual review gate.' },
      { q: 'What if a fact isn\'t a number?', a: 'Non-numeric values are shown as-is in their callout, just without the count-up animation.' },
    ],
    related: ['data-video-maker', 'stat-callout-generator'],
    relatedAlt: ['canva'],
  },

  'best-facts-for-data-recaps': {
    slug: 'best-facts-for-data-recaps',
    category: 'Strategy',
    badge: 'Strategy Guide',
    readTime: '6 min read',
    updated: 'Updated 2026',
    metaTitle: 'Best Facts for Data Recap Videos (2026) — What Actually Performs | ShortClipr',
    metaDescription:
      'Which facts make the best short-form data recap videos? A practical guide to picking, ordering, and phrasing stats that hold attention.',
    keywords:
      'best data video topics, data recap video ideas, stat video examples, what facts work for short video, data storytelling tips',
    h1: 'The Best Facts for Data Recap Videos',
    subhead:
      'Not every number makes a good on-screen callout. Here\'s what actually holds attention in a 20-40 second recap, and how to order facts so the video builds rather than lists.',
    intro:
      'A data recap lives or dies on its facts, not its visuals. The AI image and gameplay background do real work, but they can\'t rescue a video built on flat, context-free numbers. The good news: picking strong facts is a skill that transfers from good headline-writing, not a data-science problem.',
    formula: {
      alt: 'A milestone number plus a comparison plus a surprising ratio equals a data recap that holds attention',
      items: [
        { type: 'icon', icon: '🏆', label: 'A milestone number' },
        { type: 'icon', icon: '⚖️', label: 'A comparison' },
        { type: 'icon', icon: '❗', label: 'A surprising ratio' },
      ],
      result: { icon: '📈', label: 'A recap that holds attention' },
    },
    sections: [
      {
        h2: 'The three fact types that hold attention',
        body: [
          'Milestone numbers ("1,240 runs", "10 million downloads") work because they\'re inherently impressive and don\'t need explanation. Comparisons ("up 40% from last quarter") work because they give the viewer context to judge whether a number is good or bad on its own. Surprising ratios ("1 in 3 users") work because they reframe a big population into something a viewer can picture.',
          'A video built entirely from one type gets monotonous — three milestone numbers in a row all sound the same. Mixing types (one milestone, one comparison, one ratio) is what makes a 30-second recap feel like it\'s actually building toward something.',
        ],
        list: [
          'Milestone numbers land best as an opener or closer, not buried in the middle.',
          'Comparisons need a clear "compared to what" — "up 40%" alone is weaker than "up 40% from last quarter."',
          'Ratios work best when the denominator is a familiar unit (users, matches, days) not an abstract one.',
          'Avoid stacking three numbers of the same type back to back — vary the shape of the fact, not just the value.',
        ],
      },
      {
        h2: 'Phrasing labels so the narrator sounds natural',
        body: [
          'A fact\'s label becomes both the on-screen chip text and part of what the narrator reads aloud, so it needs to work in both places. Short, plain-language labels ("Runs", "Matches", "Signups") read cleanly as a chip and narrate naturally. Long or jargon-heavy labels ("Q3 Cumulative Engagement Delta") look cramped as a chip and force awkward phrasing in narration.',
          'When in doubt, say the label out loud the way you\'d want the narrator to say it — if it sounds unnatural spoken, it\'ll sound unnatural narrated.',
        ],
      },
    ],
    takeaways: [
      'Mix milestone numbers, comparisons, and ratios instead of repeating one fact type.',
      'Give every comparison a clear "compared to what."',
      'Keep labels short and speakable — they\'re narrated aloud, not just displayed.',
      'Save your single strongest fact for last, not first.',
    ],
    faqs: [
      { q: 'Should I always end on the biggest number?', a: 'Usually, yes — ending on your strongest stat gives the video a sense of build rather than front-loading the payoff.' },
      { q: 'How specific should a comparison be?', a: 'As specific as you have — "up from 800 to 1,240" narrates more concretely than "up significantly," and reads better as a callout too.' },
      { q: 'Can facts include non-numeric values?', a: 'Yes — a fact\'s value is shown as-is if it isn\'t numeric, though it won\'t get the count-up animation numeric values get.' },
      { q: 'Is there a minimum or maximum number of facts?', a: 'At least 1 fact is required; up to 8 are supported per video. 3-6 tends to work best for a 20-40 second recap.' },
    ],
    related: ['data-video-maker', 'ai-image-video-generator'],
    relatedAlt: ['manual-video-editing'],
  },

  'factloop-voice-guide': {
    slug: 'factloop-voice-guide',
    category: 'Production',
    badge: 'Production Guide',
    readTime: '5 min read',
    updated: 'Updated 2026',
    metaTitle: 'Choosing a Narrator Voice for Data Videos | ShortClipr Factloop',
    metaDescription:
      'How to pick a narrator voice that matches your data video\'s tone — energetic vs measured, and why the same facts can land differently with a different voice.',
    keywords:
      'ai narrator voice guide, data video voiceover tips, tts voice for stats video, best voice for data recap',
    h1: 'Choosing a Narrator Voice for Your Data Video',
    subhead:
      'A single consistent narrator carries the whole video — there\'s no dialogue to cast, just one voice to get right. Here\'s how tone changes how the same facts land.',
    intro:
      'Unlike a two-character debate format, a Factloop video has exactly one voice for its entire runtime. That makes the voice choice higher-leverage than it might seem: the same set of facts narrated energetically feels like a highlight reel, while the same facts narrated in a measured tone feels like a briefing. Neither is wrong — but they suit different subjects.',
    sections: [
      {
        h2: 'Energetic vs measured — which fits your facts',
        body: [
          'An energetic voice suits recaps built around milestone numbers and momentum — sports highlights, growth metrics, "we hit X" announcements. It leans into the count-up animation, making each stat feel like a small reveal.',
          'A measured voice suits recaps built around research findings, comparisons, or numbers that need to be taken seriously rather than celebrated — survey results, cost breakdowns, year-over-year analysis. It reads as more credible for subjects where "exciting" would feel like the wrong tone.',
        ],
      },
      {
        h2: 'Previewing before you spend a credit',
        body: [
          'Every voice in the picker has a preview sample, so there\'s no need to guess — play a few against your actual title and facts in mind before generating. Since the whole pipeline runs automatically once you hit Generate, this is the one point in the flow worth pausing on.',
        ],
      },
    ],
    takeaways: [
      'One voice narrates the entire video — there\'s no per-line voice switching.',
      'Energetic voices suit momentum-driven recaps (sports, growth, milestones).',
      'Measured voices suit research, comparisons, and numbers meant to be taken seriously.',
      'Preview a voice before generating — it\'s the one creative decision worth pausing on.',
    ],
    faqs: [
      { q: 'Can different facts in the same video use different voices?', a: 'No — one narrator voice covers the entire video, spoken across the hook, every stat, and the outro.' },
      { q: 'How do I preview a voice before committing?', a: 'The voice picker in the Look stage has a play button next to each voice with a short sample.' },
      { q: 'Does voice choice affect the stat callout timing?', a: 'Yes indirectly — callouts are timed to the real generated narration audio, so a slower or faster-paced voice shifts exactly when each stat appears.' },
      { q: 'Is there a default voice if I don\'t pick one?', a: 'Yes — a voice is auto-assigned if none is selected, so generation never blocks on this choice.' },
    ],
    related: ['data-video-maker', 'stat-callout-generator'],
    relatedAlt: [],
  },

  'data-video-vs-traditional-shorts': {
    slug: 'data-video-vs-traditional-shorts',
    category: 'Format',
    badge: 'Format Guide',
    readTime: '6 min read',
    updated: 'Updated 2026',
    metaTitle: 'Data Videos vs Traditional Short-Form Content | ShortClipr Factloop',
    metaDescription:
      'When does a data-driven recap video outperform a traditional talking-head or edited short? A practical comparison of the two formats.',
    keywords:
      'data video vs shorts, data driven content format, when to use a stats video, short form content formats compared',
    h1: 'Data Videos vs Traditional Short-Form Content',
    subhead:
      'A data recap isn\'t a replacement for every kind of short-form video — it\'s a specific tool for a specific job. Here\'s when it outperforms a talking-head or manually edited short, and when it doesn\'t.',
    intro:
      'Short-form video comes in a few dominant shapes: talking-head commentary, manually edited highlight reels, and increasingly, automatic data-driven recaps. Each has a job it\'s genuinely better at — picking the right one for a given piece of content matters more than which tool made it.',
    sections: [
      {
        h2: 'Where data videos win',
        body: [
          'Any content whose core value is a set of numbers — a quarterly recap, a season\'s stats, survey results, research findings — is the clearest fit. The format turns numbers that would otherwise sit in a spreadsheet or slide deck into something watchable, and it does so without needing a presenter on camera or a manual edit.',
          'It also wins on speed: a recap that would take an editor an hour to cut by hand — writing a script, recording narration, animating numbers, syncing music — takes about two minutes end to end, because none of those steps require a human in the loop.',
        ],
        list: [
          'Best fit: quarterly/season recaps, research findings, survey results, growth metrics.',
          'Strong advantage: no on-camera presenter needed — the narration and visuals carry the whole video.',
          'Strong advantage: consistent output quality regardless of who\'s making it.',
          'Weaker fit: content whose value is personality, opinion, or reaction rather than data.',
        ],
      },
      {
        h2: 'Where it doesn\'t replace a human edit',
        body: [
          'Content built on personality, humor, or reaction — commentary, storytelling, comedic takes — doesn\'t translate to a facts-and-narration format. There\'s no character casting or dialogue in Factloop by design; a subject that needs a persona or a debate is a different tool entirely.',
          'Highly custom, art-directed video (brand campaigns, heavily stylized edits) also benefits from a human editor\'s judgment in ways a fully automatic pipeline doesn\'t replace.',
        ],
      },
    ],
    takeaways: [
      'Data videos are the right tool when the content\'s value is genuinely in the numbers.',
      'They win on speed and consistency for recap-style content specifically.',
      'Personality-driven or reaction-based content isn\'t a fit for a facts-in, video-out format.',
      'Highly art-directed, brand-specific video still benefits from a human editor.',
    ],
    faqs: [
      { q: 'Can I use Factloop for non-numeric storytelling?', a: 'Facts work best when they\'re genuinely numeric or milestone-based — a purely narrative or opinion piece isn\'t what the format is built for.' },
      { q: 'Is a data video always shorter than a talking-head video?', a: 'Not necessarily by design, but in practice most data recaps run 20-40 seconds since that\'s enough time for 3-6 well-paced facts.' },
      { q: 'Does Factloop support any characters or personas?', a: 'No — the pivot to Factloop deliberately removed the character system. It\'s a single-narrator, facts-driven format.' },
      { q: 'Can I mix a data video with other short-form content in the same channel?', a: 'Yes — many creators use data recaps for periodic stats/updates alongside other content formats.' },
    ],
    related: ['data-video-maker', 'ai-image-video-generator'],
    relatedAlt: ['manual-video-editing', 'canva'],
  },
}

export const factloopGuideSlugs = Object.keys(factloopGuidesContent)
export default factloopGuidesContent
