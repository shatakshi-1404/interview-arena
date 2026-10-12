interface Entry {
  name?: string
  value?: number | string | null
  color?: string
}

/** Recharts clones this element and injects active/payload/label. */
export function ChartTooltip({ active, payload, label, formatLabel, formatValue }: {
  active?: boolean
  payload?: Entry[]
  label?: string | number
  formatLabel?: (label: string) => string
  formatValue?: (name: string, value: number | string) => string
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value != null)
  if (!rows.length) return null
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-pop">
      {label !== undefined && (
        <p className="mb-1 font-medium text-ink-900">{formatLabel ? formatLabel(String(label)) : String(label)}</p>
      )}
      {rows.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-700">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-medium text-ink-900">{formatValue ? formatValue(p.name ?? '', p.value as number | string) : p.value}</span>
        </p>
      ))}
    </div>
  )
}
