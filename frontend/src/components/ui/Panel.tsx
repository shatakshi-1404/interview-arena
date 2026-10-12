import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card } from './Card'

export function Panel({ id, title, description, action, children, className }: {
  id?: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card id={id} className={cn('scroll-mt-20 p-5 sm:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  )
}
