export type PaidPlanId = 'starter' | 'creator' | 'studio'

export interface PlanDefinition {
  id: 'free' | PaidPlanId
  name: string
  price: number
  monthlySeconds: number
  featured?: boolean
  description: string
}

export const freePlan: PlanDefinition = {
  id: 'free',
  name: 'Free',
  price: 0,
  monthlySeconds: 15,
  description: 'One finished 15-second short each month.'
}

export const paidPlans: Array<PlanDefinition & { id: PaidPlanId }> = [
  { id: 'starter', name: 'Starter', price: 15, monthlySeconds: 600, description: '15s, 30s, 45s and 60s clips for a focused publishing rhythm.' },
  { id: 'creator', name: 'Creator', price: 39, monthlySeconds: 1800, featured: true, description: '15s, 30s, 45s and 60s clips for consistent publishing.' },
  { id: 'studio', name: 'Studio', price: 89, monthlySeconds: 4200, description: '15s, 30s, 45s and 60s clips for a high-volume content floor.' }
]

export const allPlans = [freePlan, ...paidPlans]

export function formatRenderTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}m ${remainder}s` : `${minutes} min`
}
