import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { http, ApiError } from '@/lib/api'
import { passwordIssue } from '@/lib/validation'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/components/ui/Button'
import { PasswordInput } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import type { MessageResponse } from '@/types/api'
import { AuthLayout } from './AuthLayout'

export default function ResetPassword() {
  usePageTitle('Choose a new password')
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!token) {
    return (
      <AuthLayout title="This reset link is incomplete">
        <p className="text-ink-600">Request a new link and open it from your email.</p>
        <Link to="/forgot-password" className="mt-4 inline-block font-medium text-mustard-700 hover:underline">
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const issue = passwordIssue(password)
    if (issue) return setError(issue)
    setError(null)
    setBusy(true)
    try {
      await http.post<MessageResponse>('/api/auth/reset-password', { token, new_password: password }, { auth: false })
      toast.success('Password updated. Please sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'This reset link is invalid, expired or already used. Request a new one.'
          : err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
          hint="At least 8 characters, with a letter and a number."
        />
        <Button type="submit" loading={busy} className="w-full">
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
