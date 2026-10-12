import { cn } from '@/lib/cn'

export function QuestionNavigator({ items, current, onSelect }: {
  items: { id: number; answered: boolean }[]
  current: number
  onSelect: (index: number) => void
}) {
  const answered = items.filter((i) => i.answered).length
  return (
    <nav aria-label="Question navigator" className="rounded-xl border border-line bg-white p-4 shadow-card">
      <p className="text-sm font-medium">{answered} of {items.length} answered</p>
      <ol className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
        {items.map((it, i) => (
          <li key={it.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={i === current ? 'step' : undefined}
              aria-label={`Question ${i + 1}, ${it.answered ? 'answered' : 'not answered'}`}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
                it.answered ? 'border-gold-400 bg-gold-200/70' : 'border-line-strong bg-white hover:bg-ivory-200',
                i === current && 'ring-2 ring-ink-900 ring-offset-1',
              )}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 hidden items-center gap-3 text-xs text-ink-500 lg:flex" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-gold-400 bg-gold-200/70" /> Answered</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line-strong bg-white" /> Not answered</span>
      </p>
    </nav>
  )
}
