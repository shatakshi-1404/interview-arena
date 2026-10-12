import { useEffect, useRef, useState } from 'react'

export const secondsLeft = (endAt: number, now: number = Date.now()) => Math.max(0, Math.ceil((endAt - now) / 1000))

/** Counts down to an absolute timestamp, so background throttling and sleep can't make it drift. */
export function useCountdown(endAt: number): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(endAt))
  useEffect(() => {
    setRemaining(secondsLeft(endAt))
    const id = window.setInterval(() => setRemaining(secondsLeft(endAt)), 500)
    return () => window.clearInterval(id)
  }, [endAt])
  return remaining
}

const NOTICE_AT = [600, 300, 60]

/** Calls `onNotice` once as the countdown crosses 10, 5 and 1 minute. Thresholds already passed at load stay silent. */
export function useTimeNotices(remaining: number, onNotice: (message: string) => void) {
  const announced = useRef(new Set<number>())
  const primed = useRef(false)
  const callback = useRef(onNotice)
  useEffect(() => {
    callback.current = onNotice
  })
  useEffect(() => {
    if (remaining <= 0) return
    const crossed = NOTICE_AT.filter((t) => remaining <= t)
    if (!primed.current) {
      primed.current = true
      crossed.forEach((t) => announced.current.add(t))
      return
    }
    if (!crossed.length) return
    const lowest = Math.min(...crossed)
    if (announced.current.has(lowest)) return
    crossed.forEach((t) => announced.current.add(t))
    callback.current(lowest === 60 ? 'One minute left' : `${lowest / 60} minutes left`)
  }, [remaining])
}
