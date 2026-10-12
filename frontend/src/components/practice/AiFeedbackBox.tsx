import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAiFeedback, useAiStatus } from '@/lib/queries'
import { ActionError } from './ActionError'

/** LLM comments on a submitted short answer. Shown beside, never instead of, the deterministic TF-IDF score. */
export function AiFeedbackBox({ questionId }: { questionId: number }) {
  const status = useAiStatus()
  const fb = useAiFeedback(questionId)
  if (!status.data?.enabled) return null
  const ai = fb.data?.ai

  return (
    <div className="space-y-3 rounded-xl border border-gold-200 bg-gold-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
          <Sparkles className="h-4 w-4 text-gold-600" aria-hidden /> AI feedback
        </div>
        {!ai && (
          <Button variant="secondary" size="sm" loading={fb.isPending} onClick={() => fb.mutate()}>
            Get AI feedback
          </Button>
        )}
      </div>
      <ActionError error={fb.error} />
      {ai && (
        <div className="space-y-3 text-sm text-ink-800">
          <p>{ai.summary}</p>
          {ai.strengths.length > 0 && (
            <div>
              <p className="font-medium">What worked</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{ai.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {ai.gaps.length > 0 && (
            <div>
              <p className="font-medium">What's missing</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{ai.gaps.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {ai.next_step && <p><span className="font-medium">Next step: </span>{ai.next_step}</p>}
        </div>
      )}
      <p className="text-xs text-ink-500">
        Written by an LLM{fb.data ? ` (${fb.data.model})` : ''} as a second opinion. Your score above is still the
        deterministic keyword/TF-IDF one, and the AI can be wrong.
      </p>
    </div>
  )
}
