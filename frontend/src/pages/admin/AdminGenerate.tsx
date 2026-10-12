import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { ActionError } from '@/components/practice/ActionError'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useApproveQuestion, useGenerateQuestions } from '@/lib/adminQueries'
import { useAiStatus } from '@/lib/queries'
import { CATEGORY_KEYS, categoryLabel, DIFFICULTY_LABEL, TYPE_LABEL } from '@/lib/labels'
import { usePageTitle } from '@/lib/usePageTitle'

export default function AdminGenerate() {
  usePageTitle('Admin · AI generator')
  const toast = useToast()
  const status = useAiStatus()
  const gen = useGenerateQuestions()
  const approve = useApproveQuestion()
  const [topic, setTopic] = useState('')
  const [category, setCategory] = useState('DSA')
  const [difficulty, setDifficulty] = useState('MEDIUM')
  const [type, setType] = useState('MCQ')
  const [count, setCount] = useState('3')
  const [approved, setApproved] = useState<number[]>([])

  const enabled = status.data?.enabled
  const ready = topic.trim().length >= 3 && !gen.isPending && enabled !== false

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setApproved([])
    gen.mutate({ topic: topic.trim(), category, difficulty, question_type: type, count: Number(count) })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">
        Draft questions with an LLM. Nothing goes live: every draft is saved unpublished, and you approve (or delete) each one.
        SQL drafts are checked by running their reference query, and coding drafts by running their reference solution against the generated tests.
      </p>
      {enabled === false && (
        <div role="status" className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-ink-800">
          AI is not configured on this server. Set LLM_PROVIDER, LLM_MODEL and an API key (see the README) to enable it.
        </div>
      )}

      <Card className="p-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_6rem_auto] lg:items-end">
          <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. database indexing" maxLength={200} />
          <Select label="Category" value={category} onChange={setCategory} options={CATEGORY_KEYS.map((k) => ({ value: k, label: categoryLabel(k) }))} />
          <Select label="Difficulty" value={difficulty} onChange={setDifficulty} options={Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({ value, label }))} />
          <Select label="Type" value={type} onChange={setType} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <Select label="How many" value={count} onChange={setCount} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
          <Button type="submit" loading={gen.isPending} disabled={!ready}><Sparkles className="h-4 w-4" aria-hidden /> Generate</Button>
        </form>
        <p className="mt-3 text-xs text-ink-500">Takes 10-40 seconds. {status.data ? `${status.data.daily_limit - status.data.used_today} AI requests left today.` : ''}</p>
      </Card>

      <ActionError error={gen.error} />

      {gen.data && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{gen.data.drafts.length} draft{gen.data.drafts.length === 1 ? '' : 's'} created by {gen.data.model}</h2>
          {gen.data.drafts.map((d) => (
            <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link to={`/admin/questions/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                <div className="mt-1 flex gap-2"><Badge>{TYPE_LABEL[d.question_type]}</Badge><Badge tone="gold">AI draft</Badge></div>
              </div>
              <div className="flex gap-2">
                <ButtonLink to={`/admin/questions/${d.id}`} variant="secondary" size="sm">Review &amp; edit</ButtonLink>
                {approved.includes(d.id) || d.is_published ? (
                  <Badge tone="success">Published</Badge>
                ) : (
                  <Button
                    size="sm"
                    loading={approve.isPending && approve.variables === d.id}
                    onClick={() => approve.mutate(d.id, { onSuccess: () => { setApproved((a) => [...a, d.id]); toast.success('Approved and published.') }, onError: (e) => toast.error(e.message) })}
                  >
                    Approve
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {gen.data.skipped.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold">Rejected automatically</h3>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                {gen.data.skipped.map((s, i) => <li key={i}><span className="font-medium">{s.title}</span>: {s.reason}</li>)}
              </ul>
            </Card>
          )}
          <p className="text-sm text-ink-600"><Link to="/admin/questions?review=1" className="font-medium underline">All AI drafts waiting for review</Link></p>
        </div>
      )}
    </div>
  )
}
