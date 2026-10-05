import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, ClipboardCheck, Trash2 } from 'lucide-react'
import { ActionError } from '@/components/practice/ActionError'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { useAdminAssessment, useAdminQuestions, useSaveAssessment } from '@/lib/adminQueries'
import { ApiError } from '@/lib/api'
import { CATEGORY_KEYS, categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE, TYPE_LABEL } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { usePageTitle } from '@/lib/usePageTitle'
import type { AdminAssessment, Difficulty, QuestionType } from '@/types/api'

interface Item {
  question_id: number
  title: string
  category: string
  difficulty: Difficulty
  question_type: QuestionType
  points: string
}
interface AForm {
  title: string
  description: string
  duration: string
  difficulty: Difficulty
  published: boolean
  items: Item[]
}

const blank: AForm = { title: '', description: '', duration: '30', difficulty: 'MEDIUM', published: false, items: [] }
const fromAssessment = (a: AdminAssessment): AForm => ({
  title: a.title, description: a.description, duration: String(a.duration_minutes), difficulty: a.difficulty, published: a.is_published,
  items: [...a.questions].sort((x, y) => x.position - y.position).map((q) => ({
    question_id: q.question_id, title: q.title, category: q.category, difficulty: q.difficulty, question_type: q.question_type, points: String(q.points),
  })),
})

function validate(f: AForm, locked: boolean): Record<string, string> {
  const e: Record<string, string> = {}
  if (f.title.trim().length < 3) e.title = 'Enter a title (at least 3 characters)'
  else if (f.title.trim().length > 200) e.title = 'Use at most 200 characters'
  if (f.description.length > 5000) e.description = 'Use at most 5000 characters'
  const d = Number(f.duration)
  if (!Number.isInteger(d) || d < 1 || d > 480) e.duration = 'Use a whole number of minutes from 1 to 480'
  if (!locked) {
    if (f.items.some((it) => { const p = Number(it.points); return !Number.isInteger(p) || p < 1 || p > 100 })) e.questions = 'Points must be whole numbers from 1 to 100'
    else if (f.published && f.items.length === 0) e.questions = 'A published assessment needs at least one question'
  }
  return e
}

