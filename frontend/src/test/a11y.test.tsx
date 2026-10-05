import axe from 'axe-core'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { adminQuestion, page, qSummary } from '@/test/admin-fixtures'
import { attemptState, assessmentSummary } from '@/test/exam-fixtures'
import { ada, mockApi, overview, renderApp, topic } from '@/test/utils'

vi.mock('@/components/code/CodeEditor', async () => {
  const { createElement } = await import('react')
  return { CodeEditor: (p: { value: string; ariaLabel?: string }) => createElement('textarea', { 'aria-label': p.ariaLabel ?? 'Code editor', value: p.value, readOnly: true }) }
})

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

async function expectAccessible(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  const problems = results.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  expect(problems).toEqual([])
}

const detail = (over: Record<string, unknown> = {}) => ({
  id: 7, title: 'Binary search complexity', category: 'DSA', difficulty: 'EASY', question_type: 'MCQ', time_limit: 60, tags: ['searching'],
  is_published: true, created_at: '2026-10-01T00:00:00Z', user_status: null, description: 'What is the complexity?', starter_code: null,
  examples: null, constraints: null, options: [{ id: 1, text: 'O(n)' }, { id: 2, text: 'O(log n)' }], sample_test_cases: [], multiple_answers: false, ...over,
})

describe('automated accessibility checks (structure, names, roles, labels)', () => {
  it('landing page', async () => {
    mockApi({})
    const { container } = renderApp('/', { anonymous: true })
    await screen.findByRole('heading', { level: 1 })
    await expectAccessible(container)
  })

  it('sign in and register', async () => {
    mockApi({})
    const login = renderApp('/login', { anonymous: true })
    await screen.findByRole('heading', { name: /sign in/i })
    await expectAccessible(login.container)
    login.unmount()
    const register = renderApp('/register', { anonymous: true })
    await screen.findByRole('heading', { name: /create your account/i })
    await expectAccessible(register.container)
  })

  it('dashboard', async () => {
    mockApi({
      'GET /api/progress': overview(),
      'GET /api/progress/topics': { categories: [topic('DSA', 'DSA', 10, 90), topic('OS', 'OS', 6, 20), topic('CN', 'CN', 0, null)], tags: [], weak_topics: [] },
      'GET /api/recommendations': { enabled: true, items: [] },
    })
    const { container } = renderApp('/dashboard')
    await screen.findByText('Skill heatmap')
    await screen.findByText('Strong')
    await expectAccessible(container)
  })

  it('practice list', async () => {
    mockApi({
      'GET /api/questions/meta': { categories: [{ value: 'DSA', count: 2 }], difficulties: ['EASY'], question_types: ['MCQ'] },
      'GET /api/questions': page([qSummary(1, 'Binary search', { user_status: 'SOLVED', tags: ['arrays'] }), qSummary(2, 'Filtering groups')]),
    })
    const { container } = renderApp('/practice')
    await screen.findByRole('link', { name: 'Binary search' })
    await expectAccessible(container)
  })

  it('a question page', async () => {
    mockApi({ 'GET /api/questions/7': detail() })
    const { container } = renderApp('/practice/7')
    await screen.findByRole('heading', { name: 'Binary search complexity' })
    await expectAccessible(container)
  })

  it('assessment list', async () => {
    mockApi({ 'GET /api/assessments': page([assessmentSummary(3, 'Backend Basics')], { page_size: 12 }), 'GET /api/attempts': [] })
    const { container } = renderApp('/assessments')
    await screen.findByRole('link', { name: 'Backend Basics' })
    await expectAccessible(container)
  })

  it('the exam screen', async () => {
    mockApi({ 'GET /api/attempts/5': attemptState() })
    const { container } = renderApp('/attempts/5')
    await screen.findByRole('heading', { name: 'First question' })
    await expectAccessible(container)
  })

  it('admin question editor', async () => {
    mockApi({ 'GET /api/auth/me': { ...ada, role: 'ADMIN' }, 'GET /api/admin/questions/7': adminQuestion() })
    const { container } = renderApp('/admin/questions/7')
    await screen.findByLabelText('Title')
    await expectAccessible(container)
  })
})
