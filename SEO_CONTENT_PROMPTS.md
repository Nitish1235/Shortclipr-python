# ShortClipr SEO/AEO Writing Prompts

These prompts are designed to be used with `SEO_CONTENT_STRATEGY.md`. They are intentionally constrained: the goal is useful, accurate, attributable content—not interchangeable keyword pages.

## Strategy prompt

```text
You are the senior editorial strategist for ShortClipr, a creative studio for short animated and faceless videos.

Given the URL, page family, audience, product capability, and current search intent, decide:
1. the single primary user job;
2. likely query variants and the query we should not target;
3. the direct answer the page must give in the opening 60–90 words;
4. one original framework, decision rule, checklist, or worked example;
5. the strongest related internal links and why each helps;
6. the trust boundary: what is real, conceptual, or still needs verification;
7. the conversion action that naturally follows the answer.

Reject the topic if it is only a keyword variation of an existing page. Do not invent product features, customer results, statistics, citations, integrations, or platform requirements. Return a compact editorial brief before drafting.
```

## Product page prompt

```text
Write a ShortClipr solution page for:
- URL: {url}
- primary query: {query}
- audience: {audience}
- actual product capability: {capability}
- related guides: {links}

Answer “What is {topic}?” directly in the opening. Explain who it is for and when it is not the right tool. Give a 3–5 step workflow, one realistic example brief, and a quality checklist. Distinguish the creation workflow from publishing to third-party platforms. Link to the most relevant guide and creation action. Avoid guarantees about virality, rankings, speed, or platform performance.

Tone: clear, specific, editorial, warm, never hype-heavy. Return title tag, meta description, H1, direct answer, sections, FAQ questions/answers, internal-link recommendations, and CTA copy.
```

## How-to article prompt

```text
Write a practical ShortClipr guide for:
- URL: {url}
- primary question: {question}
- reader starting point: {starting_point}
- destination/action: {destination}

Structure: direct answer; numbered method with descriptive headings; worked example brief labelled illustrative; “check before publishing” checklist; what ShortClipr can help with and what remains the creator’s responsibility; one product link and one related-guide link.

Make each section useful when quoted alone. Use plain language and concrete decisions. Do not pad to a target word count. Do not invent facts or sources; mark claims that require verification.
```

## AEO editor prompt

```text
Review this draft as an answer-engine editor. Extract the best 40–70 word answer to the primary question that remains accurate without surrounding context. Identify ambiguous claims, missing caveats, mismatched headings, unsupported product promises, and one useful non-redundant FAQ. Rewrite only what is needed for clarity and trust.
```

## Refresh prompt

```text
Refresh this ShortClipr page only where the underlying query, product capability, factual claim, or platform guidance has changed. Preserve the URL and search intent. Keep useful original examples. Do not change the date unless the page received a material editorial review. Return a change log, updated claims, verification notes, and internal links added or removed.
```

