import { useCallback, useState } from 'react'

function read(key: string, initial: string): string {
  try {
    return sessionStorage.getItem(key) ?? initial
  } catch {
    return initial
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the draft lasts until the page closes */
  }
}

/** A text value persisted per key in sessionStorage. Switching `key` (e.g. language) swaps drafts. */
export function useDraft(key: string, initial: string) {
  const [state, setState] = useState(() => ({ key, value: read(key, initial) }))
  const value = state.key === key ? state.value : read(key, initial)
  const set = useCallback((v: string) => {
    setState({ key, value: v })
    write(key, v)
  }, [key])
  const reset = useCallback(() => {
    write(key, null)
    setState({ key, value: initial })
  }, [key, initial])
  return [value, set, reset] as const
}
