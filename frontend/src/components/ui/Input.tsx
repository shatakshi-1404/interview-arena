import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, trailing, className, id, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const descId = `${inputId}-desc`
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-800">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? descId : undefined}
          className={cn(
            'h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink-900 transition-colors placeholder:text-ink-500',
            'focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-300/60',
            error ? 'border-danger' : 'border-line-strong',
            trailing ? 'pr-10' : undefined,
            className,
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {error ? (
        <p id={descId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'trailing'>>(
  function PasswordInput(props, ref) {
    const [show, setShow] = useState(false)
    return (
      <Input
        ref={ref}
        {...props}
        type={show ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            className="rounded-md p-2 text-ink-500 hover:text-ink-900"
          >
            {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        }
      />
    )
  },
)
