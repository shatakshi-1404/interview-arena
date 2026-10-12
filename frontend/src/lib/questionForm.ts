import type { AdminQuestion, Difficulty, QuestionType } from '@/types/api'

export interface OptionRow {
  text: string
  is_correct: boolean
}
export interface ExampleRow {
  input: string
  output: string
  explanation: string
}
export interface TestCaseRow {
  input_data: string
  expected_output: string
  is_sample: boolean
}
export interface ConceptRow {
  concept: string
  keywords: string // comma or newline separated
  weight: string
}

export interface QuestionForm {
  title: string
  description: string
  category: string
  difficulty: Difficulty
  question_type: QuestionType
  time_limit: string // seconds, blank = none
  tags: string // comma separated
  constraints: string
  explanation: string
  is_published: boolean
  options: OptionRow[]
  starter_python: string
  starter_java: string
  examples: ExampleRow[]
  test_cases: TestCaseRow[]
  schema_sql: string
  seed_sql: string
  solution_query: string
  order_matters: boolean
  model_answer: string
  concepts: ConceptRow[]
}

export const PYTHON_STARTER = 'import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: solve and print the answer\n\n\nmain()\n'
export const JAVA_STARTER =
  'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: solve and print the answer\n    }\n}\n'

export const emptyOption = (): OptionRow => ({ text: '', is_correct: false })
export const emptyExample = (): ExampleRow => ({ input: '', output: '', explanation: '' })
export const emptyTestCase = (): TestCaseRow => ({ input_data: '', expected_output: '', is_sample: false })
export const emptyConcept = (): ConceptRow => ({ concept: '', keywords: '', weight: '1' })

/** New questions start as drafts so nothing reaches learners before it is reviewed. */
export function emptyForm(type: QuestionType = 'MCQ'): QuestionForm {
  return {
    title: '', description: '', category: 'DSA', difficulty: 'EASY', question_type: type,
    time_limit: '', tags: '', constraints: '', explanation: '', is_published: false,
    options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
    starter_python: PYTHON_STARTER, starter_java: JAVA_STARTER, examples: [],
    test_cases: [{ ...emptyTestCase(), is_sample: true }],
    schema_sql: '', seed_sql: '', solution_query: '', order_matters: false,
    model_answer: '', concepts: [emptyConcept()],
  }
}

export const parseTags = (text: string): string[] => [
  ...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)),
]
export const parseKeywords = (text: string): string[] => [
  ...new Set(text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean)),
]

const str = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v))

export function formFromQuestion(q: AdminQuestion): QuestionForm {
  const base = emptyForm(q.question_type)
  return {
    ...base,
    title: q.title,
    description: q.description,
    category: q.category,
    difficulty: q.difficulty,
    time_limit: q.time_limit == null ? '' : String(q.time_limit),
    tags: q.tags.join(', '),
    constraints: q.constraints ?? '',
    explanation: q.explanation ?? '',
    is_published: q.is_published,
    options: q.question_type === 'MCQ' ? q.options.map((o) => ({ text: o.text, is_correct: o.is_correct })) : base.options,
    starter_python: q.starter_code?.python ?? '',
    starter_java: q.starter_code?.java ?? '',
    examples: (q.examples ?? []).map((e) => ({ input: str(e.input), output: str(e.output), explanation: str(e.explanation) })),
    test_cases:
      q.question_type === 'CODING'
        ? q.test_cases.map((t) => ({ input_data: t.input_data, expected_output: t.expected_output, is_sample: t.is_sample }))
        : base.test_cases,
    schema_sql: q.sql_challenge?.schema_sql ?? '',
    seed_sql: q.sql_challenge?.seed_sql ?? '',
    solution_query: q.sql_challenge?.solution_query ?? '',
    order_matters: q.sql_challenge?.order_matters ?? false,
    model_answer: q.reference_answer?.model_answer ?? '',
    concepts: q.reference_answer
      ? q.reference_answer.concepts.map((c) => ({ concept: c.concept, keywords: c.keywords.join(', '), weight: String(c.weight) }))
      : base.concepts,
  }
}

