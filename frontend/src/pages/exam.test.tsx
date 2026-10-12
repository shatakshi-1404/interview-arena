import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { attemptResult, attemptState, detail, mockReport } from '@/test/exam-fixtures'
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

const SLOW = { timeout: 3000 }
const ack = { saved_at: '2026-10-03T10:01:00Z', remaining_seconds: 1490 }
const base = (over: Record<string, unknown> = {}) => ({
  'GET /api/attempts/5': attemptState(over),
  'PUT /api/attempts/5/answers/11': ack,
  'PUT /api/attempts/5/answers/12': ack,
  'POST /api/attempts/5/submit': attemptResult(),
  'GET /api/attempts/5/result': attemptResult(),
})

describe('exam shell', () => {
  it('shows the timer and navigator, autosaves an answer and marks it answered', async () => {
    const { calls } = mockApi(base())
    renderApp('/attempts/5')

    expect(await screen.findByRole('heading', { name: 'First question' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent(/2[45]:\d\d/) // ~25:00 from remaining_seconds
    expect(screen.getByText('0 of 2 answered')).toBeInTheDocument()
    expect(screen.getByText('Answers save automatically')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByLabelText('First question B'))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true), SLOW)
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.path).toBe('/api/attempts/5/answers/11')
    expect(put.body).toMatchObject({ selected_option_ids: [112] })
    expect(await screen.findByText('All changes saved', {}, SLOW)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeInTheDocument()
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument()
  })

  it('moves between questions; typing SQL marks it answered without a Run button', async () => {
    mockApi(base())
    renderApp('/attempts/5')
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'First question' })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('heading', { name: 'Second question' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 2, not answered' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('SQL editor'), 'SELECT 1')
    expect(screen.getByRole('button', { name: 'Question 2, answered' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByRole('heading', { name: 'First question' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('restores saved answers when you come back', async () => {
    mockApi(base({ answers: [{ question_id: 11, selected_option_ids: [111], text_answer: null, language: null, time_taken_seconds: 5 }] }))
    renderApp('/attempts/5')
    expect(await screen.findByLabelText('First question A')).toBeChecked()
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument()
  })

  it('confirms before submitting, saves unsaved answers first, then shows the result', async () => {
    const { calls } = mockApi(base())
    renderApp('/attempts/5')
    const user = userEvent.setup()
    await user.click(await screen.findByLabelText('First question B'))
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    const dialog = await screen.findByRole('dialog', { name: 'Submit assessment?' })
    expect(within(dialog).getByText("You've answered 1 of 2 questions.")).toBeInTheDocument()
    expect(within(dialog).getByText('1 unanswered question will score zero.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Keep working' })) // cancel first: nothing is submitted
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.some((c) => c.path === '/api/attempts/5/submit')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Submit now' }))

    expect(await screen.findByText('Assessment result', {}, SLOW)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Score 33.3%' })).toBeInTheDocument()
    const put = calls.findIndex((c) => c.method === 'PUT')
    const post = calls.findIndex((c) => c.path === '/api/attempts/5/submit')
    expect(put).toBeGreaterThan(-1)
    expect(put).toBeLessThan(post)
  })

  it('keeps you in the exam and offers a retry when submitting fails', async () => {
    let tries = 0
    mockApi({
      ...base(),
      'POST /api/attempts/5/submit': () => (++tries === 1 ? new Response('{}', { status: 500 }) : attemptResult()),
    })
    renderApp('/attempts/5')
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'First question' })
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Submit now' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Something went wrong on our side')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit now' }))
    expect(await screen.findByText('Assessment result', {}, SLOW)).toBeInTheDocument()
  })

  it('submits by itself when time is up', async () => {
    const { calls } = mockApi(base({ remaining_seconds: 0 }))
    renderApp('/attempts/5')
    expect(await screen.findByText('Assessment result', {}, SLOW)).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/api/attempts/5/submit')).toBe(true)
  })

  it('goes to the result when the server says the attempt is over (409 on autosave)', async () => {
    mockApi({
      ...base(),
      'PUT /api/attempts/5/answers/11': () => new Response(JSON.stringify({ detail: 'Time is up. Your attempt was submitted automatically.' }), { status: 409 }),
    })
    renderApp('/attempts/5')
    await userEvent.setup().click(await screen.findByLabelText('First question B'))
    expect(await screen.findByText('Assessment result', {}, SLOW)).toBeInTheDocument()
  })

  it('redirects a finished attempt to its result', async () => {
    mockApi({ ...base({ status: 'SUBMITTED', questions: [] }) })
    renderApp('/attempts/5')
    expect(await screen.findByText('Assessment result', {}, SLOW)).toBeInTheDocument()
  })

  it('sends mock interviews to their report', async () => {
    mockApi({
      ...base({ mode: 'MOCK_INTERVIEW', assessment_id: null, config: { role: 'BACKEND_ENGINEER' } }),
      'GET /api/mock-interviews/5/report': mockReport(),
    })
    renderApp('/attempts/5')
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'First question' })
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByRole('dialog', { name: 'Submit interview?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Submit now' }))
    expect(await screen.findByText('Mock interview report', {}, SLOW)).toBeInTheDocument()
  })

  it('warns that coding will not be scored when no runner is enabled', async () => {
    mockApi(base({
      questions: [{ position: 0, points: 2, question: detail(13, 'Write code', { question_type: 'CODING', options: [], starter_code: { python: 'print(0)' } }) }],
    }))
    renderApp('/attempts/5')
    expect(await screen.findByText(/Code execution isn't enabled on this server/)).toBeInTheDocument()
  })

  it('shows a not-found page for an unknown attempt', async () => {
    mockApi({ 'GET /api/attempts/9': () => new Response(JSON.stringify({ detail: 'Attempt not found' }), { status: 404 }) })
    renderApp('/attempts/9')
    expect(await screen.findByText('Attempt not found')).toBeInTheDocument()
  })
})
