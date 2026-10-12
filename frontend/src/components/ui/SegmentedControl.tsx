import { cn } from '@/lib/cn'

export function SegmentedControl<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line-strong bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            o.value === value ? 'bg-gold-500 text-ink-900' : 'text-ink-600 hover:bg-ivory-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
