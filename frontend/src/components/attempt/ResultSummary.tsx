import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { formatPoints } from '@/lib/exam'
import { formatSeconds } from '@/lib/format'
import type { AttemptResult, BreakdownItem } from '@/types/api'

export function ScoreCard({ result }: { result: AttemptResult }) {
  return (
    <Card className="flex flex-wrap items-center gap-6 p-5 sm:p-6">
      <ProgressRing value={result.percentage} size={128} label={`Score ${result.percentage}%`}>
        <span className="text-3xl font-semibold leading-none">{Math.round(result.percentage)}%</span>
      </ProgressRing>
      <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-500">Points</dt><dd className="font-semibold">{formatPoints(result.score)} / {formatPoints(result.max_score)}</dd></div>
        <div><dt className="text-ink-500">Answered</dt><dd className="font-semibold">{result.answered_count} of {result.total_questions}</dd></div>
        <div><dt className="text-ink-500">Time taken</dt><dd className="font-semibold">{formatSeconds(result.time_taken_seconds)}</dd></div>
      </dl>
    </Card>
  )
}

export function ResultNotices({ result }: { result: AttemptResult }) {
  return (
    <>
      {result.status === 'EXPIRED' && (
        <p role="status" className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-ink-800">
          Time ran out, so this attempt was submitted automatically with the answers you had saved.
        </p>
      )}
      {result.ungraded_count > 0 && (
        <p role="status" className="rounded-lg border border-line bg-ivory-50 px-3 py-2 text-sm text-ink-700">
          {result.ungraded_count} {result.ungraded_count === 1 ? 'answer' : 'answers'} couldn't be graded automatically on this server,
          so {result.ungraded_count === 1 ? 'it is' : 'they are'} not part of your score.
        </p>
      )}
    </>
  )
}

export function BreakdownList({ items, label }: { items: BreakdownItem[]; label: (key: string) => string }) {
  if (!items.length) return <p className="text-sm text-ink-600">Nothing to break down yet.</p>
  return (
    <ul className="space-y-4">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{label(i.key)}</span>
            <span className="text-ink-600">{i.correct} of {i.total} correct · {Math.round(i.percentage)}%</span>
          </div>
          <ProgressBar className="mt-1.5" value={i.percentage} label={`${label(i.key)} score`} />
        </li>
      ))}
    </ul>
  )
}
