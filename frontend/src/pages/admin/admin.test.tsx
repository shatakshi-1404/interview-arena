import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import {
  adminAssessment, adminQuestion, adminUser, page, qSummary, stats, submissionDetail, submissionRow,
} from '@/test/admin-fixtures'
import { ada, mockApi, renderApp } from '@/test/utils'

const admin = { ...ada, id: 9, name: 'Admin Root', email: 'admin@example.com', role: 'ADMIN' }
const api = (handlers: Record<string, unknown>) => mockApi({ 'GET /api/auth/me': admin, ...handlers })
const fail = (status: number, detail: string) => () => new Response(JSON.stringify({ detail }), { status })

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

describe('access and overview', () => {
  it('turns away learners', async () => {
    mockApi({}) // the default account is a regular user
    renderApp('/admin')
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument()
  })

  it('shows platform statistics', async () => {
    api({ 'GET /api/admin/stats': stats() })
    renderApp('/admin')
    expect(await screen.findByText('120')).toBeInTheDocument()
    expect(screen.getByText('115 active · 2 admins')).toBeInTheDocument()
    expect(screen.getByText('64.5%')).toBeInTheDocument()
    expect(screen.getByText('36')).toBeInTheDocument() // published questions
    expect(screen.getByText('of 40 total')).toBeInTheDocument()
    expect(screen.getAllByText(/38\.5%/).length).toBeGreaterThan(0)
    expect(screen.getByRole('navigation', { name: 'Admin sections' })).toBeInTheDocument()
  })

  it('shows a retry when statistics fail', async () => {
    api({ 'GET /api/admin/stats': () => new Response('{}', { status: 500 }) })
    renderApp('/admin')
    expect(await screen.findByText("We couldn't load platform statistics")).toBeInTheDocument()
  })
})

describe('users', () => {
  const users = () => page([adminUser(9, 'Admin Root', { role: 'ADMIN', email: 'admin@example.com' }), adminUser(2, 'Grace Hopper')])

  it('lists, searches, and promotes after confirmation', async () => {
    const { calls } = api({ 'GET /api/admin/users': users(), 'PATCH /api/admin/users/2': adminUser(2, 'Grace Hopper', { role: 'ADMIN' }) })
    renderApp('/admin/users')
    const user = userEvent.setup()
    expect(await screen.findByText('grace@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove admin access from Admin Root' })).toBeDisabled() // your own account
    expect(screen.getByRole('button', { name: 'Deactivate Admin Root' })).toBeDisabled()

    await user.type(screen.getByLabelText('Search users'), 'grace')
    await waitFor(() => expect(calls.some((c) => c.path === '/api/admin/users' && c.search.includes('search=grace'))).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Make Grace Hopper an admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Make Grace Hopper an admin?' })
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false) // nothing happens until confirmed
    await user.click(within(dialog).getByRole('button', { name: 'Make admin' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ role: 'ADMIN' }))
    expect(await screen.findByText('Grace Hopper is now an admin.')).toBeInTheDocument()
  })

  it('deactivates a user and shows a server refusal in the dialog', async () => {
    const { calls } = api({ 'GET /api/admin/users': users(), 'PATCH /api/admin/users/2': fail(409, 'You cannot demote or deactivate your own account') })
    renderApp('/admin/users')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Deactivate Grace Hopper' }))
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate Grace Hopper?' })
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You cannot demote or deactivate your own account')
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ is_active: false })
  })

  it('filters by role and status', async () => {
    const { calls } = api({ 'GET /api/admin/users': users() })
    renderApp('/admin/users')
    const user = userEvent.setup()
    await screen.findByText('grace@example.com')
    await user.selectOptions(screen.getByLabelText('Role'), 'ADMIN')
    await user.selectOptions(screen.getByLabelText('Status'), 'false')
    await waitFor(() => expect(calls.some((c) => c.search.includes('role=ADMIN') && c.search.includes('is_active=false'))).toBe(true))
  })
})

