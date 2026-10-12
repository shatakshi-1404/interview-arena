import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { qSummary } from '@/test/admin-fixtures'
import { ada, mockApi, renderApp } from '@/test/utils'

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

const admin = { ...ada, id: 9, name: 'Admin Root', email: 'admin@example.com', role: 'ADMIN' }
const on = { enabled: true, daily_limit: 30, used_today: 0 }
const detail = (over: Record<string, unknown> = {}) => ({
  id: 7, title: 'Binary search complexity', category: 'DSA', difficulty: 'EASY', question_type: 'MCQ', time_limit: 60,
  tags: [], is_published: true, ai_generated: false, created_at: '2026-10-01T00:00:00Z', user_status: null,
  description: 'What is the complexity?', starter_code: null, examples: null, constraints: null,
  options: [{ id: 1, text: 'O(n)' }, { id: 2, text: 'O(log n)' }], sample_test_cases: [], multiple_answers: false, ...over,
})

describe('hints', () => {
  it('is hidden when the server has no AI configured', async () => {
    mockApi({ 'GET /api/questions/7': detail(), 'GET /api/ai/status': { ...on, enabled: false } })
    renderApp('/practice/7')
    await screen.findByRole('heading', { name: 'Binary search complexity' })
    await waitFor(() => expect(screen.queryByRole('button', { name: /hint/i })).not.toBeInTheDocument())
  })

  it('shows hints one by one with their level and escalates the button label', async () => {
    let n = 0
    mockApi({
      'GET /api/questions/7': detail(),
      'GET /api/ai/status': on,
      'POST /api/questions/7/hint': () => ({ hint: `hint number ${++n}`, level: n, max_level: 3, model: 'm' }),
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Give me a hint' }))
    expect(await screen.findByText('hint number 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stronger hint' }))
    expect(await screen.findByText('hint number 2')).toBeInTheDocument()
    expect(screen.getByText('Hint 2/3')).toBeInTheDocument()
  })

  it('shows the server message when the daily limit is hit', async () => {
    mockApi({
      'GET /api/questions/7': detail(), 'GET /api/ai/status': on,
      'POST /api/questions/7/hint': () => new Response(JSON.stringify({ detail: 'You have used your 30 AI requests for today.' }), { status: 429 }),
    })
    renderApp('/practice/7')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Give me a hint' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('used your 30 AI requests')
  })

  it('labels AI-drafted questions', async () => {
    mockApi({ 'GET /api/questions/7': detail({ ai_generated: true }), 'GET /api/ai/status': on })
    renderApp('/practice/7')
    expect(await screen.findByText('AI-drafted, admin-reviewed')).toBeInTheDocument()
  })
})

describe('AI feedback on short answers', () => {
  const short = detail({ question_type: 'SHORT_ANSWER', options: [] })
  const ev = { score: 0.7, passed: false, dimensions: { coverage: 0.5 }, matched_concepts: ['a'], missing_concepts: ['b'], feedback: [] }
  const submitted = {
    attempt_id: 1, question_id: 7, question_type: 'SHORT_ANSWER', is_correct: false, score: 0.7, attempt_number: 1,
    evaluation: ev, model_answer: 'Model', explanation: null, new_achievements: [],
  }

  it('shows the LLM comments next to the TF-IDF evaluation', async () => {
    mockApi({
      'GET /api/questions/7': short, 'GET /api/ai/status': on, 'POST /api/questions/7/submit': submitted,
      'POST /api/questions/7/ai-feedback': {
        tfidf: ev, model: 'm1', cached: false, created_at: '2026-10-10T00:00:00Z',
        ai: { summary: 'Good start.', strengths: ['clear'], gaps: ['no example'], next_step: 'Add an example.' },
      },
    })
    renderApp('/practice/7')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Your answer'), 'something')
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    await user.click(await screen.findByRole('button', { name: 'Get AI feedback' }))
    expect(await screen.findByText('Good start.')).toBeInTheDocument()
    expect(screen.getByText('no example')).toBeInTheDocument()
    expect(screen.getByText(/deterministic keyword\/TF-IDF one/)).toBeInTheDocument()
    expect(screen.getByText('Concept coverage')).toBeInTheDocument()
  })

  it('does not offer AI feedback when AI is off', async () => {
    mockApi({ 'GET /api/questions/7': short, 'GET /api/ai/status': { ...on, enabled: false }, 'POST /api/questions/7/submit': submitted })
    renderApp('/practice/7')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Your answer'), 'something')
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    await screen.findByText('Concept coverage')
    expect(screen.queryByRole('button', { name: 'Get AI feedback' })).not.toBeInTheDocument()
  })
})

describe('admin generator and review', () => {
  const api = (h: Record<string, unknown>) => mockApi({ 'GET /api/auth/me': admin, ...h })

  it('generates drafts, lists rejected ones with reasons and approves a draft', async () => {
    const draft = qSummary(31, 'Why sorted input', { is_published: false, ai_generated: true })
    const { calls } = api({
      'GET /api/ai/status': on,
      'POST /api/admin/ai/generate-questions': { model: 'm1', drafts: [draft], skipped: [{ title: 'Bad one', reason: 'MCQ needs at least 1 correct option' }] },
      'POST /api/admin/questions/31/approve': { ...draft, is_published: true },
    })
    renderApp('/admin/generate')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Topic'), 'binary search')
    await user.click(screen.getByRole('button', { name: /generate/i }))
    expect(await screen.findByText('Why sorted input')).toBeInTheDocument()
    expect(screen.getByText(/MCQ needs at least 1 correct option/)).toBeInTheDocument()
    const body = calls.find((c) => c.path === '/api/admin/ai/generate-questions')?.body as Record<string, unknown>
    expect(body).toMatchObject({ topic: 'binary search', category: 'DSA', difficulty: 'MEDIUM', question_type: 'MCQ', count: 3 })

    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Published')).toBeInTheDocument()
  })

  it('warns and disables Generate when AI is not configured', async () => {
    api({ 'GET /api/ai/status': { ...on, enabled: false } })
    renderApp('/admin/generate')
    expect(await screen.findByText(/AI is not configured on this server/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })

  it('filters the question list to AI drafts and approves from there', async () => {
    const draft = qSummary(31, 'Why sorted input', { is_published: false, ai_generated: true })
    const { calls } = api({
      'GET /api/admin/questions': { items: [draft], total: 1, page: 1, page_size: 20 },
      'POST /api/admin/questions/31/approve': { ...draft, is_published: true },
    })
    renderApp('/admin/questions?review=1')
    expect(await screen.findByText('Why sorted input')).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/api/admin/questions')?.search).toContain('ai_generated=true')
    expect(calls.find((c) => c.path === '/api/admin/questions')?.search).toContain('is_published=false')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Approve Why sorted input' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/admin/questions/31/approve')).toBe(true))
  })
})
