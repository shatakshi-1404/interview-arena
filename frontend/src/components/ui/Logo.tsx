import { cn } from '@/lib/cn'

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#E3A908" />
        <path d="M9 21.5l5-6 3.5 3.5L23 11" stroke="#1F1D1A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M18.5 11H23v4.5" stroke="#1F1D1A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {showText && <span className="text-[17px] font-semibold tracking-tight text-ink-900">InterviewArena</span>}
    </span>
  )
}
