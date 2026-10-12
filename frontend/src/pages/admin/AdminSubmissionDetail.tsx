import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { CodeResultView, SqlResultView } from '@/components/practice/RunViews'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Panel } from '@/components/ui/Panel'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useAdminSubmission } from '@/lib/adminQueries'
import { ApiError } from '@/lib/api'
import { dateTimeLabel } from '@/lib/format'
import { STATUS_TEXT } from '@/lib/labels'
import { usePageTitle } from '@/lib/usePageTitle'
import type { RunResponse } from '@/types/api'

export default function AdminSubmissionDetail() {
  const { submissionId } = useParams()
  const id = Number(submissionId)
  const valid = Number.isInteger(id) && id > 0
  const q = useAdminSubmission(id, valid)
  usePageTitle(`Admin · Submission ${valid ? id : ''}`)

  const back = (
    <Link to="/admin/submissions" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to submissions
    </Link>
  )
  if (!valid || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return <div className="space-y-4">{back}<Card><EmptyState icon={FileQuestion} title="Submission not found" text="It may not exist." /></Card></div>
  }
  const detail = q.data?.result_detail as RunResponse | null | undefined

  return (
    <div className="space-y-4">
      {back}
      {q.isPending ? (
        <BlockSkeleton className="h-72" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load this submission" />
      ) : (
        <>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Submission {q.data.id}</h2>
            <p className="mt-1 text-sm text-ink-600">{q.data.question_title} · {q.data.user_name} ({q.data.user_email}) · {dateTimeLabel(q.data.created_at)}</p>
          </div>
          <Card className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-5">
            <div><p className="text-ink-500">Status</p><Badge tone={q.data.status === 'ACCEPTED' ? 'success' : 'gold'}>{STATUS_TEXT[q.data.status] ?? q.data.status}</Badge></div>
            <div><p className="text-ink-500">Language</p><p className="font-medium">{q.data.language}</p></div>
            <div><p className="text-ink-500">Tests</p><p className="font-medium">{q.data.total_tests != null ? `${q.data.passed_tests ?? 0} / ${q.data.total_tests}` : '—'}</p></div>
            <div><p className="text-ink-500">Runtime</p><p className="font-medium">{q.data.runtime_ms != null ? `${q.data.runtime_ms} ms` : '—'}</p></div>
            <div><p className="text-ink-500">Attempt</p><p className="font-medium">#{q.data.attempt_number}</p></div>
          </Card>
          <Panel title="Submitted code">
            <pre className="overflow-x-auto rounded-lg border border-line bg-ivory-50 p-3 font-mono text-xs">{q.data.code}</pre>
          </Panel>
          {detail?.sql && <Panel title="SQL result"><SqlResultView run={detail} /></Panel>}
          {detail?.code && <Panel title="Test results"><CodeResultView run={detail} /></Panel>}
        </>
      )}
    </div>
  )
}
