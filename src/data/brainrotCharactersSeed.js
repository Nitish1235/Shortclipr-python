// brainrotCharactersSeed.js — a real 20-character slice of the full 105-
// character roster (docs/brainrot/characters.json in the repo root), used
// as a fallback on the public /brainrot landing page.
//
// Why this exists: the full roster's canon.png assets live in
// docs/brainrot/assets/{id}/canon.png at ~4MB each — far too large to ship
// with the frontend, so the Studio's live roster is served from GCS via
// GET /brainrot/characters. But the marketing page shouldn't go blank (or
// silently show nothing) if that endpoint is slow, misconfigured, or the
// GCS migration (backend/scripts/migrate_characters_to_gcs.py) hasn't been
// run yet in a given environment — a first impression is exactly the wrong
// place for an empty state.
//
// These 20 images were downscaled to 320px-wide WebP (~15KB each, ~300KB
// total) specifically for this purpose — see public/brainrot/characters/.
// Picked one-or-two per family (all 11 families represented) for maximum
// visual variety in the Parade marquee, which is what sells "100+" even
// though only 20 are actually shipped here.
//
// BrainrotLanding.jsx uses this ONLY when the live API returns nothing —
// real API data always wins once it's available.

const BASE = '/brainrot/characters'

const brainrotCharactersSeed = [
  { id: 'dougie-blunt',        name: 'Dougie Blunt',           family: 'Household', archetype: 'Loud Dumb Dad',              gender: 'male',    role: 'Confidently wrong. Drives plots by misunderstanding them.',       tier: 1, pairs: ['kip-blunt', 'marla-blunt'] },
  { id: 'nibs',                name: 'Nibs',                   family: 'Gremlins',  archetype: 'Screaming Tiny Gremlin',     gender: 'neutral', role: 'Pure noise. Interrupts everything.',                               tier: 1, pairs: ['gnawl', 'bloop'] },
  { id: 'vex-corliss',         name: 'Dr. Vex Corliss',        family: 'Science',   archetype: 'Burnt-Out Mad Scientist',    gender: 'male',    role: 'Explains the impossible while emotionally checked out.',          tier: 1, pairs: ['bitsy-quark', 'norm-plimm'] },
  { id: 'brent-callahan',      name: 'Brent Callahan',         family: 'Corporate', archetype: 'Hustle-Culture CEO',         gender: 'male',    role: 'Reframes suffering as opportunity.',                               tier: 1, pairs: ['todd-synergy', 'grindset-gary'] },
  { id: 'krungar',             name: 'Krungar the Weary',      family: 'Fantasy',   archetype: 'Tired Barbarian',            gender: 'male',    role: 'Solves things with violence, reluctantly.',                        tier: 1, pairs: ['elowen-mistvale', 'borin-copperfist'] },
  { id: 'tito-ramirez',        name: 'Tito Ramirez',           family: 'Street',    archetype: 'Bodega Philosopher',         gender: 'male',    role: 'Gives the wisest advice in the video. To nobody in particular.',  tier: 1, pairs: ['big-marv', 'ms-yolanda'] },
  { id: 'sgt-waffles',         name: 'Sergeant Waffles',       family: 'Animals',   archetype: 'Pug Drill Sergeant',         gender: 'neutral', role: 'Screams orders nobody follows.',                                   tier: 1, pairs: ['miso', 'big-marv'] },
  { id: 'glorp',               name: 'GLORP',                  family: 'SciFi',     archetype: 'Overfriendly Alien',         gender: 'neutral', role: 'Misunderstands human customs, joyfully.',                          tier: 1, pairs: ['zorbo', 'bloop'] },
  { id: 'bartholomew-crumb',   name: 'Bartholomew Crumb',      family: 'Period',    archetype: 'Victorian Gentleman',        gender: 'male',    role: 'Reacts to anything modern with pure horror.',                      tier: 1, pairs: ['duke-pomp', 'agnes-grim'] },
  { id: 'lore-guy',            name: 'Lore Guy',               family: 'Internet',  archetype: 'Over-Explainer',             gender: 'male',    role: 'Turns a simple question into a 40-minute deep dive.',             tier: 1, pairs: ['uncle-sherm', 'prof-umbra'] },
  { id: 'boris-hoggard',       name: 'Boris Hoggard',          family: 'Hybrids',   archetype: 'Corrupt Union Boss',         gender: 'male',    role: 'Cuts every deal in his favor.',                                    tier: 2, pairs: ['big-marv'] },
  { id: 'marla-blunt',         name: 'Marla Blunt',            family: 'Household', archetype: 'Exhausted Mom',              gender: 'female',  role: 'Deadpan straight man. Lands the closing line.',                    tier: 1, pairs: ['dougie-blunt', 'nana-ratchet'] },
  { id: 'mop',                 name: 'Mop',                    family: 'Gremlins',  archetype: 'Obsessive Janitor',          gender: 'neutral', role: 'Wants only to clean. Becomes violent when stopped.',              tier: 3, pairs: ['doreen-sludge', 'nibs'] },
  { id: 'prof-umbra',          name: 'Professor Umbra',        family: 'Science',   archetype: 'Pompous Academic',           gender: 'male',    role: 'Correct but insufferable. Cites himself.',                         tier: 2, pairs: ['ada-vole', 'lore-guy'] },
  { id: 'deb-from-hr',         name: 'Deb from HR',            family: 'Corporate', archetype: 'Passive-Aggressive Enforcer',gender: 'female',  role: 'Threatens with kindness. Cites policy numbers.',                   tier: 1, pairs: ['marcy-mulch', 'intern-greg'] },
  { id: 'elowen-mistvale',     name: 'Elowen Mistvale',        family: 'Fantasy',   archetype: 'Haughty Elf',                gender: 'female',  role: 'Superior to everyone. Says so.',                                   tier: 1, pairs: ['krungar', 'seraphine-dawnhollow'] },
  { id: 'big-marv',            name: 'Big Marv',               family: 'Street',    archetype: 'Gentle Giant Bouncer',       gender: 'male',    role: 'Physically stops the chaos. Politely.',                            tier: 1, pairs: ['tito-ramirez', 'lugg'] },
  { id: 'miso',                name: 'Miso',                   family: 'Animals',   archetype: 'Contemptuous Cat',           gender: 'neutral', role: 'Judges silently, then destroys with one sentence.',               tier: 1, pairs: ['sgt-waffles', 'kip-blunt'] },
  { id: 'xanthar',             name: 'Xanthar the Conqueror',  family: 'SciFi',     archetype: 'Failing Invader',            gender: 'male',    role: 'Announces conquest. Is immediately inconvenienced.',              tier: 2, pairs: ['zathrix', 'glorp'] },
  { id: 'agnes-grim',          name: 'Sister Agnes Grim',      family: 'Period',    archetype: 'Stern Nun',                  gender: 'female',  role: 'Disapproves of everything. Terrifyingly calm.',                    tier: 2, pairs: ['brother-cassian', 'deb-from-hr'] },
].map(c => ({ ...c, image_url: `${BASE}/${c.id}.webp` }))

export default brainrotCharactersSeed
