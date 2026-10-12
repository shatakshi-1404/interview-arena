import { NavLink } from 'react-router-dom'
import {
  ClipboardCheck, Code2, LayoutDashboard, ShieldCheck, Sparkles, Target, TrendingUp, Trophy, UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Logo } from '@/components/ui/Logo'
import { useAuth } from '@/auth/AuthContext'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/practice', label: 'Practice', icon: Code2 },
  { to: '/assessments', label: 'Assessments', icon: ClipboardCheck },
  { to: '/mock-interviews', label: 'Mock Interviews', icon: Target },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/recommendations', label: 'Recommendations', icon: Sparkles },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const items = user?.role === 'ADMIN' ? [...NAV, { to: '/admin', label: 'Admin', icon: ShieldCheck }] : NAV
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-gold-50 text-ink-900' : 'text-ink-600 hover:bg-ivory-200 hover:text-ink-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-gold-500" aria-hidden />}
                <Icon className={cn('h-[18px] w-[18px]', isActive ? 'text-gold-700' : 'text-ink-500')} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <p className="px-5 py-4 text-xs leading-relaxed text-ink-500">Practice smarter. Perform better.</p>
    </div>
  )
}
