import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion, Hourglass } from 'lucide-react'
import { AttemptReview } from '@/components/attempt/AttemptReview'
import { BreakdownList, ResultNotices, ScoreCard } from '@/components/attempt/ResultSummary'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Panel } from '@/components/ui/Panel'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { ApiError } from '@/lib/api'
import { categoryLabel, DIFFICULTY_LABEL } from '@/lib/labels'
import { useAttemptResult } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'

export default function AttemptResultPage() {
  const { attemptId } = useParams()
  const id = Number(attemptId)
  const valid = Number.isInteger(id) && id > 0
  const q = useAttemptResult(id, valid)
  usePageTitle(q.data ? `${q.data.assessment_title} result` : 'Result')

  const back = (
    <Link to="/assessments" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to assessments
    </Link>
  )

  if (!valid || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return <div>{back}<Card className="mt-6"><EmptyState icon={FileQuestion} title="Result not found" text="This attempt doesn't exist or belongs to another account." /></Card></div>
  }
  if (q.isError && q.error instanceof ApiError && q.error.status === 409) {
    return (
      <div>
        {back}
        <Card className="mt-6"><EmptyState icon={Hourglass} title="This attempt is still in progress" text="Your result appears once you submit or time runs out." action={<ButtonLink to={`/attempts/${id}`}>Resume attempt</ButtonLink>} /></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {back}
      {q.isPending ? (
        <BlockSkeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load this result" />
      ) : (
        <>
          <div>
            <p className="text-sm font-medium text-mustard-700">Assessment result</p>
            <h1 className="text-2xl font-semibold tracking-tight">{q.data.assessment_title}</h1>
          </div>
          <ResultNotices result={q.data} />
          <ScoreCard result={q.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="By topic"><BreakdownList items={q.data.by_category} label={categoryLabel} /></Panel>
            <Panel title="By difficulty"><BreakdownList items={q.data.by_difficulty} label={(k) => DIFFICULTY_LABEL[k as keyof typeof DIFFICULTY_LABEL] ?? k} /></Panel>
          </div>
          <section aria-labelledby="review-heading" className="space-y-3">
            <h2 id="review-heading" className="text-lg font-semibold">Question review</h2>
            <AttemptReview questions={q.data.questions} />
          </section>
          <div className="flex flex-wrap gap-3">
            {q.data.assessment_id != null && <ButtonLink to={`/assessments/${q.data.assessment_id}`} variant="secondary">Retake</ButtonLink>}
            <ButtonLink to="/assessments" variant="ghost">All assessments</ButtonLink>
            <ButtonLink to="/progress" variant="ghost">See your progress</ButtonLink>
          </div>
        </>
      )}
    </div>
  )
}
