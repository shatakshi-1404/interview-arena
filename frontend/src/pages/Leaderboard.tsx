import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { LeaderboardVisibility } from '@/components/leaderboard/Visibility'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { cn } from '@/lib/cn'
import { pct } from '@/lib/format'
import { useLeaderboard } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { LeaderboardEntry, LeaderboardPeriod } from '@/types/api'

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

function Row({ e }: { e: LeaderboardEntry }) {
  return (
    <tr className={cn(e.is_you && 'bg-gold-50')}>
      <td className={cn('whitespace-nowrap px-4 py-3 font-mono', e.rank <= 3 && 'font-semibold text-gold-700')}>{e.rank}</td>
      <th scope="row" className="px-4 py-3 text-left font-medium">
        {e.name} {e.is_you && <Badge tone="gold" className="ml-1.5">You</Badge>}
      </th>
      <td className="px-4 py-3">{e.problems}</td>
      <td className="px-4 py-3">{e.accuracy == null ? '—' : pct(e.accuracy)}</td>
      <td className="px-4 py-3 text-right font-semibold">{e.points}</td>
    </tr>
  )
}

export default function Leaderboard() {
  usePageTitle('Leaderboard')
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly')
  const q = useLeaderboard(period)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-ink-600">
            {q.data ? `${fmt(q.data.period_start)} – ${fmt(new Date(new Date(q.data.period_end).getTime() - 86_400_000).toISOString())} (UTC)` : 'Rankings reset every period.'}
          </p>
        </div>
        <SegmentedControl<LeaderboardPeriod>
          label="Leaderboard period"
          value={period}
          onChange={setPeriod}
          options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
        />
      </div>

      <div className="mt-6 space-y-6">
        {q.isPending ? (
          <BlockSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <>
            {!q.data.opted_in && (
              <Card className="border-gold-300 bg-gold-50/60 p-4 text-sm text-ink-700" role="status">
                You're hidden from the leaderboard, so your points aren't counted in the rankings. Turn visibility on below to join.
              </Card>
            )}
            {q.data.entries.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Trophy}
                  title={`No one has scored this ${period === 'weekly' ? 'week' : 'month'} yet`}
                  text="Solve a question you haven't solved before to earn the first points."
                  action={<ButtonLink to="/practice">Start practicing</ButtonLink>}
                />
              </Card>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <caption className="sr-only">{period === 'weekly' ? 'Weekly' : 'Monthly'} leaderboard</caption>
                  <thead className="border-b border-line bg-ivory-50 text-xs uppercase tracking-wide text-ink-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-medium">Rank</th>
                      <th scope="col" className="px-4 py-3 text-left font-medium">Name</th>
                      <th scope="col" className="px-4 py-3 text-left font-medium">Problems</th>
                      <th scope="col" className="px-4 py-3 text-left font-medium">Accuracy</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {q.data.entries.map((e) => <Row key={`${e.rank}-${e.name}`} e={e} />)}
                  </tbody>
                </table>
              </Card>
            )}

            {q.data.me && !q.data.entries.some((e) => e.is_you) && (
              <Card className="overflow-x-auto">
                <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-ink-500">Your position</p>
                <table className="w-full min-w-[32rem] text-sm"><tbody><Row e={q.data.me} /></tbody></table>
              </Card>
            )}

            <Card className="space-y-4 p-5">
              <LeaderboardVisibility />
              <p className="border-t border-line pt-4 text-sm text-ink-600">{q.data.scoring}</p>
              <p className="text-xs text-ink-500">{q.data.participants} {q.data.participants === 1 ? 'person' : 'people'} ranked this period. Weeks start on Monday (UTC).</p>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
