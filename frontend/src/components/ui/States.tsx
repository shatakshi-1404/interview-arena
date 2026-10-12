import type { ReactNode } from 'react'
import { AlertCircle, type LucideIcon } from 'lucide-react'
import { Button } from './Button'
import { Skeleton } from './Skeleton'

export function ErrorState({ error, onRetry, title = "We couldn't load this" }: {
  error: Error
  onRetry?: () => void
  title?: string
}) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-danger">
        <AlertCircle className="h-4 w-4" aria-hidden /> {title}
      </p>
      <p className="mt-1 text-sm text-ink-700">{error.message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }: {
  icon: LucideIcon
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <Icon className="h-7 w-7 text-mustard-700" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-600">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function BlockSkeleton({ className = 'h-64' }: { className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className={`w-full ${className}`} />
    </div>
  )
}
