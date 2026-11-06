import {describe,expect,it} from 'vitest'
import {clipTypes,estimateCredits} from './catalog'

describe('ShortClipr clip catalogue',()=>{
  it('contains all approved clip types exactly once',()=>{
    expect(clipTypes).toHaveLength(16)
    expect(new Set(clipTypes.map(type=>type.name)).size).toBe(16)
  })

  it('uses render seconds as the transparent user entitlement',()=>{
    expect(estimateCredits('Space & scale journey',30,'Cinematic')).toBe(30)
    expect(estimateCredits('Animated explainer',15,'AI Auto')).toBe(15)
    expect(estimateCredits('Animated explainer',60,'AI Auto')).toBeGreaterThan(estimateCredits('Animated explainer',15,'AI Auto'))
  })
})
