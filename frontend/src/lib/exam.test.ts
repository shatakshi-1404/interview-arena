import { describe, expect, it } from 'vitest'
import type { QuestionDetail } from '@/types/api'
import { answerBody, isAnswered, languagesFor, rowStatus, SQL_STARTER, timerPhase, toAnswerMap } from './exam'

const q = (type: string, extra: Record<string, unknown> = {}) =>
  ({ id: 1, question_type: type, starter_code: null, options: [], ...extra }) as unknown as QuestionDetail

describe('isAnswered', () => {
  it('MCQ needs at least one selection', () => {
    expect(isAnswered(q('MCQ'), undefined)).toBe(false)
    expect(isAnswered(q('MCQ'), { selected_option_ids: [] })).toBe(false)
    expect(isAnswered(q('MCQ'), { selected_option_ids: [3] })).toBe(true)
  })
  it('SQL ignores the starter comment and blank text', () => {
    expect(isAnswered(q('SQL'), { text_answer: SQL_STARTER })).toBe(false)
    expect(isAnswered(q('SQL'), { text_answer: `${SQL_STARTER}SELECT 1` })).toBe(true)
  })
  it('short answers ignore whitespace', () => {
    expect(isAnswered(q('SHORT_ANSWER'), { text_answer: '   ' })).toBe(false)
    expect(isAnswered(q('SHORT_ANSWER'), { text_answer: 'a deadlock' })).toBe(true)
  })
  it('coding is not answered while it still equals the starter', () => {
    const coding = q('CODING', { starter_code: { python: 'print(0)', java: 'class Main {}' } })
    expect(isAnswered(coding, { text_answer: 'print(0)', language: 'python' })).toBe(false)
    expect(isAnswered(coding, { text_answer: 'print(0)', language: 'java' })).toBe(true) // that's not Java's starter
    expect(isAnswered(coding, { text_answer: 'print(1)' })).toBe(true)
  })
})

describe('answerBody', () => {
  it('sends an empty body to clear an unanswered question', () => {
    expect(answerBody(q('MCQ'), { selected_option_ids: [] })).toEqual({})
    expect(answerBody(q('SQL'), { text_answer: SQL_STARTER }, 40)).toEqual({})
    expect(answerBody(q('MCQ'), undefined)).toEqual({})
  })
  it('includes the time spent, clamped to what the server accepts', () => {
    expect(answerBody(q('MCQ'), { selected_option_ids: [1] }, 12)).toEqual({ selected_option_ids: [1], time_taken_seconds: 12 })
    expect(answerBody(q('MCQ'), { selected_option_ids: [1] }, 99999).time_taken_seconds).toBe(21600)
  })
  it('coding always carries a language', () => {
    expect(answerBody(q('CODING'), { text_answer: 'print(1)' })).toEqual({ text_answer: 'print(1)', language: 'python' })
    expect(answerBody(q('CODING', { starter_code: { java: 'x' } }), { text_answer: 'y' }).language).toBe('java')
  })
  it('text answers do not carry a language', () => {
    expect(answerBody(q('SQL'), { text_answer: 'SELECT 1' })).toEqual({ text_answer: 'SELECT 1' })
  })
})

describe('helpers', () => {
  it('maps saved answers by question', () => {
    expect(toAnswerMap([
      { question_id: 1, selected_option_ids: [4], text_answer: null, language: null, time_taken_seconds: 3 },
      { question_id: 2, selected_option_ids: null, text_answer: 'x', language: 'python', time_taken_seconds: null },
    ])).toEqual({ 1: { selected_option_ids: [4] }, 2: { text_answer: 'x', language: 'python' } })
  })
  it('lists offered languages, falling back to both', () => {
    expect(languagesFor(q('CODING', { starter_code: { java: 'x' } }))).toEqual(['java'])
    expect(languagesFor(q('CODING'))).toEqual(['python', 'java'])
  })
  it('timer phases', () => {
    expect([900, 301, 300, 61, 60, 0].map(timerPhase)).toEqual(['normal', 'normal', 'warning', 'warning', 'critical', 'critical'])
  })
  it('review row status', () => {
    const base = { answered: true, graded: true, is_correct: false, score: 0 }
    expect(rowStatus({ ...base, answered: false })).toBe('unanswered')
    expect(rowStatus({ ...base, graded: false, score: null })).toBe('ungraded')
    expect(rowStatus({ ...base, is_correct: true, score: 1 })).toBe('correct')
    expect(rowStatus({ ...base, score: 0.5 })).toBe('partial')
    expect(rowStatus(base)).toBe('incorrect')
  })
})
