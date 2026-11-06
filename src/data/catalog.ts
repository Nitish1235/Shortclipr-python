import type { Department } from '../types'

export interface ClipTypeDefinition {
  name: string
  description: string
  image: string
  symbol: string
  department: Department
  complexity: 'light' | 'medium' | 'heavy'
}

export const departmentCopy: Record<Department, { index: string; title: string; subtitle: string }> = {
  learn: { index: '01', title: 'Learn & explain', subtitle: 'Knowledge in motion' },
  story: { index: '02', title: 'Story & spectacle', subtitle: 'Worlds worth watching' },
  engage: { index: '03', title: 'Engage & transform', subtitle: 'Action, play and change' }
}

export const clipTypes: ClipTypeDefinition[] = [
  { name: 'Animated explainer', description: 'A clear idea, brought to life.', image: '/clip-types/animated-explainer.jpg', symbol: 'A→B', department: 'learn', complexity: 'light' },
  { name: 'Comparisons & visual facts', description: 'Make the difference visible.', image: '/clip-types/comparisons-visual-facts.jpg', symbol: 'VS', department: 'learn', complexity: 'light' },
  { name: 'Historical story', description: 'A past moment with momentum.', image: '/clip-types/historical-story.jpg', symbol: '19', department: 'learn', complexity: 'medium' },
  { name: 'Maps & geography', description: 'A journey drawn in motion.', image: '/clip-types/maps-geography.jpg', symbol: '↗', department: 'learn', complexity: 'medium' },
  { name: 'Space & scale journey', description: 'From tiny to impossible.', image: '/clip-types/space-scale-journey.jpg', symbol: '∞', department: 'learn', complexity: 'heavy' },
  { name: 'What-if simulation', description: 'Turn a question into a world.', image: '/clip-types/what-if-simulation.jpg', symbol: 'IF', department: 'learn', complexity: 'heavy' },
  { name: 'Myth-busting experiment', description: 'Test the claim on screen.', image: '/clip-types/myth-busting-experiment.jpg', symbol: '✓', department: 'learn', complexity: 'medium' },
  { name: 'News & event recap', description: 'Make the moment understandable.', image: '/clip-types/news-event-recap.jpg', symbol: 'NOW', department: 'learn', complexity: 'medium' },
  { name: 'Character comedy', description: 'Timing, contrast and a good turn.', image: '/clip-types/character-comedy.jpg', symbol: 'HA', department: 'story', complexity: 'medium' },
  { name: 'Mini story or fable', description: 'A complete world in a minute.', image: '/clip-types/mini-story-fable.jpg', symbol: 'ONCE', department: 'story', complexity: 'medium' },
  { name: 'Mystery & suspense', description: 'A clue worth following.', image: '/clip-types/mystery-suspense.jpg', symbol: '?', department: 'story', complexity: 'medium' },
  { name: 'Horror short', description: 'Tension hiding in plain sight.', image: '/clip-types/horror-short.jpg', symbol: '!', department: 'story', complexity: 'medium' },
  { name: 'Animated conversation', description: 'Two voices, one sharp idea.', image: '/clip-types/animated-conversation.jpg', symbol: '“ ”', department: 'story', complexity: 'medium' },
  { name: 'Quiz & visual puzzle', description: 'A question viewers need to solve.', image: '/clip-types/quiz-visual-puzzle.jpg', symbol: '? !', department: 'engage', complexity: 'light' },
  { name: 'Sports tactics', description: 'Make the play easy to see.', image: '/clip-types/sports-tactics.jpg', symbol: '↗', department: 'engage', complexity: 'heavy' },
  { name: 'Architecture transformation', description: 'Before becomes after.', image: '/clip-types/architecture-transformation.jpg', symbol: '▱', department: 'engage', complexity: 'heavy' }
]

export function estimateCredits(_typeName: string, durationSeconds: number, _style: string): number {
  return durationSeconds
}
