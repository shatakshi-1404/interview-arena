import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileQuestion, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useAdminQuestions, useDeleteQuestion, usePatchQuestion } from '@/lib/adminQueries'
import { dateLabel } from '@/lib/format'
import { CATEGORY_KEYS, categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE, TYPE_LABEL } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { usePageTitle } from '@/lib/usePageTitle'
import type { QuestionSummary } from '@/types/api'

const ALL = (label: string) => ({ value: '', label })

export default function AdminQuestions() {
  usePageTitle('Admin · Questions')
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const difficulty = params.get('difficulty') ?? ''
  const type = params.get('type') ?? ''
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const [text, setText] = useState(params.get('q') ?? '')
  const term = useDebouncedValue(text.trim())

  const update = useCallback(
    (patch: Record<string, string | undefined>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!('page' in patch)) next.delete('page')
        return next
      }, { replace: true }),
    [setParams],
  )

  const list = useAdminQuestions({ q: term || undefined, category: category || undefined, difficulty: difficulty || undefined, question_type: type || undefined, page })
  const patch = usePatchQuestion()
  const del = useDeleteQuestion()
  const [deleting, setDeleting] = useState<QuestionSummary | null>(null)

  const togglePublish = (q: QuestionSummary) =>
    patch.mutate(
      { id: q.id, body: { is_published: !q.is_published } },
      { onSuccess: () => toast.success(q.is_published ? 'Question unpublished.' : 'Question published.'), onError: (e) => toast.error(e.message) },
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">Drafts and published questions. Learners only see published ones.</p>
        <ButtonLink to="/admin/questions/new"><Plus className="h-4 w-4" aria-hidden /> New question</ButtonLink>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <Input label="Search questions" type="search" value={text} onChange={(e) => { setText(e.target.value); update({}) }} placeholder="Title" />
          <Select label="Category" value={category} onChange={(v) => update({ category: v || undefined })} options={[ALL('All categories'), ...CATEGORY_KEYS.map((k) => ({ value: k, label: categoryLabel(k) }))]} />
          <Select label="Difficulty" value={difficulty} onChange={(v) => update({ difficulty: v || undefined })} options={[ALL('All difficulties'), ...Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({ value, label }))]} />
          <Select label="Type" value={type} onChange={(v) => update({ type: v || undefined })} options={[ALL('All types'), ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]} />
        </div>
      </Card>

      {list.isPending ? (
        <BlockSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="We couldn't load questions" />
      ) : list.data.items.length === 0 ? (
        <Card><EmptyState icon={FileQuestion} title="No questions found" text="Create one, or change the filters." action={<ButtonLink to="/admin/questions/new">New question</ButtonLink>} /></Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">Questions</caption>
              <thead className="border-b border-line bg-ivory-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>{['Title', 'Category', 'Difficulty', 'Type', 'Status', 'Created', 'Actions'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((q) => (
                  <tr key={q.id}>
                    <th scope="row" className="px-4 py-3 text-left font-medium"><Link to={`/admin/questions/${q.id}`} className="hover:underline">{q.title}</Link></th>
                    <td className="px-4 py-3">{categoryLabel(q.category)}</td>
                    <td className="px-4 py-3"><Badge tone={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Badge></td>
                    <td className="px-4 py-3">{TYPE_LABEL[q.question_type]}</td>
                    <td className="px-4 py-3"><Badge tone={q.is_published ? 'success' : 'neutral'}>{q.is_published ? 'Published' : 'Draft'}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateLabel(q.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex gap-2">
                        <ButtonLink to={`/admin/questions/${q.id}`} variant="secondary" size="sm" aria-label={`Edit ${q.title}`}>Edit</ButtonLink>
                        <Button variant="ghost" size="sm" aria-label={`${q.is_published ? 'Unpublish' : 'Publish'} ${q.title}`} disabled={patch.isPending && patch.variables?.id === q.id} onClick={() => togglePublish(q)}>
                          {q.is_published ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={`Delete ${q.title}`} onClick={() => { del.reset(); setDeleting(q) }}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete question?"
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        error={del.error}
        onCancel={() => !del.isPending && setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id, { onSuccess: () => { toast.success('Question deleted.'); setDeleting(null) } })}
      >
        <p>"{deleting?.title}" is permanently deleted, along with every learner's answer history for it.</p>
        <p>If you only want to hide it, unpublish it instead.</p>
      </ConfirmDialog>
    </div>
  )
}
