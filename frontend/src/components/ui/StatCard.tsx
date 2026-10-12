import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card } from './Card'

export function StatCard({ label, value, hint, icon: Icon, accent = false }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  accent?: boolean
}) {
  return (
    <Card className={cn('p-5', accent && 'border-gold-300 bg-gold-50/60')}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', accent ? 'bg-gold-500 text-ink-900' : 'bg-ivory-200 text-ink-600')}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-500">{hint}</p>}
    </Card>
  )
}
