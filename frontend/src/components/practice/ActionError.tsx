import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

export function ActionError({ error, hint }: { error: Error | null; hint?: string }) {
  if (!error) return null
  const unavailable = error instanceof ApiError && error.status === 503
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        unavailable ? 'border-gold-300 bg-gold-50 text-ink-800' : 'border-danger/30 bg-danger-soft text-danger',
      )}
    >
      {error.message}
      {unavailable && hint ? ` ${hint}` : ''}
    </div>
  )
}
