import { cn } from '@/lib/cn'

export function RadioCards({ legend, name, value, onChange, options }: {
  legend: string
  name: string
  value: string
  onChange: (v: string) => void
  options: { value: string; title: string; description?: string }[]
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-800">{legend}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl border p-4',
              o.value === value ? 'border-gold-500 bg-gold-50' : 'border-line bg-white hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="mt-1 h-4 w-4 accent-gold-600"
            />
            <span>
              <span className="block font-medium">{o.title}</span>
              {o.description && <span className="mt-0.5 block text-sm text-ink-600">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
