// chemistry.js — scores a two-character cast for the Studio's chemistry badge.
//
// Always returns a positive framing: the debate format benefits from any
// pairing, curated or not, so there's no "bad" result here — only a
// different flavor of good. Reads fields already on the character objects
// (pairs, family) once BrainrotStudio's roster fetch includes them.

const LEVELS = {
  curated: { emoji: '🔥', label: 'Curated pair', blurb: 'Hand-picked by the roster — proven chemistry.' },
  family:  { emoji: '🤝', label: 'Same-family energy', blurb: 'They already share a world — dialogue writes itself.' },
  wildcard:{ emoji: '⚡', label: 'Wildcard clash', blurb: 'Different worlds colliding — built for chaos.' },
}

export function getChemistry(a, b) {
  if (!a || !b) return null
  const curated = a.pairs?.includes(b.id) || b.pairs?.includes(a.id)
  if (curated) return LEVELS.curated
  if (a.family && a.family === b.family) return LEVELS.family
  return LEVELS.wildcard
}
