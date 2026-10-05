import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '@/lib/tokens'
import { mockApi, overview, renderApp } from '@/test/utils'

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

describe('AppShell navigation', () => {
  it('moves focus to the content and announces the new page', async () => {
    mockApi({
      'GET /api/progress': overview(),
      'GET /api/progress/topics': { categories: [], tags: [], weak_topics: [] },
      'GET /api/recommendations': { enabled: true, items: [] },
      'GET /api/achievements': [],
    })
    renderApp('/dashboard')
    await screen.findByRole('heading', { name: /Welcome back/ })

    await userEvent.setup().click(screen.getByRole('link', { name: 'Profile' }))
    expect(await screen.findByRole('heading', { name: 'Profile', level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
    expect(screen.getByText('Profile · InterviewArena')).toBeInTheDocument() // the polite live-region announcement
  })

  it('offers a skip link that targets the main region', async () => {
    mockApi({ 'GET /api/leaderboard': { period: 'weekly', period_start: '2026-09-28T00:00:00Z', period_end: '2026-10-05T00:00:00Z', opted_in: true, participants: 0, entries: [], me: null, scoring: '' } })
    renderApp('/leaderboard')
    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})
