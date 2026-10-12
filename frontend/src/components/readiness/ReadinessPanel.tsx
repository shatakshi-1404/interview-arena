import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { BlockSkeleton, ErrorState } from '@/components/ui/States'
import { useReadiness } from '@/lib/queries'
import type { ReadinessDetail } from '@/types/api'

const CONFIDENCE: Record<string, string> = { NONE: 'Not started', LOW: 'Early data', MEDIUM: 'Fair data', HIGH: 'Solid data' }

function Overall({ r }: { r: ReadinessDetail }) {
  if (r.status === 'READY_TO_SCORE' && r.score != null) {
    return (
      <div className="flex flex-wrap items-center gap-6">
        <ProgressRing value={r.score} size={140} label={`Practice Readiness ${Math.round(r.score)} out of 100`}>
          <span className="text-4xl font-semibold leading-none">{Math.round(r.score)}</span>
          <span className="mt-1 text-xs text-ink-500">out of 100</span>
        </ProgressRing>
        <div className="min-w-[14rem] flex-1">
          {r.category && <Badge tone="gold">{r.category}</Badge>}
          <p className="mt-3 text-sm text-ink-700">
            This estimate summarizes your accuracy, recent results, speed, difficulty mix and topic coverage across {r.answered} answers on
            this platform.
          </p>
          {r.drivers.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium">What's affecting it most</p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
                {r.drivers.map((d) => (
                  <li key={d.feature} className="flex items-center gap-2">
                    {d.effect === 'raises' ? (
                      <ArrowUpRight className="h-4 w-4 text-success" aria-hidden />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-danger" aria-hidden />
                    )}
                    {d.label}: {d.effect === 'raises' ? 'helping your estimate' : 'holding it back'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }
  if (r.status === 'DISABLED') {
    return <p className="text-sm text-ink-600">Personalized readiness is turned off on this server. Your analytics still work.</p>
  }
  return (
    <div className="max-w-md">
      <p className="text-sm text-ink-700">
        Your readiness estimate unlocks after {r.needed} answers. You've answered {r.answered}.
      </p>
      <ProgressBar className="mt-3" value={r.answered} max={r.needed} label="Answers toward unlocking readiness" />
    </div>
  )
}

export function ReadinessPanel() {
  const q = useReadiness()
  return (
    <Panel id="readiness" title="Practice Readiness" description="How you're performing across the topic areas, based on your practice here.">
      {q.isPending ? (
        <BlockSkeleton className="h-72" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-8">
          <Overall r={q.data} />

          {q.data.status !== 'DISABLED' && (
            <>
              <section aria-labelledby="readiness-topics">
                <h3 id="readiness-topics" className="text-sm font-semibold">By topic</h3>
                <ul className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {q.data.topics.map((t) => (
                    <li key={t.category}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{t.label}</span>
                        <span className="text-ink-600">{t.score == null ? 'Not started' : `${Math.round(t.score)}`}</span>
                      </div>
                      <ProgressBar className="mt-1.5" value={t.score ?? 0} label={`${t.label} readiness`} />
                      <p className="mt-1 text-xs text-ink-500">{CONFIDENCE[t.confidence]}{t.attempts > 0 ? ` · ${t.attempts} answers` : ''}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="grid gap-6 md:grid-cols-2">
                <section aria-labelledby="readiness-strengths">
                  <h3 id="readiness-strengths" className="text-sm font-semibold">Strengths</h3>
                  {q.data.strengths.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {q.data.strengths.map((s) => <Badge key={s} tone="success">{s}</Badge>)}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-ink-600">Strengths appear once a topic has 5+ answers and a strong score.</p>
                  )}
                </section>
                <section aria-labelledby="readiness-improvement">
                  <h3 id="readiness-improvement" className="text-sm font-semibold">Recent improvement</h3>
                  {q.data.recent_improvement ? (
                    <p className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                      {q.data.recent_improvement.change_points > 0 ? <ArrowUpRight className="h-4 w-4 text-success" aria-hidden /> :
                        q.data.recent_improvement.change_points < 0 ? <ArrowDownRight className="h-4 w-4 text-danger" aria-hidden /> :
                        <Minus className="h-4 w-4 text-ink-500" aria-hidden />}
                      Accuracy {q.data.recent_improvement.previous_accuracy}% → {q.data.recent_improvement.recent_accuracy}% over the last{' '}
                      {q.data.recent_improvement.window_days} days
                      ({q.data.recent_improvement.change_points > 0 ? '+' : ''}{q.data.recent_improvement.change_points} points).
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-ink-600">Needs 5+ answers in each of the last two 14-day windows.</p>
                  )}
                </section>
              </div>

              <section aria-labelledby="readiness-weak">
                <h3 id="readiness-weak" className="text-sm font-semibold">Weaknesses</h3>
                {q.data.weaknesses.length ? (
                  <ul className="mt-3 space-y-2">
                    {q.data.weaknesses.map((w) => (
                      <li key={w.category} className="rounded-lg border border-line bg-ivory-50 px-3 py-2 text-sm">
                        <span className="font-medium">{w.label}</span>
                        <span className="text-ink-600"> · {w.reasons.join(' ')}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-ink-600">No weak topics detected yet. A topic needs at least 3 answers to be assessed.</p>
                )}
              </section>

              <section aria-labelledby="readiness-next">
                <h3 id="readiness-next" className="text-sm font-semibold">Recommended next steps</h3>
                <ul className="mt-3 space-y-2 text-sm text-ink-700">
                  {q.data.next_steps.map((s) => (
                    <li key={s} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />{s}</li>
                  ))}
                </ul>
              </section>
            </>
          )}

          <div className="border-t border-line pt-4 text-xs leading-relaxed text-ink-500">
            <p>{q.data.disclaimer}</p>
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-ink-700">How this is calculated</summary>
              <div className="mt-2 space-y-1.5">
                <p>Model: {q.data.model.type} (version {q.data.model.version}).</p>
                <p>Trained on: {q.data.model.trained_on}.</p>
                <p>
                  {q.data.model.validated_against_real_outcomes
                    ? 'Validated against real outcomes.'
                    : 'Not validated against real interview outcomes. Treat it as a practice indicator only.'}
                </p>
                {q.data.category && q.data.rubric_category && q.data.category !== q.data.rubric_category && (
                  <p>The model's category differs from the plain scoring rubric ({q.data.rubric_category}) near a boundary.</p>
                )}
                {Object.keys(q.data.probabilities).length > 0 && (
                  <p>
                    Model probabilities:{' '}
                    {Object.entries(q.data.probabilities).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}.
                  </p>
                )}
              </div>
            </details>
          </div>
        </div>
      )}
    </Panel>
  )
}
