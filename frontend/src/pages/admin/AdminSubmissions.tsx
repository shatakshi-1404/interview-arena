import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useAdminSubmissions } from '@/lib/adminQueries'
import { dateTimeLabel } from '@/lib/format'
import { STATUS_TEXT } from '@/lib/labels'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { usePageTitle } from '@/lib/usePageTitle'

const positiveInt = (v: string) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : undefined)
const tone = (s: string) => (s === 'ACCEPTED' ? 'success' : s === 'WRONG_ANSWER' ? 'danger' : 'gold')

export default function AdminSubmissions() {
  usePageTitle('Admin · Submissions')
  const [status, setStatus] = useState('')
  const [language, setLanguage] = useState('')
  const [questionText, setQuestionText] = useState('')
  const [userText, setUserText] = useState('')
  const [page, setPage] = useState(1)
  const questionId = positiveInt(useDebouncedValue(questionText))
  const userId = positiveInt(useDebouncedValue(userText))
  useEffect(() => setPage(1), [status, language, questionId, userId])

  const list = useAdminSubmissions({ status: status || undefined, language: language || undefined, question_id: questionId, user_id: userId, page })

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, ...Object.entries(STATUS_TEXT).map(([value, label]) => ({ value, label }))]} />
          <Select label="Language" value={language} onChange={setLanguage} options={[{ value: '', label: 'All languages' }, { value: 'python', label: 'Python' }, { value: 'java', label: 'Java' }, { value: 'sql', label: 'SQL' }]} />
          <Input label="Question ID" inputMode="numeric" value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
          <Input label="User ID" inputMode="numeric" value={userText} onChange={(e) => setUserText(e.target.value)} />
        </div>
      </Card>

      {list.isPending ? (
        <BlockSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="We couldn't load submissions" />
      ) : list.data.items.length === 0 ? (
        <Card><EmptyState icon={Send} title="No submissions found" text="Code and SQL submissions appear here as learners submit them." /></Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <caption className="sr-only">Submissions</caption>
              <thead className="border-b border-line bg-ivory-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>{['ID', 'User', 'Question', 'Language', 'Status', 'Tests', 'Runtime', 'Attempt', 'When', ''].map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono text-ink-600">{s.id}</td>
                    <td className="px-4 py-3"><span className="block font-medium">{s.user_name}</span><span className="text-xs text-ink-500">{s.user_email}</span></td>
                    <td className="px-4 py-3">{s.question_title}</td>
                    <td className="px-4 py-3">{s.language}</td>
                    <td className="px-4 py-3"><Badge tone={tone(s.status)}>{STATUS_TEXT[s.status] ?? s.status}</Badge></td>
                    <td className="px-4 py-3">{s.total_tests != null ? `${s.passed_tests ?? 0}/${s.total_tests}` : '—'}</td>
                    <td className="px-4 py-3">{s.runtime_ms != null ? `${s.runtime_ms} ms` : '—'}</td>
                    <td className="px-4 py-3">{s.attempt_number}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTimeLabel(s.created_at)}</td>
                    <td className="px-4 py-3"><Link to={`/admin/submissions/${s.id}`} className="font-medium text-mustard-700 hover:underline" aria-label={`View submission ${s.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onChange={setPage} />
        </>
      )}
    </div>
  )
}
