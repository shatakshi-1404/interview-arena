export type Role = 'USER' | 'ADMIN'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  show_on_leaderboard: boolean
  created_at: string
}
export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}
export interface AuthResponse {
  user: User
  tokens: TokenPair
}
export interface MessageResponse {
  message: string
}

export interface DayPoint {
  date: string
  answered: number
  correct: number
  accuracy: number | null
  average_score: number | null
}
export interface WeekPoint {
  week_start: string
  answered: number
  correct: number
  accuracy: number | null
}
export interface TopicBrief {
  key: string
  label: string
  accuracy: number
}
export interface DifficultyStat {
  difficulty: string
  attempts: number
  correct: number
  accuracy: number | null
  avg_time_seconds: number | null
}
export type ReadinessStatus = 'READY_TO_SCORE' | 'INSUFFICIENT_DATA' | 'DISABLED'
export interface ReadinessSummary {
  status: ReadinessStatus
  score: number | null
  category: string | null
  answered: number
  needed: number
}
export interface ProgressOverview {
  current_streak: number
  longest_streak: number
  problems_solved: number
  total_answered: number
  accuracy: number | null
  average_score: number | null
  avg_solve_time_seconds: number | null
  consistency: number | null
  weakest_topic: TopicBrief | null
  readiness: ReadinessSummary
  performance_over_time: DayPoint[]
  weekly: WeekPoint[]
  by_difficulty: DifficultyStat[]
}

export interface NotificationItem {
  id: number
  title: string
  body: string
  is_read: boolean
  created_at: string
}
export interface NotificationList {
  unread_count: number
  items: NotificationItem[]
}

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'
export type QuestionType = 'MCQ' | 'CODING' | 'SQL' | 'SHORT_ANSWER'

export interface TopicStat {
  key: string
  label: string
  attempts: number
  correct: number
  accuracy: number | null
  recent_accuracy: number | null
  trend_points: number | null
  avg_time_seconds: number | null
  last_practiced: string | null
  readiness_score: number | null
  confidence: string | null
}
export interface WeakTopic {
  category: string
  label: string
  attempts: number
  accuracy: number
  recent_accuracy: number
  severity: number
  reasons: string[]
}
export interface TopicsResponse {
  categories: TopicStat[]
  tags: TopicStat[]
  weak_topics: WeakTopic[]
}
export interface ActivityResponse {
  days: DayPoint[]
  current_streak: number
  longest_streak: number
  active_days: number
  total_answered: number
}

export interface ReadinessDriver {
  feature: string
  label: string
  effect: 'raises' | 'lowers'
}
export interface ReadinessTopic {
  category: string
  label: string
  score: number | null
  attempts: number
  confidence: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
}
export interface ReadinessDetail {
  status: ReadinessStatus
  answered: number
  needed: number
  score: number | null
  category: string | null
  rubric_category: string | null
  probabilities: Record<string, number>
  drivers: ReadinessDriver[]
  topics: ReadinessTopic[]
  strengths: string[]
  weaknesses: WeakTopic[]
  recent_improvement: {
    window_days: number
    recent_accuracy: number
    previous_accuracy: number
    change_points: number
  } | null
  next_steps: string[]
  disclaimer: string
  model: { type: string; trained_on: string; validated_against_real_outcomes: boolean; version: string }
}

export interface RecQuestion {
  id: number
  title: string
  category: string
  difficulty: Difficulty
  question_type: QuestionType
}
export interface Recommendation {
  id: number
  priority: number
  reason: string
  created_at: string
  question: RecQuestion
}
export interface RecommendationList {
  enabled: boolean
  items: Recommendation[]
}

export type LeaderboardPeriod = 'weekly' | 'monthly'
export interface LeaderboardEntry {
  rank: number
  name: string
  problems: number
  accuracy: number | null
  points: number
  is_you: boolean
}
export interface LeaderboardResponse {
  period: LeaderboardPeriod
  period_start: string
  period_end: string
  opted_in: boolean
  participants: number
  entries: LeaderboardEntry[]
  me: LeaderboardEntry | null
  scoring: string
}

export interface Achievement {
  code: string
  name: string
  description: string
  target: number
  progress: number
  earned: boolean
  earned_at: string | null
}