describe('question list', () => {
  const list = () => page([qSummary(1, 'Binary search'), qSummary(2, 'Draft question', { is_published: false, category: 'SQL' })])

  it('shows status, filters through the API and toggles publication', async () => {
    const { calls } = api({ 'GET /api/admin/questions': list(), 'PATCH /api/admin/questions/1': adminQuestion() })
    renderApp('/admin/questions')
    const user = userEvent.setup()
    expect(await screen.findByRole('link', { name: 'Binary search' })).toHaveAttribute('href', '/admin/questions/1')
    expect(screen.getByText('Draft')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Category'), 'SQL')
    await waitFor(() => expect(calls.some((c) => c.path === '/api/admin/questions' && c.search.includes('category=SQL'))).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Unpublish Binary search' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ is_published: false }))
    expect(await screen.findByText('Question unpublished.')).toBeInTheDocument()
  })

  it('explains why a delete was refused', async () => {
    api({
      'GET /api/admin/questions': list(),
      'DELETE /api/admin/questions/1': fail(409, 'This question is part of an assessment. Remove it from the assessment, or unpublish it instead (PATCH is_published=false).'),
    })
    renderApp('/admin/questions')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete Binary search' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete question?' })
    expect(within(dialog).getByText(/permanently deleted/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('part of an assessment')
  })

  it('deletes after confirmation', async () => {
    const { calls } = api({ 'GET /api/admin/questions': list(), 'DELETE /api/admin/questions/2': new Response(null, { status: 204 }) })
    renderApp('/admin/questions')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete Draft question' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Question deleted.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/admin/questions/2')).toBe(true)
  })
})

