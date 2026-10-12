import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { AttemptHistory } from '@/components/attempt/AttemptHistory'
import { ActionError } from '@/components/practice/ActionError'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { ApiError, http } from '@/lib/api'
import { categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE, TYPE_LABEL } from '@/lib/labels'
import { useAssessment } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { AttemptState, QuestionType } from '@/types/api'

const RULES = [
  'The timer is enforced by the server and keeps running if you close the tab.',
  'Answers save automatically. If time runs out, your saved answers are submitted for you.',
  'SQL and coding answers are graded when you submit. There is no Run button during an assessment.',
  'You can leave and resume until time is up. After you submit, answers are final.',
]

export default function AssessmentDetailPage() {
  const { assessmentId } = useParams()
  const id = Number(assessmentId)
  const valid = Number.isInteger(id) && id > 0
  const navigate = useNavigate()
  const qc = useQueryClient()
  const q = useAssessment(id, valid)
  usePageTitle(q.data?.title ?? 'Assessment')

  const start = useMutation({
    mutationFn: () => http.post<AttemptState>(`/api/assessments/${id}/start`),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['assessments'] })
      navigate(`/attempts/${s.attempt_id}`)
    },
  })

  const back = (
    <Link to="/assessments" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to assessments
    </Link>
  )

  if (!valid || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return <div>{back}<Card className="mt-6"><EmptyState icon={ClipboardCheck} title="Assessment not found" text="It may have been removed or unpublished." action={<ButtonLink to="/assessments">Browse assessments</ButtonLink>} /></Card></div>
  }

  return (
    <div className="space-y-6">
      {back}
      {q.isPending ? (
        <div aria-busy="true" aria-label="Loading assessment" className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-48 w-full" /></div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load this assessment" />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{q.data.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={DIFFICULTY_TONE[q.data.difficulty]}>{DIFFICULTY_LABEL[q.data.difficulty]}</Badge>
              {q.data.best_percentage != null && <Badge tone="success">Best: {q.data.best_percentage}%</Badge>}
            </div>
            {q.data.description && <p className="mt-3 max-w-2xl text-ink-700">{q.data.description}</p>}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-semibold">What's inside</h2>
              <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div><dt className="text-ink-500">Duration</dt><dd className="font-semibold">{q.data.duration_minutes} min</dd></div>
                <div><dt className="text-ink-500">Questions</dt><dd className="font-semibold">{q.data.question_count}</dd></div>
                <div><dt className="text-ink-500">Points</dt><dd className="font-semibold">{q.data.total_points}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                {Object.entries(q.data.category_counts).map(([k, n]) => <Badge key={k}>{categoryLabel(k)} · {n}</Badge>)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(q.data.type_counts).map(([k, n]) => <Badge key={k} tone="gold">{TYPE_LABEL[k as QuestionType] ?? k} · {n}</Badge>)}
              </div>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-semibold">Before you start</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                {RULES.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />{r}</li>)}
              </ul>
            </Card>
          </div>

          <div className="space-y-3">
            <ActionError error={start.error} />
            {q.data.in_progress_attempt_id != null ? (
              <ButtonLink to={`/attempts/${q.data.in_progress_attempt_id}`} size="lg">Resume assessment</ButtonLink>
            ) : (
              <Button size="lg" onClick={() => start.mutate()} loading={start.isPending}>Start assessment</Button>
            )}
          </div>

          <AttemptHistory mode="ASSESSMENT" title="Your attempts at this assessment" assessmentId={id} />
        </>
      )}
    </div>
  )
}
