import { Lightbulb } from 'lucide-react'
import { RecommendationItem } from '@/components/recommendations/RecommendationItem'
import { ButtonLink } from '@/components/ui/Button'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useDismissRecommendation, useRecommendations } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'

export default function Recommendations() {
  usePageTitle('Recommendations')
  const q = useRecommendations()
  const dismiss = useDismissRecommendation()
  const toast = useToast()

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Recommendations</h1>
      <p className="mt-1 max-w-2xl text-ink-600">
        Built from your answers: weak topics, recent accuracy and the difficulty you're ready for. Each one says why it's here.
      </p>

      <div className="mt-6">
        {q.isPending ? (
          <BlockSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data.enabled ? (
          <EmptyState icon={Lightbulb} title="Personalization is turned off" text="Recommendations are disabled on this server. You can still browse every question in Practice." action={<ButtonLink to="/practice" variant="secondary">Go to Practice</ButtonLink>} />
        ) : q.data.items.length === 0 ? (
          <EmptyState icon={Lightbulb} title="Nothing to recommend right now" text="Check back after you answer more questions, or when new ones are published." action={<ButtonLink to="/practice">Browse questions</ButtonLink>} />
        ) : (
          <ul className="space-y-3">
            {q.data.items.map((r) => (
              <RecommendationItem
                key={r.id}
                rec={r}
                dismissing={dismiss.isPending && dismiss.variables === r.id}
                onDismiss={(id) =>
                  dismiss.mutate(id, {
                    onSuccess: () => toast.info("Dismissed. We won't suggest it again for a week."),
                    onError: (e) => toast.error(e.message),
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
