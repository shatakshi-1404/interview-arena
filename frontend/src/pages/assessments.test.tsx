import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { assessmentSummary, attemptResult, attemptState, mockOptions, mockReport, resultQuestion, sqlResultQuestion, detail } from '@/test/exam-fixtures'
import { mockApi, renderApp } from '@/test/utils'

vi.mock('@/components/code/CodeEditor', async () => {
  const { createElement } = await import('react')
  return { CodeEditor: (p: { value: string; ariaLabel?: string }) => createElement('textarea', { 'aria-label': p.ariaLabel, value: p.value, readOnly: true }) }
})

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

const attempt = (id: number, over: Record<string, unknown> = {}) => ({
  attempt_id: id, assessment_id: 3, assessment_title: 'Backend Basics', mode: 'ASSESSMENT', status: 'SUBMITTED',
  started_at: '2026-10-02T10:00:00Z', submitted_at: '2026-10-02T10:20:00Z', percentage: 82.5, ...over,
})
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 12 })

describe('assessments list', () => {
  it('shows resume and best-score states and your attempts', async () => {
    mockApi({
      'GET /api/assessments': page([
        assessmentSummary(3, 'Backend Basics', { best_percentage: 82.5 }),
        assessmentSummary(4, 'SQL Check', { in_progress_attempt_id: 9 }),
      ]),
      'GET /api/attempts': [attempt(7), attempt(9, { status: 'IN_PROGRESS', percentage: null, assessment_id: 4, assessment_title: 'SQL Check' })],
    })
    renderApp('/assessments')

    expect(await screen.findByRole('link', { name: 'Backend Basics' })).toHaveAttribute('href', '/assessments/3')
    expect(screen.getByText('Best: 82.5%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Details & start' })).toHaveAttribute('href', '/assessments/3')
    expect(screen.getAllByRole('link', { name: 'Resume' }).every((l) => l.getAttribute('href') === '/attempts/9')).toBe(true)
    expect(await screen.findByRole('link', { name: 'View result' })).toHaveAttribute('href', '/attempts/7/result')
  })

  it('explains an empty catalog', async () => {
    mockApi({ 'GET /api/assessments': page([]), 'GET /api/attempts': [] })
    renderApp('/assessments')
    expect(await screen.findByText('No assessments are published yet')).toBeInTheDocument()
  })
})

