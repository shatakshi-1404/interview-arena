import { Badge } from '@/components/ui/Badge'
import { STATUS_TEXT } from '@/lib/labels'
import type { ResultTable, RunResponse } from '@/types/api'

function StatusBadge({ status }: { status: RunResponse['status'] }) {
  const tone = status === 'ACCEPTED' ? 'success' : status === 'WRONG_ANSWER' ? 'danger' : 'gold'
  return <Badge tone={tone}>{STATUS_TEXT[status] ?? status}</Badge>
}

function Cell({ v }: { v: unknown }) {
  if (v === null) return <span className="italic text-ink-500">NULL</span>
  if (typeof v === 'object') return <>{JSON.stringify(v)}</>
  return <>{String(v)}</>
}

export function DataTable({ title, table }: { title: string; table: ResultTable | null }) {
  if (!table) return null
  return (
    <div className="min-w-0">
      <h4 className="mb-1.5 text-sm font-semibold">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label="Query result table">
        <table className="w-full text-left font-mono text-xs">
          <caption className="sr-only">{title}</caption>
          <thead className="bg-ivory-50 text-ink-600">
            <tr>{table.columns.map((c, i) => <th key={i} scope="col" className="px-3 py-2 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {table.rows.length === 0 ? (
              <tr><td colSpan={Math.max(1, table.columns.length)} className="px-3 py-3 text-ink-500">No rows</td></tr>
            ) : (
              table.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} className="px-3 py-2"><Cell v={v} /></td>)}</tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {table.truncated && <p className="mt-1 text-xs text-ink-500">Showing the first rows only.</p>}
    </div>
  )
}

export function SqlResultView({ run }: { run: RunResponse }) {
  const failed = run.status === 'RUNTIME_ERROR' || run.status === 'TIME_LIMIT_EXCEEDED'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={run.status} />
        {run.runtime_ms != null && <span className="text-sm text-ink-600">Execution time: {run.runtime_ms} ms</span>}
      </div>
      {run.message && (
        <p className={failed ? 'whitespace-pre-wrap rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 font-mono text-xs text-danger' : 'rounded-lg border border-line bg-ivory-50 px-3 py-2 text-sm text-ink-700'}>
          {run.message}
        </p>
      )}
      {run.sql && (
        <div className="grid gap-4 xl:grid-cols-2">
          <DataTable title="Expected result" table={run.sql.expected} />
          <DataTable title="Your result" table={run.sql.actual} />
        </div>
      )}
    </div>
  )
}

export function CodeResultView({ run }: { run: RunResponse }) {
  const code = run.code
  if (!code) return null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={run.status} />
        <span className="text-sm text-ink-600">Passed {code.passed} of {code.total} tests</span>
        {run.runtime_ms != null && <span className="text-sm text-ink-600">Runtime: {run.runtime_ms} ms</span>}
      </div>
      {code.compile_error && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 font-mono text-xs text-danger">{code.compile_error}</pre>
      )}
      <ul className="space-y-2">
        {code.cases.map((c) => (
          <li key={c.index} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Test {c.index + 1} · {c.is_sample ? 'sample' : 'hidden'}</span>
              <Badge tone={c.passed ? 'success' : 'danger'}>{c.passed ? 'Passed' : 'Failed'}</Badge>
            </div>
            {c.is_sample && (
              <dl className="mt-2 space-y-2">
                {([['Input', c.input_data], ['Expected', c.expected_output], ['Your output', c.actual_output], ['Error', c.error]] as const)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs font-medium text-ink-500">{k}</dt>
                      <dd className="whitespace-pre-wrap font-mono text-xs">{v}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
