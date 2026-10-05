import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { CodingPanel } from '@/components/practice/CodingPanel'
import { McqPanel } from '@/components/practice/McqPanel'
import { ProblemStatement } from '@/components/practice/ProblemStatement'
import { ShortAnswerPanel } from '@/components/practice/ShortAnswerPanel'
import { SqlPanel } from '@/components/practice/SqlPanel'
import { StatusChip } from '@/components/practice/StatusChip'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { ApiError } from '@/lib/api'
import { categoryLabel, DIFFICULTY_LABEL, DIFFICULTY_TONE, TYPE_LABEL } from '@/lib/labels'
import { useCapabilities, useQuestion } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { Capabilities, QuestionDetail } from '@/types/api'
import { Card } from '@/components/ui/Card'

function Workspace({ q, caps }: { q: QuestionDetail; caps: Capabilities | undefined }) {
  switch (q.question_type) {
    case 'MCQ':
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <ProblemStatement q={q} />
          <McqPanel q={q} />
        </div>
      )
    case 'SHORT_ANSWER':
      return (
        <div className="mx-auto max-w-3xl space-y-6">
          <ProblemStatement q={q} />
          <ShortAnswerPanel q={q} caps={caps} />
        </div>
      )
    case 'SQL':
      return (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <ProblemStatement q={q} />
          <SqlPanel q={q} />
        </div>
      )
    case 'CODING':
      return (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <ProblemStatement q={q} />
          <CodingPanel q={q} caps={caps} />
        </div>
      )
  }
}

export default function Question() {
  const { questionId } = useParams()
  const id = Number(questionId)
  const valid = Number.isInteger(id) && id > 0
  const query = useQuestion(id, valid)
  const caps = useCapabilities()
  usePageTitle(query.data?.title ?? 'Question')

  const back = (
    <Link to="/practice" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to questions
    </Link>
  )

  if (!valid || (query.isError && query.error instanceof ApiError && query.error.status === 404)) {
    return (
      <div>
        {back}
        <Card className="mt-6">
          <EmptyState icon={FileQuestion} title="Question not found" text="It may have been removed or unpublished." action={<ButtonLink to="/practice">Browse questions</ButtonLink>} />
        </Card>
      </div>
    )
  }

  return (
    <div>
      {back}
      {query.isPending ? (
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading question">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.isError ? (
        <div className="mt-6"><ErrorState error={query.error} onRetry={() => query.refetch()} title="We couldn't load this question" /></div>
      ) : (
        <>
          <div className="mt-4 mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">{query.data.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge>{categoryLabel(query.data.category)}</Badge>
              <Badge tone={DIFFICULTY_TONE[query.data.difficulty]}>{DIFFICULTY_LABEL[query.data.difficulty]}</Badge>
              <Badge>{TYPE_LABEL[query.data.question_type]}</Badge>
              <StatusChip status={query.data.user_status} />
              {query.data.tags.map((t) => <span key={t} className="text-xs text-ink-500">#{t}</span>)}
            </div>
          </div>
          <Workspace key={query.data.id} q={query.data} caps={caps.data} />
        </>
      )}
    </div>
  )
}
