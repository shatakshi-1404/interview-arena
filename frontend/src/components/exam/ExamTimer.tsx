import { Timer } from 'lucide-react'
import { cn } from '@/lib/cn'
import { timerPhase } from '@/lib/exam'
import { clock } from '@/lib/format'

/** Not a live region: announcing every second would be noise. Threshold warnings come through toasts. */
export function ExamTimer({ remaining }: { remaining: number }) {
  const phase = timerPhase(remaining)
  return (
    <div
      role="timer"
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold',
        phase === 'critical' && 'border-danger/40 bg-danger-soft text-danger',
        phase === 'warning' && 'border-gold-300 bg-gold-50 text-mustard-700',
        phase === 'normal' && 'border-line bg-white text-ink-900',
      )}
    >
      <Timer className="h-4 w-4" aria-hidden />
      <span>{clock(remaining)}</span>
      <span className="sr-only">remaining</span>
    </div>
  )
}
