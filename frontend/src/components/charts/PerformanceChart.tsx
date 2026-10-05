import { Activity } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from '@/components/ui/States'
import { dayLabel } from '@/lib/format'
import type { DayPoint } from '@/types/api'
import { ChartTooltip } from './ChartTooltip'
import { AXIS_TICK, COLORS } from './theme'

export function PerformanceChart({ data }: { data: DayPoint[] }) {
  const answered = data.reduce((s, d) => s + d.answered, 0)
  const correct = data.reduce((s, d) => s + d.correct, 0)

  if (answered === 0) {
    return (
      <EmptyState
        icon={Activity}
        title={`No activity in the last ${data.length} days`}
        text="Answer a few questions and your daily accuracy will show up here."
      />
    )
  }

  const summary = `${answered} answers over the last ${data.length} days, ${Math.round((correct / answered) * 100)}% correct.`
  return (
    <div role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} interval="preserveStartEnd" minTickGap={28} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
          <YAxis yAxisId="left" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: '#F4EFE2' }}
            content={<ChartTooltip formatLabel={dayLabel} formatValue={(name, v) => (name === 'Accuracy' ? `${v}%` : String(v))} />}
          />
          <Bar yAxisId="left" dataKey="answered" name="Answered" fill={COLORS.mustardSoft} fillOpacity={0.35} radius={[3, 3, 0, 0]} />
          <Line yAxisId="right" dataKey="accuracy" name="Accuracy" stroke={COLORS.gold} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.gold, strokeWidth: 0 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 flex items-center gap-4 text-xs text-ink-500" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-gold-500" /> Accuracy (right axis)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-mustard-400/40" /> Answers per day</span>
      </p>
    </div>
  )
}
