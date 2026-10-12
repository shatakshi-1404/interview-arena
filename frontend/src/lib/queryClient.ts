import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export function createQueryClient(overrides?: { retry?: boolean }) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) will not fix themselves; network/5xx errors get two retries.
        retry: overrides?.retry === false ? false : (n, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && n < 2,
      },
      mutations: { retry: false },
    },
  })
}
