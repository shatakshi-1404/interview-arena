import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { QuestionFormFields } from '@/components/admin/QuestionFormFields'
import { ActionError } from '@/components/practice/ActionError'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useAdminQuestion, useSaveQuestion } from '@/lib/adminQueries'
import { ApiError } from '@/lib/api'
import { emptyForm, formFromQuestion, toPayload, validateForm, type QuestionForm } from '@/lib/questionForm'
import { usePageTitle } from '@/lib/usePageTitle'

function QuestionEditor({ initial, id }: { initial: QuestionForm; id?: number }) {
  const editing = id !== undefined
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveQuestion(id)
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const baseline = useRef(JSON.stringify(initial))
  const summaryRef = useRef<HTMLDivElement>(null)
  const dirty = JSON.stringify(form) !== baseline.current && !save.isSuccess
  const errorCount = Object.keys(errors).length

  useEffect(() => {
    if (Object.keys(errors).length) summaryRef.current?.focus()
  }, [errors])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateForm(form)
    setErrors(found)
    if (Object.keys(found).length) return
    save.mutate(toPayload(form, editing ? 'update' : 'create'), {
      onSuccess: () => {
        toast.success(editing ? 'Question updated.' : 'Question created.')
        navigate('/admin/questions')
      },
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {errorCount > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger outline-none">
          Please fix the {errorCount} highlighted {errorCount === 1 ? 'problem' : 'problems'} below.
        </div>
      )}
      <QuestionFormFields form={form} setForm={setForm} errors={errors} editing={editing} />
      <ActionError error={save.error} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create question'}</Button>
        <ButtonLink to="/admin/questions" variant="secondary">Cancel</ButtonLink>
      </div>
    </form>
  )
}

export default function AdminQuestionEditor() {
  const { questionId } = useParams()
  const creating = questionId === undefined
  const id = Number(questionId)
  const valid = creating || (Number.isInteger(id) && id > 0)
  const q = useAdminQuestion(id, !creating && valid)
  usePageTitle(creating ? 'Admin · New question' : 'Admin · Edit question')

  const back = (
    <Link to="/admin/questions" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to questions
    </Link>
  )

  if (!valid || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return <div className="space-y-4">{back}<Card><EmptyState icon={FileQuestion} title="Question not found" text="It may have been deleted." /></Card></div>
  }
  return (
    <div className="space-y-4">
      {back}
      <h2 className="text-xl font-semibold tracking-tight">{creating ? 'New question' : 'Edit question'}</h2>
      {!creating && q.isPending ? (
        <div aria-busy="true" aria-label="Loading question" className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full" /></div>
      ) : !creating && q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn't load this question" />
      ) : (
        <QuestionEditor key={q.data?.id ?? 'new'} initial={creating ? emptyForm() : formFromQuestion(q.data!)} id={creating ? undefined : id} />
      )}
    </div>
  )
}
