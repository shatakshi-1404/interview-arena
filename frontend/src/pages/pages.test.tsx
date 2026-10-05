import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { ada, day, mockApi, overview, renderApp, topic } from '@/test/utils'
import type { LeaderboardResponse, RecommendationList } from '@/types/api'

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

const rec = (id: number, title: string, reason: string) => ({
  id, priority: id, reason, created_at: '2026-10-02T00:00:00Z',
  question: { id: 100 + id, title, category: 'DSA', difficulty: 'MEDIUM' as const, question_type: 'MCQ' as const },
})

describe('dashboard', () => {
  it('shows stats, the skill heatmap with honest labels, and recommendations with reasons', async () => {
    mockApi({
      'GET /api/progress': overview(),
      'GET /api/progress/topics': {
        categories: [topic('DSA', 'DSA', 10, 90), topic('OS', 'OS', 6, 20), topic('SQL', 'SQL', 1, 100), topic('CN', 'CN', 0, null)],
        tags: [],
        weak_topics: [{ category: 'OS', label: 'OS', attempts: 6, accuracy: 20, recent_accuracy: 20, severity: 0.7, reasons: ['Your recent OS accuracy is 20%.'] }],
      },
      'GET /api/recommendations': { enabled: true, items: [rec(1, 'Deadlock basics', 'Your recent OS accuracy is 20%. Matched to your current level (Medium).')] },
    })
    renderApp('/dashboard')

    expect(await screen.findByRole('heading', { name: 'Welcome back, Ada' })).toBeInTheDocument()
    expect(await screen.findByText('3 days')).toBeInTheDocument()
    expect(screen.getByText('6 / 10')).toBeInTheDocument() // readiness not yet unlocked: no invented score

    expect(await screen.findByText('Strong')).toBeInTheDocument()
    expect(screen.getByText('Needs work')).toBeInTheDocument()
    expect(screen.getByText('Early data')).toBeInTheDocument() // 1 answer is not judged
    expect(screen.getByText('No data')).toBeInTheDocument()
    expect(await screen.findByText(/Needs attention:/)).toBeInTheDocument()

    expect(await screen.findByRole('link', { name: 'Deadlock basics' })).toHaveAttribute('href', '/practice/101')
    expect(screen.getByText(/Matched to your current level/)).toBeInTheDocument()
  })

  it('keeps working when one panel fails', async () => {
    mockApi({
      'GET /api/progress': overview(),
      'GET /api/progress/topics': () => new Response(JSON.stringify({ detail: 'boom' }), { status: 500 }),
      'GET /api/recommendations': { enabled: true, items: [] },
    })
    renderApp('/dashboard')
    expect(await screen.findByText('3 days')).toBeInTheDocument() // stats still render
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom/)
    expect(screen.getByText('Nothing to recommend yet')).toBeInTheDocument()
  })
})

describe('progress page', () => {
  const base = {
    'GET /api/progress': overview(),
    'GET /api/progress/topics': { categories: [topic('DSA', 'DSA', 5, 80)], tags: [topic('graphs', 'graphs', 3, 33)], weak_topics: [] },
    'GET /api/progress/activity': { days: [day('2026-09-30', 2, 1), day('2026-10-01', 0, 0)], current_streak: 1, longest_streak: 4, active_days: 1, total_answered: 2 },
  }

  it('explains readiness progress before there is enough data', async () => {
    mockApi({
      ...base,
      'GET /api/progress/readiness': {
        status: 'INSUFFICIENT_DATA', answered: 6, needed: 10, score: null, category: null, rubric_category: null, probabilities: {}, drivers: [],
        topics: [{ category: 'DSA', label: 'DSA', score: 70, attempts: 6, confidence: 'MEDIUM' }], strengths: [], weaknesses: [], recent_improvement: null,
        next_steps: ['Try a first question in: SQL, OS.'], disclaimer: 'Practice Readiness reflects how you perform on this platform. It is not a prediction of interview or job outcomes.',
        model: { type: 'Logistic regression', trained_on: 'Synthetic practice profiles', validated_against_real_outcomes: false, version: '1' },
      },
    })
    renderApp('/progress')
    expect(await screen.findByText(/unlocks after 10 answers/)).toBeInTheDocument()
    expect(screen.getByText('Try a first question in: SQL, OS.')).toBeInTheDocument()
    expect(screen.getByText(/not a prediction of interview or job outcomes/i)).toBeInTheDocument()
    expect(screen.getByText(/Not validated against real interview outcomes/)).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Performance by topic' })).toBeInTheDocument()
  })

  it('shows the score, category and what drives it once unlocked', async () => {
    mockApi({
      ...base,
      'GET /api/progress/readiness': {
        status: 'READY_TO_SCORE', answered: 40, needed: 10, score: 68.4, category: 'Developing', rubric_category: 'Developing',
        probabilities: { Developing: 0.7, 'Interview Ready': 0.2, 'Needs Practice': 0.1 },
        drivers: [{ feature: 'recent_accuracy', label: 'Recent accuracy', effect: 'raises' }, { feature: 'topic_coverage', label: 'Topic coverage', effect: 'lowers' }],
        topics: [], strengths: ['DSA'], weaknesses: [], recent_improvement: { window_days: 14, recent_accuracy: 80, previous_accuracy: 60, change_points: 20 },
        next_steps: ['Solid so far.'], disclaimer: 'Not a prediction.',
        model: { type: 'Logistic regression', trained_on: 'Synthetic practice profiles', validated_against_real_outcomes: false, version: '1' },
      },
    })
    renderApp('/progress')
    expect(await screen.findByRole('img', { name: 'Practice Readiness 68 out of 100' })).toBeInTheDocument()
    expect(screen.getByText('Developing')).toBeInTheDocument()
    expect(screen.getByText(/Recent accuracy: helping your estimate/)).toBeInTheDocument()
    expect(screen.getByText(/Topic coverage: holding it back/)).toBeInTheDocument()
    expect(screen.getByText(/60% → 80%/)).toBeInTheDocument()
  })
})

