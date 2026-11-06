import { describe, expect, it } from 'vitest'
import { freePlan, paidPlans } from './plans'

describe('ShortClipr plan entitlements', () => {
  it('keeps the requested free allowance', () => {
    expect(freePlan).toMatchObject({ id: 'free', price: 0, monthlySeconds: 15 })
  })

  it('keeps each Dodo plan price and render-time allowance exact', () => {
    expect(paidPlans.map(({ id, price, monthlySeconds }) => ({ id, price, monthlySeconds }))).toEqual([
      { id: 'starter', price: 15, monthlySeconds: 600 },
      { id: 'creator', price: 39, monthlySeconds: 1800 },
      { id: 'studio', price: 89, monthlySeconds: 4200 },
    ])
  })
})