describe('assessment detail', () => {
  const info = { ...assessmentSummary(3, 'Backend Basics'), category_counts: { DSA: 6, SQL: 4 }, type_counts: { MCQ: 8, SQL: 2 } }

  it('lists the rules and starts an attempt, landing in the exam', async () => {
    const { calls } = mockApi({
      'GET /api/assessments/3': info,
      'GET /api/attempts': [],
      'POST /api/assessments/3/start': attemptState(),
      'GET /api/attempts/5': attemptState(),
    })
    renderApp('/assessments/3')
    expect(await screen.findByRole('heading', { name: 'Backend Basics' })).toBeInTheDocument()
    expect(screen.getByText(/The timer is enforced by the server/)).toBeInTheDocument()
    expect(screen.getByText('DSA · 6')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Start assessment' }))
    expect(await screen.findByRole('heading', { name: 'First question' })).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/assessments/3/start')).toBe(true)
  })

  it('offers Resume when an attempt is already in progress', async () => {
    mockApi({ 'GET /api/assessments/3': { ...info, in_progress_attempt_id: 5 }, 'GET /api/attempts': [] })
    renderApp('/assessments/3')
    expect(await screen.findByRole('link', { name: 'Resume assessment' })).toHaveAttribute('href', '/attempts/5')
  })

  it('shows a not-found state', async () => {
    mockApi({ 'GET /api/assessments/99': () => new Response(JSON.stringify({ detail: 'Assessment not found' }), { status: 404 }) })
    renderApp('/assessments/99')
    expect(await screen.findByText('Assessment not found')).toBeInTheDocument()
  })
})

describe('result page', () => {
  it('shows the score, breakdown and a reviewable list of questions', async () => {
    mockApi({
      'GET /api/attempts/5/result': attemptResult({ status: 'EXPIRED', ungraded_count: 1 }),
      'GET /api/questions/11': detail(11, 'First question'),
    })
    renderApp('/attempts/5/result')

    expect(await screen.findByRole('heading', { name: 'Backend Basics' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Score 33.3%' })).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText(/submitted automatically/)).toBeInTheDocument()
    expect(screen.getByText(/1 answer couldn't be graded/)).toBeInTheDocument()
    expect(screen.getAllByText('DSA').length).toBeGreaterThan(0)
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()

    const user = userEvent.setup()
    const [mcqReview, sqlReview] = screen.getAllByRole('button', { name: 'Review' })
    await user.click(mcqReview!)
    expect(await screen.findByText('First question B')).toBeInTheDocument()
    expect(screen.getByText('Your answer')).toBeInTheDocument()
    expect(screen.getByText('Correct answer')).toBeInTheDocument()
    expect(screen.getByText('Because B.')).toBeInTheDocument()

    await user.click(sqlReview!)
    expect(await screen.findByRole('table', { name: 'Expected result' })).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Your result' })).getByText('200')).toBeInTheDocument()
    expect(screen.getByText('SELECT MAX(salary) FROM employees')).toBeInTheDocument()
  })

  it('explains unanswered and ungraded questions', async () => {
    mockApi({
      'GET /api/attempts/5/result': attemptResult({
        questions: [
          resultQuestion({ answered: false, graded: true, is_correct: false, score: 0, points_earned: 0, selected_option_ids: null }),
          { ...sqlResultQuestion(), graded: false, score: null, points_earned: null, is_correct: null, run: null },
        ],
      }),
    })
    renderApp('/attempts/5/result')
    const user = userEvent.setup()
    const [first, second] = await screen.findAllByRole('button', { name: 'Review' })
    await user.click(first!)
    expect(screen.getByText("You didn't answer this question.")).toBeInTheDocument()
    await user.click(second!)
    expect(screen.getByText(/couldn't be graded automatically on this server/)).toBeInTheDocument()
  })

  it('points to the attempt when it is still in progress', async () => {
    mockApi({ 'GET /api/attempts/5/result': () => new Response(JSON.stringify({ detail: 'This attempt is still in progress' }), { status: 409 }) })
    renderApp('/attempts/5/result')
    expect(await screen.findByText('This attempt is still in progress')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume attempt' })).toHaveAttribute('href', '/attempts/5')
  })
})

describe('mock interviews', () => {
  const setup = (extra: Record<string, unknown> = {}) =>
    mockApi({
      'GET /api/mock-interviews/options': mockOptions(),
      'GET /api/mock-interviews/current': null,
      'GET /api/attempts': [],
      ...extra,
    })

  it('starts an interview with the chosen settings and lands in it', async () => {
    const { calls } = setup({
      'POST /api/mock-interviews/start': attemptState({ mode: 'MOCK_INTERVIEW', assessment_id: null, title: 'Data Engineer mock interview (Advanced)' }),
      'GET /api/attempts/5': attemptState({ mode: 'MOCK_INTERVIEW', assessment_id: null }),
    })
    renderApp('/mock-interviews')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('radio', { name: /Data Engineer/ }))
    await user.click(screen.getByRole('radio', { name: /Advanced/ }))
    await user.click(screen.getByRole('button', { name: /45 min/ }))
    expect(screen.getByText(/Includes: MCQ, Short answer, SQL\./)).toBeInTheDocument()
    expect(screen.getByText(/Coding questions are left out/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start mock interview' }))

    expect(await screen.findByRole('heading', { name: 'First question' })).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/api/mock-interviews/start')?.body).toEqual({
      role: 'DATA_ENGINEER', level: 'ADVANCED', duration_minutes: 45, focus_weak_topics: true,
    })
  })

  it('defaults to a sensible interview and shows server errors', async () => {
    const { calls } = setup({
      'POST /api/mock-interviews/start': () => new Response(JSON.stringify({ detail: 'Not enough published questions to build this interview yet.' }), { status: 409 }),
    })
    renderApp('/mock-interviews')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Start mock interview' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough published questions')
    expect(calls.find((c) => c.path === '/api/mock-interviews/start')?.body).toEqual({
      role: 'BACKEND_ENGINEER', level: 'INTERMEDIATE', duration_minutes: 30, focus_weak_topics: true,
    })
  })

  it('offers to resume an interview in progress instead of the form', async () => {
    setup({ 'GET /api/mock-interviews/current': attemptState({ mode: 'MOCK_INTERVIEW', title: 'Backend Engineer mock interview (Intermediate)' }) })
    renderApp('/mock-interviews')
    expect(await screen.findByRole('link', { name: 'Resume interview' })).toHaveAttribute('href', '/attempts/5')
    expect(screen.queryByRole('button', { name: 'Start mock interview' })).not.toBeInTheDocument()
  })

  it('lists past interviews with a link to the report', async () => {
    setup({ 'GET /api/attempts': [attempt(8, { mode: 'MOCK_INTERVIEW', assessment_id: null, assessment_title: 'Backend Engineer mock interview (Beginner)', percentage: 70 }), attempt(7)] })
    renderApp('/mock-interviews')
    expect(await screen.findByRole('link', { name: 'View report' })).toHaveAttribute('href', '/mock-interviews/8/report')
    expect(screen.queryByText('Backend Basics')).not.toBeInTheDocument() // assessments are not listed here
  })
})

describe('mock report', () => {
  it('shows the band, pace, focus areas, next steps and the disclaimer', async () => {
    mockApi({ 'GET /api/mock-interviews/5/report': mockReport() })
    renderApp('/mock-interviews/5/report')

    expect(await screen.findByText('Mock interview report')).toBeInTheDocument()
    expect(screen.getByText('Solid')).toBeInTheDocument()
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument()
    expect(screen.getByText('Used 14.5 of 30 minutes.')).toBeInTheDocument()
    expect(screen.getByText('About 97 seconds per answered question.')).toBeInTheDocument()
    expect(screen.getByText(/You answered 0 of 2 OS questions correctly in this interview\./, { selector: 'li span' })).toBeInTheDocument()
    expect(screen.getByText(/does not predict interview or hiring outcomes/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(2)
  })

  it('points to the interview when it is not finished', async () => {
    mockApi({ 'GET /api/mock-interviews/5/report': () => new Response(JSON.stringify({ detail: 'still going' }), { status: 409 }) })
    renderApp('/mock-interviews/5/report')
    expect(await screen.findByText('This interview is still in progress')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Resume interview' })).toHaveAttribute('href', '/attempts/5')
  })
})
