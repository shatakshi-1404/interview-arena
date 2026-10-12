import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AppRoutes } from '@/App'
import { AuthProvider } from '@/auth/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { createQueryClient } from '@/lib/queryClient'
import { tokenStore } from '@/lib/tokens'
import type { DayPoint, ProgressOverview, User } from '@/types/api'

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const ada: User = {
  id: 1, name: 'Ada Lovelace', email: 'ada@example.com', role: 'USER', show_on_leaderboard: true, created_at: '2026-09-01T00:00:00Z',
}

interface Req {
  url: URL
  method: string
  body: unknown
}
type Handler = unknown | ((req: Req) => unknown)

/** Routes are keyed 'METHOD /path' (query string ignored). A function handler receives the request. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: { method: string; path: string; search: string; body: unknown }[] = []
  const all: Record<string, Handler> = {
    'GET /api/auth/me': ada,
    'GET /api/notifications': { unread_count: 0, items: [] },
    'GET /api/mock-interviews/options': { includes: ['MCQ', 'SHORT_ANSWER', 'SQL'] },
    ...handlers,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined
      calls.push({ method, path: url.pathname, search: url.search, body })
      const h = all[`${method} ${url.pathname}`]
      if (h === undefined) return json({ detail: `not mocked: ${method} ${url.pathname}` }, 404)
      const out = typeof h === 'function' ? (h as (r: Req) => unknown)({ url, method, body }) : h
      return out instanceof Response ? out : json(out)
    }),
  )
  return { calls }
}

export function renderApp(path: string, opts: { anonymous?: boolean } = {}) {
  if (!opts.anonymous) tokenStore.set('A', 'R')
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

export const day = (date: string, answered = 0, correct = 0): DayPoint => ({
  date, answered, correct, accuracy: answered ? Math.round((correct / answered) * 1000) / 10 : null, average_score: null,
})

export const overview = (over: Partial<ProgressOverview> = {}): ProgressOverview => ({
  current_streak: 3, longest_streak: 5, problems_solved: 12, total_answered: 20, accuracy: 65, average_score: 70,
  avg_solve_time_seconds: 41, consistency: 0.8, weakest_topic: { key: 'OS', label: 'OS', accuracy: 40 },
  readiness: { status: 'INSUFFICIENT_DATA', score: null, category: null, answered: 6, needed: 10 },
  performance_over_time: [day('2026-10-01', 4, 3), day('2026-10-02', 2, 1)],
  weekly: [{ week_start: '2026-09-28', answered: 6, correct: 4, accuracy: 66.7 }],
  by_difficulty: [
    { difficulty: 'EASY', attempts: 4, correct: 4, accuracy: 100, avg_time_seconds: 20 },
    { difficulty: 'MEDIUM', attempts: 2, correct: 0, accuracy: 0, avg_time_seconds: 50 },
    { difficulty: 'HARD', attempts: 0, correct: 0, accuracy: null, avg_time_seconds: null },
  ],
  ...over,
})

export const topic = (key: string, label: string, attempts: number, accuracy: number | null, extra = {}) => ({
  key, label, attempts, correct: accuracy == null ? 0 : Math.round((accuracy / 100) * attempts), accuracy,
  recent_accuracy: accuracy, trend_points: null, avg_time_seconds: null, last_practiced: null,
  readiness_score: null, confidence: null, ...extra,
})