function QuestionPicker({ added, onAdd }: { added: Set<number>; onAdd: (q: { id: number; title: string; category: string; difficulty: Difficulty; question_type: QuestionType }) => void }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const term = useDebouncedValue(search.trim())
  const list = useAdminQuestions({ q: term || undefined, category: category || undefined, page: 1 }, 10)
  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold">Add questions</h3>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Input label="Search questions to add" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Picker category" value={category} onChange={setCategory} options={[{ value: '', label: 'All categories' }, ...CATEGORY_KEYS.map((k) => ({ value: k, label: categoryLabel(k) }))]} />
      </div>
      {list.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <p className="text-sm text-ink-600">No questions match.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.data.items.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 font-medium">{q.title}</span>
              <Badge>{categoryLabel(q.category)}</Badge>
              <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
              <Badge>{TYPE_LABEL[q.question_type]}</Badge>
              {!q.is_published && <Badge tone="danger">Draft</Badge>}
              <Button variant="secondary" size="sm" aria-label={`Add ${q.title}`} disabled={!q.is_published || added.has(q.id)}
                title={!q.is_published ? 'Publish the question first' : undefined} onClick={() => onAdd(q)}>
                {added.has(q.id) ? 'Added' : 'Add'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-500">Only published questions can be added. Showing the first 10 matches; refine the search to find others.</p>
    </Card>
  )
}

function AssessmentEditor({ source, id }: { source: AdminAssessment | null; id?: number }) {
  const editing = id !== undefined
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveAssessment(id)
  const initial = source ? fromAssessment(source) : blank
  const [f, setF] = useState<AForm>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const baseline = useRef(JSON.stringify(initial))
  const dirty = JSON.stringify(f) !== baseline.current && !save.isSuccess
  const locked = (source?.attempt_count ?? 0) > 0
  const set = (patch: Partial<AForm>) => setF((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const move = (i: number, dir: -1 | 1) => {
    const items = [...f.items]
    const j = i + dir
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j]!, items[i]!]
    set({ items })
  }
  const total = f.items.reduce((s, it) => s + (Number.isInteger(Number(it.points)) ? Number(it.points) : 0), 0)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const found = validate(f, locked)
    setErrors(found)
    if (Object.keys(found).length) return
    const body = {
      title: f.title.trim(),
      description: f.description.trim(),
      duration_minutes: Number(f.duration),
      difficulty: f.difficulty,
      is_published: f.published,
      ...(locked ? {} : { questions: f.items.map((it) => ({ question_id: it.question_id, points: Number(it.points) })) }),
    }
    save.mutate(body, {
      onSuccess: () => {
        toast.success(editing ? 'Assessment updated.' : 'Assessment created.')
        navigate('/admin/assessments')
      },
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card className="space-y-4 p-5 sm:p-6">
        <Input label="Title" value={f.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
        <Textarea label="Description" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} error={errors.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Duration (minutes)" type="number" inputMode="numeric" min={1} max={480} value={f.duration} onChange={(e) => set({ duration: e.target.value })} error={errors.duration} />
          <Select label="Difficulty" value={f.difficulty} onChange={(v) => set({ difficulty: v as Difficulty })} options={Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({ value, label }))} />
        </div>
        <Switch label="Published" description={editing ? 'Unpublished assessments are hidden from learners.' : 'New assessments start as drafts. Publish once the questions are final.'} checked={f.published} onChange={(v) => set({ published: v })} />
      </Card>

      <section aria-labelledby="aq-heading" className="space-y-3">
        <h2 id="aq-heading" className="text-base font-semibold">Questions</h2>
        {locked && (
          <p role="note" className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-ink-800">
            This assessment already has {source?.attempt_count} {source?.attempt_count === 1 ? 'attempt' : 'attempts'}, so its question list can't change. Create a new assessment to use different questions.
          </p>
        )}
        {errors.questions && <p className="text-sm font-medium text-danger">{errors.questions}</p>}

        {f.items.length === 0 ? (
          <Card><EmptyState icon={ClipboardCheck} title="No questions yet" text="Use the picker below to add published questions." /></Card>
        ) : (
          <Card>
            <ol className="divide-y divide-line">
              {f.items.map((it, i) => (
                <li key={it.question_id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="w-6 font-mono text-ink-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 font-medium">{it.title}</span>
                  <Badge>{categoryLabel(it.category)}</Badge>
                  <Badge tone={DIFFICULTY_TONE[it.difficulty]}>{DIFFICULTY_LABEL[it.difficulty]}</Badge>
                  <Badge>{TYPE_LABEL[it.question_type]}</Badge>
                  <input
                    type="number" min={1} max={100} value={it.points} disabled={locked}
                    onChange={(e) => set({ items: f.items.map((x, k) => (k === i ? { ...x, points: e.target.value } : x)) })}
                    aria-label={`Points for ${it.title}`}
                    className="h-9 w-16 rounded-lg border border-line-strong bg-white px-2 text-sm disabled:bg-ivory-100"
                  />
                  {!locked && (
                    <div className="flex">
                      <button type="button" aria-label={`Move ${it.title} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 text-ink-600 hover:bg-ivory-200 disabled:opacity-30"><ArrowUp className="h-4 w-4" aria-hidden /></button>
                      <button type="button" aria-label={`Move ${it.title} down`} disabled={i === f.items.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 text-ink-600 hover:bg-ivory-200 disabled:opacity-30"><ArrowDown className="h-4 w-4" aria-hidden /></button>
                      <button type="button" aria-label={`Remove ${it.title}`} onClick={() => set({ items: f.items.filter((_, k) => k !== i) })} className="rounded-lg p-2 text-ink-500 hover:bg-ivory-200 hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <p className="border-t border-line px-4 py-2 text-sm text-ink-600">{f.items.length} {f.items.length === 1 ? 'question' : 'questions'} · {total} points</p>
          </Card>
        )}

        {!locked && (
          <QuestionPicker
            added={new Set(f.items.map((x) => x.question_id))}
            onAdd={(q) => set({ items: [...f.items, { question_id: q.id, title: q.title, category: q.category, difficulty: q.difficulty, question_type: q.question_type, points: '1' }] })}
          />
        )}
      </section>

      <ActionError error={save.error} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create assessment'}</Button>
        <ButtonLink to="/admin/assessments" variant="secondary">Cancel</ButtonLink>
      </div>
    </form>
  )
}

export default function AdminAssessmentEditor() {
  const { assessmentId } = useParams()
  const creating = assessmentId === undefined
  const id = Number(assessmentId)
  const valid = creating || (Number.isInteger(id) && id > 0)
  const q = useAdminAssessment(id, !creating && valid)
  usePageTitle(creating ? 'Admin · New assessment' : 'Admin · Edit assessment')

  const back = (
    <Link to="/admin/assessments" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to assessments
    </Link>
  )
  if (!valid || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return <div className="space-y-4">{back}<Card><EmptyState icon={ClipboardCheck} title="Assessment not found" text="It may have been deleted." /></Card></div>
  }
  return (
    <div className="space-y-4">
      {back}
      <h2 className="text-xl font-semibold tracking-tight">{creating ? 'New assessment' : 'Edit assessment'}</h2>
      {!creating && q.isPending ? (
        <div aria-busy="true" aria-label="Loading assessment" className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full" /></div>
      ) : !creating && q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load this assessment" />
      ) : (
        <AssessmentEditor key={q.data?.id ?? 'new'} source={creating ? null : q.data!} id={creating ? undefined : id} />
      )}
    </div>
  )
}
