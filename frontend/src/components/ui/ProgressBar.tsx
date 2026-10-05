import { cn } from '@/lib/cn'

export function ProgressBar({ value, max = 100, label, className, barClassName }: {
  value: number
  max?: number
  label: string
  className?: string
  barClassName?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-ivory-200', className)}
    >
      <div className={cn('h-full rounded-full bg-gold-500 transition-[width] duration-300', barClassName)} style={{ width: `${pct}%` }} />
    </div>
  )
}
