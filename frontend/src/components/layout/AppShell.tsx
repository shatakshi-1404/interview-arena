import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { SidebarContent } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => setOpen(false), [pathname])

  // After a client-side navigation, tell screen readers where they are and move focus to the content.
  // (Pages set document.title in their own effects, which run before this one.)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setAnnouncement(document.title)
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-line bg-ivory-50 lg:block">
        <SidebarContent />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink-950/40" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85%] animate-fade-in bg-ivory-50 shadow-pop">
            <button onClick={() => setOpen(false)} aria-label="Close navigation" className="absolute right-3 top-4 rounded-lg p-1.5 text-ink-600 hover:bg-ivory-200">
              <X className="h-5 w-5" aria-hidden />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <Topbar onOpenMenu={() => setOpen(true)} />
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
