export function page<T>(items: T[], extra: Record<string, unknown> = {}) {
  return { items, total: items.length, page: 1, page_size: 20, ...extra }
}

export const stats = () => ({
  generated_at: '2026-10-03T10:00:00Z',
  users: { total: 120, active: 115, admins: 2, new_last_7_days: 9, new_last_30_days: 31 },
  activity: { daily_active: 14, weekly_active: 48, monthly_active: 80 },
  questions: {
    total: 40, published: 36,
    by_category: [{ key: 'DSA', count: 20 }, { key: 'SQL', count: 10 }],
    by_type: [{ key: 'MCQ', count: 30 }, { key: 'SQL', count: 6 }],
    by_difficulty: [{ key: 'EASY', count: 15 }, { key: 'HARD', count: 5 }],
  },
  assessments: { total: 5, published: 4, attempts_total: 77 },
  attempts: { last_30_days_by_mode: [{ key: 'ASSESSMENT', count: 31 }, { key: 'MOCK_INTERVIEW', count: 12 }], assessments_completed: 60, mock_interviews_completed: 18 },
  submissions: { total: 310, last_24_hours: 21, by_status: [{ key: 'ACCEPTED', count: 200 }, { key: 'WRONG_ANSWER', count: 90 }] },
  answers_per_day: [{ date: '2026-10-02', answered: 30, correct: 20 }, { date: '2026-10-03', answered: 10, correct: 7 }],
  overall_accuracy: 64.5,
  lowest_accuracy_categories: [{ key: 'OS', label: 'OS', answered: 22, accuracy: 38.5 }],
})

export const adminUser = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id, name, email: `${name.split(' ')[0]!.toLowerCase()}@example.com`, role: 'USER', is_active: true, show_on_leaderboard: true,
  created_at: '2026-09-01T00:00:00Z', answered: 12, last_active: '2026-10-02T10:00:00Z', ...over,
})

export const qSummary = (id: number, title: string, over: Record<string, unknown> = {}) => ({
  id, title, category: 'DSA', difficulty: 'EASY', question_type: 'MCQ', time_limit: 60, tags: [], is_published: true,
  created_at: '2026-10-01T00:00:00Z', user_status: null, ...over,
})

export const adminQuestion = (over: Record<string, unknown> = {}) => ({
  ...qSummary(7, 'Binary search complexity', { tags: ['searching'] }),
  description: 'What is the time complexity of binary search?', starter_code: null, examples: null, constraints: null,
  explanation: 'It halves the range.', created_by: 9, updated_at: '2026-10-01T00:00:00Z',
  options: [
    { id: 1, text: 'O(n)', is_correct: false, position: 0 },
    { id: 2, text: 'O(log n)', is_correct: true, position: 1 },
  ],
  test_cases: [], sql_challenge: null, reference_answer: null, ...over,
})

export const adminAssessment = (over: Record<string, unknown> = {}) => ({
  id: 4, title: 'Backend Basics', description: 'Core topics', duration_minutes: 45, difficulty: 'MEDIUM', is_published: true,
  question_count: 2, total_points: 5, categories: ['DSA'], in_progress_attempt_id: null, best_percentage: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', attempt_count: 0,
  questions: [
    { question_id: 1, position: 0, points: 2, title: 'Binary search', category: 'DSA', difficulty: 'EASY', question_type: 'MCQ' },
    { question_id: 2, position: 1, points: 3, title: 'Filtering groups', category: 'SQL', difficulty: 'EASY', question_type: 'MCQ' },
  ],
  ...over,
})

export const submissionRow = (id: number, over: Record<string, unknown> = {}) => ({
  id, user_id: 2, user_name: 'Grace Hopper', user_email: 'grace@example.com', question_id: 7, question_title: 'Second highest salary',
  language: 'sql', status: 'WRONG_ANSWER', runtime_ms: 4, passed_tests: null, total_tests: null, attempt_number: 2,
  created_at: '2026-10-02T09:00:00Z', ...over,
})

export const submissionDetail = () => ({
  ...submissionRow(31),
  code: 'SELECT MAX(salary) FROM employees',
  result_detail: {
    question_id: 7, question_type: 'SQL', status: 'WRONG_ANSWER', runtime_ms: 4, message: null, code: null,
    sql: { correct: false, expected: { columns: ['second_highest'], rows: [[100]], truncated: false }, actual: { columns: ['max'], rows: [[200]], truncated: false } },
  },
})
