import type { TokenPair } from '@/types/api'
import { tokenStore } from './tokens'

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>
  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

interface ValidationItem {
  loc?: unknown[]
  msg?: string
}

function parseDetail(detail: unknown, status: number): { message: string; fields: Record<string, string> } {
  if (typeof detail === 'string') return { message: detail, fields: {} }
  if (Array.isArray(detail)) {
    const fields: Record<string, string> = {}
    const parts: string[] = []
    for (const item of detail as ValidationItem[]) {
      const msg = (item.msg ?? 'Invalid value').replace(/^Value error, /, '')
      const field = (item.loc ?? []).filter((p): p is string => typeof p === 'string' && p !== 'body').join('.')
      if (field && !fields[field]) fields[field] = msg
      parts.push(field ? `${field}: ${msg}` : msg)
    }
    return { message: parts.join('; ') || 'Please check the form and try again.', fields }
  }
  return {
    message: status >= 500 ? 'Something went wrong on our side. Please try again.' : `Request failed (${status})`,
    fields: {},
  }
}

// ---------------------------------------------------------------- refresh
type RefreshOutcome = 'ok' | 'rejected' | 'unreachable'

let sessionExpiredHandler: (() => void) | null = null
export function setSessionExpiredHandler(fn: (() => void) | null) {
  sessionExpiredHandler = fn
}

async function doRefresh(): Promise<RefreshOutcome> {
  const refresh = tokenStore.refresh
  if (!refresh) return 'rejected'
  let res: Response
  try {
    res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })
  } catch {
    return 'unreachable'
  }
  if (res.ok) {
    const t = (await res.json()) as TokenPair
    tokenStore.set(t.access_token, t.refresh_token)
    return 'ok'
  }
  // 5xx is treated as temporary: do not log the user out because the server hiccuped.
  return res.status === 401 || res.status === 403 || res.status === 422 ? 'rejected' : 'unreachable'
}

/** Single-flight: the backend rotates refresh tokens and treats reuse as theft, so concurrent
 *  401s must share one refresh call instead of each sending the same refresh token. */
let inflight: Promise<RefreshOutcome> | null = null
function refreshOnce(): Promise<RefreshOutcome> {
  inflight ??= doRefresh().finally(() => {
    inflight = null
  })
  return inflight
}

// ---------------------------------------------------------------- request
type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>

export interface RequestOptions {
  method?: string
  body?: unknown
  query?: Query
  /** false for login/register/etc.: no bearer token and no refresh-on-401. */
  auth?: boolean
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) params.set(k, String(v))
  }
  const qs = params.toString()
  return `${BASE}${path}${qs ? `?${qs}` : ''}`
}

async function send(path: string, opts: RequestOptions, auth: boolean) {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? tokenStore.access : null
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
    return { res, token }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const { message, fields } = parseDetail((data as { detail?: unknown } | null)?.detail, res.status)
    throw new ApiError(res.status, message, fields)
  }
  return data as T
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth !== false
  let sent = await send(path, opts, auth)

  if (sent.res.status === 401 && auth && tokenStore.refresh) {
    if (tokenStore.access && tokenStore.access !== sent.token) {
      sent = await send(path, opts, auth) // another request already rotated the tokens
    } else {
      const outcome = await refreshOnce()
      if (outcome === 'ok') {
        sent = await send(path, opts, auth)
      } else if (outcome === 'rejected') {
        tokenStore.clear()
        sessionExpiredHandler?.()
      } else {
        throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
      }
    }
  }
  return parse<T>(sent.res)
}

type Extra = Pick<RequestOptions, 'auth' | 'signal'>

export const http = {
  get: <T>(path: string, query?: Query, o?: Extra) => request<T>(path, { ...o, method: 'GET', query }),
  post: <T>(path: string, body?: unknown, o?: Extra) => request<T>(path, { ...o, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, o?: Extra) => request<T>(path, { ...o, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, o?: Extra) => request<T>(path, { ...o, method: 'PATCH', body }),
  delete: <T>(path: string, o?: Extra) => request<T>(path, { ...o, method: 'DELETE' }),
}
