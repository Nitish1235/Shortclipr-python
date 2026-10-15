// Distinct, task-focused pages for long-video and transcript searches.
// These describe the current YouTube-link workflow and paid generation policy.
export const seoIntentContent = {
  'youtube-long-video-to-short': {
    slug: 'youtube-long-video-to-short',
    badge: 'Long YouTube videos',
    metaTitle: 'Turn a Long YouTube Video into Short Clips | ShortClipr',
    metaDescription: 'Make short clips from a long YouTube video. Learn how to choose complete moments, review 9:16 framing and captions, and generate after choosing a plan.',
    h1: 'Turn a long YouTube video into short clips',
    subhead: 'A long recording can contain several useful Shorts. Start with a YouTube link, choose moments that stand alone, and review the portrait frame and captions before publishing.',
    heroStat: { value: '9:16', label: 'vertical format to review for Shorts' },
    visual: 'workflow',
    steps: [
      { n: '01', title: 'Choose a video you can reuse', desc: 'Start with your own YouTube upload or one you have permission to repurpose. Clear speech and distinct topics make clip selection easier.' },
      { n: '02', title: 'Find complete moments', desc: 'Look for an answer, demonstration, or short story with its own opening and ending. Do not cut away a qualification that changes the meaning.' },
      { n: '03', title: 'Generate and review the Shorts', desc: 'Explore project and caption controls first. A paid plan is required to generate clips from your video; then check the cut, framing, and words before sharing.' },
    ],
    features: [
      { icon: '✂', title: 'Shortlist by idea', desc: 'A two-hour recording needs selection. Favor self-contained passages over a fixed number of clips.' },
      { icon: '◫', title: 'Check the narrow frame', desc: 'A wide interview or screen recording can lose a second speaker or important on-screen detail in 9:16.' },
      { icon: '≡', title: 'Proofread captions', desc: 'Names, figures, and specialist terms can be misheard. Compare the output with the original audio.' },
      { icon: '✓', title: 'Keep source context', desc: 'Watch a little before and after every cut so the finished Short represents the speaker fairly.' },
    ],
    editorial: {
      title: 'What changes when the source is long?',
      paragraphs: [
        'Length gives you more choices, but it does not guarantee more strong clips. A 45-minute tutorial may contain one excellent standalone explanation and several sections that only make sense together. Start by marking topic changes and questions; then judge each proposed cut on its own.',
        'For a video interview, try a cut that begins with the host’s question and ends after the guest’s answer. Play it once without the original nearby. If you cannot identify the topic or the conclusion, add context or reject the cut. This takes less time than publishing a misleading clip and correcting it later.',
      ],
      checklist: ['Can a new viewer understand the first line?', 'Does the ending complete the point?', 'Is the important action visible in portrait?', 'Are captions and reuse rights checked?'],
    },
    relatedTools: ['youtube-to-shorts-converter', 'long-video-to-shorts-ai', 'podcast-to-shorts'],
    relatedGuides: ['how-to-turn-long-videos-into-shorts', 'crop-horizontal-video-for-shorts'],
    faqs: [
      { q: 'Can I turn a long YouTube video into several Shorts?', a: 'Yes, when the source has several moments that make sense independently. Review every suggested cut rather than forcing a fixed clip count.' },
      { q: 'Do I need to download the YouTube video first?', a: 'The ShortClipr workflow starts with a YouTube link. Use a video you own or have permission to process.' },
      { q: 'Can I generate clips on an unpaid account?', a: 'You can explore the workflow and project controls. Choose a paid plan when you are ready to generate clips from your own video.' },
      { q: 'What if the vertical crop hides part of the video?', a: 'Review the full clip at phone size. Try another layout or choose a different moment if a face, slide, or demonstration is lost.' },
    ],
  },
  'long-video-to-shorts-ai': {
    slug: 'long-video-to-shorts-ai',
    badge: 'AI moment discovery',
    metaTitle: 'AI Long Video to Shorts Workflow | ShortClipr',
    metaDescription: 'See how AI can shortlist moments from a long YouTube video for Shorts, and what to check in the cut, vertical frame, and captions before publishing.',
    h1: 'Use AI to find Shorts in a long video',
    subhead: 'AI can narrow the search through a long recording. You still decide whether each selected moment is clear, accurate, and worth sharing.',
    heroStat: { value: '3 checks', label: 'context, portrait frame, and captions' },
    visual: 'workflow',
    steps: [
      { n: '01', title: 'Start with a YouTube source', desc: 'Paste a video you own or may reuse. Conversations, tutorials, and interviews with clear spoken ideas are practical starting points.' },
      { n: '02', title: 'Review candidate passages', desc: 'AI can identify passages with a question, claim, story, or answer. Read the surrounding context before choosing a cut.' },
      { n: '03', title: 'Check the finished portrait edit', desc: 'After choosing a paid plan to generate, inspect framing, caption accuracy, the opening, and the ending before you download or post.' },
    ],
    features: [
      { icon: '☷', title: 'Transcript-led selection', desc: 'Spoken ideas can reveal useful passages that a simple timestamp or volume peak would miss.' },
      { icon: '✂', title: 'Human editorial choice', desc: 'A candidate with an exciting opening can still be misleading if the conclusion is outside the cut.' },
      { icon: '◫', title: 'Portrait review', desc: 'Check whether the subject remains visible when a wide source becomes a narrow Short.' },
      { icon: '≡', title: 'Caption review', desc: 'Correct proper nouns, numbers, and jargon against the source audio.' },
    ],
    editorial: {
      title: 'What AI can help with—and what it cannot promise',
      paragraphs: [
        'AI is useful for reducing the time spent searching a long source. It can propose passages with a clear topic or apparent payoff. It cannot guarantee that a clip will perform well, preserve every nuance automatically, or know which visual details your audience needs.',
        'Suppose a speaker says, “That approach failed,” then spends twenty seconds explaining what worked instead. A cut ending on the first sentence might attract attention but misrepresent the lesson. Keep the explanation and judge whether the whole passage works as one Short.',
      ],
      checklist: ['Does the selected passage preserve the conclusion?', 'Can a new viewer follow it without the full video?', 'Does the 9:16 frame show what matters?', 'Have captions been checked?'],
    },
    relatedTools: ['youtube-to-shorts-converter', 'youtube-transcript-to-clips', 'ai-clip-maker'],
    relatedGuides: ['ai-video-clipping-explained', 'how-to-turn-long-videos-into-shorts'],
    faqs: [
      { q: 'Can AI guarantee that a clip will go viral?', a: 'No. AI can suggest moments to review, but audience response depends on the content, edit, and distribution.' },
      { q: 'How does ShortClipr start?', a: 'Start with a YouTube video you own or have permission to reuse. Explore the project controls, then choose a paid plan to generate from that source.' },
      { q: 'Should I post every suggested clip?', a: 'No. Keep only cuts that have a clear opening, complete point, accurate captions, and useful portrait framing.' },
    ],
  },
  'youtube-transcript-to-clips': {
    slug: 'youtube-transcript-to-clips',
    badge: 'Transcript to clips',
    metaTitle: 'Find YouTube Clips from a Video Transcript | ShortClipr',
    metaDescription: 'Use spoken topics and complete answers to identify YouTube clip candidates. Learn how to check timestamps, context, captions, and vertical framing.',
    h1: 'Find clip ideas in a YouTube video transcript',
    subhead: 'The transcript can point you to strong answers and stories. Match each passage back to the video, then keep the context and picture that make it understandable.',
    heroStat: { value: '1 idea', label: 'per clear, self-contained clip' },
    visual: 'workflow',
    steps: [
      { n: '01', title: 'Choose a spoken topic', desc: 'A question, surprising explanation, or complete story gives you a useful place to start in the transcript.' },
      { n: '02', title: 'Check the surrounding video', desc: 'The text alone cannot show a visual demonstration, speaker reaction, or caveat outside the proposed passage.' },
      { n: '03', title: 'Generate and verify captions', desc: 'Explore ShortClipr’s setup before choosing a paid plan. After generation, compare the captions and cut with the original audio and video.' },
    ],
    features: [
      { icon: '☷', title: 'Find specific ideas', desc: 'A transcript makes it easier to identify an answer, product explanation, or story within a longer recording.' },
      { icon: '✂', title: 'Select complete passages', desc: 'Include the question or setup when a striking quote would otherwise be unclear.' },
      { icon: '◫', title: 'Return to the picture', desc: 'The transcript cannot tell you whether the narrow frame hides a guest, slide, or product action.' },
      { icon: '≡', title: 'Verify the words', desc: 'Captions can be wrong about names, figures, or overlapping speakers; proofread them before posting.' },
    ],
    editorial: {
      title: 'A transcript is a map, not the finished edit',
      paragraphs: [
        'Searchable speech helps you find where an idea happens. The video determines whether it works as a short clip. A sentence may need the previous question, and a demonstration may be impossible to understand if the portrait crop loses the screen.',
        'For a tutorial, mark the question, the action that answers it, and the point where the demonstration finishes. Then watch that complete section at phone size. If the captions or crop hide the action, adjust the layout or choose another passage.',
      ],
      checklist: ['Is the spoken idea complete?', 'Are the start and end timestamps fair?', 'Does the visual demonstrate the point?', 'Do captions match the audio?'],
    },
    relatedTools: ['youtube-to-shorts-converter', 'long-video-to-shorts-ai', 'interview-to-clips'],
    relatedGuides: ['ai-video-clipping-explained', 'how-to-turn-long-videos-into-shorts'],
    faqs: [
      { q: 'Can a transcript alone tell me which clips to post?', a: 'No. Use it to find candidates, then watch the source video to check visual context, timing, and the full meaning.' },
      { q: 'Can I generate from a YouTube transcript without paying?', a: 'You can explore the YouTube-link workflow and project controls. A paid plan is required to generate clips from your source.' },
      { q: 'What should I check in the captions?', a: 'Compare names, numbers, technical terms, and overlapping speech with the source audio before publishing.' },
    ],
  },
}
