import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    const items = () => (root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [])
    const target = items()[0] ?? root
    target?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      if (!list.length) {
        e.preventDefault()
        return
      }
      const first = list[0]!
      const last = list[list.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink-950/50" onClick={() => closeRef.current()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative m-4 w-full max-w-md animate-fade-in rounded-xl border border-line bg-white p-6 shadow-pop outline-none"
      >
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 text-sm text-ink-700">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, loading, error, destructive }: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  error?: Error | null
  destructive?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-2">{children}</div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error.message}
        </p>
      )}
    </Modal>
  )
}
