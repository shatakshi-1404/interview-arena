export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

/** Mirrors the backend rule: 8 to 128 characters with at least one letter and one number. */
export function passwordIssue(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters'
  if (pw.length > 128) return 'Use at most 128 characters'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number'
  return null
}

/** Only same-site paths are valid redirect targets (blocks open redirects like //evil.com). */
export function safeRedirect(from: string | undefined | null, fallback = '/dashboard'): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || /^\/(login|register)/.test(from)) return fallback
  return from
}
