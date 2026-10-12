import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONES = {
  neutral: 'bg-ivory-200 text-ink-700',
  gold: 'bg-gold-100 text-ink-800',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
} as const

export function Badge({ tone = 'neutral', children, className }: {
  tone?: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>
}
