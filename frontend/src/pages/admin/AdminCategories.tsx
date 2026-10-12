import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { BlockSkeleton, ErrorState } from '@/components/ui/States'
import { useAdminCategories } from '@/lib/adminQueries'
import { DIFFICULTY_LABEL, TYPE_LABEL } from '@/lib/labels'
import { usePageTitle } from '@/lib/usePageTitle'

export default function AdminCategories() {
  usePageTitle('Admin · Categories')
  const q = useAdminCategories()
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-ink-600">
        Categories are a fixed set built into the platform. This is an overview of the content in each one.
      </p>
      {q.isPending ? (
        <BlockSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load categories" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {q.data.map((c) => (
            <li key={c.key}>
              <Card className="h-full space-y-3 p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold">{c.label}</h2>
                  <span className="text-sm text-ink-600">{c.published} of {c.total} published</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(c.by_difficulty).map(([k, n]) => <Badge key={k}>{DIFFICULTY_LABEL[k as keyof typeof DIFFICULTY_LABEL] ?? k} · {n}</Badge>)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(c.by_type).map(([k, n]) => <Badge key={k} tone="gold">{TYPE_LABEL[k as keyof typeof TYPE_LABEL] ?? k} · {n}</Badge>)}
                </div>
                {c.total === 0 && <p className="text-sm text-ink-500">No questions yet.</p>}
                <Link to={`/admin/questions?category=${c.key}`} className="inline-block text-sm font-medium text-mustard-700 hover:underline">View questions</Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