describe('recommendations page', () => {
  it('lists reasons and dismisses one', async () => {
    const after: RecommendationList = { enabled: true, items: [rec(2, 'Two pointers', 'You haven\'t practiced DSA yet.')] }
    const { calls } = mockApi({
      'GET /api/recommendations': { enabled: true, items: [rec(1, 'Deadlock basics', 'Your recent OS accuracy is 20%.'), after.items[0]] },
      'POST /api/recommendations/1/dismiss': after,
    })
    renderApp('/recommendations')
    expect(await screen.findByText('Your recent OS accuracy is 20%.')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss recommendation: Deadlock basics' }))
    await waitFor(() => expect(screen.queryByText('Deadlock basics')).not.toBeInTheDocument())
    expect(screen.getByText('Two pointers')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/recommendations/1/dismiss')).toBe(true)
  })

  it('explains when personalization is off', async () => {
    mockApi({ 'GET /api/recommendations': { enabled: false, items: [] } })
    renderApp('/recommendations')
    expect(await screen.findByText('Personalization is turned off')).toBeInTheDocument()
  })
})

describe('leaderboard page', () => {
  const board = (period: string, optedIn = true): LeaderboardResponse => ({
    period: period as LeaderboardResponse['period'], period_start: '2026-09-28T00:00:00Z', period_end: '2026-10-05T00:00:00Z',
    opted_in: optedIn, participants: 12,
    entries: [
      { rank: 1, name: 'Grace H.', problems: 9, accuracy: 90, points: 180, is_you: false },
      { rank: 2, name: 'Ada L.', problems: 5, accuracy: 80, points: 90, is_you: true },
    ],
    me: { rank: 2, name: 'Ada L.', problems: 5, accuracy: 80, points: 90, is_you: true },
    scoring: '10, 20 or 30 points for the first correct answer to each question.',
  })

  it('shows rankings, highlights you, and switches period', async () => {
    const { calls } = mockApi({ 'GET /api/leaderboard': ({ url }: { url: URL }) => board(url.searchParams.get('period') ?? 'weekly') })
    renderApp('/leaderboard')

    const table = await screen.findByRole('table', { name: 'Weekly leaderboard' })
    expect(within(table).getByText('Grace H.')).toBeInTheDocument()
    expect(within(table).getByText('You')).toBeInTheDocument()
    expect(screen.queryByText(/ada@example.com/)).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Monthly' }))
    expect(await screen.findByRole('table', { name: 'Monthly leaderboard' })).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/api/leaderboard' && c.search.includes('period=monthly'))).toBe(true)
  })

  it('lets you opt out', async () => {
    const { calls } = mockApi({
      'GET /api/leaderboard': board('weekly'),
      'PATCH /api/users/me': { ...ada, show_on_leaderboard: false },
    })
    renderApp('/leaderboard')
    const toggle = await screen.findByRole('switch', { name: 'Show me on the leaderboard' })
    expect(toggle).toBeChecked()
    await userEvent.setup().click(toggle)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Show me on the leaderboard' })).not.toBeChecked())
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ show_on_leaderboard: false })
    expect(await screen.findByText('You are hidden from the leaderboard.')).toBeInTheDocument()
  })

  it('tells hidden users why they are not ranked', async () => {
    mockApi({ 'GET /api/leaderboard': { ...board('weekly', false), entries: [], me: null } })
    renderApp('/leaderboard')
    expect(await screen.findByText(/You're hidden from the leaderboard/)).toBeInTheDocument()
    expect(screen.getByText(/No one has scored this week yet/)).toBeInTheDocument()
  })
})

describe('profile page', () => {
  const achievements = [
    { code: 'FIRST_10', name: 'First 10 Problems', description: 'Solve 10 different questions.', target: 10, progress: 10, earned: true, earned_at: '2026-10-01T10:00:00Z' },
    { code: 'SQL_BEGINNER', name: 'SQL Beginner', description: 'Solve 3 different SQL questions.', target: 3, progress: 1, earned: false, earned_at: null },
  ]

  it('shows achievement progress and saves a new name', async () => {
    const { calls } = mockApi({
      'GET /api/achievements': achievements,
      'PATCH /api/users/me': { ...ada, name: 'Ada Byron' },
    })
    renderApp('/profile')

    expect(await screen.findByText('First 10 Problems')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText(/^Earned /)).toBeInTheDocument()

    const user = userEvent.setup()
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled() // nothing changed yet
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Ada Byron')
    await user.click(save)

    expect(await screen.findByText('Profile updated')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'Ada Byron' })
  })

  it('validates the name before sending anything', async () => {
    const { calls } = mockApi({ 'GET /api/achievements': achievements })
    renderApp('/profile')
    const name = await screen.findByLabelText('Name')
    const user = userEvent.setup()
    await user.clear(name)
    await user.type(name, 'A')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Enter at least 2 characters')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })
})
