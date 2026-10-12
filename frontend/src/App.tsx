import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { GuestRoute, ProtectedRoute } from '@/auth/RouteGuards'
import { AppShell } from '@/components/layout/AppShell'
import { Spinner } from '@/components/ui/Spinner'
import AssessmentDetailPage from '@/pages/AssessmentDetailPage'
import Assessments from '@/pages/Assessments'
import AttemptPage from '@/pages/AttemptPage'
import AttemptResultPage from '@/pages/AttemptResultPage'
import Dashboard from '@/pages/Dashboard'
import ForgotPassword from '@/pages/ForgotPassword'
import Landing from '@/pages/Landing'
import Leaderboard from '@/pages/Leaderboard'
import Login from '@/pages/Login'
import MockInterviews from '@/pages/MockInterviews'
import MockReportPage from '@/pages/MockReportPage'
import NotFound from '@/pages/NotFound'
import Practice from '@/pages/Practice'
import Profile from '@/pages/Profile'
import Progress from '@/pages/Progress'
import Question from '@/pages/Question'
import Recommendations from '@/pages/Recommendations'
import Register from '@/pages/Register'
import ResetPassword from '@/pages/ResetPassword'

const AdminRoutes = lazy(() => import('@/pages/admin/AdminRoutes'))

/** Routes only. Router and providers live in main.tsx so tests can supply their own. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        {/* The exam is deliberately outside the app shell: no sidebar, nothing to distract. */}
        <Route path="/attempts/:attemptId" element={<AttemptPage />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/practice/:questionId" element={<Question />} />
          <Route path="/assessments" element={<Assessments />} />
          <Route path="/assessments/:assessmentId" element={<AssessmentDetailPage />} />
          <Route path="/attempts/:attemptId/result" element={<AttemptResultPage />} />
          <Route path="/mock-interviews" element={<MockInterviews />} />
          <Route path="/mock-interviews/:attemptId/report" element={<MockReportPage />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="ADMIN" />}>
        <Route element={<AppShell />}>
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<div className="flex justify-center py-16 text-ink-500" role="status" aria-label="Loading"><Spinner className="h-6 w-6" /></div>}>
                <AdminRoutes />
              </Suspense>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
