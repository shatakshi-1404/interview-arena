import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { mockApi, renderApp } from '@/test/utils'

// Monaco can't run in jsdom: swap the single wrapper for a textarea. Everything else is the real code.
vi.mock('@/components/code/CodeEditor', async () => {
  const { createElement } = await import('react')
  return {
    CodeEditor: (p: { value: string; onChange: (v: string) => void; ariaLabel?: string }) =>
      createElement('textarea', { 'aria-label': p.ariaLabel ?? 'Code editor', value: p.value, onChange: (e: { target: { value: string } }) => p.onChange(e.target.value) }),
  }
})

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

const detail = (over: Record<string, unknown> = {}) => ({
  id: 7, title: 'Binary search complexity', category: 'DSA', difficulty: 'EASY', question_type: 'MCQ', time_limit: 60,
  tags: ['searching'], is_published: true, created_at: '2026-10-01T00:00:00Z', user_status: null,
  description: 'What is the time complexity of binary search on `n` items?', starter_code: null, examples: null, constraints: null,
  options: [{ id: 1, text: 'O(n)' }, { id: 2, text: 'O(log n)' }], sample_test_cases: [], multiple_answers: false, ...over,
})
const result = (over: Record<string, unknown> = {}) => ({
  attempt_id: 1, question_id: 7, question_type: 'MCQ', is_correct: true, score: 1, attempt_number: 1, correct_option_ids: [2],
  explanation: 'It halves the range every step.', submission_id: null, status: null, run: null, evaluation: null, model_answer: null,
  new_achievements: [], ...over,
})
const table = (columns: string[], rows: unknown[][]) => ({ columns, rows, truncated: false })

describe('MCQ', () => {
  it('submits a single answer and marks the right and wrong options', async () => {
    const { calls } = mockApi({
      'GET /api/questions/7': detail(),
      'POST /api/questions/7/submit': result({ is_correct: false, score: 0, correct_option_ids: [2], new_achievements: [{ code: 'FIRST_10', name: 'First 10 Problems', description: '' }] }),
    })
    renderApp('/practice/7')
    expect(await screen.findByRole('heading', { name: 'Binary search complexity' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2) // single-answer question: radios
    expect(screen.getByText('n').tagName).toBe('CODE') // `inline code` is highlighted, not left as backticks

    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled()
    await user.click(screen.getByLabelText('O(n)'))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))

    expect(await screen.findByText('Not quite')).toBeInTheDocument()
    expect(screen.getByText('Correct answer')).toBeInTheDocument()
    expect(screen.getByText('Your answer (incorrect)')).toBeInTheDocument()
    expect(screen.getByText('It halves the range every step.')).toBeInTheDocument()
    expect(await screen.findByText('Achievement unlocked: First 10 Problems')).toBeInTheDocument()
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())

    const body = calls.find((c) => c.method === 'POST')?.body as { selected_option_ids: number[]; time_taken_seconds: number }
    expect(body.selected_option_ids).toEqual([1])
    expect(typeof body.time_taken_seconds).toBe('number')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled()
  })

  it('uses checkboxes for multi-answer questions and sends every pick', async () => {
    const { calls } = mockApi({
      'GET /api/questions/7': detail({ multiple_answers: true, options: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }, { id: 3, text: 'C' }] }),
      'POST /api/questions/7/submit': result({ correct_option_ids: [1, 2] }),
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    expect(await screen.findAllByRole('checkbox')).toHaveLength(3)
    await user.click(screen.getByLabelText('A'))
    await user.click(screen.getByLabelText('B'))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByText('Correct')).toBeInTheDocument()
    expect((calls.find((c) => c.method === 'POST')?.body as { selected_option_ids: number[] }).selected_option_ids).toEqual([1, 2])
  })

  it('shows the server error and lets the user retry', async () => {
    mockApi({
      'GET /api/questions/7': detail(),
      'POST /api/questions/7/submit': () => new Response(JSON.stringify({ detail: 'One or more selected options do not belong to this question' }), { status: 422 }),
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    await user.click(await screen.findByLabelText('O(n)'))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('do not belong to this question')
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeEnabled()
  })
})

