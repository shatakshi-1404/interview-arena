import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

export function Pagination({ page, pageSize, total, onChange }: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  if (total === 0) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-600">Showing {from}–{to} of {total}</p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
          </Button>
          <span className="text-sm text-ink-600">Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
    </nav>
  )
}
