import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '@/App'
import { ToastProvider } from '@/components/ui/Toast'
import { createQueryClient } from '@/lib/queryClient'
import { tokenStore } from '@/lib/tokens'
import type { ProgressOverview } from '@/types/api'
import { AuthProvider } from './AuthContext'

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ada = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', role: 'USER', show_on_leaderboard: true, created_at: '2026-10-01T00:00:00Z' }
const overview: ProgressOverview = {
  current_streak: 3, longest_streak: 5, problems_solved: 12, total_answered: 20, accuracy: 65, average_score: 70,
  avg_solve_time_seconds: 41, consistency: 0.8, weakest_topic: { key: 'OS', label: 'OS', accuracy: 40 },
  readiness: { status: 'INSUFFICIENT_DATA', score: null, category: null, answered: 6, needed: 10 },
  performance_over_time: [], weekly: [], by_difficulty: [],
}

function installFetch() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'POST' && url === '/api/auth/login') {
      const { password } = JSON.parse(String(init?.body)) as { password: string }
      return password === 'Passw0rdXY'
        ? respond({ user: ada, tokens: { access_token: 'A', refresh_token: 'R', token_type: 'bearer' } })
        : respond({ detail: 'Incorrect email or password' }, 401)
    }
    if (url.startsWith('/api/progress/topics')) return respond({ categories: [], tags: [], weak_topics: [] })
    if (url.startsWith('/api/progress/activity')) return respond({ days: [], current_streak: 0, longest_streak: 0, active_days: 0, total_answered: 0 })
    if (url.startsWith('/api/progress/readiness')) return respond({ detail: 'not needed' }, 404)
    if (url.startsWith('/api/progress')) return respond(overview)
    if (url === '/api/notifications') return respond({ unread_count: 0, items: [] })
    return respond({ detail: `not mocked: ${url}` }, 404)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function renderApp(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient({ retry: false })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

async function signIn(password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email'), 'ada@example.com')
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
})

describe('authentication flow', () => {
  it('redirects signed-out visitors from a protected page to sign in', async () => {
    installFetch()
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { name: /sign in to interviewarena/i })).toBeInTheDocument()
  })

  it('blocks an empty submit with inline errors and no request', async () => {
    const f = installFetch()
    renderApp('/login')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('shows a clear error for wrong credentials and stays on the page', async () => {
    installFetch()
    renderApp('/login')
    await signIn('wrong-pass1')
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sign in to interviewarena/i })).toBeInTheDocument()
    expect(tokenStore.refresh).toBeNull()
  })

  it('signs in and lands on the dashboard with real stats', async () => {
    installFetch()
    renderApp('/login')
    await signIn('Passw0rdXY')
    expect(await screen.findByRole('heading', { name: 'Welcome back, Ada' })).toBeInTheDocument()
    expect(await screen.findByText('Current streak')).toBeInTheDocument()
    expect(screen.getByText('3 days')).toBeInTheDocument()
    expect(screen.getByText('6 / 10')).toBeInTheDocument()
    expect(tokenStore.refresh).toBe('R')
  })

  it('returns you to the page you were trying to reach', async () => {
    installFetch()
    renderApp('/leaderboard')
    await signIn('Passw0rdXY')
    expect(await screen.findByRole('heading', { name: 'Leaderboard' })).toBeInTheDocument()
  })

  it('restores an existing session on load', async () => {
    tokenStore.set('A', 'R')
    const f = installFetch()
    f.mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/api/auth/me') return respond(ada)
      if (url.startsWith('/api/progress/topics')) return respond({ categories: [], tags: [], weak_topics: [] })
    if (url.startsWith('/api/progress/activity')) return respond({ days: [], current_streak: 0, longest_streak: 0, active_days: 0, total_answered: 0 })
    if (url.startsWith('/api/progress/readiness')) return respond({ detail: 'not needed' }, 404)
    if (url.startsWith('/api/progress')) return respond(overview)
      return respond({ unread_count: 0, items: [] })
    })
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Welcome back, Ada' })).toBeInTheDocument()
  })
})
