import type { Difficulty, QuestionType } from '@/types/api'

const CATEGORY: Record<string, string> = {
  DSA: 'DSA', SQL: 'SQL', DBMS: 'DBMS', OS: 'OS', CN: 'CN', OOP: 'OOP',
  PROGRAMMING: 'Programming', SYSTEM_DESIGN: 'System Design',
}
export const categoryLabel = (key: string) => CATEGORY[key] ?? key

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' }
export const TYPE_LABEL: Record<QuestionType, string> = {
  MCQ: 'MCQ', CODING: 'Coding', SQL: 'SQL', SHORT_ANSWER: 'Short answer',
}

export const CATEGORY_KEYS = ['DSA', 'SQL', 'DBMS', 'OS', 'CN', 'OOP', 'PROGRAMMING', 'SYSTEM_DESIGN'] as const
export const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'gold', HARD: 'danger' } as const
export const STATUS_TEXT: Record<string, string> = {
  ACCEPTED: 'Accepted', WRONG_ANSWER: 'Wrong answer', RUNTIME_ERROR: 'Runtime error',
  TIME_LIMIT_EXCEEDED: 'Time limit exceeded', COMPILE_ERROR: 'Compile error', PENDING: 'Pending',
}
