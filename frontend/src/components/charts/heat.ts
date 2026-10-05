import { parseDay } from '@/lib/format'
import type { DayPoint } from '@/types/api'

export type Tone = 'none' | 'early' | 'weak' | 'mid' | 'strong'

export const TONE_LABEL: Record<Tone, string> = {
  none: 'No data', early: 'Early data', weak: 'Needs work', mid: 'Getting there', strong: 'Strong',
}

/** Fewer than 3 answers is too little evidence to call a topic strong or weak. */
export function accuracyTone(accuracy: number | null, attempts: number): Tone {
  if (accuracy == null || attempts === 0) return 'none'
  if (attempts < 3) return 'early'
  if (accuracy >= 75) return 'strong'
  if (accuracy >= 50) return 'mid'
  return 'weak'
}

export function activityLevel(answered: number): 0 | 1 | 2 | 3 | 4 {
  if (answered <= 0) return 0
  if (answered <= 2) return 1
  if (answered <= 5) return 2
  if (answered <= 9) return 3
  return 4
}

/** Pads the front so the first day lands in the right weekday row (Monday = row 0). */
export function buildCalendar(days: DayPoint[]): (DayPoint | null)[] {
  if (days.length === 0) return []
  const pad = (parseDay(days[0].date).getDay() + 6) % 7
  return [...Array<null>(pad).fill(null), ...days]
}
