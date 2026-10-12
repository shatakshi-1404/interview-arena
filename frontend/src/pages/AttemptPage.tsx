import { Navigate, useParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { ExamRunner } from '@/components/exam/ExamRunner'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { ApiError } from '@/lib/api'
import { useAttemptState } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'

export default function AttemptPage() {
  const { attemptId } = useParams()
  const id = Number(attemptId)
  const valid = Number.isInteger(id) && id > 0
  const q = useAttemptState(id, valid)
  usePageTitle(q.data?.title ?? 'Assessment')

  if (!valid || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <Card><EmptyState icon={FileQuestion} title="Attempt not found" text="This attempt doesn't exist or belongs to another account." action={<ButtonLink to="/assessments">Back to assessments</ButtonLink>} /></Card>
      </div>
    )
  }
  if (q.isPending) return <FullPageSpinner />
  if (q.isError) {
    return <div className="mx-auto max-w-xl px-4 py-16"><ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't open this attempt" /></div>
  }

  const s = q.data
  if (s.status !== 'IN_PROGRESS') {
    return <Navigate to={s.mode === 'MOCK_INTERVIEW' ? `/mock-interviews/${s.attempt_id}/report` : `/attempts/${s.attempt_id}/result`} replace />
  }
  return <ExamRunner key={s.attempt_id} state={s} receivedAt={q.dataUpdatedAt} />
}