describe('not found', () => {
  it('explains a missing question', async () => {
    mockApi({ 'GET /api/questions/99': () => new Response(JSON.stringify({ detail: 'Question not found' }), { status: 404 }) })
    renderApp('/practice/99')
    expect(await screen.findByText('Question not found')).toBeInTheDocument()
  })
})

describe('SQL', () => {
  const sqlQ = detail({ question_type: 'SQL', category: 'SQL', options: [], title: 'Second highest salary', description: 'Return the second highest salary from `employees`.' })
  const wrongRun = {
    question_id: 7, question_type: 'SQL', status: 'WRONG_ANSWER', runtime_ms: 3, message: null,
    sql: { correct: false, expected: table(['second_highest'], [[100]]), actual: table(['max'], [[200]]) }, code: null,
  }

  it('runs a query and shows expected vs your result with execution time', async () => {
    const { calls } = mockApi({ 'GET /api/questions/7': sqlQ, 'POST /api/questions/7/run': wrongRun })
    renderApp('/practice/7')
    const user = userEvent.setup()
    const editor = await screen.findByLabelText('SQL editor')
    await user.clear(editor)
    await user.type(editor, 'SELECT MAX(salary) FROM employees')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(await screen.findByRole('table', { name: 'Expected result' })).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Your result' })).getByText('200')).toBeInTheDocument()
    expect(screen.getByText('Execution time: 3 ms')).toBeInTheDocument()
    expect(screen.getByText('Wrong answer')).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/api/questions/7/run')?.body).toEqual({ code: 'SELECT MAX(salary) FROM employees' })
  })

  it('submits and shows the summary; a query error is shown plainly', async () => {
    mockApi({
      'GET /api/questions/7': sqlQ,
      'POST /api/questions/7/submit': result({
        question_type: 'SQL', is_correct: false, score: 0, correct_option_ids: null, explanation: null, status: 'RUNTIME_ERROR',
        run: { question_id: 7, question_type: 'SQL', status: 'RUNTIME_ERROR', runtime_ms: null, message: 'Only SELECT queries are allowed', sql: null, code: null },
      }),
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    const editor = await screen.findByLabelText('SQL editor')
    await user.clear(editor)
    await user.type(editor, 'DROP TABLE employees')
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Not quite')).toBeInTheDocument()
    expect(screen.getByText('Only SELECT queries are allowed')).toBeInTheDocument()
    expect(screen.getAllByText(/Runtime error/).length).toBeGreaterThan(0)
  })

  it('will not run an empty or comment-only query', async () => {
    const { calls } = mockApi({ 'GET /api/questions/7': sqlQ })
    renderApp('/practice/7')
    await screen.findByLabelText('SQL editor')
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled() // starter text is only a comment
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('keeps a draft in sessionStorage', async () => {
    mockApi({ 'GET /api/questions/7': sqlQ })
    const first = renderApp('/practice/7')
    const editor = await screen.findByLabelText('SQL editor')
    await userEvent.setup().type(editor, 'SELECT 1')
    first.unmount()
    renderApp('/practice/7')
    expect(await screen.findByLabelText('SQL editor')).toHaveValue('-- Write a single SELECT query\nSELECT 1')
  })
})

describe('coding', () => {
  const codingQ = detail({
    question_type: 'CODING', options: [], title: 'Max subarray',
    starter_code: { python: 'print(0)', java: 'class Main {}' },
    examples: [{ input: '3\n1 2 3', output: '6', explanation: 'Whole array.' }],
    constraints: '1 <= n <= 100000',
    sample_test_cases: [{ input_data: '1\n1', expected_output: '1' }],
  })

  it('explains that execution is unavailable and keeps the editor usable', async () => {
    const { calls } = mockApi({ 'GET /api/questions/7': codingQ }) // default capabilities: no CODING
    renderApp('/practice/7')
    expect(await screen.findByText(/Code execution isn't enabled on this server/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    expect(screen.getByLabelText('python code editor')).toHaveValue('print(0)')
    expect(screen.getByText('Whole array.')).toBeInTheDocument() // examples render
    expect(screen.getByText('1 <= n <= 100000')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('switches language, keeping separate drafts', async () => {
    mockApi({ 'GET /api/questions/7': codingQ })
    renderApp('/practice/7')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('python code editor'), '#x')
    await user.selectOptions(screen.getByLabelText('Language'), 'java')
    expect(screen.getByLabelText('java code editor')).toHaveValue('class Main {}')
    await user.selectOptions(screen.getByLabelText('Language'), 'python')
    expect(screen.getByLabelText('python code editor')).toHaveValue('print(0)#x')
  })

  it('submits with a language and shows per-test results without leaking hidden tests', async () => {
    const { calls } = mockApi({
      'GET /api/mock-interviews/options': { includes: ['MCQ', 'SQL', 'CODING'] },
      'GET /api/questions/7': codingQ,
      'POST /api/questions/7/submit': result({
        question_type: 'CODING', is_correct: false, score: 0.5, correct_option_ids: null, explanation: null, status: 'WRONG_ANSWER',
        run: {
          question_id: 7, question_type: 'CODING', status: 'WRONG_ANSWER', runtime_ms: 7, message: null, sql: null,
          code: { passed: 1, total: 2, compile_error: null, cases: [
            { index: 0, is_sample: true, passed: true, input_data: '1\n1', expected_output: '1', actual_output: '1', error: null, runtime_ms: 2 },
            { index: 1, is_sample: false, passed: false, input_data: null, expected_output: null, actual_output: null, error: null, runtime_ms: 3 },
          ] },
        },
      }),
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    await screen.findByLabelText('python code editor')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Partly correct (50%)')).toBeInTheDocument()
    expect(screen.getByText('Passed 1 of 2 tests')).toBeInTheDocument()
    expect(screen.getByText('Test 2 · hidden')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ code: 'print(0)', language: 'python' })
  })

  it('tells the user when the server refuses with 503', async () => {
    mockApi({
      'GET /api/mock-interviews/options': { includes: ['CODING'] },
      'GET /api/questions/7': codingQ,
      'POST /api/questions/7/run': () => new Response(JSON.stringify({ detail: 'Code execution is not enabled on this server' }), { status: 503 }),
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    await screen.findByLabelText('python code editor')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not enabled on this server/)
  })
})

describe('short answer', () => {
  const shortQ = detail({ question_type: 'SHORT_ANSWER', options: [], title: 'Explain deadlock', description: 'What is a deadlock?' })

  it('shows the evaluation with matched and missing concepts and the model answer', async () => {
    const { calls } = mockApi({
      'GET /api/questions/7': shortQ,
      'POST /api/questions/7/submit': result({
        question_type: 'SHORT_ANSWER', is_correct: false, score: 0.42, correct_option_ids: null, model_answer: 'Processes wait in a circular wait.',
        evaluation: {
          score: 0.42, passed: false, dimensions: { coverage: 0.5, similarity: 0.4, completeness: 0.6, clarity: 0.8 },
          matched_concepts: ['mutual exclusion'], missing_concepts: ['circular wait'], feedback: ['Consider mentioning: circular wait.'],
        },
      }),
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    const box = await screen.findByLabelText('Your answer')
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled()
    await user.type(box, 'Resources are held by one process at a time.')
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))

    expect(await screen.findByText('Needs more detail (42%)')).toBeInTheDocument()
    expect(screen.getByText('Concept coverage')).toBeInTheDocument()
    expect(screen.getByText('mutual exclusion')).toBeInTheDocument()
    expect(screen.getByText('circular wait')).toBeInTheDocument()
    expect(screen.getByText('Consider mentioning: circular wait.')).toBeInTheDocument()
    expect(screen.getByText('Processes wait in a circular wait.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ text_answer: 'Resources are held by one process at a time.' })
  })

  it('disables submission when scoring is off on the server', async () => {
    mockApi({ 'GET /api/questions/7': shortQ, 'GET /api/mock-interviews/options': { includes: ['MCQ', 'SQL'] } })
    renderApp('/practice/7')
    expect(await screen.findByText(/Short-answer scoring is turned off/)).toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Your answer'), 'some answer')
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled()
  })
})
