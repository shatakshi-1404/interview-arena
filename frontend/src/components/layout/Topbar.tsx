import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { NotificationsMenu } from './NotificationsMenu'
import { UserMenu } from './UserMenu'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  // Ctrl/Cmd+K focuses search from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate(`/practice?q=${encodeURIComponent(q)}`)
    inputRef.current?.blur()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-ivory-100/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button onClick={onOpenMenu} aria-label="Open navigation" className="rounded-lg p-2 text-ink-700 hover:bg-ivory-200 lg:hidden">
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <form onSubmit={submit} role="search" className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions…"
          aria-label="Search questions"
          className="h-10 w-full rounded-lg border border-line-strong bg-white pl-9 pr-16 text-sm placeholder:text-ink-500 focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-300/60"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-ivory-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-500 sm:block">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </form>
      <div className="ml-auto flex items-center gap-1">
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  )
}
