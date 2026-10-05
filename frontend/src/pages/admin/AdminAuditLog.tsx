import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useAuditLog } from '@/lib/adminQueries'
import { dateTimeLabel } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'

const ENTITY_PATH: Record<string, string> = { question: '/admin/questions', assessment: '/admin/assessments' }
const TONE = { CREATE: 'success', UPDATE: 'gold', DELETE: 'danger' } as const

export default function AdminAuditLog() {
  usePageTitle('Admin · Audit log')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const list = useAuditLog({ entity_type: entity || undefined, action: action || undefined, page })

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Entity" value={entity} onChange={(v) => { setEntity(v); setPage(1) }} options={[{ value: '', label: 'All entities' }, { value: 'question', label: 'Questions' }, { value: 'assessment', label: 'Assessments' }, { value: 'user', label: 'Users' }]} />
          <Select label="Action" value={action} onChange={(v) => { setAction(v); setPage(1) }} options={[{ value: '', label: 'All actions' }, { value: 'CREATE', label: 'Create' }, { value: 'UPDATE', label: 'Update' }, { value: 'DELETE', label: 'Delete' }]} />
        </div>
      </Card>

      {list.isPending ? (
        <BlockSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="We couldn't load the audit log" />
      ) : list.data.items.length === 0 ? (
        <Card><EmptyState icon={ScrollText} title="No entries" text="Admin changes are recorded here." /></Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <caption className="sr-only">Audit log</caption>
              <thead className="border-b border-line bg-ivory-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>{['When', 'Admin', 'Action', 'Entity', 'Details'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {list.data.items.map((a) => {
                  const base = ENTITY_PATH[a.entity_type]
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateTimeLabel(a.created_at)}</td>
                      <td className="px-4 py-3">{a.admin_name ?? <span className="text-ink-500">Deleted admin</span>}</td>
                      <td className="px-4 py-3"><Badge tone={TONE[a.action as keyof typeof TONE] ?? 'neutral'}>{a.action}</Badge></td>
                      <td className="px-4 py-3">
                        <span className="capitalize">{a.entity_type}</span>{' '}
                        {a.entity_id != null && (base && a.action !== 'DELETE' ? <Link to={`${base}/${a.entity_id}`} className="font-medium text-mustard-700 hover:underline">#{a.entity_id}</Link> : <span className="text-ink-600">#{a.entity_id}</span>)}
                      </td>
                      <td className="px-4 py-3">
                        {a.details ? (
                          <details><summary className="cursor-pointer text-mustard-700">View</summary><pre className="mt-1 max-w-sm overflow-x-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(a.details, null, 2)}</pre></details>
                        ) : <span className="text-ink-500">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
          <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onChange={setPage} />
        </>
      )}
    </div>
  )
}
