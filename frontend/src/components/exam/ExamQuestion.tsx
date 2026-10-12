import { useEffect, useRef } from 'react'
import { CodeEditor } from '@/components/code/CodeEditor'
import { ProblemStatement } from '@/components/practice/ProblemStatement'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { DEBOUNCE_CHOICE_MS, DEBOUNCE_TEXT_MS } from '@/lib/answerSaver'
import { cn } from '@/lib/cn'
import { languagesFor, SQL_STARTER, starterFor, type ExamAnswer } from '@/lib/exam'
import { categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE, TYPE_LABEL } from '@/lib/labels'
import type { Capabilities, QuestionDetail } from '@/types/api'

type Change = (patch: ExamAnswer, delay: number) => void
type Props = { q: QuestionDetail; answer: ExamAnswer | undefined; onChange: Change }

function Note({ children }: { children: string }) {
  return <p role="status" className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-ink-800">{children}</p>
}

function McqAnswer({ q, answer, onChange }: Props) {
  const selected = answer?.selected_option_ids ?? []
  const toggle = (id: number) =>
    onChange(
      { selected_option_ids: q.multiple_answers ? (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) : [id] },
      DEBOUNCE_CHOICE_MS,
    )
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <fieldset>
        <legend className="text-base font-semibold">Your answer</legend>
        <p className="mt-1 text-sm text-ink-600">{q.multiple_answers ? 'Select all that apply.' : 'Select one answer.'}</p>
        <ul className="mt-3 space-y-2">
          {q.options.map((o) => {
            const on = selected.includes(o.id)
            return (
              <li key={o.id}>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm', on ? 'border-gold-500 bg-gold-50' : 'border-line bg-white hover:border-line-strong')}>
                  <input
                    type={q.multiple_answers ? 'checkbox' : 'radio'}
                    name={`q-${q.id}`}
                    checked={on}
                    onChange={() => toggle(o.id)}
                    className="mt-0.5 h-4 w-4 accent-gold-600"
                  />
                  <span className="flex-1">{o.text}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>
      {selected.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ selected_option_ids: [] }, DEBOUNCE_CHOICE_MS)}>
          Clear answer
        </Button>
      )}
    </Card>
  )
}

function SqlAnswer({ answer, onChange }: Omit<Props, 'q'>) {
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <h3 className="text-base font-semibold">Your query</h3>
      <CodeEditor
        value={answer?.text_answer ?? SQL_STARTER}
        onChange={(v) => onChange({ text_answer: v }, DEBOUNCE_TEXT_MS)}
        language="sql"
        height={280}
        ariaLabel="SQL editor"
      />
      <p className="text-xs text-ink-500">Only a single SELECT query is allowed. It's graded when you submit; there is no Run during an assessment.</p>
    </Card>
  )
}

function ShortAnswer({ answer, onChange }: Omit<Props, 'q'>) {
  const text = answer?.text_answer ?? ''
  return (
    <Card className="space-y-2 p-5 sm:p-6">
      <label htmlFor="short-answer" className="text-base font-semibold">Your answer</label>
      <textarea
        id="short-answer"
        rows={10}
        maxLength={5000}
        value={text}
        onChange={(e) => onChange({ text_answer: e.target.value }, DEBOUNCE_TEXT_MS)}
        placeholder="Explain in your own words…"
        className="w-full resize-y rounded-lg border border-line-strong bg-white p-3 text-sm focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-300/60"
      />
      <p className="text-xs text-ink-500">{text.length} / 5000 characters</p>
    </Card>
  )
}

function CodingAnswer({ q, answer, onChange }: Props) {
  const langs = languagesFor(q)
  const language = answer?.language && langs.includes(answer.language) ? answer.language : langs[0]!
  const code = answer?.text_answer ?? starterFor(q, language)
  const drafts = useRef<Record<string, string>>({})

  const switchTo = (next: string) => {
    drafts.current[language] = code
    onChange({ language: next, text_answer: drafts.current[next] ?? starterFor(q, next) }, DEBOUNCE_CHOICE_MS)
  }
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <Select
        label="Language"
        value={language}
        onChange={switchTo}
        options={langs.map((l) => ({ value: l, label: l === 'python' ? 'Python' : 'Java' }))}
        className="w-40"
      />
      <CodeEditor
        value={code}
        onChange={(v) => onChange({ language, text_answer: v }, DEBOUNCE_TEXT_MS)}
        language={language as 'python' | 'java'}
        height={340}
        ariaLabel={`${language} code editor`}
      />
      <p className="text-xs text-ink-500">Only the selected language is saved. Your code is graded against all tests when you submit.</p>
    </Card>
  )
}

export function ExamQuestion({ q, points, position, total, answer, onChange, caps, focusHeading }: Props & {
  points: number
  position: number
  total: number
  caps: Capabilities | undefined
  focusHeading: boolean
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])

  const wide = q.question_type === 'SQL' || q.question_type === 'CODING'
  return (
    <div>
      <p className="text-sm text-ink-600">Question {position} of {total} · {points} {points === 1 ? 'point' : 'points'}</p>
      <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-semibold tracking-tight outline-none">{q.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge>{categoryLabel(q.category)}</Badge>
        <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
        <Badge>{TYPE_LABEL[q.question_type]}</Badge>
      </div>

      <div className={cn('mt-5', wide ? 'grid gap-6 xl:grid-cols-2 xl:items-start' : 'max-w-3xl space-y-6')}>
        <ProblemStatement q={q} />
        <div className="space-y-4">
          {q.question_type === 'CODING' && caps?.coding === false && (
            <Note>Code execution isn't enabled on this server, so your code will be saved but won't be scored.</Note>
          )}
          {q.question_type === 'SHORT_ANSWER' && caps?.shortAnswer === false && (
            <Note>Short-answer scoring is turned off on this server, so your answer will be saved but won't be scored.</Note>
          )}
          {q.question_type === 'MCQ' && <McqAnswer q={q} answer={answer} onChange={onChange} />}
          {q.question_type === 'SQL' && <SqlAnswer answer={answer} onChange={onChange} />}
          {q.question_type === 'SHORT_ANSWER' && <ShortAnswer answer={answer} onChange={onChange} />}
          {q.question_type === 'CODING' && <CodingAnswer q={q} answer={answer} onChange={onChange} />}
        </div>
      </div>
    </div>
  )
}
