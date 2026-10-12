import { useCallback, useEffect, useRef, useState } from 'react'

/** Wall-clock based (survives throttled background tabs). `elapsed` ticks each second for display;
 *  `read()` is exact. `stop()` freezes it; `resume()` continues after a failed submit. */
export function useStopwatch() {
  const startRef = useRef(Date.now())
  const stoppedAt = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const read = useCallback(() => stoppedAt.current ?? Math.floor((Date.now() - startRef.current) / 1000), [])
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stoppedAt.current == null) setElapsed(read())
    }, 1000)
    return () => window.clearInterval(id)
  }, [read])

  const stop = useCallback(() => {
    const s = read()
    stoppedAt.current = s
    setElapsed(s)
    return s
  }, [read])
  const resume = useCallback(() => {
    const s = stoppedAt.current
    if (s != null) {
      startRef.current = Date.now() - s * 1000
      stoppedAt.current = null
    }
  }, [])
  const reset = useCallback(() => {
    startRef.current = Date.now()
    stoppedAt.current = null
    setElapsed(0)
  }, [])

  return { elapsed, read, stop, resume, reset }
}