export type SubmissionStatus =
  | 'PENDING' | 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' | 'COMPILE_ERROR'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
export interface QuestionSummary {
  id: number
  title: string
  category: string
  difficulty: Difficulty
  question_type: QuestionType
  time_limit: number | null
  tags: string[]
  is_published: boolean
  created_at: string
  user_status: 'SOLVED' | 'ATTEMPTED' | null
}
export interface QuestionDetail extends QuestionSummary {
  description: string
  starter_code: Record<string, string> | null
  examples: Record<string, unknown>[] | null
  constraints: string | null
  options: { id: number; text: string }[]
  sample_test_cases: { input_data: string; expected_output: string }[]
  multiple_answers: boolean
}
export interface QuestionMeta {
  categories: { value: string; count: number }[]
  difficulties: Difficulty[]
  question_types: QuestionType[]
}

export interface ResultTable {
  columns: string[]
  rows: unknown[][]
  truncated: boolean
}
export interface CaseResult {
  index: number
  is_sample: boolean
  passed: boolean
  input_data: string | null
  expected_output: string | null
  actual_output: string | null
  error: string | null
  runtime_ms: number | null
}
export interface RunResponse {
  question_id: number
  question_type: QuestionType
  status: SubmissionStatus
  runtime_ms: number | null
  message: string | null
  sql: { correct: boolean; expected: ResultTable | null; actual: ResultTable | null } | null
  code: { passed: number; total: number; cases: CaseResult[]; compile_error: string | null } | null
}
export interface AnswerEvaluation {
  score: number
  passed: boolean
  dimensions: Record<string, number>
  matched_concepts: string[]
  missing_concepts: string[]
  feedback: string[]
}
export interface SubmitResult {
  attempt_id: number
  question_id: number
  question_type: QuestionType
  is_correct: boolean
  score: number
  attempt_number: number
  correct_option_ids: number[] | null
  explanation: string | null
  submission_id: number | null
  status: string | null
  run: RunResponse | null
  evaluation: AnswerEvaluation | null
  model_answer: string | null
  new_achievements: { code: string; name: string; description: string }[]
}
export interface Capabilities {
  coding: boolean
  shortAnswer: boolean
}

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED'
export type AttemptMode = 'PRACTICE' | 'ASSESSMENT' | 'MOCK_INTERVIEW'

export interface AssessmentSummary {
  id: number
  title: string
  description: string
  duration_minutes: number
  difficulty: Difficulty
  is_published: boolean
  question_count: number
  total_points: number
  categories: string[]
  in_progress_attempt_id: number | null
  best_percentage: number | null
}
export interface AssessmentDetail extends AssessmentSummary {
  category_counts: Record<string, number>
  type_counts: Record<string, number>
}

export interface AttemptQuestion {
  position: number
  points: number
  question: QuestionDetail
}
export interface SavedAnswer {
  question_id: number
  selected_option_ids: number[] | null
  text_answer: string | null
  language: string | null
  time_taken_seconds: number | null
}
export interface AttemptState {
  attempt_id: number
  assessment_id: number | null
  title: string
  status: AttemptStatus
  started_at: string
  deadline: string | null
  server_time: string
  remaining_seconds: number
  questions: AttemptQuestion[]
  answers: SavedAnswer[]
  mode: AttemptMode
  config: Record<string, unknown> | null
}
export interface SaveAck {
  saved_at: string
  remaining_seconds: number
}

export interface BreakdownItem {
  key: string
  correct: number
  total: number
  points_earned: number
  points_max: number
  percentage: number
}
export interface ResultQuestion {
  question_id: number
  position: number
  title: string
  category: string
  difficulty: Difficulty
  question_type: QuestionType
  points: number
  answered: boolean
  graded: boolean
  is_correct: boolean | null
  score: number | null
  points_earned: number | null
  selected_option_ids: number[] | null
  correct_option_ids: number[] | null
  text_answer: string | null
  explanation: string | null
  time_taken_seconds: number | null
  run: RunResponse | null
  evaluation: AnswerEvaluation | null
  model_answer: string | null
}
export interface AttemptResult {
  attempt_id: number
  assessment_id: number | null
  assessment_title: string
  status: AttemptStatus
  started_at: string
  submitted_at: string | null
  time_taken_seconds: number | null
  score: number
  max_score: number
  percentage: number
  total_questions: number
  answered_count: number
  ungraded_count: number
  by_category: BreakdownItem[]
  by_difficulty: BreakdownItem[]
  questions: ResultQuestion[]
}
export interface AttemptSummary {
  attempt_id: number
  assessment_id: number | null
  assessment_title: string | null
  mode: AttemptMode
  status: AttemptStatus
  started_at: string
  submitted_at: string | null
  percentage: number | null
}