/** Mirrors the backend rules, so mistakes show up before a request is sent. */
export function validateForm(f: QuestionForm): Record<string, string> {
  const e: Record<string, string> = {}
  const title = f.title.trim()
  if (title.length < 3) e.title = 'Enter a title (at least 3 characters)'
  else if (title.length > 200) e.title = 'Use at most 200 characters'
  if (!f.description.trim()) e.description = 'Enter the question text'

  if (f.time_limit.trim() !== '') {
    const n = Number(f.time_limit)
    if (!Number.isInteger(n) || n <= 0 || n > 14400) e.time_limit = 'Use a whole number of seconds between 1 and 14400'
  }
  const tags = parseTags(f.tags)
  if (tags.length > 10) e.tags = 'Use at most 10 tags'
  else if (tags.some((t) => t.length > 50)) e.tags = 'Each tag must be 50 characters or fewer'

  switch (f.question_type) {
    case 'MCQ':
      if (f.options.some((o) => !o.text.trim())) e.options = 'Fill in or remove the empty options'
      else if (f.options.length < 2) e.options = 'Add at least 2 options'
      else if (f.options.length > 10) e.options = 'Use at most 10 options'
      else if (!f.options.some((o) => o.is_correct)) e.options = 'Mark at least one option as correct'
      break
    case 'CODING':
      if (!f.starter_python.trim() && !f.starter_java.trim()) e.starter_code = 'Provide starter code for at least one language'
      if (f.test_cases.length === 0) e.test_cases = 'Add at least one test case'
      else if (f.test_cases.length > 100) e.test_cases = 'Use at most 100 test cases'
      else if (f.test_cases.some((t) => !t.expected_output.trim())) e.test_cases = 'Every test case needs an expected output'
      else if (!f.test_cases.some((t) => t.is_sample)) e.test_cases = 'Mark at least one test case as a sample (shown to learners)'
      break
    case 'SQL':
      if (!f.schema_sql.trim()) e.schema_sql = 'Enter the schema (CREATE TABLE statements)'
      if (!f.seed_sql.trim()) e.seed_sql = 'Enter the seed data (INSERT statements)'
      if (!f.solution_query.trim()) e.solution_query = 'Enter the reference solution'
      break
    case 'SHORT_ANSWER':
      if (!f.model_answer.trim()) e.model_answer = 'Enter a model answer'
      if (f.concepts.length === 0) e.concepts = 'Add at least one concept'
      else if (f.concepts.some((c) => !c.concept.trim() || parseKeywords(c.keywords).length === 0))
        e.concepts = 'Every concept needs a name and at least one keyword'
      else if (f.concepts.some((c) => { const w = Number(c.weight); return !Number.isInteger(w) || w < 1 || w > 10 }))
        e.concepts = 'Concept weights are whole numbers from 1 to 10'
      break
  }
  return e
}

/** Only the data that belongs to the question's type is sent (the API rejects the rest). */
export function toPayload(f: QuestionForm, mode: 'create' | 'update'): Record<string, unknown> {
  const limit = f.time_limit.trim()
  const payload: Record<string, unknown> = {
    ...(mode === 'create' ? { question_type: f.question_type } : {}),
    title: f.title.trim(),
    description: f.description.trim(),
    category: f.category,
    difficulty: f.difficulty,
    time_limit: limit === '' ? null : Number(limit),
    tags: parseTags(f.tags),
    constraints: f.constraints.trim() || null,
    explanation: f.explanation.trim() || null,
    is_published: f.is_published,
  }
  switch (f.question_type) {
    case 'MCQ':
      payload.options = f.options.map((o) => ({ text: o.text.trim(), is_correct: o.is_correct }))
      break
    case 'CODING': {
      const starter: Record<string, string> = {}
      if (f.starter_python.trim()) starter.python = f.starter_python
      if (f.starter_java.trim()) starter.java = f.starter_java
      payload.starter_code = starter
      const examples = f.examples
        .filter((x) => x.input.trim() || x.output.trim())
        .map((x) => ({ input: x.input, output: x.output, ...(x.explanation.trim() ? { explanation: x.explanation.trim() } : {}) }))
      payload.examples = examples.length ? examples : null
      payload.test_cases = f.test_cases.map((t) => ({ input_data: t.input_data, expected_output: t.expected_output, is_sample: t.is_sample }))
      break
    }
    case 'SQL':
      payload.sql_challenge = {
        schema_sql: f.schema_sql, seed_sql: f.seed_sql, solution_query: f.solution_query, order_matters: f.order_matters,
      }
      break
    case 'SHORT_ANSWER':
      payload.reference_answer = {
        model_answer: f.model_answer.trim(),
        concepts: f.concepts.map((c) => ({ concept: c.concept.trim(), keywords: parseKeywords(c.keywords), weight: Number(c.weight) })),
      }
      break
  }
  return payload
}
