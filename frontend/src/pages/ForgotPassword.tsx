import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { http, ApiError } from '@/lib/api'
import { isEmail } from '@/lib/validation'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { MessageResponse } from '@/types/api'
import { AuthLayout } from './AuthLayout'

export default function ForgotPassword() {
  usePageTitle('Reset password')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isEmail(email)) return setError('Enter a valid email address')
    setError(null)
    setBusy(true)
    try {
      await http.post<MessageResponse>('/api/auth/forgot-password', { email: email.trim() }, { auth: false })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll send a reset link if the email is registered.">
      {sent ? (
        <div className="space-y-4" role="status">
          <MailCheck className="h-8 w-8 text-gold-700" aria-hidden />
          <p className="text-ink-800">If that email is registered, a reset link has been sent. The link expires in 30 minutes.</p>
          {import.meta.env.DEV && (
            <p className="rounded-lg border border-line bg-ivory-200 px-3 py-2 text-sm text-ink-600">
              Development: no email provider is configured, so the link is printed in the backend logs.
            </p>
          )}
          <Link to="/login" className="text-sm font-medium text-mustard-700 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error ?? undefined} />
          <Button type="submit" loading={busy} className="w-full">
            Send reset link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-mustard-700 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
