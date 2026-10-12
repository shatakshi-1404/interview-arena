import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { ApiError } from '@/lib/api'
import { isEmail, passwordIssue } from '@/lib/validation'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/components/ui/Button'
import { Input, PasswordInput } from '@/components/ui/Input'
import { AuthLayout } from './AuthLayout'

type Errors = { name?: string; email?: string; password?: string }

export default function Register() {
  usePageTitle('Create account')
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const next: Errors = {}
    if (name.trim().length < 2) next.name = 'Enter your name (at least 2 characters)'
    if (!isEmail(email)) next.email = 'Enter a valid email address'
    const pwIssue = passwordIssue(password)
    if (pwIssue) next.password = pwIssue
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await register(name.trim(), email.trim(), password)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ email: 'An account with this email already exists' })
      } else if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors({ name: err.fieldErrors.name, email: err.fieldErrors.email, password: err.fieldErrors.password })
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Free to use. Start tracking your progress today.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
        <Input label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
        />
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-mustard-700 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
