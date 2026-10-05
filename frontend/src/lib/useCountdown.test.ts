import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { secondsLeft, useTimeNotices } from './useCountdown'

describe('secondsLeft', () => {
  it('rounds up and never goes negative', () => {
    expect(secondsLeft(10_000, 8_500)).toBe(2)
    expect(secondsLeft(10_000, 10_000)).toBe(0)
    expect(secondsLeft(10_000, 12_000)).toBe(0)
  })
})

describe('useTimeNotices', () => {
  const run = (initial: number) => {
    const cb = vi.fn()
    const hook = renderHook(({ r }) => useTimeNotices(r, cb), { initialProps: { r: initial } })
    return { cb, set: (r: number) => hook.rerender({ r }) }
  }

  it('announces 10 min, 5 min and 1 min once each', () => {
    const { cb, set } = run(900)
    set(601)
    expect(cb).not.toHaveBeenCalled()
    set(600)
    expect(cb).toHaveBeenLastCalledWith('10 minutes left')
    set(599)
    set(300)
    expect(cb).toHaveBeenLastCalledWith('5 minutes left')
    set(59)
    expect(cb).toHaveBeenLastCalledWith('One minute left')
    set(58)
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('stays silent about thresholds already passed when the page loads', () => {
    const { cb, set } = run(200)
    expect(cb).not.toHaveBeenCalled()
    set(59)
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith('One minute left')
  })
})
