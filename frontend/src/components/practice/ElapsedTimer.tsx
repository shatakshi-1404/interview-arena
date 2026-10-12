import { Timer } from 'lucide-react'
import { cn } from '@/lib/cn'
import { clock } from '@/lib/format'

/** Not a live region on purpose: announcing every second would be noise for screen readers. */
export function ElapsedTimer({ seconds, limit }: { seconds: number; limit: number | null }) {
  const over = limit != null && seconds > limit
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm text-ink-800">
      <Timer className="h-4 w-4 text-ink-500" aria-hidden />
      <span aria-label={`Elapsed ${clock(seconds)}`}>{clock(seconds)}</span>
      {limit != null && (
        <span className={cn('text-ink-500', over && 'text-mustard-700')}>
          / suggested {clock(limit)}
        </span>
      )}
    </span>
  )
}
