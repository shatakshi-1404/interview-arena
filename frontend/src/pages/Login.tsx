import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { ApiError } from '@/lib/api'
import { isEmail } from '@/lib/validation'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/components/ui/Button'
import { Input, PasswordInput } from '@/components/ui/Input'
import { AuthLayout } from './AuthLayout'

export default function Login() {
  usePageTitle('Sign in')
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const next: typeof errors = {}
    if (!isEmail(email)) next.email = 'Enter a valid email address'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await login(email.trim(), password) // GuestRoute redirects once the session is established
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.status === 401 ? 'Incorrect email or password.' : err.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Sign in to InterviewArena" subtitle="Pick up where you left off.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-mustard-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600">
        New here?{' '}
        <Link to="/register" className="font-medium text-mustard-700 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
