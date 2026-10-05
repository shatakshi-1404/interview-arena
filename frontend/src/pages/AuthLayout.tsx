import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'

const POINTS = [
  'Every answer feeds your analytics: accuracy, speed and consistency by topic.',
  'Recommendations come with a reason, like "Your recent Graph accuracy is 48%."',
  'Timed assessments and mock interviews, scored on the server.',
]

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" aria-label="InterviewArena home" className="w-fit">
          <Logo />
        </Link>
        <main className="m-auto w-full max-w-sm py-12">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </main>
      </div>
      <aside aria-label="About InterviewArena" className="hidden bg-ink-900 p-14 text-ivory-100 lg:flex lg:flex-col lg:justify-center">
        <div className="max-w-md">
          <span className="mb-6 block h-1 w-12 rounded-full bg-gold-500" aria-hidden />
          <p className="text-3xl font-semibold leading-tight tracking-tight">Practice smarter. Perform better.</p>
          <ul className="mt-8 space-y-4 text-ink-300">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
