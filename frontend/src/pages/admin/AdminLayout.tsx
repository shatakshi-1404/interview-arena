import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/questions', label: 'Questions' },
  { to: '/admin/assessments', label: 'Assessments' },
  { to: '/admin/submissions', label: 'Submissions' },
  { to: '/admin/audit-log', label: 'Audit log' },
  { to: '/admin/categories', label: 'Categories' },
]

export default function AdminLayout() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <nav aria-label="Admin sections" className="-mx-4 mt-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 whitespace-nowrap">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn('inline-block border-b-2 px-3 py-2 text-sm font-medium', isActive ? 'border-gold-500 text-ink-900' : 'border-transparent text-ink-600 hover:text-ink-900')
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}
