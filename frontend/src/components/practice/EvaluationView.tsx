import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { AnswerEvaluation } from '@/types/api'
import { RichText } from './RichText'

const DIM: Record<string, string> = {
  coverage: 'Concept coverage',
  similarity: 'Similarity to model answer',
  completeness: 'Completeness',
  clarity: 'Clarity',
}

export function EvaluationView({ ev, modelAnswer }: { ev: AnswerEvaluation; modelAnswer: string | null }) {
  return (
    <div className="space-y-5 rounded-xl border border-line bg-white p-4">
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {Object.entries(ev.dimensions).map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between text-sm"><span>{DIM[k] ?? k}</span><span className="text-ink-600">{Math.round(v * 100)}%</span></div>
            <ProgressBar className="mt-1.5" value={v * 100} label={DIM[k] ?? k} />
          </li>
        ))}
      </ul>

      {(ev.matched_concepts.length > 0 || ev.missing_concepts.length > 0) && (
        <div className="space-y-2 text-sm">
          {ev.matched_concepts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">You covered:</span>
              {ev.matched_concepts.map((c) => <Badge key={c} tone="success">{c}</Badge>)}</div>
          )}
          {ev.missing_concepts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Missing:</span>
              {ev.missing_concepts.map((c) => <Badge key={c} tone="danger">{c}</Badge>)}</div>
          )}
        </div>
      )}

      {ev.feedback.length > 0 && (
        <ul className="space-y-1.5 text-sm text-ink-700">
          {ev.feedback.map((f) => (
            <li key={f} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />{f}</li>
          ))}
        </ul>
      )}

      {modelAnswer && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Model answer</summary>
          <RichText text={modelAnswer} className="mt-2 text-sm text-ink-800" />
        </details>
      )}
      <p className="text-xs text-ink-500">
        Short answers are scored by concept coverage and similarity. It's a practice aid: a good answer in different words can score lower than it deserves.
      </p>
    </div>
  )
}
