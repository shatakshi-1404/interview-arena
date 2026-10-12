import { describe, expect, it } from 'vitest'
import { day } from '@/test/utils'
import { accuracyTone, activityLevel, buildCalendar } from './heat'

describe('accuracyTone', () => {
  it('does not judge a topic from fewer than 3 answers', () => {
    expect(accuracyTone(100, 1)).toBe('early')
    expect(accuracyTone(0, 2)).toBe('early')
  })
  it('classifies by accuracy once there is enough evidence', () => {
    expect(accuracyTone(75, 3)).toBe('strong')
    expect(accuracyTone(74.9, 3)).toBe('mid')
    expect(accuracyTone(50, 5)).toBe('mid')
    expect(accuracyTone(49.9, 5)).toBe('weak')
  })
  it('reports missing data', () => {
    expect(accuracyTone(null, 0)).toBe('none')
    expect(accuracyTone(80, 0)).toBe('none')
  })
})

describe('activityLevel', () => {
  it('buckets daily answers', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 40].map(activityLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('buildCalendar', () => {
  it('starts weeks on Monday', () => {
    expect(buildCalendar([day('2026-09-28')]).length).toBe(1) // a Monday: no padding
    const wed = buildCalendar([day('2026-09-30'), day('2026-10-01')]) // a Wednesday: two blank cells first
    expect(wed.slice(0, 2)).toEqual([null, null])
    expect(wed).toHaveLength(4)
  })
  it('handles an empty range', () => {
    expect(buildCalendar([])).toEqual([])
  })
})
