import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ProgressRing } from '@/components/ui/ProgressRing'
import type { ReadinessSummary } from '@/types/api'

export function ReadinessCompact({ summary }: { summary: ReadinessSummary }) {
  return (
    <Panel
      title="Practice Readiness"
      action={<Link to="/progress#readiness" className="text-sm font-medium text-mustard-700 hover:underline">Details</Link>}
    >
      {summary.status === 'READY_TO_SCORE' && summary.score != null ? (
        <div className="flex flex-col items-center text-center">
          <ProgressRing value={summary.score} size={132} label={`Practice Readiness ${Math.round(summary.score)} out of 100`}>
            <span className="text-3xl font-semibold leading-none">{Math.round(summary.score)}</span>
            <span className="mt-1 text-xs text-ink-500">out of 100</span>
          </ProgressRing>
          {summary.category && <Badge tone="gold" className="mt-4">{summary.category}</Badge>}
        </div>
      ) : summary.status === 'DISABLED' ? (
        <p className="text-sm text-ink-600">Personalized readiness is turned off on this server. Your analytics still work.</p>
      ) : (
        <div>
          <p className="text-sm text-ink-700">Answer {Math.max(0, summary.needed - summary.answered)} more questions to unlock your estimate.</p>
          <ProgressBar className="mt-3" value={summary.answered} max={summary.needed} label="Answers toward unlocking readiness" />
          <p className="mt-2 text-xs text-ink-500">{summary.answered} of {summary.needed} answered</p>
        </div>
      )}
      <p className="mt-5 text-xs leading-relaxed text-ink-500">
        Based on your practice on this platform. Not a prediction of interview or job outcomes.
      </p>
    </Panel>
  )
}
