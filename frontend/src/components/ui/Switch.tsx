import { useId } from 'react'
import { cn } from '@/lib/cn'

export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-l`} className="text-sm font-medium text-ink-900">{label}</p>
        {description && <p id={`${id}-d`} className="mt-0.5 text-sm text-ink-600">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-gold-500' : 'bg-line-strong',
        )}
      >
        <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}
