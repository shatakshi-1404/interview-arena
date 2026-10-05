import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useAdminAssessments, useDeleteAssessment, usePatchAssessment } from '@/lib/adminQueries'
import { DIFFICULTY_LABEL, DIFFICULTY_TONE } from '@/lib/labels'
import { usePageTitle } from '@/lib/usePageTitle'
import type { AssessmentSummary } from '@/types/api'

export default function AdminAssessments() {
  usePageTitle('Admin · Assessments')
  const toast = useToast()
  const [page, setPage] = useState(1)
  const list = useAdminAssessments(page)
  const patch = usePatchAssessment()
  const del = useDeleteAssessment()
  const [deleting, setDeleting] = useState<AssessmentSummary | null>(null)

  const toggle = (a: AssessmentSummary) =>
    patch.mutate(
      { id: a.id, body: { is_published: !a.is_published } },
      { onSuccess: () => toast.success(a.is_published ? 'Assessment unpublished.' : 'Assessment published.'), onError: (e) => toast.error(e.message) },
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">Timed sets of questions. Learners only see published assessments.</p>
        <ButtonLink to="/admin/assessments/new"><Plus className="h-4 w-4" aria-hidden /> New assessment</ButtonLink>
      </div>

      {list.isPending ? (
        <BlockSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="We couldn't load assessments" />
      ) : list.data.items.length === 0 ? (
        <Card><EmptyState icon={ClipboardCheck} title="No assessments yet" text="Build one from your published questions." action={<ButtonLink to="/admin/assessments/new">New assessment</ButtonLink>} /></Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <caption className="sr-only">Assessments</caption>
              <thead className="border-b border-line bg-ivory-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>{['Title', 'Difficulty', 'Duration', 'Questions', 'Points', 'Status', 'Actions'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((a) => (
                  <tr key={a.id}>
                    <th scope="row" className="px-4 py-3 text-left font-medium"><Link to={`/admin/assessments/${a.id}`} className="hover:underline">{a.title}</Link></th>
                    <td className="px-4 py-3"><Badge tone={DIFFICULTY_TONE[a.difficulty]}>{DIFFICULTY_LABEL[a.difficulty]}</Badge></td>
                    <td className="px-4 py-3">{a.duration_minutes} min</td>
                    <td className="px-4 py-3">{a.question_count}</td>
                    <td className="px-4 py-3">{a.total_points}</td>
                    <td className="px-4 py-3"><Badge tone={a.is_published ? 'success' : 'neutral'}>{a.is_published ? 'Published' : 'Draft'}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex gap-2">
                        <ButtonLink to={`/admin/assessments/${a.id}`} variant="secondary" size="sm" aria-label={`Edit ${a.title}`}>Edit</ButtonLink>
                        <Button variant="ghost" size="sm" aria-label={`${a.is_published ? 'Unpublish' : 'Publish'} ${a.title}`} disabled={patch.isPending && patch.variables?.id === a.id} onClick={() => toggle(a)}>
                          {a.is_published ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={`Delete ${a.title}`} onClick={() => { del.reset(); setDeleting(a) }}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete assessment?"
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        error={del.error}
        onCancel={() => !del.isPending && setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => { toast.success('Assessment deleted.'); setDeleting(null) } })}
      >
        <p>"{deleting?.title}" is deleted. Assessments that already have attempts can't be deleted; unpublish them instead.</p>
      </ConfirmDialog>
    </div>
  )
}
