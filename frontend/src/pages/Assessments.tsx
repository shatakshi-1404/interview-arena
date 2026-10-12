import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Clock, ListChecks } from 'lucide-react'
import { AttemptHistory } from '@/components/attempt/AttemptHistory'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE } from '@/lib/labels'
import { useAssessments } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { AssessmentSummary } from '@/types/api'

function AssessmentCard({ a }: { a: AssessmentSummary }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold"><Link to={`/assessments/${a.id}`} className="hover:underline">{a.title}</Link></h2>
        <Badge tone={DIFFICULTY_TONE[a.difficulty]}>{DIFFICULTY_LABEL[a.difficulty]}</Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-ink-600">{a.description || 'No description.'}</p>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-700">
        <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-ink-500" aria-hidden />{a.duration_minutes} min</span>
        <span className="inline-flex items-center gap-1.5"><ListChecks className="h-4 w-4 text-ink-500" aria-hidden />{a.question_count} questions</span>
        <span>{a.total_points} points</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">{a.categories.map((c) => <Badge key={c}>{categoryLabel(c)}</Badge>)}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3 pt-1">
        {a.in_progress_attempt_id != null ? (
          <>
            <Badge tone="gold">In progress</Badge>
            <ButtonLink to={`/attempts/${a.in_progress_attempt_id}`} size="sm">Resume</ButtonLink>
          </>
        ) : (
          <>
            {a.best_percentage != null && <Badge tone="success">Best: {a.best_percentage}%</Badge>}
            <ButtonLink to={`/assessments/${a.id}`} variant="secondary" size="sm">Details &amp; start</ButtonLink>
          </>
        )}
      </div>
    </Card>
  )
}

export default function Assessments() {
  usePageTitle('Assessments')
  const [page, setPage] = useState(1)
  const q = useAssessments(page)
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
        <p className="mt-1 max-w-2xl text-ink-600">Timed, graded sets of questions. Your answers save as you go, and you get a full report at the end.</p>
      </div>

      {q.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading assessments">
          {Array.from({ length: 4 }, (_, i) => <Card key={i} className="space-y-3 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/2" /></Card>)}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load assessments" />
      ) : q.data.items.length === 0 ? (
        <Card><EmptyState icon={ClipboardCheck} title="No assessments are published yet" text="Check back soon. In the meantime you can practice individual questions." action={<ButtonLink to="/practice">Go to Practice</ButtonLink>} /></Card>
      ) : (
        <div className="space-y-4">
          <ul className="grid gap-4 sm:grid-cols-2">
            {q.data.items.map((a) => <li key={a.id} className="flex"><div className="flex-1"><AssessmentCard a={a} /></div></li>)}
          </ul>
          <Pagination page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onChange={setPage} />
        </div>
      )}

      <AttemptHistory mode="ASSESSMENT" title="Your attempts" />
    </div>
  )
}
