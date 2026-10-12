import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from '@/components/ui/States'
import { dayLabel } from '@/lib/format'
import type { WeekPoint } from '@/types/api'
import { ChartTooltip } from './ChartTooltip'
import { AXIS_TICK, COLORS } from './theme'

export function WeeklyBars({ data }: { data: WeekPoint[] }) {
  const total = data.reduce((s, w) => s + w.answered, 0)
  if (total === 0) {
    return <EmptyState icon={BarChart3} title="No weekly activity yet" text="Your answers per week will appear here." />
  }
  const rows = data.map((w) => ({ week_start: w.week_start, correct: w.correct, incorrect: w.answered - w.correct }))
  return (
    <div role="img" aria-label={`${total} answers over the last ${data.length} weeks.`}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="week_start" tickFormatter={dayLabel} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#F4EFE2' }} content={<ChartTooltip formatLabel={(l) => `Week of ${dayLabel(l)}`} />} />
          <Bar dataKey="correct" name="Correct" stackId="a" fill={COLORS.goldBright} />
          <Bar dataKey="incorrect" name="Incorrect" stackId="a" fill={COLORS.muted} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
