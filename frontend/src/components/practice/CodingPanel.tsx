import { useState } from 'react'
import { Play, RotateCcw, Send } from 'lucide-react'
import { CodeEditor } from '@/components/code/CodeEditor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { clampSeconds, useQuestionActions } from '@/lib/practice'
import { modKey } from '@/lib/shortcuts'
import { useDraft } from '@/lib/useDraft'
import { useStopwatch } from '@/lib/useStopwatch'
import type { Capabilities, QuestionDetail, RunResponse, SubmitResult } from '@/types/api'
import { ActionError } from './ActionError'
import { ElapsedTimer } from './ElapsedTimer'
import { CodeResultView } from './RunViews'
import { SubmitSummary } from './SubmitSummary'

const LANGS = [{ value: 'python', label: 'Python' }, { value: 'java', label: 'Java' }]
type Outcome = { kind: 'run'; run: RunResponse } | { kind: 'submit'; result: SubmitResult }

export function CodingPanel({ q, caps }: { q: QuestionDetail; caps: Capabilities | undefined }) {
  const { run, submit } = useQuestionActions(q.id)
  const clock = useStopwatch()
  const offered = LANGS.filter((l) => q.starter_code?.[l.value] != null)
  const langs = offered.length ? offered : LANGS
  const [language, setLanguage] = useState(langs[0]!.value)
  const starter = q.starter_code?.[language] ?? ''
  const [code, setCode, resetCode] = useDraft(`ia.draft.${q.id}.${language}`, starter)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const unavailable = caps?.coding === false
  const busy = run.isPending || submit.isPending
  const ready = code.trim().length > 0 && !busy && !unavailable

  const doRun = () => {
    if (!ready) return
    setError(null)
    run.mutate({ code, language }, { onSuccess: (r) => setOutcome({ kind: 'run', run: r }), onError: setError })
  }
  const doSubmit = () => {
    if (!ready) return
    setError(null)
    submit.mutate(
      { code, language, time_taken_seconds: clampSeconds(clock.read()) },
      { onSuccess: (r) => setOutcome({ kind: 'submit', result: r }), onError: setError },
    )
  }

  return (
    <div className="space-y-4">
      {unavailable && (
        <div role="status" className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-ink-800">
          Code execution isn't enabled on this server yet, so coding answers can't be run or graded. You can still write your solution here; it's saved in this browser.
        </div>
      )}
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Select label="Language" value={language} onChange={(v) => { setLanguage(v); setOutcome(null) }} options={langs} className="w-40" />
          <ElapsedTimer seconds={clock.elapsed} limit={q.time_limit} />
        </div>
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language as 'python' | 'java'}
          onRun={doRun}
          onSubmit={doSubmit}
          height={340}
          ariaLabel={`${language} code editor`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={doRun} loading={run.isPending} disabled={!ready && !run.isPending}>
            <Play className="h-4 w-4" aria-hidden /> Run
          </Button>
          <Button onClick={doSubmit} loading={submit.isPending} disabled={!ready && !submit.isPending}>
            <Send className="h-4 w-4" aria-hidden /> Submit
          </Button>
          <Button variant="ghost" onClick={() => { resetCode(); setOutcome(null); setError(null) }}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset
          </Button>
        </div>
        <p className="text-xs text-ink-500">
          Run checks the sample tests; Submit checks all tests. {modKey}+Enter runs, {modKey}+Shift+Enter submits. In the editor, {modKey === '⌘' ? 'Ctrl+Shift+M' : 'Ctrl+M'} lets Tab move focus out.
        </p>
      </Card>

      <ActionError error={error} hint="Your code is saved in this browser." />

      {outcome?.kind === 'run' && (
        <Card className="space-y-3 p-4 sm:p-5">
          <h3 className="text-base font-semibold">Run result (sample tests)</h3>
          <CodeResultView run={outcome.run} />
        </Card>
      )}
      {outcome?.kind === 'submit' && (
        <div className="space-y-4">
          <SubmitSummary result={outcome.result} />
          {outcome.result.run && <Card className="p-4 sm:p-5"><CodeResultView run={outcome.result.run} /></Card>}
        </div>
      )}
    </div>
  )
}
