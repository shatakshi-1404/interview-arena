import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, Blocks, Boxes, ClipboardCheck, Cpu, Database, Flame, LayoutGrid, Menu, Network, Server,
  Sparkles, Terminal, Timer, X, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/cn'
import { usePageTitle } from '@/lib/usePageTitle'
import { ButtonLink } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'

const LINKS = [
  { to: '/practice', label: 'Practice' },
  { to: '/assessments', label: 'Assessments' },
  { to: '/leaderboard', label: 'Leaderboard' },
]
const navLink = 'rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ivory-200 hover:text-ink-900'

function Navbar() {
  const { status } = useAuth()
  const [open, setOpen] = useState(false)
  const authed = status === 'authenticated'
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ivory-100/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="InterviewArena home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={navLink}>
              {l.label}
            </Link>
          ))}
          <a href="#how-it-works" className={navLink}>How it works</a>
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {authed ? (
            <ButtonLink to="/dashboard" size="sm">Go to dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="sm">Login</ButtonLink>
              <ButtonLink to="/register" size="sm">Start Practicing</ButtonLink>
            </>
          )}
        </div>
        <button
          className="rounded-lg p-2 text-ink-700 hover:bg-ivory-200 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="space-y-1 border-t border-line bg-ivory-50 px-4 py-3 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={cn(navLink, 'block')} onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
          <a href="#how-it-works" className={cn(navLink, 'block')} onClick={() => setOpen(false)}>How it works</a>
          <div className="flex gap-2 pt-2">
            {authed ? (
              <ButtonLink to="/dashboard" className="flex-1">Go to dashboard</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/login" variant="secondary" className="flex-1">Login</ButtonLink>
                <ButtonLink to="/register" className="flex-1">Start Practicing</ButtonLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

/** Illustration only: every number here is sample data, and the card says so. */
function HeroPreview() {
  const topics: [string, number][] = [['Arrays', 86], ['Trees', 72], ['SQL', 64], ['OS', 58], ['Graphs', 48]]
  const C = 2 * Math.PI * 34
  return (
    <div role="img" aria-label="Illustration of the InterviewArena dashboard, using sample data" className="relative">
      <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-line bg-ivory-50 px-4 py-3">
          <p className="text-sm font-medium">Mock interview · Backend Engineer</p>
          <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[11px] font-medium text-ink-600">Sample data</span>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between text-sm text-ink-600">
              <span>Question 6 of 10</span>
              <span className="inline-flex items-center gap-1.5 font-mono font-medium text-ink-900"><Timer className="h-4 w-4" />24:10</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-ivory-200"><div className="h-2 w-[60%] rounded-full bg-gold-500" /></div>
            <p className="mt-4 text-sm font-medium">Find the second highest salary</p>
            <p className="mt-1 font-mono text-xs text-ink-500">SQL · Medium</p>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-gold-300 bg-gold-50/60 p-4 sm:flex-col sm:justify-center">
            <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#F4EFE2" strokeWidth="8" />
              <circle cx="40" cy="40" r="34" fill="none" stroke="#E3A908" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * 0.22} />
            </svg>
            <div className="sm:text-center">
              <p className="text-2xl font-semibold leading-none">78</p>
              <p className="mt-1 text-xs text-ink-600">Practice Readiness</p>
            </div>
          </div>
        </div>
        <div className="space-y-2.5 px-4 pb-4 sm:px-5">
          {topics.map(([name, v]) => (
            <div key={name} className="flex items-center gap-3 text-xs">
              <span className="w-12 text-ink-600">{name}</span>
              <div className="h-2 flex-1 rounded-full bg-ivory-200">
                <div className={cn('h-2 rounded-full', v < 50 ? 'bg-mustard-500' : 'bg-gold-400')} style={{ width: `${v}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-ink-700">{v}%</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 border-t border-line bg-ivory-50 px-4 py-3 text-xs text-ink-700 sm:px-5">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-700" />
          <p>Your recent Graph accuracy is 48%. Recommended next: BFS / DFS · Medium</p>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  const { status } = useAuth()
  const authed = status === 'authenticated'
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-24">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink-600">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden /> Interview preparation, measured
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[56px] lg:leading-[1.06]">
          Turn interview practice into{' '}
          <span className="bg-gradient-to-t from-gold-300/60 to-gold-300/60 bg-[length:100%_0.3em] bg-bottom bg-no-repeat [box-decoration-break:clone]">
            measurable progress.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-600">
          Practice coding, SQL, and computer science fundamentals while understanding exactly where you need to improve.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to={authed ? '/dashboard' : '/register'} size="lg">Start Practicing</ButtonLink>
          <ButtonLink to="/practice" variant="secondary" size="lg">Explore Challenges</ButtonLink>
        </div>
      </div>
      <HeroPreview />
    </section>
  )
}

const AREAS: { name: string; blurb: string; icon: LucideIcon }[] = [
  { name: 'DSA', blurb: 'Arrays, trees, graphs, dynamic programming.', icon: Network },
  { name: 'SQL', blurb: 'Joins, aggregation and window functions on real datasets.', icon: Database },
  { name: 'DBMS', blurb: 'Normalization, transactions, indexing.', icon: Boxes },
  { name: 'OS', blurb: 'Scheduling, memory, concurrency, deadlocks.', icon: Cpu },
  { name: 'CN', blurb: 'TCP/IP, HTTP, DNS and the layers between.', icon: Server },
  { name: 'OOP', blurb: 'Polymorphism, SOLID, design principles.', icon: Blocks },
  { name: 'Programming', blurb: 'Java and Python fundamentals.', icon: Terminal },
  { name: 'System Design Basics', blurb: 'Scaling, caching and trade-offs.', icon: LayoutGrid },
]

const FEATURES: { title: string; text: string; icon: LucideIcon }[] = [
  { title: 'Timed assessments', text: 'Server-enforced timers with auto-save, and automatic submission when time runs out.', icon: Timer },
  { title: 'Detailed analytics', text: 'Accuracy, speed and consistency by topic and difficulty.', icon: BarChart3 },
  { title: 'Personalized practice', text: 'Recommendations built from your own history, each with the reason behind it.', icon: Sparkles },
  { title: 'AI-assisted feedback', text: 'Short answers are scored for concept coverage, with clear notes on what is missing. No black box.', icon: ClipboardCheck },
  { title: 'Progress tracking', text: 'Daily streaks and activity that stay subtle and useful.', icon: Flame },
  { title: 'Skill heatmaps', text: 'See strengths and gaps across all topic areas at a glance.', icon: LayoutGrid },
]

const STEPS = [
  { n: '01', title: 'Practice', text: 'Solve MCQs, SQL problems, short answers and coding challenges.' },
  { n: '02', title: 'Get feedback', text: 'See your result immediately, with explanations and expected output.' },
  { n: '03', title: 'Find your gaps', text: 'Analytics show which topics need work and why.' },
  { n: '04', title: 'Follow your plan', text: 'Take recommended questions, then assessments and mock interviews.' },
]

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      {intro && <p className="mt-3 max-w-2xl text-ink-600">{intro}</p>}
      <div className="mt-10">{children}</div>
    </section>
  )
}

export default function Landing() {
  usePageTitle('Practice smarter. Perform better.')
  const { status } = useAuth()
  return (
    <div>
      <Navbar />
      <main>
        <Hero />

        <Section id="practice-areas" title="Practice areas" intro="Eight areas that cover what technical interviews actually ask.">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AREAS.map(({ name, blurb, icon: Icon }) => (
              <li key={name} className="rounded-xl border border-line bg-white p-5 shadow-card">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{name}</h3>
                <p className="mt-1 text-sm text-ink-600">{blurb}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="features" title="Built around feedback, not just questions">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, text, icon: Icon }) => (
              <li key={title} className="rounded-xl border border-line bg-ivory-50 p-6">
                <Icon className="h-5 w-5 text-mustard-700" aria-hidden />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-600">{text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how-it-works" title="How it works">
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="border-t-2 border-gold-500 pt-4">
                <p className="font-mono text-sm text-mustard-700">{s.n}</p>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-ink-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-ink-900 px-8 py-10 text-ivory-100 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ready to see where you stand?</h2>
              <p className="mt-2 text-ink-300">Create a free account and answer your first question in a minute.</p>
            </div>
            <ButtonLink to={status === 'authenticated' ? '/dashboard' : '/register'} size="lg">Start Practicing</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Logo />
          <p className="max-w-lg">
            Practice Readiness reflects performance on this platform. It does not predict interview or hiring outcomes.
          </p>
          <p>© {new Date().getFullYear()} InterviewArena</p>
        </div>
      </footer>
    </div>
  )
}
