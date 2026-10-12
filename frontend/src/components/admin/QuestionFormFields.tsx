import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import { CATEGORY_KEYS, categoryLabel, DIFFICULTY_LABEL, TYPE_LABEL } from '@/lib/labels'
import { emptyConcept, emptyExample, emptyOption, emptyTestCase, type QuestionForm } from '@/lib/questionForm'
import type { Difficulty, QuestionType } from '@/types/api'

const cell =
  'h-10 w-full rounded-lg border border-line-strong bg-white px-3 text-sm focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-300/60'

function patchRow<T>(list: T[], i: number, patch: Partial<T>): T[] {
  return list.map((x, k) => (k === i ? { ...x, ...patch } : x))
}
function dropRow<T>(list: T[], i: number): T[] {
  return list.filter((_, k) => k !== i)
}

function Section({ title, description, error, children }: { title: string; description?: string; error?: string; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
      </div>
      {children}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </Card>
  )
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="shrink-0 rounded-lg p-2 text-ink-500 hover:bg-ivory-200 hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  )
}

type Props = {
  form: QuestionForm
  setForm: Dispatch<SetStateAction<QuestionForm>>
  errors: Record<string, string>
  editing: boolean
}

export function QuestionFormFields({ form, setForm, errors, editing }: Props) {
  const set = (patch: Partial<QuestionForm>) => setForm((prev) => ({ ...prev, ...patch }))
  const t = form.question_type
  const publishText = editing
    ? 'Unpublished questions are hidden from learners.'
    : 'New questions start as drafts. Switch this on when you are ready for learners to see it.'

  return (
    <div className="space-y-6">
      <Section title="Basics">
        <Input label="Title" value={form.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
        <Textarea
          label="Question text"
          rows={5}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          error={errors.description}
          hint="Use `backticks` for inline code."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Category" value={form.category} onChange={(v) => set({ category: v })} options={CATEGORY_KEYS.map((k) => ({ value: k, label: categoryLabel(k) }))} />
          <Select label="Difficulty" value={form.difficulty} onChange={(v) => set({ difficulty: v as Difficulty })} options={Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({ value, label }))} />
          {editing ? (
            <Input label="Type" value={TYPE_LABEL[t]} disabled readOnly hint="The type can't be changed after creation." />
          ) : (
            <Select label="Type" value={t} onChange={(v) => set({ question_type: v as QuestionType })} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Suggested time (seconds)" type="number" inputMode="numeric" min={1} value={form.time_limit} onChange={(e) => set({ time_limit: e.target.value })} error={errors.time_limit} hint="Optional. Shown to learners as a guide." />
          <Input label="Tags" value={form.tags} onChange={(e) => set({ tags: e.target.value })} error={errors.tags} hint="Comma-separated, e.g. arrays, two-pointers" />
        </div>
        <Switch label="Published" description={publishText} checked={form.is_published} onChange={(v) => set({ is_published: v })} />
      </Section>

      {t === 'MCQ' && (
        <Section
          title="Answer options"
          description="Mark every correct option. More than one correct option makes it a multi-answer question."
          error={errors.options}
        >
          {editing && (
            <p role="note" className="rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-ink-800">
              Saving replaces the answer options. Anyone in the middle of an attempt with a saved choice for this question will lose that choice.
            </p>
          )}
          <ul className="space-y-2">
            {form.options.map((o, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={o.is_correct}
                  onChange={(e) => set({ options: patchRow(form.options, i, { is_correct: e.target.checked }) })}
                  aria-label={`Option ${i + 1} is correct`}
                  className="h-4 w-4 shrink-0 accent-gold-600"
                />
                <input
                  value={o.text}
                  onChange={(e) => set({ options: patchRow(form.options, i, { text: e.target.value }) })}
                  aria-label={`Option ${i + 1} text`}
                  placeholder={`Option ${i + 1}`}
                  className={cell}
                />
                <RemoveButton label={`Remove option ${i + 1}`} disabled={form.options.length <= 2} onClick={() => set({ options: dropRow(form.options, i) })} />
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" disabled={form.options.length >= 10} onClick={() => set({ options: [...form.options, emptyOption()] })}>
            <Plus className="h-4 w-4" aria-hidden /> Add option
          </Button>
        </Section>
      )}

      {t === 'CODING' && (
        <>
          <Section title="Starter code" description="Learners can only pick a language you provide starter code for." error={errors.starter_code}>
            <Textarea label="Python starter code" mono rows={8} value={form.starter_python} onChange={(e) => set({ starter_python: e.target.value })} />
            <Textarea label="Java starter code" mono rows={8} value={form.starter_java} onChange={(e) => set({ starter_java: e.target.value })} />
            <Textarea label="Constraints" rows={2} value={form.constraints} onChange={(e) => set({ constraints: e.target.value })} hint="Shown to learners, e.g. 1 <= n <= 100000" />
          </Section>

          <Section title="Examples" description="Shown to learners in the problem statement. Optional.">
            <ul className="space-y-3">
              {form.examples.map((x, i) => (
                <li key={i} className="space-y-2 rounded-lg border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Textarea label={`Example ${i + 1} input`} mono rows={2} value={x.input} onChange={(e) => set({ examples: patchRow(form.examples, i, { input: e.target.value }) })} />
                    <Textarea label={`Example ${i + 1} output`} mono rows={2} value={x.output} onChange={(e) => set({ examples: patchRow(form.examples, i, { output: e.target.value }) })} />
                  </div>
                  <Input label={`Example ${i + 1} explanation`} value={x.explanation} onChange={(e) => set({ examples: patchRow(form.examples, i, { explanation: e.target.value }) })} />
                  <Button variant="ghost" size="sm" onClick={() => set({ examples: dropRow(form.examples, i) })}>Remove example {i + 1}</Button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" onClick={() => set({ examples: [...form.examples, emptyExample()] })}>
              <Plus className="h-4 w-4" aria-hidden /> Add example
            </Button>
          </Section>

          <Section
            title="Test cases"
            description="Input is sent to the program's stdin and compared with its stdout. Sample cases are shown to learners; the rest stay hidden."
            error={errors.test_cases}
          >
            <ul className="space-y-3">
              {form.test_cases.map((tc, i) => (
                <li key={i} className="space-y-2 rounded-lg border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Textarea label={`Test ${i + 1} input`} mono rows={3} value={tc.input_data} onChange={(e) => set({ test_cases: patchRow(form.test_cases, i, { input_data: e.target.value }) })} />
                    <Textarea label={`Test ${i + 1} expected output`} mono rows={3} value={tc.expected_output} onChange={(e) => set({ test_cases: patchRow(form.test_cases, i, { expected_output: e.target.value }) })} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={tc.is_sample} onChange={(e) => set({ test_cases: patchRow(form.test_cases, i, { is_sample: e.target.checked }) })} className="h-4 w-4 accent-gold-600" />
                      Test {i + 1} is a sample (shown to learners)
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => set({ test_cases: dropRow(form.test_cases, i) })}>Remove test {i + 1}</Button>
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" disabled={form.test_cases.length >= 100} onClick={() => set({ test_cases: [...form.test_cases, emptyTestCase()] })}>
              <Plus className="h-4 w-4" aria-hidden /> Add test case
            </Button>
          </Section>
        </>
      )}

      {t === 'SQL' && (
        <Section
          title="SQL dataset"
          description="Each evaluation builds this dataset in a throwaway schema. The reference solution is run when you save, and must run against the dataset and reproduce itself."
        >
          <Textarea label="Schema" mono rows={6} value={form.schema_sql} onChange={(e) => set({ schema_sql: e.target.value })} error={errors.schema_sql} hint="CREATE TABLE statements" />
          <Textarea label="Seed data" mono rows={6} value={form.seed_sql} onChange={(e) => set({ seed_sql: e.target.value })} error={errors.seed_sql} hint="INSERT statements" />
          <Textarea label="Reference solution" mono rows={4} value={form.solution_query} onChange={(e) => set({ solution_query: e.target.value })} error={errors.solution_query} hint="A single SELECT. Column names are ignored when comparing results." />
          <Switch label="Row order matters" description="Turn on when the question asks for a specific ORDER BY." checked={form.order_matters} onChange={(v) => set({ order_matters: v })} />
        </Section>
      )}

      {t === 'SHORT_ANSWER' && (
        <Section
          title="Reference answer"
          description="Answers are scored by concept coverage (55%), similarity to the model answer, completeness and clarity."
          error={errors.concepts}
        >
          <Textarea label="Model answer" rows={5} value={form.model_answer} onChange={(e) => set({ model_answer: e.target.value })} error={errors.model_answer} />
          <ul className="space-y-2">
            {form.concepts.map((c, i) => (
              <li key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_2fr_5rem_auto]">
                <input value={c.concept} onChange={(e) => set({ concepts: patchRow(form.concepts, i, { concept: e.target.value }) })} aria-label={`Concept ${i + 1} name`} placeholder="Concept" className={cell} />
                <input value={c.keywords} onChange={(e) => set({ concepts: patchRow(form.concepts, i, { keywords: e.target.value }) })} aria-label={`Concept ${i + 1} keywords`} placeholder="Keywords, comma-separated" className={cell} />
                <input type="number" min={1} max={10} value={c.weight} onChange={(e) => set({ concepts: patchRow(form.concepts, i, { weight: e.target.value }) })} aria-label={`Concept ${i + 1} weight`} className={cell} />
                <RemoveButton label={`Remove concept ${i + 1}`} disabled={form.concepts.length <= 1} onClick={() => set({ concepts: dropRow(form.concepts, i) })} />
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" onClick={() => set({ concepts: [...form.concepts, emptyConcept()] })}>
            <Plus className="h-4 w-4" aria-hidden /> Add concept
          </Button>
        </Section>
      )}

      <Section title="Explanation">
        <Textarea
          label="Explanation"
          rows={4}
          value={form.explanation}
          onChange={(e) => set({ explanation: e.target.value })}
          hint={
            t === 'SQL' || t === 'CODING'
              ? 'Revealed only after a correct answer, so it may include the solution.'
              : 'Shown to learners after they answer.'
          }
        />
      </Section>
    </div>
  )
}
