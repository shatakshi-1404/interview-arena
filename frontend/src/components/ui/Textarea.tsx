import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  hint?: string
  mono?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, error, hint, mono, className, id, rows = 4, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  const descId = `${fieldId}-desc`
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-ink-800">{label}</label>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? descId : undefined}
        className={cn(
          'w-full resize-y rounded-lg border bg-white p-3 text-sm text-ink-900 placeholder:text-ink-500',
          'focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-300/60',
          error ? 'border-danger' : 'border-line-strong',
          mono && 'font-mono text-xs',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={descId} role="alert" className="mt-1.5 text-sm text-danger">{error}</p>
      ) : hint ? (
        <p id={descId} className="mt-1.5 text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
})
