import { useState } from 'react'
import { Play, RotateCcw, Send } from 'lucide-react'
import { CodeEditor } from '@/components/code/CodeEditor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clampSeconds, useQuestionActions } from '@/lib/practice'
import { modKey } from '@/lib/shortcuts'
import { useDraft } from '@/lib/useDraft'
import { useStopwatch } from '@/lib/useStopwatch'
import type { QuestionDetail, RunResponse, SubmitResult } from '@/types/api'
import { ActionError } from './ActionError'
import { ElapsedTimer } from './ElapsedTimer'
import { SqlResultView } from './RunViews'
import { SubmitSummary } from './SubmitSummary'

const STARTER = '-- Write a single SELECT query\n'
type Outcome = { kind: 'run'; run: RunResponse } | { kind: 'submit'; result: SubmitResult }

export function SqlPanel({ q }: { q: QuestionDetail }) {
  const { run, submit } = useQuestionActions(q.id)
  const clock = useStopwatch()
  const [sql, setSql, resetSql] = useDraft(`ia.draft.${q.id}`, STARTER)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const busy = run.isPending || submit.isPending
  const ready = sql.replace(/--.*$/gm, '').trim().length > 0 && !busy

  const doRun = () => {
    if (!ready) return
    setError(null)
    run.mutate({ code: sql }, { onSuccess: (r) => setOutcome({ kind: 'run', run: r }), onError: setError })
  }
  const doSubmit = () => {
    if (!ready) return
    setError(null)
    submit.mutate(
      { code: sql, time_taken_seconds: clampSeconds(clock.read()) },
      { onSuccess: (r) => setOutcome({ kind: 'submit', result: r }), onError: setError },
    )
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Your query</h2>
          <ElapsedTimer seconds={clock.elapsed} limit={q.time_limit} />
        </div>
        <CodeEditor value={sql} onChange={setSql} language="sql" onRun={doRun} onSubmit={doSubmit} height={260} ariaLabel="SQL editor" />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={doRun} loading={run.isPending} disabled={!ready && !run.isPending}>
            <Play className="h-4 w-4" aria-hidden /> Run
          </Button>
          <Button onClick={doSubmit} loading={submit.isPending} disabled={!ready && !submit.isPending}>
            <Send className="h-4 w-4" aria-hidden /> Submit
          </Button>
          <Button variant="ghost" onClick={() => { resetSql(); setOutcome(null); setError(null) }}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset
          </Button>
        </div>
        <p className="text-xs text-ink-500">
          {modKey}+Enter runs, {modKey}+Shift+Enter submits. Only single SELECT queries are allowed. In the editor, {modKey === '⌘' ? 'Ctrl+Shift+M' : 'Ctrl+M'} lets Tab move focus out.
        </p>
      </Card>

      <ActionError error={error} />

      {outcome?.kind === 'run' && (
        <Card className="space-y-3 p-4 sm:p-5">
          <h3 className="text-base font-semibold">Run result</h3>
          <SqlResultView run={outcome.run} />
        </Card>
      )}
      {outcome?.kind === 'submit' && (
        <div className="space-y-4">
          <SubmitSummary result={outcome.result} />
          {outcome.result.run && (
            <Card className="p-4 sm:p-5"><SqlResultView run={outcome.result.run} /></Card>
          )}
        </div>
      )}
    </div>
  )
}
