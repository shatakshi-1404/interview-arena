import { ButtonLink } from '@/components/ui/Button'
import { usePageTitle } from '@/lib/usePageTitle'

export default function NotFound() {
  usePageTitle('Page not found')
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-sm text-mustard-700">404</p>
      <h1 className="text-2xl font-semibold">We couldn't find that page</h1>
      <p className="text-ink-600">The link may be broken or the page may have moved.</p>
      <ButtonLink to="/" className="mt-3">
        Go home
      </ButtonLink>
    </div>
  )
}
