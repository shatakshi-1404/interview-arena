import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuestionDetail, SavedAnswer } from '@/types/api'
import { AnswerSaver, DEBOUNCE_TEXT_MS, type SaverSnapshot } from './answerSaver'
import { isAnswered, toAnswerMap, type ExamAnswer } from './exam'

interface Options {
  attemptId: number
  questions: QuestionDetail[]
  initial: SavedAnswer[]
  getSeconds?: (qid: number) => number | undefined
  onAck?: (remainingSeconds: number) => void
  onLocked?: () => void
}

export function useExamAnswers(opts: Options) {
  const latest = useRef(opts)
  useEffect(() => {
    latest.current = opts
  })

  const [answers, setAnswers] = useState<Record<number, ExamAnswer>>(() => toAnswerMap(opts.initial))
  const answersRef = useRef(answers)
  const [snap, setSnap] = useState<SaverSnapshot>({ status: 'idle', unsaved: 0, lastSavedAt: null })

  const [saver] = useState(
    () =>
      new AnswerSaver({
        attemptId: opts.attemptId,
        getQuestion: (id) => latest.current.questions.find((q) => q.id === id),
        getAnswer: (id) => answersRef.current[id],
        getSeconds: (id) => latest.current.getSeconds?.(id),
        onAck: (s) => latest.current.onAck?.(s),
        onLocked: () => latest.current.onLocked?.(),
        onChange: setSnap,
      }),
  )
  useEffect(() => {
    saver.start()
    return () => saver.dispose()
  }, [saver])

  // Closing the tab with unsaved answers gets the browser's own warning.
  useEffect(() => {
    if (snap.unsaved === 0) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [snap.unsaved])

  const setAnswer = useCallback(
    (qid: number, patch: ExamAnswer, delay: number = DEBOUNCE_TEXT_MS) => {
      const next = { ...answersRef.current, [qid]: { ...answersRef.current[qid], ...patch } }
      answersRef.current = next
      setAnswers(next)
      saver.touch(qid, delay)
    },
    [saver],
  )

  /** Re-send an existing answer (e.g. after leaving a question) so its time spent is up to date. */
  const resave = useCallback(
    (qid: number) => {
      const q = latest.current.questions.find((x) => x.id === qid)
      if (q && isAnswered(q, answersRef.current[qid])) saver.touch(qid, 0)
    },
    [saver],
  )

  const flush = useCallback(() => saver.flush(), [saver])

  return { answers, setAnswer, resave, flush, status: snap.status, unsaved: snap.unsaved }
}
