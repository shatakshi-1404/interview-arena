import { Link } from 'react-router-dom'
import { Flame, Gauge, Percent, Sparkles, Star, TrendingDown, Target } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { PerformanceChart } from '@/components/charts/PerformanceChart'
import { SkillHeatmap } from '@/components/charts/SkillHeatmap'
import { ReadinessCompact } from '@/components/readiness/ReadinessCompact'
import { RecommendationItem } from '@/components/recommendations/RecommendationItem'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Panel } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { StatCard } from '@/components/ui/StatCard'
import { firstName, pct } from '@/lib/format'
import { useProgress, useRecommendations, useTopics } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import type { ProgressOverview } from '@/types/api'

function Stats({ p }: { p: ProgressOverview }) {
  const r = p.readiness
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard accent icon={Flame} label="Current streak" value={`${p.current_streak} ${p.current_streak === 1 ? 'day' : 'days'}`} hint={`Longest: ${p.longest_streak}`} />
      <StatCard icon={Star} label="Problems solved" value={p.problems_solved} hint={`${p.total_answered} answers in total`} />
      <StatCard icon={Percent} label="Accuracy" value={pct(p.accuracy)} hint="Share of answers fully correct" />
      <StatCard icon={Gauge} label="Average score" value={pct(p.average_score)} hint="Includes partial credit" />
      <StatCard icon={TrendingDown} label="Weakest topic" value={p.weakest_topic?.label ?? '—'} hint={p.weakest_topic ? `${pct(p.weakest_topic.accuracy)} accuracy` : 'Needs 3 answers in a topic'} />
      <StatCard
        accent
        icon={Sparkles}
        label="Practice Readiness"
        value={r.status === 'READY_TO_SCORE' && r.score != null ? <>{Math.round(r.score)}<span className="text-base font-medium text-ink-500"> / 100</span></> : r.status === 'DISABLED' ? 'Off' : `${r.answered} / ${r.needed}`}
        hint={r.status === 'READY_TO_SCORE' ? r.category : r.status === 'DISABLED' ? 'Personalization is disabled on this server' : 'answers needed to unlock your estimate'}
      />
    </div>
  )
}

function SkillSection() {
  const topics = useTopics()
  return (
    <Panel title="Skill heatmap" description="Accuracy by topic area." action={<Link to="/progress" className="text-sm font-medium text-mustard-700 hover:underline">Full breakdown</Link>}>
      {topics.isPending ? (
        <BlockSkeleton className="h-40" />
      ) : topics.isError ? (
        <ErrorState error={topics.error} onRetry={() => topics.refetch()} />
      ) : (
        <>
          <SkillHeatmap items={topics.data.categories} />
          {topics.data.weak_topics[0] && (
            <p className="mt-4 rounded-lg border border-line bg-ivory-50 px-3 py-2 text-sm text-ink-700">
              <span className="font-medium">Needs attention: </span>
              {topics.data.weak_topics[0].reasons[0]}
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

function RecommendationsSection() {
  const recs = useRecommendations()
  return (
    <Panel title="Recommended next" description="Chosen from your own history, with the reason for each." action={<Link to="/recommendations" className="text-sm font-medium text-mustard-700 hover:underline">See all</Link>}>
      {recs.isPending ? (
        <BlockSkeleton className="h-40" />
      ) : recs.isError ? (
        <ErrorState error={recs.error} onRetry={() => recs.refetch()} />
      ) : !recs.data.enabled ? (
        <p className="text-sm text-ink-600">Personalized recommendations are turned off on this server.</p>
      ) : recs.data.items.length === 0 ? (
        <EmptyState icon={Target} title="Nothing to recommend yet" text="Recommendations appear once there are published questions you haven't solved." />
      ) : (
        <ul className="space-y-3">
          {recs.data.items.slice(0, 3).map((r) => <RecommendationItem key={r.id} rec={r} />)}
        </ul>
      )}
    </Panel>
  )
}

export default function Dashboard() {
  usePageTitle('Overview')
  const { user } = useAuth()
  const progress = useProgress()

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user ? firstName(user.name) : ''}</h1>
      <p className="mt-1 text-ink-600">Here's where your practice stands today.</p>

      {progress.isPending ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading your stats">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>
      ) : progress.isError ? (
        <div className="mt-8"><ErrorState error={progress.error} onRetry={() => progress.refetch()} title="We couldn't load your stats" /></div>
      ) : (
        <div className="mt-6 space-y-6">
          {progress.data.total_answered === 0 && (
            <Card className="flex flex-col items-start justify-between gap-4 border-gold-300 bg-gold-50/60 p-6 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold">No activity yet</p>
                <p className="mt-1 text-sm text-ink-600">Answer your first question and your analytics will start filling in.</p>
              </div>
              <ButtonLink to="/practice">Start practicing</ButtonLink>
            </Card>
          )}
          <Stats p={progress.data} />
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Performance over time" description="Last 30 days">
              <PerformanceChart data={progress.data.performance_over_time} />
            </Panel>
            <ReadinessCompact summary={progress.data.readiness} />
          </div>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <SkillSection />
        <RecommendationsSection />
      </div>
    </div>
  )
}