export interface MockOptions {
  roles: { key: string; label: string; focus: string[] }[]
  levels: { key: string; label: string; description: string }[]
  durations: { minutes: number; questions: number }[]
  includes: QuestionType[]
}
export interface MockStartBody {
  role: string
  level: string
  duration_minutes: number
  focus_weak_topics: boolean
}
export interface MockReport {
  attempt_id: number
  title: string
  role: string
  role_label: string
  level: string
  level_label: string
  duration_minutes: number
  status: AttemptStatus
  percentage: number
  band: string
  by_type: BreakdownItem[]
  strengths: string[]
  focus_areas: { category: string; label: string; reason: string }[]
  pace: { minutes_allowed: number; minutes_used: number; seconds_per_answered: number | null }
  next_steps: string[]
  disclaimer: string
  result: AttemptResult
}

export interface CountItem {
  key: string
  count: number
}
export interface PlatformStats {
  generated_at: string
  users: { total: number; active: number; admins: number; new_last_7_days: number; new_last_30_days: number }
  activity: { daily_active: number; weekly_active: number; monthly_active: number }
  questions: { total: number; published: number; by_category: CountItem[]; by_type: CountItem[]; by_difficulty: CountItem[] }
  assessments: { total: number; published: number; attempts_total: number }
  attempts: { last_30_days_by_mode: CountItem[]; assessments_completed: number; mock_interviews_completed: number }
  submissions: { total: number; last_24_hours: number; by_status: CountItem[] }
  answers_per_day: { date: string; answered: number; correct: number }[]
  overall_accuracy: number | null
  lowest_accuracy_categories: { key: string; label: string; answered: number; accuracy: number }[]
}
export interface AdminUser {
  id: number
  name: string
  email: string
  role: Role
  is_active: boolean
  show_on_leaderboard: boolean
  created_at: string
  answered: number
  last_active: string | null
}
export interface SqlChallengeBody {
  schema_sql: string
  seed_sql: string
  solution_query: string
  order_matters: boolean
}
export interface ConceptBody {
  concept: string
  keywords: string[]
  weight: number
}
export interface ReferenceAnswerBody {
  model_answer: string
  concepts: ConceptBody[]
}
export interface AdminQuestion extends QuestionSummary {
  description: string
  starter_code: Record<string, string> | null
  examples: Record<string, unknown>[] | null
  constraints: string | null
  explanation: string | null
  created_by: number | null
  updated_at: string
  options: { id: number; text: string; is_correct: boolean; position: number }[]
  test_cases: { id: number; input_data: string; expected_output: string; is_sample: boolean }[]
  sql_challenge: SqlChallengeBody | null
  reference_answer: ReferenceAnswerBody | null
}
export interface AdminAssessmentQuestion {
  question_id: number
  position: number
  points: number
  title: string
  category: string
  difficulty: Difficulty
  question_type: QuestionType
}
export interface AdminAssessment extends AssessmentSummary {
  created_at: string
  updated_at: string
  attempt_count: number
  questions: AdminAssessmentQuestion[]
}
export interface AdminSubmission {
  id: number
  user_id: number
  user_name: string
  user_email: string
  question_id: number
  question_title: string
  language: string
  status: SubmissionStatus
  runtime_ms: number | null
  passed_tests: number | null
  total_tests: number | null
  attempt_number: number
  created_at: string
}
export interface AdminSubmissionDetail extends AdminSubmission {
  code: string
  result_detail: Record<string, unknown> | null
}
export interface AuditEntry {
  id: number
  admin_id: number | null
  admin_name: string | null
  action: string
  entity_type: string
  entity_id: number | null
  details: Record<string, unknown> | null
  created_at: string
}
export interface AdminCategory {
  key: string
  label: string
  total: number
  published: number
  by_difficulty: Record<string, number>
  by_type: Record<string, number>
}
