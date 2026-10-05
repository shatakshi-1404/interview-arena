import { useState } from 'react'
import { CodeResultView, SqlResultView } from '@/components/practice/RunViews'
import { EvaluationView } from '@/components/practice/EvaluationView'
import { RichText } from '@/components/practice/RichText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatPoints, ROW_LABEL, ROW_TONE, rowStatus } from '@/lib/exam'
import { formatSeconds } from '@/lib/format'
import { categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE, TYPE_LABEL } from '@/lib/labels'
import { useQuestion } from '@/lib/queries'
import type { ResultQuestion } from '@/types/api'

function McqReview({ q }: { q: ResultQuestion }) {
  const detail = useQuestion(q.question_id)
  if (detail.isPending) return <p className="text-sm text-ink-500">Loading options…</p>
  if (detail.isError) return <p className="text-sm text-ink-600">The answer options are no longer available for this question.</p>
  const picked = new Set(q.selected_option_ids ?? [])
  const correct = new Set(q.correct_option_ids ?? [])
  return (
    <ul className="space-y-2">
      {detail.data.options.map((o) => (
        <li
          key={o.id}
          className={cn('flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm',
            correct.has(o.id) ? 'border-success bg-success-soft' : picked.has(o.id) ? 'border-danger bg-danger-soft' : 'border-line')}
        >
          <span className="flex-1">{o.text}</span>
          {picked.has(o.id) && <Badge>Your answer</Badge>}
          {correct.has(o.id) && <Badge tone="success">Correct answer</Badge>}
        </li>
      ))}
    </ul>
  )
}

function ReviewBody({ q }: { q: ResultQuestion }) {
  const status = rowStatus(q)
  return (
    <div className="space-y-4">
      {status === 'unanswered' && <p className="text-sm text-ink-600">You didn't answer this question.</p>}
      {status === 'ungraded' && (
        <p className="text-sm text-ink-600">This answer couldn't be graded automatically on this server, so it isn't part of your score.</p>
      )}

      {q.answered && q.question_type === 'MCQ' && <McqReview q={q} />}

      {q.answered && (q.question_type === 'SQL' || q.question_type === 'CODING') && (
        <>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Your {q.question_type === 'SQL' ? 'query' : 'code'}</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-ivory-50 p-3 font-mono text-xs">{q.text_answer}</pre>
          </div>
          {q.run?.sql && <SqlResultView run={q.run} />}
          {q.run?.code && <CodeResultView run={q.run} />}
        </>
      )}

      {q.answered && q.question_type === 'SHORT_ANSWER' && (
        <>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Your answer</p>
            <p className="whitespace-pre-wrap rounded-lg border border-line bg-ivory-50 p-3 text-sm">{q.text_answer}</p>
          </div>
          {q.evaluation && <EvaluationView ev={q.evaluation} modelAnswer={q.model_answer} />}
        </>
      )}

      {q.explanation && (
        <div className="border-t border-line pt-3">
          <p className="text-sm font-semibold">Explanation</p>
          <RichText text={q.explanation} className="mt-1 text-sm text-ink-800" />
        </div>
      )}
    </div>
  )
}

function ReviewRow({ q }: { q: ResultQuestion }) {
  const [open, setOpen] = useState(false)
  const status = rowStatus(q)
  return (
    <li className="rounded-xl border border-line bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="font-mono text-sm text-ink-500">{q.position + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{q.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge>{categoryLabel(q.category)}</Badge>
            <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
            <Badge>{TYPE_LABEL[q.question_type]}</Badge>
            {q.time_taken_seconds != null && <span className="text-xs text-ink-500">{formatSeconds(q.time_taken_seconds)}</span>}
          </div>
        </div>
        <Badge tone={ROW_TONE[status]}>{ROW_LABEL[status]}</Badge>
        <span className="text-sm text-ink-600">
          {q.graded && q.answered && q.points_earned != null ? `${formatPoints(q.points_earned)} / ${q.points} pts` : `${q.points} pts`}
        </span>
        <Button variant="secondary" size="sm" aria-expanded={open} aria-controls={`review-${q.question_id}`} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Review'}
        </Button>
      </div>
      {open && (
        <div id={`review-${q.question_id}`} className="border-t border-line p-4">
          <ReviewBody q={q} />
        </div>
      )}
    </li>
  )
}

export function AttemptReview({ questions }: { questions: ResultQuestion[] }) {
  return (
    <ol className="space-y-3">
      {[...questions].sort((a, b) => a.position - b.position).map((q) => <ReviewRow key={q.question_id} q={q} />)}
    </ol>
  )
}