describe('question editor', () => {
  it('validates before sending, then creates an MCQ draft', async () => {
    const { calls } = api({ 'POST /api/admin/questions': adminQuestion(), 'GET /api/admin/questions': page([]) })
    renderApp('/admin/questions/new')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Create question' }))
    expect(await screen.findByText('Enter a title (at least 3 characters)')).toBeInTheDocument()
    expect(screen.getByText('Enter the question text')).toBeInTheDocument()
    expect(screen.getByText('Fill in or remove the empty options')).toBeInTheDocument()
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.type(screen.getByLabelText('Title'), 'Stack or queue')
    await user.type(screen.getByLabelText('Question text'), 'Which structure does BFS use?')
    await user.type(screen.getByLabelText('Tags'), 'Graphs, BFS')
    for (const [i, text] of ['Stack', 'Queue', 'Heap', 'Tree'].entries()) await user.type(screen.getByLabelText(`Option ${i + 1} text`), text)
    await user.click(screen.getByLabelText('Option 2 is correct'))
    await user.click(screen.getByRole('button', { name: 'Create question' }))

    expect(await screen.findByText('Question created.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      question_type: 'MCQ', title: 'Stack or queue', description: 'Which structure does BFS use?', category: 'DSA', difficulty: 'EASY',
      time_limit: null, tags: ['graphs', 'bfs'], constraints: null, explanation: null, is_published: false,
      options: [{ text: 'Stack', is_correct: false }, { text: 'Queue', is_correct: true }, { text: 'Heap', is_correct: false }, { text: 'Tree', is_correct: false }],
    })
  })

  it('switching the type changes the form and shows server-side SQL errors', async () => {
    const { calls } = api({ 'POST /api/admin/questions': fail(422, 'SQL challenge is invalid: Reference solution failed: relation "emp" does not exist') })
    renderApp('/admin/questions/new')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Type'), 'SQL')
    expect(screen.queryByLabelText('Option 1 text')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Title'), 'Second highest')
    await user.type(screen.getByLabelText('Question text'), 'Find it')
    await user.type(screen.getByLabelText('Schema'), 'CREATE TABLE employees(salary int);')
    await user.type(screen.getByLabelText('Seed data'), 'INSERT INTO employees VALUES (1);')
    await user.type(screen.getByLabelText('Reference solution'), 'SELECT * FROM emp')
    await user.click(screen.getByRole('button', { name: 'Create question' }))

    expect(await screen.findByText(/Reference solution failed: relation "emp" does not exist/)).toBeInTheDocument()
    const body = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>
    expect(body.question_type).toBe('SQL')
    expect(body.sql_challenge).toMatchObject({ solution_query: 'SELECT * FROM emp', order_matters: false })
    expect(body).not.toHaveProperty('options')
  })

  it('edits an existing question: type is locked, MCQ warning is shown, the type is not sent', async () => {
    const { calls } = api({
      'GET /api/admin/questions/7': adminQuestion(),
      'PATCH /api/admin/questions/7': adminQuestion({ title: 'Binary search (revised)' }),
      'GET /api/admin/questions': page([]),
    })
    renderApp('/admin/questions/7')
    const user = userEvent.setup()
    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('Binary search complexity')
    expect(screen.getByLabelText('Type')).toBeDisabled()
    expect(screen.getByLabelText('Option 2 is correct')).toBeChecked()
    expect(screen.getByRole('note')).toHaveTextContent('Saving replaces the answer options')

    await user.clear(title)
    await user.type(title, 'Binary search (revised)')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Question updated.')).toBeInTheDocument()
    const body = calls.find((c) => c.method === 'PATCH')?.body as Record<string, unknown>
    expect(body.title).toBe('Binary search (revised)')
    expect(body).not.toHaveProperty('question_type')
    expect(body.options).toEqual([{ text: 'O(n)', is_correct: false }, { text: 'O(log n)', is_correct: true }])
  })

  it('shows a not-found state', async () => {
    api({ 'GET /api/admin/questions/99': fail(404, 'Question not found') })
    renderApp('/admin/questions/99')
    expect(await screen.findByText('Question not found')).toBeInTheDocument()
  })

  it('lets you add test cases and concepts for the other types', async () => {
    api({})
    renderApp('/admin/questions/new')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Type'), 'CODING')
    expect(screen.getByLabelText('Test 1 input')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add test case' }))
    expect(screen.getByLabelText('Test 2 expected output')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove test 2' }))
    expect(screen.queryByLabelText('Test 2 input')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Type'), 'SHORT_ANSWER')
    await user.click(screen.getByRole('button', { name: 'Add concept' }))
    expect(screen.getByLabelText('Concept 2 keywords')).toBeInTheDocument()
  })
})

describe('assessment manager', () => {
  const pool = () => page([qSummary(1, 'Binary search'), qSummary(2, 'Filtering groups', { category: 'SQL' }), qSummary(3, 'Draft one', { is_published: false })])

  it('builds an assessment: pick, reorder, set points, and save', async () => {
    const { calls } = api({
      'GET /api/admin/questions': pool(),
      'POST /api/admin/assessments': adminAssessment(),
      'GET /api/admin/assessments': page([]),
    })
    renderApp('/admin/assessments/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Title'), 'Backend Basics')

    expect(await screen.findByRole('button', { name: 'Add Draft one' })).toBeDisabled() // drafts can't be added
    await user.click(screen.getByRole('button', { name: 'Add Binary search' }))
    await user.click(screen.getByRole('button', { name: 'Add Filtering groups' }))
    expect(screen.getAllByRole('button', { name: /Added|Remove/ }).length).toBeGreaterThanOrEqual(2)

    await user.click(screen.getByRole('button', { name: 'Move Filtering groups up' }))
    const points = screen.getByLabelText('Points for Binary search')
    await user.clear(points)
    await user.type(points, '3')
    expect(screen.getByText('2 questions · 4 points')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create assessment' }))
    expect(await screen.findByText('Assessment created.')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      title: 'Backend Basics', description: '', duration_minutes: 30, difficulty: 'MEDIUM', is_published: false,
      questions: [{ question_id: 2, points: 1 }, { question_id: 1, points: 3 }],
    })
  })

  it('refuses to publish an empty assessment before calling the API', async () => {
    const { calls } = api({ 'GET /api/admin/questions': pool() })
    renderApp('/admin/assessments/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Title'), 'Empty one')
    await user.click(screen.getByRole('switch', { name: 'Published' }))
    await user.click(screen.getByRole('button', { name: 'Create assessment' }))
    expect(await screen.findByText('A published assessment needs at least one question')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('locks the question list once there are attempts but still saves other fields', async () => {
    const { calls } = api({
      'GET /api/admin/assessments/4': adminAssessment({ attempt_count: 3 }),
      'PATCH /api/admin/assessments/4': adminAssessment(),
      'GET /api/admin/assessments': page([]),
    })
    renderApp('/admin/assessments/4')
    const user = userEvent.setup()
    expect(await screen.findByRole('note')).toHaveTextContent('already has 3 attempts')
    expect(screen.queryByRole('button', { name: 'Remove Binary search' })).not.toBeInTheDocument()
    expect(screen.queryByText('Add questions')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Points for Binary search')).toBeDisabled()

    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Backend Basics v2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Assessment updated.')).toBeInTheDocument()
    const body = calls.find((c) => c.method === 'PATCH')?.body as Record<string, unknown>
    expect(body.title).toBe('Backend Basics v2')
    expect(body).not.toHaveProperty('questions')
  })

  it('lists assessments and explains a refused delete', async () => {
    api({
      'GET /api/admin/assessments': page([{ id: 4, title: 'Backend Basics', description: '', duration_minutes: 45, difficulty: 'MEDIUM', is_published: true, question_count: 2, total_points: 5, categories: ['DSA'], in_progress_attempt_id: null, best_percentage: null }]),
      'DELETE /api/admin/assessments/4': fail(409, 'This assessment has attempts. Unpublish it instead (PATCH is_published=false).'),
    })
    renderApp('/admin/assessments')
    const user = userEvent.setup()
    expect(await screen.findByRole('link', { name: 'Backend Basics' })).toHaveAttribute('href', '/admin/assessments/4')
    await user.click(screen.getByRole('button', { name: 'Delete Backend Basics' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('has attempts')
  })
})

describe('submissions, audit log and categories', () => {
  it('lists submissions, filters them and opens the detail page', async () => {
    const { calls } = api({
      'GET /api/admin/submissions': page([submissionRow(31), submissionRow(30, { status: 'ACCEPTED', language: 'python', passed_tests: 3, total_tests: 3 })]),
      'GET /api/admin/submissions/31': submissionDetail(),
    })
    renderApp('/admin/submissions')
    const user = userEvent.setup()
    expect((await screen.findAllByText('grace@example.com')).length).toBeGreaterThan(0)
    expect(screen.getByText('3/3')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Status'), 'WRONG_ANSWER')
    await waitFor(() => expect(calls.some((c) => c.path === '/api/admin/submissions' && c.search.includes('status=WRONG_ANSWER'))).toBe(true))

    await user.click(screen.getByRole('link', { name: 'View submission 31' }))
    expect(await screen.findByText('SELECT MAX(salary) FROM employees')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Expected result' })).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Your result' })).getByText('200')).toBeInTheDocument()
  })

  it('shows the audit log with details', async () => {
    const { calls } = api({
      'GET /api/admin/audit-log': page([
        { id: 2, admin_id: 9, admin_name: 'Admin Root', action: 'UPDATE', entity_type: 'user', entity_id: 2, details: { role: { from: 'USER', to: 'ADMIN' } }, created_at: '2026-10-03T08:00:00Z' },
        { id: 1, admin_id: 9, admin_name: 'Admin Root', action: 'CREATE', entity_type: 'question', entity_id: 7, details: null, created_at: '2026-10-02T08:00:00Z' },
      ]),
    })
    renderApp('/admin/audit-log')
    const user = userEvent.setup()
    expect(await screen.findAllByText('Admin Root')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '#7' })).toHaveAttribute('href', '/admin/questions/7')
    await user.selectOptions(screen.getByLabelText('Entity'), 'user')
    await waitFor(() => expect(calls.some((c) => c.search.includes('entity_type=user'))).toBe(true))
  })

  it('shows a content overview per category', async () => {
    api({
      'GET /api/admin/categories': [
        { key: 'DSA', label: 'DSA', total: 12, published: 10, by_difficulty: { EASY: 6, HARD: 6 }, by_type: { MCQ: 12 } },
        { key: 'OS', label: 'OS', total: 0, published: 0, by_difficulty: {}, by_type: {} },
      ],
    })
    renderApp('/admin/categories')
    expect(await screen.findByText('10 of 12 published')).toBeInTheDocument()
    expect(screen.getByText('Easy · 6')).toBeInTheDocument()
    expect(screen.getByText('No questions yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'View questions' })[0]).toHaveAttribute('href', '/admin/questions?category=DSA')
  })
})
