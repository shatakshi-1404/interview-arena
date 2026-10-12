export const detail = (id: number, title: string, over: Record<string, unknown> = {}) => ({
  id, title, category: 'DSA', difficulty: 'EASY', question_type: 'MCQ', time_limit: 60, tags: [], is_published: true,
  created_at: '2026-10-01T00:00:00Z', user_status: null, description: `About ${title}`, starter_code: null, examples: null,
  constraints: null, options: [{ id: id * 10 + 1, text: `${title} A` }, { id: id * 10 + 2, text: `${title} B` }],
  sample_test_cases: [], multiple_answers: false, ...over,
})
export const sqlDetail = (id: number, title: string) =>
  detail(id, title, { question_type: 'SQL', category: 'SQL', options: [] })

export const attemptState = (over: Record<string, unknown> = {}) => ({
  attempt_id: 5, assessment_id: 3, title: 'Backend Basics', status: 'IN_PROGRESS', started_at: '2026-10-03T10:00:00Z',
  deadline: '2026-10-03T10:30:00Z', server_time: '2026-10-03T10:00:05Z', remaining_seconds: 1500,
  questions: [
    { position: 0, points: 1, question: detail(11, 'First question') },
    { position: 1, points: 2, question: sqlDetail(12, 'Second question') },
  ],
  answers: [], mode: 'ASSESSMENT', config: null, ...over,
})

export const resultQuestion = (over: Record<string, unknown> = {}) => ({
  question_id: 11, position: 0, title: 'First question', category: 'DSA', difficulty: 'EASY', question_type: 'MCQ', points: 1,
  answered: true, graded: true, is_correct: true, score: 1, points_earned: 1, selected_option_ids: [112], correct_option_ids: [112],
  text_answer: null, explanation: 'Because B.', time_taken_seconds: 12, run: null, evaluation: null, model_answer: null, ...over,
})
export const sqlResultQuestion = () =>
  resultQuestion({
    question_id: 12, position: 1, title: 'Second question', category: 'SQL', question_type: 'SQL', points: 2, is_correct: false,
    score: 0, points_earned: 0, selected_option_ids: null, correct_option_ids: null, explanation: null,
    text_answer: 'SELECT MAX(salary) FROM employees',
    run: {
      question_id: 12, question_type: 'SQL', status: 'WRONG_ANSWER', runtime_ms: 3, message: null, code: null,
      sql: { correct: false, expected: { columns: ['second_highest'], rows: [[100]], truncated: false }, actual: { columns: ['max'], rows: [[200]], truncated: false } },
    },
  })

export const attemptResult = (over: Record<string, unknown> = {}) => ({
  attempt_id: 5, assessment_id: 3, assessment_title: 'Backend Basics', status: 'SUBMITTED', started_at: '2026-10-03T10:00:00Z',
  submitted_at: '2026-10-03T10:12:00Z', time_taken_seconds: 720, score: 1, max_score: 3, percentage: 33.3, total_questions: 2,
  answered_count: 2, ungraded_count: 0,
  by_category: [
    { key: 'DSA', correct: 1, total: 1, points_earned: 1, points_max: 1, percentage: 100 },
    { key: 'SQL', correct: 0, total: 1, points_earned: 0, points_max: 2, percentage: 0 },
  ],
  by_difficulty: [{ key: 'EASY', correct: 1, total: 2, points_earned: 1, points_max: 3, percentage: 33.3 }],
  questions: [resultQuestion(), sqlResultQuestion()], ...over,
})

export const mockReport = () => ({
  attempt_id: 5, title: 'Backend Engineer mock interview (Intermediate)', role: 'BACKEND_ENGINEER', role_label: 'Backend Engineer',
  level: 'INTERMEDIATE', level_label: 'Intermediate', duration_minutes: 30, status: 'SUBMITTED', percentage: 62.5, band: 'Solid',
  by_type: [{ key: 'MCQ', correct: 3, total: 4, points_earned: 3, points_max: 4, percentage: 75 }],
  strengths: ['DSA'],
  focus_areas: [{ category: 'OS', label: 'OS', reason: 'You answered 0 of 2 OS questions correctly in this interview.' }],
  pace: { minutes_allowed: 30, minutes_used: 14.5, seconds_per_answered: 96.7 },
  next_steps: ['Practice OS: You answered 0 of 2 OS questions correctly in this interview.'],
  disclaimer: 'This report reflects your performance in this practice session. It does not predict interview or hiring outcomes.',
  result: attemptResult({ assessment_id: null, assessment_title: 'Backend Engineer mock interview (Intermediate)', percentage: 62.5 }),
})

export const assessmentSummary = (id: number, title: string, over: Record<string, unknown> = {}) => ({
  id, title, description: `${title} description`, duration_minutes: 30, difficulty: 'MEDIUM', is_published: true, question_count: 10,
  total_points: 12, categories: ['DSA', 'SQL'], in_progress_attempt_id: null, best_percentage: null, ...over,
})

export const mockOptions = () => ({
  roles: [
    { key: 'BACKEND_ENGINEER', label: 'Backend Engineer', focus: ['DSA', 'SQL', 'DBMS'] },
    { key: 'DATA_ENGINEER', label: 'Data Engineer', focus: ['SQL', 'DBMS', 'DSA'] },
  ],
  levels: [
    { key: 'BEGINNER', label: 'Beginner', description: 'Mostly easy questions.' },
    { key: 'INTERMEDIATE', label: 'Intermediate', description: 'A balanced mix.' },
    { key: 'ADVANCED', label: 'Advanced', description: 'Mostly medium and hard.' },
  ],
  durations: [{ minutes: 15, questions: 5 }, { minutes: 30, questions: 10 }, { minutes: 45, questions: 15 }, { minutes: 60, questions: 20 }],
  includes: ['MCQ', 'SHORT_ANSWER', 'SQL'],
})
