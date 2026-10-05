import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { ActionError } from '@/components/practice/ActionError'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Logo } from '@/components/ui/Logo'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { http } from '@/lib/api'
import { isAnswered } from '@/lib/exam'
import { invalidateLearningData, useCapabilities } from '@/lib/queries'
import { useCountdown, useTimeNotices } from '@/lib/useCountdown'
import { useExamAnswers } from '@/lib/useExamAnswers'
import type { AttemptResult, AttemptState } from '@/types/api'
import { ExamQuestion } from './ExamQuestion'
import { ExamTimer } from './ExamTimer'
import { QuestionNavigator } from './QuestionNavigator'
import { SaveIndicator } from './SaveIndicator'

export function ExamRunner({ state, receivedAt }: { state: AttemptState; receivedAt: number }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const caps = useCapabilities()

  const id = state.attempt_id
  const isMock = state.mode === 'MOCK_INTERVIEW'
  const destination = isMock ? `/mock-interviews/${id}/report` : `/attempts/${id}/result`

  const items = state.questions
  const details = useMemo(() => items.map((x) => x.question), [items])
  const [index, setIndex] = useState(0)
  const [navigated, setNavigated] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // The server's remaining time, turned into an absolute end time. Every autosave re-syncs it.
  const [endAt, setEndAt] = useState(() => receivedAt + state.remaining_seconds * 1000)
  const remaining = useCountdown(endAt)

  // Time spent per question (only while the tab is visible), reported with each saved answer.
  const [spent] = useState(
    () =>
      new Map<number, number>(
        state.answers.flatMap((a): [number, number][] => (a.time_taken_seconds != null ? [[a.question_id, a.time_taken_seconds]] : [])),
      ),
  )
  const currentId = details[index]?.id
  useEffect(() => {
    if (currentId == null) return
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') spent.set(currentId, (spent.get(currentId) ?? 0) + 1)
    }, 1000)
    return () => window.clearInterval(t)
  }, [currentId, spent])

  const answers = useExamAnswers({
    attemptId: id,
    questions: details,
    initial: state.answers,
    getSeconds: (qid) => spent.get(qid),
    onAck: (s) => setEndAt(Date.now() + s * 1000),
    onLocked: () => {
      invalidateLearningData(qc)
      navigate(destination, { replace: true })
    },
  })

  const submit = useMutation<AttemptResult, Error, { force: boolean }>({
    mutationFn: async ({ force }) => {
      const saved = await answers.flush()
      if (!saved && !force) throw new Error("We couldn't save your latest answers. Check your connection and try again.")
      return http.post<AttemptResult>(`/api/attempts/${id}/submit`)
    },
    onSuccess: (result) => {
      qc.setQueryData(['attempt-result', id], result)
      invalidateLearningData(qc)
      navigate(destination, { replace: true })
    },
  })
  const { mutate, isIdle, isError, isPending } = submit

  // Time is up: submit whatever is saved, and keep retrying if the network is down.
  useEffect(() => {
    if (remaining === 0 && isIdle) mutate({ force: true })
  }, [remaining, isIdle, mutate])
  useEffect(() => {
    if (remaining !== 0 || !isError) return
    const t = window.setTimeout(() => mutate({ force: true }), 3000)
    return () => window.clearTimeout(t)
  }, [remaining, isError, mutate])

  useTimeNotices(remaining, (message) => toast.info(message))

  const go = (next: number) => {
    if (next < 0 || next >= details.length || next === index) return
    if (currentId != null) answers.resave(currentId)
    setNavigated(true)
    setIndex(next)
  }
  const exit = async () => {
    await answers.flush()
    toast.info('Your progress is saved. The timer keeps running until you submit.')
    navigate(isMock ? '/mock-interviews' : '/assessments')
  }

  const q = details[index]
  if (!q) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card className="p-6 text-center">
          <p className="font-medium">This attempt has no questions.</p>
        </Card>
      </div>
    )
  }

  const flags = details.map((d) => isAnswered(d, answers.answers[d.id]))
  const answeredCount = flags.filter(Boolean).length
  const unanswered = details.length - answeredCount
  const last = index === details.length - 1

  return (
    <div className="min-h-screen bg-ivory-100">
      <header className="sticky top-0 z-30 border-b border-line bg-ivory-100/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Logo showText={false} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{state.title}</h1>
            <SaveIndicator status={answers.status} />
          </div>
          <ExamTimer remaining={remaining} />
          <Button variant="ghost" size="sm" onClick={exit}>Exit</Button>
          <Button size="sm" onClick={() => setConfirming(true)} disabled={isPending}>Submit</Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_15rem]">
        <aside className="lg:col-start-2 lg:row-start-1">
          <div className="lg:sticky lg:top-24">
            <QuestionNavigator items={details.map((d, i) => ({ id: d.id, answered: flags[i]! }))} current={index} onSelect={go} />
          </div>
        </aside>

        <main className="min-w-0 lg:col-start-1 lg:row-start-1" aria-label={`Question ${index + 1} of ${details.length}`}>
          <ExamQuestion
            key={q.id}
            q={q}
            points={items[index]!.points}
            position={index + 1}
            total={details.length}
            answer={answers.answers[q.id]}
            onChange={(patch, delay) => answers.setAnswer(q.id, patch, delay)}
            caps={caps.data}
            focusHeading={navigated}
          />
          <div className="mt-8 flex items-center justify-between">
            <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Previous
            </Button>
            {last ? (
              <Button onClick={() => setConfirming(true)} disabled={isPending}>Review &amp; submit</Button>
            ) : (
              <Button onClick={() => go(index + 1)}>Next <ArrowRight className="h-4 w-4" aria-hidden /></Button>
            )}
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={confirming}
        title={isMock ? 'Submit interview?' : 'Submit assessment?'}
        confirmLabel="Submit now"
        cancelLabel="Keep working"
        loading={isPending}
        error={submit.error}
        onCancel={() => !isPending && setConfirming(false)}
        onConfirm={() => mutate({ force: false })}
      >
        <p>You've answered {answeredCount} of {details.length} questions.</p>
        {unanswered > 0 && <p>{unanswered} unanswered {unanswered === 1 ? 'question' : 'questions'} will score zero.</p>}
        <p>You can't change your answers after submitting.</p>
        {answers.unsaved > 0 && <p>We'll finish saving your latest changes first.</p>}
      </ConfirmDialog>

      {remaining === 0 && (
        <div role="status" className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/60 p-6">
          <Card className="max-w-sm p-6 text-center">
            <p className="text-lg font-semibold">Time's up</p>
            <p className="mt-1 text-sm text-ink-600">{isError ? "We couldn't submit yet. Retrying…" : 'Submitting your saved answers…'}</p>
            {isError && <ActionError error={submit.error} />}
            {isError && <Button className="mt-4" onClick={() => mutate({ force: true })}>Retry now</Button>}
          </Card>
        </div>
      )}
    </div>
  )
}
