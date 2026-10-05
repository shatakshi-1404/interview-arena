import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clampSeconds, useQuestionActions } from '@/lib/practice'
import { modKey, useCtrlEnter } from '@/lib/shortcuts'
import { useDraft } from '@/lib/useDraft'
import { useStopwatch } from '@/lib/useStopwatch'
import type { Capabilities, QuestionDetail } from '@/types/api'
import { ActionError } from './ActionError'
import { ElapsedTimer } from './ElapsedTimer'
import { EvaluationView } from './EvaluationView'
import { SubmitSummary } from './SubmitSummary'

const MAX = 5000

export function ShortAnswerPanel({ q, caps }: { q: QuestionDetail; caps: Capabilities | undefined }) {
  const { submit } = useQuestionActions(q.id)
  const clock = useStopwatch()
  const [text, setText, resetText] = useDraft(`ia.draft.${q.id}`, '')
  const [, force] = useState(0)
  const result = submit.data
  const unavailable = caps?.shortAnswer === false
  const ready = text.trim().length > 0 && text.length <= MAX && !submit.isPending && !unavailable && !result

  const send = () => {
    if (!ready) return
    submit.mutate(
      { text_answer: text, time_taken_seconds: clampSeconds(clock.stop()) },
      { onError: () => clock.resume() },
    )
  }
  useCtrlEnter(send, !result)

  const again = () => {
    submit.reset()
    resetText()
    clock.reset()
    force((n) => n + 1)
  }

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      {unavailable && (
        <div role="status" className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-ink-800">
          Short-answer scoring is turned off on this server, so answers can't be submitted right now.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={`answer-${q.id}`} className="text-base font-semibold">Your answer</label>
        <ElapsedTimer seconds={clock.elapsed} limit={q.time_limit} />
      </div>
      <textarea
        id={`answer-${q.id}`}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!!result}
        placeholder="Explain in your own words…"
        className="w-full resize-y rounded-lg border border-line-strong bg-white p-3 text-sm focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-300/60"
      />
      <p className={text.length > MAX ? 'text-xs text-danger' : 'text-xs text-ink-500'}>{text.length} / {MAX} characters</p>

      <ActionError error={submit.error} />

      {result ? (
        <div className="space-y-4">
          <SubmitSummary result={result} />
          {result.evaluation && <EvaluationView ev={result.evaluation} modelAnswer={result.model_answer} />}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={again}>Try again</Button>
            <Link to="/practice" className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-ink-700 hover:bg-ivory-200">Back to questions</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={send} loading={submit.isPending} disabled={!ready && !submit.isPending}>Submit answer</Button>
          <span className="text-xs text-ink-500">{modKey}+Enter to submit</span>
        </div>
      )}
    </Card>
  )
}
