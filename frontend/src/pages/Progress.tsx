import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { ActivityCalendar } from '@/components/charts/ActivityCalendar'
import { DifficultyBars } from '@/components/charts/DifficultyBars'
import { PerformanceChart } from '@/components/charts/PerformanceChart'
import { SkillHeatmap } from '@/components/charts/SkillHeatmap'
import { WeeklyBars } from '@/components/charts/WeeklyBars'
import { ReadinessPanel } from '@/components/readiness/ReadinessPanel'
import { Panel } from '@/components/ui/Panel'
import { BlockSkeleton, ErrorState } from '@/components/ui/States'
import { dateLabel, formatSeconds, pct } from '@/lib/format'
import { useActivity, useProgress, useTopics } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { TopicStat } from '@/types/api'

function Trend({ pts }: { pts: number | null }) {
  if (pts == null || pts === 0) return <span className="text-ink-500">—</span>
  const up = pts > 0
  return (
    <span className="inline-flex items-center gap-0.5">
      {up ? <ArrowUp className="h-3.5 w-3.5 text-success" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5 text-danger" aria-hidden />}
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      {Math.abs(Math.round(pts))} pts
    </span>
  )
}

function TopicTable({ rows }: { rows: TopicStat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Performance by topic</caption>
        <thead className="text-xs uppercase tracking-wide text-ink-500">
          <tr>
            {['Topic', 'Answers', 'Accuracy', 'Recent', 'Trend', 'Avg time', 'Last practiced'].map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap py-2 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((t) => (
            <tr key={t.key}>
              <th scope="row" className="py-2.5 pr-4 font-medium">{t.label}</th>
              <td className="py-2.5 pr-4">{t.attempts}</td>
              <td className="py-2.5 pr-4">{t.accuracy == null ? '—' : pct(t.accuracy)}</td>
              <td className="py-2.5 pr-4">{t.recent_accuracy == null || t.attempts === 0 ? '—' : pct(t.recent_accuracy)}</td>
              <td className="py-2.5 pr-4"><Trend pts={t.trend_points} /></td>
              <td className="py-2.5 pr-4">{formatSeconds(t.avg_time_seconds)}</td>
              <td className="py-2.5 pr-4 text-ink-600">{t.last_practiced ? dateLabel(t.last_practiced) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Progress() {
  usePageTitle('Progress')
  const { hash } = useLocation()
  const progress = useProgress()
  const topics = useTopics()
  const activity = useActivity(90)

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-ink-600">Everything here is computed from your own answers.</p>
      </div>

      <ReadinessPanel />

      <Panel title="Performance over time" description="Last 30 days">
        {progress.isPending ? <BlockSkeleton /> : progress.isError ? <ErrorState error={progress.error} onRetry={() => progress.refetch()} /> : (
          <>
            <PerformanceChart data={progress.data.performance_over_time} />
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
              <div><dt className="text-ink-500">Accuracy</dt><dd className="font-semibold">{pct(progress.data.accuracy)}</dd></div>
              <div><dt className="text-ink-500">Average score</dt><dd className="font-semibold">{pct(progress.data.average_score)}</dd></div>
              <div><dt className="text-ink-500">Avg solve time</dt><dd className="font-semibold">{formatSeconds(progress.data.avg_solve_time_seconds)}</dd></div>
              <div>
                <dt className="text-ink-500">Consistency</dt>
                <dd className="font-semibold">{progress.data.consistency == null ? '—' : `${Math.round(progress.data.consistency * 100)}%`}</dd>
              </div>
            </dl>
            {progress.data.consistency == null && <p className="mt-2 text-xs text-ink-500">Consistency needs at least 10 answers (two blocks of five).</p>}
          </>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Weekly activity" description="Answers per week, last 8 weeks">
          {progress.isPending ? <BlockSkeleton className="h-56" /> : progress.isError ? <ErrorState error={progress.error} onRetry={() => progress.refetch()} /> : <WeeklyBars data={progress.data.weekly} />}
        </Panel>
        <Panel title="Difficulty breakdown" description="Accuracy at each level">
          {progress.isPending ? <BlockSkeleton className="h-56" /> : progress.isError ? <ErrorState error={progress.error} onRetry={() => progress.refetch()} /> : <DifficultyBars data={progress.data.by_difficulty} />}
        </Panel>
      </div>

      <Panel title="Topics" description="Your performance in every topic area.">
        {topics.isPending ? <BlockSkeleton /> : topics.isError ? <ErrorState error={topics.error} onRetry={() => topics.refetch()} /> : (
          <div className="space-y-8">
            <SkillHeatmap items={topics.data.categories} />
            <TopicTable rows={topics.data.categories} />
            {topics.data.weak_topics.length > 0 && (
              <section aria-labelledby="needs-attention">
                <h3 id="needs-attention" className="text-sm font-semibold">Needs attention</h3>
                <ul className="mt-3 space-y-2">
                  {topics.data.weak_topics.map((w) => (
                    <li key={w.category} className="rounded-lg border border-line bg-ivory-50 px-3 py-2 text-sm">
                      <span className="font-medium">{w.label}</span><span className="text-ink-600"> · {w.reasons.join(' ')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {topics.data.tags.length > 0 && (
              <section aria-labelledby="by-tag">
                <h3 id="by-tag" className="mb-3 text-sm font-semibold">By tag</h3>
                <SkillHeatmap items={topics.data.tags} dense />
              </section>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Activity" description="Daily practice over the last 90 days.">
        {activity.isPending ? <BlockSkeleton className="h-40" /> : activity.isError ? <ErrorState error={activity.error} onRetry={() => activity.refetch()} /> : (
          <>
            <dl className="mb-5 grid grid-cols-3 gap-4 text-sm">
              <div><dt className="text-ink-500">Current streak</dt><dd className="text-lg font-semibold">{activity.data.current_streak} {activity.data.current_streak === 1 ? 'day' : 'days'}</dd></div>
              <div><dt className="text-ink-500">Longest streak</dt><dd className="text-lg font-semibold">{activity.data.longest_streak} days</dd></div>
              <div><dt className="text-ink-500">Active days</dt><dd className="text-lg font-semibold">{activity.data.active_days}</dd></div>
            </dl>
            <ActivityCalendar days={activity.data.days} />
          </>
        )}
      </Panel>
    </div>
  )
}
