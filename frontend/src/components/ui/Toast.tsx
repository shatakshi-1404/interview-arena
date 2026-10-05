import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type Kind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: Kind
  message: string
}
interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const STYLE: Record<Kind, { bar: string; icon: typeof Info }> = {
  success: { bar: 'bg-success', icon: CheckCircle2 },
  error: { bar: 'bg-danger', icon: AlertCircle },
  info: { bar: 'bg-gold-500', icon: Info },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = ++seq.current
      setItems((l) => [...l.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {items.map((t) => {
          const { bar, icon: Icon } = STYLE[t.kind]
          return (
            <div key={t.id} className="pointer-events-auto flex animate-fade-in overflow-hidden rounded-lg border border-line bg-white shadow-pop">
              <span className={cn('w-1 shrink-0', bar)} aria-hidden />
              <Icon className="ml-3 mt-3 h-4 w-4 shrink-0 text-ink-600" aria-hidden />
              <p className="flex-1 px-3 py-3 text-sm text-ink-800">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="p-3 text-ink-500 hover:text-ink-900">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
