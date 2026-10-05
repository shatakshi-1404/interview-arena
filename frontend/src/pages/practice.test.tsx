import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { mockApi, renderApp } from '@/test/utils'

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

const summary = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, category: 'DSA', difficulty: 'EASY', question_type: 'MCQ', time_limit: 60, tags: ['arrays'],
  is_published: true, created_at: '2026-10-01T00:00:00Z', user_status: null, ...extra,
})
const meta = {
  categories: [{ value: 'DSA', count: 2 }, { value: 'SQL', count: 1 }],
  difficulties: ['EASY', 'MEDIUM', 'HARD'], question_types: ['MCQ', 'CODING', 'SQL', 'SHORT_ANSWER'],
}
const two = {
  items: [summary(1, 'Binary search complexity', { user_status: 'SOLVED' }), summary(2, 'Filtering groups', { category: 'SQL', user_status: 'ATTEMPTED', tags: ['having'] })],
  total: 2, page: 1, page_size: 20,
}

describe('question browser', () => {
  it('lists questions with status chips and filters through the API', async () => {
    const { calls } = mockApi({ 'GET /api/questions/meta': meta, 'GET /api/questions': two })
    renderApp('/practice')

    expect(await screen.findByRole('link', { name: 'Binary search complexity' })).toHaveAttribute('href', '/practice/1')
    expect(screen.getByText('Solved')).toBeInTheDocument()
    expect(screen.getByText('Attempted')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'DSA (2)' })).toBeInTheDocument() // live counts from /meta

    await userEvent.setup().selectOptions(screen.getByLabelText('Category'), 'SQL')
    await waitFor(() => expect(calls.some((c) => c.path === '/api/questions' && c.search.includes('category=SQL'))).toBe(true))
  })

  it('applies the top-bar search from the URL and shows it in the box', async () => {
    const { calls } = mockApi({ 'GET /api/questions/meta': meta, 'GET /api/questions': two })
    renderApp('/practice?q=join')
    expect(await screen.findByLabelText('Filter by title')).toHaveValue('join')
    await waitFor(() => expect(calls.some((c) => c.path === '/api/questions' && c.search.includes('q=join'))).toBe(true))
  })

  it('pages through results', async () => {
    const { calls } = mockApi({
      'GET /api/questions/meta': meta,
      'GET /api/questions': ({ url }: { url: URL }) => {
        const page = Number(url.searchParams.get('page') ?? '1')
        return { items: [summary(page * 10, `Question on page ${page}`)], total: 45, page, page_size: 20 }
      },
    })
    renderApp('/practice')
    expect(await screen.findByText('Showing 1–20 of 45')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('Question on page 2')).toBeInTheDocument()
    expect(screen.getByText('Showing 21–40 of 45')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/api/questions' && c.search.includes('page=2'))).toBe(true)
  })

  it('filters by tag and explains an empty result', async () => {
    mockApi({
      'GET /api/questions/meta': meta,
      'GET /api/questions': ({ url }: { url: URL }) =>
        url.searchParams.get('tag') ? { items: [], total: 0, page: 1, page_size: 20 } : two,
    })
    renderApp('/practice')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Filter by tag having' }))
    expect(await screen.findByText('No questions match your filters')).toBeInTheDocument()
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Clear all filters' })[0]!)
    expect(await screen.findByRole('link', { name: 'Filtering groups' })).toBeInTheDocument()
  })

  it('shows a retry when the list fails to load', async () => {
    mockApi({ 'GET /api/questions/meta': meta, 'GET /api/questions': () => new Response('{}', { status: 500 }) })
    renderApp('/practice')
    expect(await screen.findByText("We couldn't load questions")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
