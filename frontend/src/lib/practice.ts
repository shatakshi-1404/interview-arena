import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import type { RunResponse, SubmitResult } from '@/types/api'
import { http } from './api'
import { invalidateLearningData } from './queries'

export interface AnswerBody {
  selected_option_ids?: number[]
  text_answer?: string
  code?: string
  language?: string
  time_taken_seconds?: number
}

/** The backend caps time_taken_seconds at 6 hours. */
export const clampSeconds = (s: number) => Math.min(Math.max(0, Math.round(s)), 21600)

export function useQuestionActions(questionId: number) {
  const qc = useQueryClient()
  const toast = useToast()
  const run = useMutation({
    mutationFn: (b: AnswerBody) => http.post<RunResponse>(`/api/questions/${questionId}/run`, b),
  })
  const submit = useMutation({
    mutationFn: (b: AnswerBody) => http.post<SubmitResult>(`/api/questions/${questionId}/submit`, b),
    onSuccess: (res) => {
      invalidateLearningData(qc)
      for (const a of res.new_achievements) toast.success(`Achievement unlocked: ${a.name}`)
    },
  })
  return { run, submit }
}
