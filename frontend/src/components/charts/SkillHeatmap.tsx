import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { TopicStat } from '@/types/api'
import { accuracyTone, TONE_LABEL, type Tone } from './heat'

const TONE_STYLE: Record<Tone, string> = {
  none: 'border-dashed border-line-strong bg-ivory-50 text-ink-500',
  early: 'border-line bg-white text-ink-800',
  weak: 'border-danger/30 bg-danger-soft text-ink-900',
  mid: 'border-gold-200 bg-gold-50 text-ink-900',
  strong: 'border-gold-300 bg-gold-200/60 text-ink-900',
}

export function SkillHeatmap({ items, dense = false }: { items: TopicStat[]; dense?: boolean }) {
  return (
    <div>
      <ul className={cn('grid gap-3', dense ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4')}>
        {items.map((t) => {
          const tone = accuracyTone(t.accuracy, t.attempts)
          const trend = t.trend_points
          return (
            <li key={t.key} className={cn('rounded-lg border p-3', TONE_STYLE[tone])}>
              <p className="truncate text-sm font-medium">{t.label}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">{t.accuracy == null ? '—' : `${Math.round(t.accuracy)}%`}</p>
              <p className="mt-0.5 text-xs">
                {t.attempts > 0 ? `${t.attempts} ${t.attempts === 1 ? 'answer' : 'answers'}` : 'Not practiced'}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium">
                {TONE_LABEL[tone]}
                {trend != null && trend !== 0 && (
                  <span className="ml-auto inline-flex items-center gap-0.5 font-normal" title="Recent accuracy vs earlier">
                    {trend > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
                    <span className="sr-only">{trend > 0 ? 'Up' : 'Down'}</span>
                    {Math.abs(Math.round(trend))} pts
                  </span>
                )}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-500">Topics with fewer than 3 answers are marked "Early data" and aren't judged yet.</p>
    </div>
  )
}
