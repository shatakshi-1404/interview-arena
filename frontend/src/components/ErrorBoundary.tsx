import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { buttonClasses } from '@/components/ui/Button'

interface Props {
  children: ReactNode
  /** When this changes (e.g. the route), the boundary clears its error and tries to render again. */
  resetKey?: string
}
interface State {
  error: Error | null
}

function Fallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-ink-600">
        An unexpected error stopped this page from loading. Your saved work isn't affected. Try again, or reload the page.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className={buttonClasses()} onClick={onRetry}>Try again</button>
        <button type="button" className={buttonClasses({ variant: 'secondary' })} onClick={() => window.location.reload()}>Reload page</button>
        {/* A plain link: the router itself might be what broke. */}
        <a href="/" className={buttonClasses({ variant: 'ghost' })}>Go home</a>
      </div>
      {import.meta.env.DEV && (
        <details className="max-w-xl text-left text-sm text-ink-600">
          <summary className="cursor-pointer">Error details (development only)</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs">{error.stack ?? error.message}</pre>
        </details>
      )}
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook for an error-reporting service (Sentry etc.) goes here.
    console.error('Unhandled UI error', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (this.state.error) return <Fallback error={this.state.error} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}

/** Resets itself when the user navigates, so one broken page never traps the whole app. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}
