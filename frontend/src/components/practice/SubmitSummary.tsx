import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { STATUS_TEXT } from '@/lib/labels'
import type { SubmitResult } from '@/types/api'
import { RichText } from './RichText'

function headline(r: SubmitResult): string {
  const pct = Math.round(r.score * 100)
  if (r.question_type === 'SHORT_ANSWER') return r.is_correct ? `Good answer (${pct}%)` : `Needs more detail (${pct}%)`
  if (r.is_correct) return 'Correct'
  return r.score > 0 ? `Partly correct (${pct}%)` : 'Not quite'
}

export function SubmitSummary({ result }: { result: SubmitResult }) {
  return (
    <div
      role="status"
      className={cn('rounded-xl border p-4', result.is_correct ? 'border-success/30 bg-success-soft' : 'border-line bg-white')}
    >
      <p className="flex items-center gap-2 font-semibold">
        {result.is_correct ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> : <XCircle className="h-5 w-5 text-ink-500" aria-hidden />}
        {headline(result)}
      </p>
      <p className="mt-1 text-sm text-ink-600">
        Attempt {result.attempt_number}
        {result.status ? ` · ${STATUS_TEXT[result.status] ?? result.status}` : ''}
      </p>
      {result.explanation && (
        <div className="mt-3 border-t border-line/70 pt-3">
          <p className="text-sm font-medium">Explanation</p>
          <RichText text={result.explanation} className="mt-1 text-sm text-ink-800" />
        </div>
      )}
    </div>
  )
}
