import { cn } from '@/lib/cn'
import { dayLabel } from '@/lib/format'
import type { DayPoint } from '@/types/api'
import { activityLevel, buildCalendar } from './heat'

const LEVEL = ['bg-ivory-200', 'bg-gold-100', 'bg-gold-200', 'bg-gold-400', 'bg-gold-600']
const CELL = 12

export function ActivityCalendar({ days }: { days: DayPoint[] }) {
  const cells = buildCalendar(days)
  const active = days.filter((d) => d.answered > 0).length
  const summary = `Practice activity over the last ${days.length} days: active on ${active} days.`
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={summary}
          className="grid w-max gap-1"
          style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoFlow: 'column', gridAutoColumns: `${CELL}px` }}
        >
          {cells.map((d, i) =>
            d ? (
              <span
                key={d.date}
                title={`${dayLabel(d.date)}: ${d.answered} ${d.answered === 1 ? 'answer' : 'answers'}`}
                className={cn('rounded-[3px]', LEVEL[activityLevel(d.answered)])}
              />
            ) : (
              <span key={`pad-${i}`} />
            ),
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
        <span>{days.length ? `${dayLabel(days[0].date)} – ${dayLabel(days[days.length - 1].date)}` : ''}</span>
        <span className="inline-flex items-center gap-1.5" aria-hidden="true">
          Less
          {LEVEL.map((c) => (
            <span key={c} className={cn('h-3 w-3 rounded-[3px]', c)} />
          ))}
          More
        </span>
      </div>
    </div>
  )
}
