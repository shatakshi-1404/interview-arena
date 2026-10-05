import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ButtonLink } from '@/components/ui/Button'
import { safeRedirect } from '@/lib/validation'
import type { Role } from '@/types/api'
import { useAuth } from './AuthContext'

/** Frontend gate only. The API enforces roles on every request. */
export function ProtectedRoute({ role }: { role?: Role }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (role && user?.role !== role) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-mustard-700" aria-hidden />
        <h1 className="text-xl font-semibold">You don't have access to this page</h1>
        <p className="max-w-sm text-ink-600">
          This area is for administrators. If you think that's a mistake, ask an admin to update your role.
        </p>
        <ButtonLink to="/dashboard" variant="secondary">
          Back to your dashboard
        </ButtonLink>
        <Link to="/" className="text-sm text-ink-500 underline">
          Home
        </Link>
      </div>
    )
  }
  return <Outlet />
}

/** Login/register are for signed-out visitors; signed-in users go where they were headed. */
export function GuestRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') {
    return <Navigate to={safeRedirect((location.state as { from?: string } | null)?.from)} replace />
  }
  return <Outlet />
}
