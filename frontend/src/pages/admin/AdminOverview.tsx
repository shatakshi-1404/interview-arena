import { Activity, BarChart3, ClipboardCheck, FileQuestion, Percent, Send, UserPlus, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS_TICK, COLORS } from '@/components/charts/theme'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { StatCard } from '@/components/ui/StatCard'
import { useAdminStats } from '@/lib/adminQueries'
import { dayLabel } from '@/lib/format'
import { categoryLabel, DIFFICULTY_LABEL, STATUS_TEXT, TYPE_LABEL } from '@/lib/labels'
import { usePageTitle } from '@/lib/usePageTitle'
import type { CountItem, PlatformStats } from '@/types/api'

const MODE_LABEL: Record<string, string> = { PRACTICE: 'Practice', ASSESSMENT: 'Assessments', MOCK_INTERVIEW: 'Mock interviews' }

function CountList({ items, label }: { items: CountItem[]; label: (key: string) => string }) {
  if (!items.length) return <p className="text-sm text-ink-600">Nothing yet.</p>
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex justify-between text-sm"><span>{label(i.key)}</span><span className="text-ink-600">{i.count}</span></div>
          <ProgressBar className="mt-1" value={i.count} max={max} label={label(i.key)} />
        </li>
      ))}
    </ul>
  )
}

function AnswersChart({ data }: { data: PlatformStats['answers_per_day'] }) {
  const total = data.reduce((s, d) => s + d.answered, 0)
  if (total === 0) return <EmptyState icon={BarChart3} title="No answers in the last 14 days" text="Learner activity will show up here." />
  const rows = data.map((d) => ({ date: d.date, correct: d.correct, incorrect: d.answered - d.correct }))
  return (
    <div role="img" aria-label={`${total} answers over the last ${data.length} days.`}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} interval="preserveStartEnd" minTickGap={24} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#F4EFE2' }} content={<ChartTooltip formatLabel={dayLabel} />} />
          <Bar dataKey="correct" name="Correct" stackId="a" fill={COLORS.goldBright} />
          <Bar dataKey="incorrect" name="Incorrect" stackId="a" fill={COLORS.muted} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function AdminOverview() {
  usePageTitle('Admin · Overview')
  const q = useAdminStats()
  if (q.isPending) return <BlockSkeleton className="h-96" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load platform statistics" />
  const s = q.data
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Users" value={s.users.total} hint={`${s.users.active} active · ${s.users.admins} admins`} />
        <StatCard icon={UserPlus} label="New users (7 days)" value={s.users.new_last_7_days} hint={`${s.users.new_last_30_days} in 30 days`} />
        <StatCard accent icon={Activity} label="Active today" value={s.activity.daily_active} hint={`${s.activity.weekly_active} this week · ${s.activity.monthly_active} this month`} />
        <StatCard icon={Percent} label="Overall accuracy" value={s.overall_accuracy == null ? '—' : `${s.overall_accuracy}%`} hint="Across all recorded answers" />
        <StatCard icon={FileQuestion} label="Published questions" value={s.questions.published} hint={`of ${s.questions.total} total`} />
        <StatCard icon={ClipboardCheck} label="Published assessments" value={s.assessments.published} hint={`of ${s.assessments.total} · ${s.assessments.attempts_total} attempts`} />
        <StatCard icon={Send} label="Submissions (24h)" value={s.submissions.last_24_hours} hint={`${s.submissions.total} in total`} />
        <StatCard icon={ClipboardCheck} label="Completed attempts" value={s.attempts.assessments_completed + s.attempts.mock_interviews_completed} hint={`${s.attempts.assessments_completed} assessments · ${s.attempts.mock_interviews_completed} mock interviews`} />
      </div>

      <Panel title="Answers per day" description="Last 14 days"><AnswersChart data={s.answers_per_day} /></Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Questions by category"><CountList items={s.questions.by_category} label={categoryLabel} /></Panel>
        <Panel title="Questions by type"><CountList items={s.questions.by_type} label={(k) => TYPE_LABEL[k as keyof typeof TYPE_LABEL] ?? k} /></Panel>
        <Panel title="Questions by difficulty"><CountList items={s.questions.by_difficulty} label={(k) => DIFFICULTY_LABEL[k as keyof typeof DIFFICULTY_LABEL] ?? k} /></Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Attempts by mode" description="Last 30 days"><CountList items={s.attempts.last_30_days_by_mode} label={(k) => MODE_LABEL[k] ?? k} /></Panel>
        <Panel title="Submission outcomes"><CountList items={s.submissions.by_status} label={(k) => STATUS_TEXT[k] ?? k} /></Panel>
        <Panel title="Lowest accuracy" description="Topics with 10+ answers">
          {s.lowest_accuracy_categories.length === 0 ? (
            <p className="text-sm text-ink-600">Not enough data yet.</p>
          ) : (
            <ul className="space-y-3">
              {s.lowest_accuracy_categories.map((c) => (
                <li key={c.key} className="text-sm"><span className="font-medium">{c.label}</span><span className="text-ink-600"> · {c.accuracy}% across {c.answered} answers</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
