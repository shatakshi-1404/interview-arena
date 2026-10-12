const KEY = 'ia.refresh'
let access: string | null = null

/** Access token: memory only. Refresh token: sessionStorage (survives reloads, dies with the tab). */
export const tokenStore = {
  get access(): string | null {
    return access
  },
  get refresh(): string | null {
    try {
      return sessionStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set(accessToken: string, refreshToken: string) {
    access = accessToken
    try {
      sessionStorage.setItem(KEY, refreshToken)
    } catch {
      /* storage unavailable: the session lasts until reload */
    }
  },
  clear() {
    access = null
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* storage unavailable */
    }
  },
}
