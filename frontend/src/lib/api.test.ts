import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, http, setSessionExpiredHandler } from './api'
import { tokenStore } from './tokens'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
function mockFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init ?? {})))
  vi.stubGlobal('fetch', fn)
  return fn
}
const bearer = (init: RequestInit) => (init.headers as Record<string, string>).Authorization
const refreshCalls = (f: ReturnType<typeof mockFetch>) => f.mock.calls.filter(([u]) => String(u).endsWith('/api/auth/refresh'))

const NEW_TOKENS = { access_token: 'new', refresh_token: 'R2', token_type: 'bearer' }
const expiredUnlessNew: Handler = (url, init) => {
  if (url.endsWith('/api/auth/refresh')) return json(NEW_TOKENS)
  return bearer(init) === 'Bearer new' ? json({ value: 42 }) : json({ detail: 'Invalid or expired token' }, 401)
}

beforeEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  sessionStorage.clear()
  setSessionExpiredHandler(null)
})

describe('api client', () => {
  it('sends the access token as a bearer header', async () => {
    tokenStore.set('A1', 'R1')
    const f = mockFetch(() => json({ ok: true }))
    await http.get('/api/ping')
    expect(bearer(f.mock.calls[0]![1]!)).toBe('Bearer A1')
  })

  it('refreshes once on 401, stores the rotated tokens and retries', async () => {
    tokenStore.set('old', 'R1')
    const f = mockFetch(expiredUnlessNew)
    await expect(http.get('/api/thing')).resolves.toEqual({ value: 42 })
    expect(tokenStore.access).toBe('new')
    expect(tokenStore.refresh).toBe('R2')
    expect(refreshCalls(f)).toHaveLength(1)
  })

  it('shares ONE refresh between concurrent requests (refresh tokens are single-use)', async () => {
    tokenStore.set('old', 'R1')
    const f = mockFetch((url, init) =>
      url.endsWith('/api/auth/refresh')
        ? new Promise<Response>((resolve) => setTimeout(() => resolve(json(NEW_TOKENS)), 10))
        : expiredUnlessNew(url, init),
    )
    const results = await Promise.all([http.get('/api/a'), http.get('/api/b'), http.get('/api/c')])
    expect(results).toEqual([{ value: 42 }, { value: 42 }, { value: 42 }])
    expect(refreshCalls(f)).toHaveLength(1)
  })

  it('ends the session when the refresh token is rejected', async () => {
    tokenStore.set('old', 'R1')
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    mockFetch((url) =>
      url.endsWith('/api/auth/refresh')
        ? json({ detail: 'Refresh token has been revoked' }, 401)
        : json({ detail: 'Invalid or expired token' }, 401),
    )
    await expect(http.get('/api/thing')).rejects.toMatchObject({ status: 401 })
    expect(tokenStore.refresh).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
  })

  it('does not log the user out when the network fails during refresh', async () => {
    tokenStore.set('old', 'R1')
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    mockFetch((url) =>
      url.endsWith('/api/auth/refresh') ? Promise.reject(new TypeError('offline')) : json({ detail: 'Invalid or expired token' }, 401),
    )
    await expect(http.get('/api/thing')).rejects.toMatchObject({ status: 0 })
    expect(tokenStore.refresh).toBe('R1')
    expect(expired).not.toHaveBeenCalled()
  })

  it('never tries to refresh for auth:false requests such as login', async () => {
    tokenStore.set('A', 'R1')
    const f = mockFetch(() => json({ detail: 'Incorrect email or password' }, 401))
    await expect(http.post('/api/auth/login', { email: 'a@b.co', password: 'x' }, { auth: false })).rejects.toMatchObject({
      status: 401,
      message: 'Incorrect email or password',
    })
    expect(f).toHaveBeenCalledTimes(1)
    expect(bearer(f.mock.calls[0]![1]!)).toBeUndefined()
  })

  it('turns validation errors into per-field messages', async () => {
    mockFetch(() =>
      json(
        {
          detail: [
            { loc: ['body', 'email'], msg: 'value is not a valid email address' },
            { loc: ['body', 'password'], msg: 'Value error, Password must contain at least one letter and one number' },
          ],
        },
        422,
      ),
    )
    const err = (await http.post('/api/auth/register', {}, { auth: false }).catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.fieldErrors).toEqual({
      email: 'value is not a valid email address',
      password: 'Password must contain at least one letter and one number',
    })
  })

  it('builds query strings without empty values', async () => {
    const f = mockFetch(() => json({}))
    await http.get('/api/x', { page: 2, q: undefined, flag: false, n: null })
    expect(String(f.mock.calls[0]![0])).toBe('/api/x?page=2&flag=false')
  })

  it('returns undefined for 204 responses', async () => {
    mockFetch(() => new Response(null, { status: 204 }))
    await expect(http.delete('/api/x')).resolves.toBeUndefined()
  })
})
