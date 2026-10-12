import { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAiStatus, useHint } from '@/lib/queries'
import type { Hint } from '@/types/api'
import { ActionError } from './ActionError'

/** "Give me a hint". The server never reveals the answer; asking again escalates from a nudge to an outline. */
export function HintBox({ questionId }: { questionId: number }) {
  const status = useAiStatus()
  const hint = useHint(questionId)
  const [hints, setHints] = useState<Hint[]>([])

  if (!status.data?.enabled) return null
  const last = hints[hints.length - 1]
  const left = status.data.daily_limit - status.data.used_today
  const atMax = last !== undefined && last.level >= last.max_level

  return (
    <Card className="space-y-3 border-gold-200 bg-gold-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
          <Lightbulb className="h-4 w-4 text-gold-600" aria-hidden /> Stuck?
          <span className="font-normal text-ink-600">Hints nudge you without giving the answer away.</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={hint.isPending}
          disabled={left <= 0}
          onClick={() => hint.mutate(undefined, { onSuccess: (h) => setHints((p) => [...p, h]) })}
        >
          {hints.length === 0 ? 'Give me a hint' : atMax ? 'Another hint' : 'Stronger hint'}
        </Button>
      </div>
      <ActionError error={hint.error} />
      {hints.length > 0 && (
        <ol className="space-y-2" aria-label="Hints so far">
          {hints.map((h, i) => (
            <li key={i} className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-800">
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Hint {h.level}/{h.max_level}</span>
              {h.hint}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-ink-500">
        AI-written ({last?.model ?? 'LLM'}) and can be wrong. {left} AI request{left === 1 ? '' : 's'} left today.
      </p>
    </Card>
  )
}
