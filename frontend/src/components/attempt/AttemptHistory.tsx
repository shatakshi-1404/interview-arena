import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import { BlockSkeleton, ErrorState } from '@/components/ui/States'
import { dateLabel, pct } from '@/lib/format'
import { useAttempts } from '@/lib/queries'
import type { AttemptMode, AttemptStatus } from '@/types/api'

const STATUS_TEXT: Record<AttemptStatus, string> = { IN_PROGRESS: 'In progress', SUBMITTED: 'Completed', EXPIRED: 'Auto-submitted' }

export function AttemptHistory({ mode, title, assessmentId }: { mode: AttemptMode; title: string; assessmentId?: number }) {
  const q = useAttempts()
  const rows = (q.data ?? []).filter((a) => a.mode === mode && (assessmentId == null || a.assessment_id === assessmentId))
  return (
    <Panel title={title}>
      {q.isPending ? (
        <BlockSkeleton className="h-24" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-600">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((a) => {
            const finished = a.status !== 'IN_PROGRESS'
            const href = !finished ? `/attempts/${a.attempt_id}`
              : mode === 'MOCK_INTERVIEW' ? `/mock-interviews/${a.attempt_id}/report` : `/attempts/${a.attempt_id}/result`
            return (
              <li key={a.attempt_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.assessment_title ?? 'Attempt'}</p>
                  <p className="text-sm text-ink-500">{dateLabel(a.started_at)}</p>
                </div>
                <Badge tone={finished ? 'neutral' : 'gold'}>{STATUS_TEXT[a.status]}</Badge>
                {finished && <span className="w-14 text-right text-sm font-semibold">{pct(a.percentage)}</span>}
                <Link to={href} className="text-sm font-medium text-mustard-700 hover:underline">
                  {finished ? (mode === 'MOCK_INTERVIEW' ? 'View report' : 'View result') : 'Resume'}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
