export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 10) / 10}%`)

/** 'YYYY-MM-DD' -> local Date (new Date('2026-10-01') would be parsed as UTC and can shift a day). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const dayLabel = (day: string) => parseDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

export function formatSeconds(s: number | null | undefined): string {
  if (s == null) return '—'
  const total = Math.round(s)
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`
}

/** 75 -> '1:15' */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

export const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
