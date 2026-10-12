import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileQuestion, X } from 'lucide-react'
import { StatusChip } from '@/components/practice/StatusChip'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { cn } from '@/lib/cn'
import { CATEGORY_KEYS, categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE, TYPE_LABEL } from '@/lib/labels'
import { PAGE_SIZE, useQuestionMeta, useQuestions } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { QuestionSummary } from '@/types/api'

const DIFFICULTY_OPTIONS = [{ value: '', label: 'All difficulties' }, ...Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({ value, label }))]
const TYPE_OPTIONS = [{ value: '', label: 'All types' }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]

function Row({ q, onTag }: { q: QuestionSummary; onTag: (t: string) => void }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/practice/${q.id}`} className="font-medium hover:underline">{q.title}</Link>
          <StatusChip status={q.user_status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge>{categoryLabel(q.category)}</Badge>
          <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
          <Badge>{TYPE_LABEL[q.question_type]}</Badge>
          {q.time_limit != null && <span className="text-xs text-ink-500">~{Math.max(1, Math.round(q.time_limit / 60))} min</span>}
          {q.tags.slice(0, 4).map((t) => (
            <button key={t} onClick={() => onTag(t)} className="rounded-md border border-line px-1.5 py-0.5 text-xs text-ink-600 hover:bg-ivory-200" aria-label={`Filter by tag ${t}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <ButtonLink to={`/practice/${q.id}`} variant="secondary" size="sm" className="self-start sm:self-center">
        {q.user_status === 'SOLVED' ? 'Practice again' : q.user_status === 'ATTEMPTED' ? 'Continue' : 'Start'}
      </ButtonLink>
    </li>
  )
}

export default function Practice() {
  usePageTitle('Practice')
  const [params, setParams] = useSearchParams()
  const urlQ = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const difficulty = params.get('difficulty') ?? ''
  const type = params.get('type') ?? ''
  const tag = params.get('tag') ?? ''
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)

  // The URL is the source of truth, so filters survive reloads and the top-bar search can set them.
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

  // Debounced title search. `lastPushed` stops the URL -> text -> URL loop from clobbering typing.
  const [text, setText] = useState(urlQ)
  const lastPushed = useRef(urlQ)
  useEffect(() => {
    if (urlQ !== lastPushed.current) {
      lastPushed.current = urlQ
      setText(urlQ)
    }
  }, [urlQ])
  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed === lastPushed.current) return
    const t = window.setTimeout(() => {
      lastPushed.current = trimmed
      update({ q: trimmed || undefined })
    }, 300)
    return () => window.clearTimeout(t)
  }, [text, update])

  const questions = useQuestions({
    q: urlQ || undefined,
    category: category || undefined,
    difficulty: difficulty || undefined,
    question_type: type || undefined,
    tag: tag || undefined,
    page,
  })
  const meta = useQuestionMeta()
  const counts = new Map(meta.data?.categories.map((c) => [c.value, c.count]))
  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...CATEGORY_KEYS.map((k) => ({ value: k, label: counts.has(k) ? `${categoryLabel(k)} (${counts.get(k)})` : categoryLabel(k) })),
  ]
  const filtered = Boolean(urlQ || category || difficulty || type || tag)
  const clearAll = () => {
    lastPushed.current = ''
    setText('')
    setParams({}, { replace: true })
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Practice</h1>
      <p className="mt-1 text-ink-600">Pick a question, answer it, and see exactly how you did.</p>

      <Card className="mt-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <Input label="Filter by title" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. binary search" />
          <Select label="Category" value={category} onChange={(v) => update({ category: v || undefined })} options={categoryOptions} />
          <Select label="Difficulty" value={difficulty} onChange={(v) => update({ difficulty: v || undefined })} options={DIFFICULTY_OPTIONS} />
          <Select label="Type" value={type} onChange={(v) => update({ type: v || undefined })} options={TYPE_OPTIONS} />
        </div>
        {(tag || filtered) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tag && (
              <button onClick={() => update({ tag: undefined })} className="inline-flex items-center gap-1 rounded-md bg-gold-100 px-2 py-1 text-xs font-medium text-gold-700">
                Tag: {tag} <X className="h-3 w-3" aria-hidden /><span className="sr-only">Remove tag filter</span>
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={clearAll}>Clear all filters</Button>
          </div>
        )}
      </Card>

      <div className="mt-6 space-y-4">
        {questions.isPending ? (
          <Card className="divide-y divide-line" aria-busy="true" aria-label="Loading questions">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-2 p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
            ))}
          </Card>
        ) : questions.isError ? (
          <ErrorState error={questions.error} onRetry={() => questions.refetch()} title="We couldn't load questions" />
        ) : questions.data.items.length === 0 ? (
          <Card>
            <EmptyState
              icon={FileQuestion}
              title={filtered ? 'No questions match your filters' : 'No questions are published yet'}
              text={filtered ? 'Try removing a filter or searching for something broader.' : 'Check back soon. An admin needs to publish questions first.'}
              action={filtered ? <Button variant="secondary" onClick={clearAll}>Clear all filters</Button> : undefined}
            />
          </Card>
        ) : (
          <>
            <Card className={cn('transition-opacity', questions.isPlaceholderData && 'opacity-60')}>
              <ul className="divide-y divide-line">
                {questions.data.items.map((q) => <Row key={q.id} q={q} onTag={(t) => update({ tag: t })} />)}
              </ul>
            </Card>
            <Pagination
              page={questions.data.page}
              pageSize={PAGE_SIZE}
              total={questions.data.total}
              onChange={(p) => {
                update({ page: p > 1 ? String(p) : undefined })
                window.scrollTo({ top: 0 })
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
