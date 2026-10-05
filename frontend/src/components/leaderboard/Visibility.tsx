import { useAuth } from '@/auth/AuthContext'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import { useUpdateProfile } from '@/lib/queries'

export function LeaderboardVisibility() {
  const { user } = useAuth()
  const update = useUpdateProfile()
  const toast = useToast()
  if (!user) return null
  return (
    <Switch
      label="Show me on the leaderboard"
      description="Others see your first name and last initial, problems solved, accuracy and points. Never your email."
      checked={user.show_on_leaderboard}
      disabled={update.isPending}
      onChange={(next) =>
        update.mutate(
          { show_on_leaderboard: next },
          {
            onSuccess: () => toast.success(next ? 'You now appear on the leaderboard.' : 'You are hidden from the leaderboard.'),
            onError: (e) => toast.error(e.message),
          },
        )
      }
    />
  )
}
