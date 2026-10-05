import { ProgressBar } from '@/components/ui/ProgressBar'
import { DIFFICULTY_LABEL } from '@/lib/labels'
import { formatSeconds } from '@/lib/format'
import type { DifficultyStat, Difficulty } from '@/types/api'

export function DifficultyBars({ data }: { data: DifficultyStat[] }) {
  return (
    <ul className="space-y-5">
      {data.map((d) => {
        const label = DIFFICULTY_LABEL[d.difficulty as Difficulty] ?? d.difficulty
        return (
          <li key={d.difficulty}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{label}</span>
              <span className="text-ink-600">
                {d.attempts === 0 ? 'No attempts yet' : `${d.correct} of ${d.attempts} correct · ${Math.round(d.accuracy ?? 0)}%`}
              </span>
            </div>
            <ProgressBar className="mt-2" value={d.accuracy ?? 0} label={`${label} accuracy`} />
            {d.avg_time_seconds != null && <p className="mt-1 text-xs text-ink-500">Average time {formatSeconds(d.avg_time_seconds)}</p>}
          </li>
        )
      })}
    </ul>
  )
}
