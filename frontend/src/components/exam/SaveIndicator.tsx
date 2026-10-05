import { AlertCircle, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import type { SaveStatus } from '@/lib/answerSaver'
import { cn } from '@/lib/cn'

const TEXT: Record<SaveStatus, string> = {
  idle: 'Answers save automatically',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: "Couldn't save. We'll keep trying.",
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <p
      role={status === 'error' ? 'alert' : undefined}
      className={cn('flex items-center gap-1.5 text-xs', status === 'error' ? 'text-danger' : 'text-ink-500')}
    >
      {status === 'saving' && <Spinner className="h-3 w-3" />}
      {status === 'saved' && <Check className="h-3 w-3 text-success" aria-hidden />}
      {status === 'error' && <AlertCircle className="h-3 w-3" aria-hidden />}
      {TEXT[status]}
    </p>
  )
}
