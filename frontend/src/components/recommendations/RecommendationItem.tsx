import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { categoryLabel, DIFFICULTY_LABEL, TYPE_LABEL } from '@/lib/labels'
import type { Recommendation } from '@/types/api'

const DIFF_TONE = { EASY: 'success', MEDIUM: 'gold', HARD: 'danger' } as const

export function RecommendationItem({ rec, onDismiss, dismissing }: {
  rec: Recommendation
  onDismiss?: (id: number) => void
  dismissing?: boolean
}) {
  const q = rec.question
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-white p-4 shadow-card">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-50 font-mono text-sm font-semibold text-gold-700">
        {rec.priority}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/practice/${q.id}`} className="font-medium hover:underline">{q.title}</Link>
          <Badge>{categoryLabel(q.category)}</Badge>
          <Badge tone={DIFF_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
          <Badge>{TYPE_LABEL[q.question_type]}</Badge>
        </div>
        <p className="mt-1.5 text-sm text-ink-600">{rec.reason}</p>
        <div className="mt-3 flex items-center gap-2">
          <ButtonLink to={`/practice/${q.id}`} size="sm">Practice</ButtonLink>
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={() => onDismiss(rec.id)}
          disabled={dismissing}
          aria-label={`Dismiss recommendation: ${q.title}`}
          className="h-fit rounded-lg p-1.5 text-ink-500 hover:bg-ivory-200 hover:text-ink-900 disabled:opacity-50"
        >
          {dismissing ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" aria-hidden />}
        </button>
      )}
    </li>
  )
}
