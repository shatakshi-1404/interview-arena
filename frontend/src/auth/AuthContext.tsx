import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, http, setSessionExpiredHandler } from '@/lib/api'
import { tokenStore } from '@/lib/tokens'
import { useToast } from '@/components/ui/Toast'
import type { AuthResponse, User } from '@/types/api'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthValue {
  status: AuthStatus
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => (tokenStore.refresh ? 'loading' : 'anonymous'))

  // A rejected refresh token ends the session everywhere in the app.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      qc.clear()
      setUser(null)
      setStatus('anonymous')
      toast.info('Your session expired. Please sign in again.')
    })
    return () => setSessionExpiredHandler(null)
  }, [qc, toast])

  // Restore the session on page load. The client refreshes the access token on its own if needed.
  useEffect(() => {
    if (!tokenStore.refresh) return
    let ignore = false
    http
      .get<User>('/api/auth/me')
      .then((u) => {
        if (ignore) return
        setUser(u)
        setStatus('authenticated')
      })
      .catch((e: unknown) => {
        if (ignore) return
        // Offline at startup: keep the tokens so a reload can recover. Anything else: start clean.
        if (!(e instanceof ApiError && e.status === 0)) tokenStore.clear()
        setStatus('anonymous')
      })
    return () => {
      ignore = true
    }
  }, [])

  const accept = useCallback(
    (res: AuthResponse) => {
      qc.clear() // never show the previous account's cached data
      tokenStore.set(res.tokens.access_token, res.tokens.refresh_token)
      setUser(res.user)
      setStatus('authenticated')
    },
    [qc],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      accept(await http.post<AuthResponse>('/api/auth/login', { email, password }, { auth: false }))
    },
    [accept],
  )

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      accept(await http.post<AuthResponse>('/api/auth/register', { name, email, password }, { auth: false }))
    },
    [accept],
  )

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh
    try {
      if (refresh) await http.post('/api/auth/logout', { refresh_token: refresh }, { auth: false })
    } catch {
      /* the local session ends regardless */
    } finally {
      tokenStore.clear()
      qc.clear()
      setUser(null)
      setStatus('anonymous')
    }
  }, [qc])

  const value = useMemo(
    () => ({ status, user, login, register, logout, setUser }),
    [status, user, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
