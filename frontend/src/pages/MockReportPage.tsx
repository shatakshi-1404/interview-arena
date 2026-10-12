import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion, Hourglass } from 'lucide-react'
import { AttemptReview } from '@/components/attempt/AttemptReview'
import { BreakdownList, ResultNotices, ScoreCard } from '@/components/attempt/ResultSummary'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Panel } from '@/components/ui/Panel'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { ApiError } from '@/lib/api'
import { categoryLabel, TYPE_LABEL } from '@/lib/labels'
import { useMockReport } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { QuestionType } from '@/types/api'

const BAND_TONE: Record<string, 'success' | 'gold' | 'neutral'> = { Strong: 'success', Solid: 'gold' }

export default function MockReportPage() {
  const { attemptId } = useParams()
  const id = Number(attemptId)
  const valid = Number.isInteger(id) && id > 0
  const q = useMockReport(id, valid)
  usePageTitle(q.data ? `${q.data.title} report` : 'Mock interview report')

  const back = (
    <Link to="/mock-interviews" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to mock interviews
    </Link>
  )

  if (!valid || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return <div>{back}<Card className="mt-6"><EmptyState icon={FileQuestion} title="Report not found" text="This interview doesn't exist or belongs to another account." /></Card></div>
  }
  if (q.isError && q.error instanceof ApiError && q.error.status === 409) {
    return <div>{back}<Card className="mt-6"><EmptyState icon={Hourglass} title="This interview is still in progress" text="Your report appears once you submit or time runs out." action={<ButtonLink to={`/attempts/${id}`}>Resume interview</ButtonLink>} /></Card></div>
  }

  return (
    <div className="space-y-6">
      {back}
      {q.isPending ? (
        <BlockSkeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load this report" />
      ) : (
        <>
          <div>
            <p className="text-sm font-medium text-mustard-700">Mock interview report</p>
            <h1 className="text-2xl font-semibold tracking-tight">{q.data.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={BAND_TONE[q.data.band] ?? 'neutral'}>{q.data.band}</Badge>
              <Badge>{q.data.role_label}</Badge>
              <Badge>{q.data.level_label}</Badge>
            </div>
          </div>

          <ResultNotices result={q.data.result} />
          <ScoreCard result={q.data.result} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="By question type"><BreakdownList items={q.data.by_type} label={(k) => TYPE_LABEL[k as QuestionType] ?? k} /></Panel>
            <Panel title="By topic"><BreakdownList items={q.data.result.by_category} label={categoryLabel} /></Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Pace">
              <p className="text-sm text-ink-700">Used {q.data.pace.minutes_used} of {q.data.pace.minutes_allowed} minutes.</p>
              {q.data.pace.seconds_per_answered != null && (
                <p className="mt-1 text-sm text-ink-700">About {Math.round(q.data.pace.seconds_per_answered)} seconds per answered question.</p>
              )}
            </Panel>
            <Panel title="Strengths">
              {q.data.strengths.length ? (
                <div className="flex flex-wrap gap-2">{q.data.strengths.map((s) => <Badge key={s} tone="success">{s}</Badge>)}</div>
              ) : (
                <p className="text-sm text-ink-600">A topic shows up here once you answer 2+ of its questions with 75% or better.</p>
              )}
            </Panel>
          </div>

          <Panel title="Where to focus">
            {q.data.focus_areas.length ? (
              <ul className="space-y-2">
                {q.data.focus_areas.map((f) => (
                  <li key={f.category} className="rounded-lg border border-line bg-ivory-50 px-3 py-2 text-sm"><span className="font-medium">{f.label}</span><span className="text-ink-600"> · {f.reason}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">No topic scored under 50% in this interview.</p>
            )}
            <h3 className="mt-6 text-sm font-semibold">Next steps</h3>
            <ul className="mt-2 space-y-2 text-sm text-ink-700">
              {q.data.next_steps.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />{s}</li>)}
            </ul>
          </Panel>

          <section aria-labelledby="review-heading" className="space-y-3">
            <h2 id="review-heading" className="text-lg font-semibold">Question review</h2>
            <AttemptReview questions={q.data.result.questions} />
          </section>

          <p className="text-xs leading-relaxed text-ink-500">{q.data.disclaimer}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/mock-interviews">Start another interview</ButtonLink>
            <ButtonLink to="/progress" variant="ghost">See your progress</ButtonLink>
          </div>
        </>
      )}
    </div>
  )
}
