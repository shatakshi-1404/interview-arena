import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { QuestionDetail } from '@/types/api'
import { RichText } from './RichText'

function Example({ ex, n }: { ex: Record<string, unknown>; n: number }) {
  const entries = Object.entries(ex).filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <div className="rounded-lg border border-line bg-ivory-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Example {n}</p>
      <dl className="mt-2 space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium capitalize text-ink-500">{k.replace(/_/g, ' ')}</dt>
            <dd className={k === 'explanation' ? 'whitespace-pre-wrap text-sm text-ink-800' : 'whitespace-pre-wrap font-mono text-xs text-ink-900'}>
              {typeof v === 'string' ? v : JSON.stringify(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function ProblemStatement({ q }: { q: QuestionDetail }) {
  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <section aria-labelledby="problem-heading">
        <h2 id="problem-heading" className="text-base font-semibold">Problem</h2>
        <RichText text={q.description} className="mt-2 text-sm text-ink-800" />
      </section>

      {q.examples && q.examples.length > 0 && (
        <section aria-labelledby="examples-heading" className="space-y-3">
          <h2 id="examples-heading" className="text-base font-semibold">Examples</h2>
          {q.examples.map((ex, i) => <Example key={i} ex={ex} n={i + 1} />)}
        </section>
      )}

      {q.constraints && (
        <section aria-labelledby="constraints-heading">
          <h2 id="constraints-heading" className="text-base font-semibold">Constraints</h2>
          <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-ink-800">{q.constraints}</p>
        </section>
      )}

      {q.sample_test_cases.length > 0 && (
        <section aria-labelledby="samples-heading" className="space-y-3">
          <h2 id="samples-heading" className="text-base font-semibold">Sample tests</h2>
          {q.sample_test_cases.map((t, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <Badge>Sample {i + 1}</Badge>
              <p className="mt-2 text-xs font-medium text-ink-500">Input</p>
              <pre className="whitespace-pre-wrap font-mono text-xs">{t.input_data}</pre>
              <p className="mt-2 text-xs font-medium text-ink-500">Expected output</p>
              <pre className="whitespace-pre-wrap font-mono text-xs">{t.expected_output}</pre>
            </div>
          ))}
        </section>
      )}
    </Card>
  )
}
