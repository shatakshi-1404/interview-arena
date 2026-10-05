import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { clampSeconds, useQuestionActions } from '@/lib/practice'
import { modKey, useCtrlEnter } from '@/lib/shortcuts'
import { useStopwatch } from '@/lib/useStopwatch'
import type { QuestionDetail } from '@/types/api'
import { ActionError } from './ActionError'
import { ElapsedTimer } from './ElapsedTimer'
import { SubmitSummary } from './SubmitSummary'

export function McqPanel({ q }: { q: QuestionDetail }) {
  const { submit } = useQuestionActions(q.id)
  const clock = useStopwatch()
  const [selected, setSelected] = useState<number[]>([])
  const result = submit.data
  const locked = !!result

  const toggle = (id: number) =>
    setSelected((prev) => (q.multiple_answers ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]))

  const send = () => {
    if (!selected.length || submit.isPending || locked) return
    submit.mutate(
      { selected_option_ids: selected, time_taken_seconds: clampSeconds(clock.stop()) },
      { onError: () => clock.resume() },
    )
  }
  useCtrlEnter(send, !locked)

  const again = () => {
    submit.reset()
    setSelected([])
    clock.reset()
  }

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Your answer</h2>
        <ElapsedTimer seconds={clock.elapsed} limit={q.time_limit} />
      </div>

      <fieldset disabled={locked}>
        <legend className="text-sm text-ink-600">{q.multiple_answers ? 'Select all that apply.' : 'Select one answer.'}</legend>
        <ul className="mt-3 space-y-2">
          {q.options.map((o) => {
            const isSelected = selected.includes(o.id)
            const isCorrect = result?.correct_option_ids?.includes(o.id) ?? false
            const tone = result
              ? isCorrect ? 'border-success bg-success-soft' : isSelected ? 'border-danger bg-danger-soft' : 'border-line bg-white'
              : isSelected ? 'border-gold-500 bg-gold-50' : 'border-line bg-white hover:border-line-strong'
            return (
              <li key={o.id}>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', tone, locked && 'cursor-default')}>
                  <input
                    type={q.multiple_answers ? 'checkbox' : 'radio'}
                    name={`q-${q.id}`}
                    checked={isSelected}
                    onChange={() => toggle(o.id)}
                    className="mt-0.5 h-4 w-4 accent-gold-600"
                  />
                  <span className="flex-1">{o.text}</span>
                  {result && isCorrect && <span className="text-xs font-medium text-success">Correct answer</span>}
                  {result && !isCorrect && isSelected && <span className="text-xs font-medium text-danger">Your answer (incorrect)</span>}
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <ActionError error={submit.error} />

      {result ? (
        <div className="space-y-4">
          <SubmitSummary result={result} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={again}>Try again</Button>
            <Link to="/practice" className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-ink-700 hover:bg-ivory-200">Back to questions</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={send} loading={submit.isPending} disabled={!selected.length}>Check answer</Button>
          <span className="text-xs text-ink-500">{modKey}+Enter to submit</span>
        </div>
      )}
    </Card>
  )
}
