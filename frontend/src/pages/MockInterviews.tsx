import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AttemptHistory } from '@/components/attempt/AttemptHistory'
import { ActionError } from '@/components/practice/ActionError'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { RadioCards } from '@/components/ui/RadioCards'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { http } from '@/lib/api'
import { TYPE_LABEL } from '@/lib/labels'
import { useCurrentMock, useMockOptions } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { AttemptState, MockStartBody } from '@/types/api'

export default function MockInterviews() {
  usePageTitle('Mock Interviews')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const options = useMockOptions()
  const current = useCurrentMock()

  const [role, setRole] = useState<string | null>(null)
  const [level, setLevel] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<string | null>(null)
  const [focusWeak, setFocusWeak] = useState(true)

  const start = useMutation({
    mutationFn: (body: MockStartBody) => http.post<AttemptState>('/api/mock-interviews/start', body),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['mock-current'] })
      navigate(`/attempts/${s.attempt_id}`)
    },
  })

  const o = options.data
  const selRole = role ?? o?.roles[0]?.key
  const selLevel = level ?? (o?.levels.find((l) => l.key === 'INTERMEDIATE') ?? o?.levels[0])?.key
  const selMinutes = minutes ?? String((o?.durations.find((d) => d.minutes === 30) ?? o?.durations[0])?.minutes ?? '')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!selRole || !selLevel || !selMinutes) return
    start.mutate({ role: selRole, level: selLevel, duration_minutes: Number(selMinutes), focus_weak_topics: focusWeak })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mock Interviews</h1>
        <p className="mt-1 max-w-2xl text-ink-600">A timed, mixed interview for a role you choose, with a performance report at the end.</p>
      </div>

      {current.data ? (
        <Card className="flex flex-col items-start justify-between gap-4 border-gold-300 bg-gold-50/60 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold">{current.data.title}</p>
            <p className="mt-1 text-sm text-ink-600">You have an interview in progress. About {Math.max(1, Math.ceil(current.data.remaining_seconds / 60))} min were left when this page loaded.</p>
          </div>
          <ButtonLink to={`/attempts/${current.data.attempt_id}`}>Resume interview</ButtonLink>
        </Card>
      ) : options.isPending || current.isPending ? (
        <div aria-busy="true" aria-label="Loading"><Skeleton className="h-96 w-full" /></div>
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} title="We couldn't load interview options" />
      ) : (
        <Card className="p-5 sm:p-6">
          <form onSubmit={onSubmit} className="space-y-6">
            <RadioCards
              legend="Role"
              name="role"
              value={selRole ?? ''}
              onChange={setRole}
              options={options.data.roles.map((r) => ({ value: r.key, title: r.label, description: `Focus: ${r.focus.join(', ')}` }))}
            />
            <RadioCards
              legend="Level"
              name="level"
              value={selLevel ?? ''}
              onChange={setLevel}
              options={options.data.levels.map((l) => ({ value: l.key, title: l.label, description: l.description }))}
            />
            <div>
              <p className="mb-2 text-sm font-medium text-ink-800">Duration</p>
              <SegmentedControl<string>
                label="Duration"
                value={selMinutes}
                onChange={setMinutes}
                options={options.data.durations.map((d) => ({ value: String(d.minutes), label: `${d.minutes} min · ${d.questions} questions` }))}
              />
            </div>
            <Switch
              label="Emphasize my weak topics"
              description="Adds more questions from topics where your recent accuracy is low."
              checked={focusWeak}
              onChange={setFocusWeak}
            />
            <p className="text-sm text-ink-600">
              Includes: {options.data.includes.map((t) => TYPE_LABEL[t]).join(', ')}.
              {!options.data.includes.includes('CODING') && " Coding questions are left out because code execution isn't enabled on this server."}
            </p>
            <ActionError error={start.error} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" loading={start.isPending}>Start mock interview</Button>
              <Link to="/practice" className="text-sm font-medium text-ink-600 hover:underline">Prefer to practice one question at a time?</Link>
            </div>
          </form>
        </Card>
      )}

      <AttemptHistory mode="MOCK_INTERVIEW" title="Past interviews" />
    </div>
  )
}
