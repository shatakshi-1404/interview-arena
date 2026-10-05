import { useState, type FormEvent } from 'react'
import { Award, Check } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { LeaderboardVisibility } from '@/components/leaderboard/Visibility'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { BlockSkeleton, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { dateLabel } from '@/lib/format'
import { useAchievements, useUpdateProfile } from '@/lib/queries'
import { usePageTitle } from '@/lib/usePageTitle'

function AccountForm() {
  const { user } = useAuth()
  const update = useUpdateProfile()
  const toast = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [error, setError] = useState<string | undefined>()
  if (!user) return null

  const unchanged = name.trim() === user.name

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next = name.trim()
    if (next.length < 2) return setError('Enter at least 2 characters')
    if (next.length > 100) return setError('Use at most 100 characters')
    setError(undefined)
    update.mutate(
      { name: next },
      { onSuccess: () => toast.success('Profile updated'), onError: (err) => setError(err.message) },
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} autoComplete="name" />
      <Input label="Email" value={user.email} readOnly disabled hint="Your email can't be changed here." />
      <p className="text-sm text-ink-500">Member since {dateLabel(user.created_at)}</p>
      <Button type="submit" loading={update.isPending} disabled={unchanged}>Save changes</Button>
    </form>
  )
}

function Achievements() {
  const q = useAchievements()
  if (q.isPending) return <BlockSkeleton className="h-40" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {q.data.map((a) => (
        <li key={a.code} className={cn('rounded-xl border p-4', a.earned ? 'border-gold-300 bg-gold-50/60' : 'border-line bg-white')}>
          <div className="flex items-start gap-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', a.earned ? 'bg-gold-500 text-ink-900' : 'bg-ivory-200 text-ink-500')}>
              {a.earned ? <Check className="h-4 w-4" aria-hidden /> : <Award className="h-4 w-4" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{a.name}</p>
              <p className="mt-0.5 text-sm text-ink-600">{a.description}</p>
            </div>
          </div>
          <ProgressBar className="mt-4" value={a.progress} max={a.target} label={`${a.name} progress`} />
          <p className="mt-1.5 text-xs text-ink-500">
            {a.earned && a.earned_at ? `Earned ${dateLabel(a.earned_at)}` : `${a.progress} / ${a.target}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

export default function Profile() {
  usePageTitle('Profile')
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <Panel title="Account"><AccountForm /></Panel>
      <Panel title="Privacy"><div className="max-w-xl"><LeaderboardVisibility /></div></Panel>
      <Panel title="Achievements" description="Quiet milestones, earned by practicing."><Achievements /></Panel>
    </div>
  )
}
