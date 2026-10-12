import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useAdminUsers, useUpdateUser } from '@/lib/adminQueries'
import { dateLabel, timeAgo } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { usePageTitle } from '@/lib/usePageTitle'
import { Users } from 'lucide-react'
import type { AdminUser } from '@/types/api'

type Kind = 'role' | 'active'

function describe(u: AdminUser, kind: Kind) {
  if (kind === 'role') {
    return u.role === 'ADMIN'
      ? { title: `Remove admin access from ${u.name}?`, body: 'They become a regular user and lose access to the admin console.', confirm: 'Remove admin', done: `${u.name} is no longer an admin.`, destructive: true }
      : { title: `Make ${u.name} an admin?`, body: 'Admins can manage questions, assessments and users, and see platform data.', confirm: 'Make admin', done: `${u.name} is now an admin.`, destructive: false }
  }
  return u.is_active
    ? { title: `Deactivate ${u.name}?`, body: 'They are signed out and cannot log in until reactivated. Their data is kept.', confirm: 'Deactivate', done: `${u.name} was deactivated.`, destructive: true }
    : { title: `Reactivate ${u.name}?`, body: 'They will be able to log in again.', confirm: 'Reactivate', done: `${u.name} was reactivated.`, destructive: false }
}

export default function AdminUsers() {
  usePageTitle('Admin · Users')
  const { user: me } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const term = useDebouncedValue(search.trim())
  useEffect(() => setPage(1), [term, role, status])

  const list = useAdminUsers({ search: term || undefined, role: role || undefined, is_active: status || undefined, page })
  const update = useUpdateUser()
  const [pending, setPending] = useState<{ u: AdminUser; kind: Kind } | null>(null)
  const info = pending ? describe(pending.u, pending.kind) : null

  const open = (u: AdminUser, kind: Kind) => {
    update.reset()
    setPending({ u, kind })
  }
  const confirm = () => {
    if (!pending || !info) return
    const body = pending.kind === 'role' ? { role: pending.u.role === 'ADMIN' ? ('USER' as const) : ('ADMIN' as const) } : { is_active: !pending.u.is_active }
    update.mutate({ id: pending.u.id, body }, { onSuccess: () => { toast.success(info.done); setPending(null) } })
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Input label="Search users" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
          <Select label="Role" value={role} onChange={setRole} options={[{ value: '', label: 'All roles' }, { value: 'USER', label: 'Users' }, { value: 'ADMIN', label: 'Admins' }]} />
          <Select label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Deactivated' }]} />
        </div>
      </Card>

      {list.isPending ? (
        <BlockSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="We couldn't load users" />
      ) : list.data.items.length === 0 ? (
        <Card><EmptyState icon={Users} title="No users match" text="Try a different search or clear the filters." /></Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">Users</caption>
              <thead className="border-b border-line bg-ivory-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>{['Name', 'Email', 'Role', 'Status', 'Answers', 'Last active', 'Joined', 'Actions'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((u) => {
                  const self = u.id === me?.id
                  return (
                    <tr key={u.id}>
                      <th scope="row" className="whitespace-nowrap px-4 py-3 font-medium">{u.name}{self && <Badge tone="gold" className="ml-2">You</Badge>}</th>
                      <td className="px-4 py-3">{u.email}</td>
                      <td className="px-4 py-3"><Badge tone={u.role === 'ADMIN' ? 'gold' : 'neutral'}>{u.role === 'ADMIN' ? 'Admin' : 'User'}</Badge></td>
                      <td className="px-4 py-3"><Badge tone={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Deactivated'}</Badge></td>
                      <td className="px-4 py-3">{u.answered}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{u.last_active ? timeAgo(u.last_active) : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-600">{dateLabel(u.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" disabled={self} title={self ? "You can't change your own role" : undefined}
                            aria-label={u.role === 'ADMIN' ? `Remove admin access from ${u.name}` : `Make ${u.name} an admin`} onClick={() => open(u, 'role')}>
                            {u.role === 'ADMIN' ? 'Remove admin' : 'Make admin'}
                          </Button>
                          <Button variant="ghost" size="sm" disabled={self} title={self ? "You can't deactivate your own account" : undefined}
                            aria-label={u.is_active ? `Deactivate ${u.name}` : `Reactivate ${u.name}`} onClick={() => open(u, 'active')}>
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
          <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        title={info?.title ?? ''}
        confirmLabel={info?.confirm ?? ''}
        destructive={info?.destructive}
        loading={update.isPending}
        error={update.error}
        onCancel={() => !update.isPending && setPending(null)}
        onConfirm={confirm}
      >
        <p>{info?.body}</p>
      </ConfirmDialog>
    </div>
  )
}
