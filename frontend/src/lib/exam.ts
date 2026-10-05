import type { QuestionDetail, ResultQuestion, SavedAnswer } from '@/types/api'

export const SQL_STARTER = '-- Write a single SELECT query\n'
export const CODE_LANGUAGES = ['python', 'java'] as const

export interface ExamAnswer {
  selected_option_ids?: number[]
  text_answer?: string
  language?: string
}
export interface SaveBody {
  selected_option_ids?: number[]
  text_answer?: string
  language?: string
  time_taken_seconds?: number
}

export const stripSqlComments = (sql: string) => sql.replace(/--.*$/gm, '').trim()

export function languagesFor(q: QuestionDetail): string[] {
  const offered = CODE_LANGUAGES.filter((l) => q.starter_code?.[l] != null)
  return offered.length ? [...offered] : [...CODE_LANGUAGES]
}
export const starterFor = (q: QuestionDetail, language: string) => q.starter_code?.[language] ?? ''

/** What counts as an answer. The server uses the same rule: an untouched starter is not an answer. */
export function isAnswered(q: QuestionDetail, a: ExamAnswer | undefined): boolean {
  if (!a) return false
  switch (q.question_type) {
    case 'MCQ':
      return (a.selected_option_ids?.length ?? 0) > 0
    case 'SQL':
      return stripSqlComments(a.text_answer ?? '').length > 0
    case 'SHORT_ANSWER':
      return (a.text_answer ?? '').trim().length > 0
    case 'CODING': {
      const code = a.text_answer ?? ''
      const language = a.language ?? languagesFor(q)[0]!
      return code.trim().length > 0 && code !== starterFor(q, language)
    }
  }
}

/** The body for PUT /api/attempts/{id}/answers/{qid}. An empty body clears the saved answer. */
export function answerBody(q: QuestionDetail, a: ExamAnswer | undefined, seconds?: number): SaveBody {
  if (!a || !isAnswered(q, a)) return {}
  const time = seconds != null ? { time_taken_seconds: Math.min(Math.max(0, Math.round(seconds)), 21600) } : {}
  switch (q.question_type) {
    case 'MCQ':
      return { selected_option_ids: [...(a.selected_option_ids ?? [])], ...time }
    case 'CODING':
      return { text_answer: a.text_answer, language: a.language ?? languagesFor(q)[0], ...time }
    default:
      return { text_answer: a.text_answer, ...time }
  }
}

export function toAnswerMap(saved: SavedAnswer[]): Record<number, ExamAnswer> {
  const out: Record<number, ExamAnswer> = {}
  for (const s of saved) {
    out[s.question_id] = {
      ...(s.selected_option_ids ? { selected_option_ids: s.selected_option_ids } : {}),
      ...(s.text_answer != null ? { text_answer: s.text_answer } : {}),
      ...(s.language ? { language: s.language } : {}),
    }
  }
  return out
}

export type TimerPhase = 'normal' | 'warning' | 'critical'
export function timerPhase(remaining: number): TimerPhase {
  return remaining <= 60 ? 'critical' : remaining <= 300 ? 'warning' : 'normal'
}

export type RowStatus = 'correct' | 'partial' | 'incorrect' | 'unanswered' | 'ungraded'
export function rowStatus(q: Pick<ResultQuestion, 'answered' | 'graded' | 'is_correct' | 'score'>): RowStatus {
  if (!q.answered) return 'unanswered'
  if (!q.graded) return 'ungraded'
  if (q.is_correct) return 'correct'
  return (q.score ?? 0) > 0 ? 'partial' : 'incorrect'
}
export const ROW_LABEL: Record<RowStatus, string> = {
  correct: 'Correct', partial: 'Partly correct', incorrect: 'Incorrect', unanswered: 'Not answered', ungraded: 'Not graded',
}
export const ROW_TONE = {
  correct: 'success', partial: 'gold', incorrect: 'danger', unanswered: 'neutral', ungraded: 'neutral',
} as const

export const formatPoints = (n: number) => String(Number(n.toFixed(2)))
