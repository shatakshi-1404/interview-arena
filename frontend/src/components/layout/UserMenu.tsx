import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { initials } from '@/lib/format'
import { useDismiss } from '@/lib/useDismiss'

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  if (!user) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-ivory-200"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-700">
          {initials(user.name)}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-500 sm:block" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 animate-fade-in rounded-xl border border-line bg-white py-1 shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-sm text-ink-500">{user.email}</p>
          </div>
          <Link to="/profile" onClick={close} className="flex items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-ivory-100">
            <UserRound className="h-4 w-4" aria-hidden /> Profile
          </Link>
          <button
            onClick={async () => {
              close()
              await logout()
              navigate('/', { replace: true })
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink-700 hover:bg-ivory-100"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
