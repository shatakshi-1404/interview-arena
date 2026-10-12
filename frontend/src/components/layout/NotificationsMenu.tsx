import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { http } from '@/lib/api'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { useDismiss } from '@/lib/useDismiss'
import { Skeleton } from '@/components/ui/Skeleton'
import type { NotificationList } from '@/types/api'

const KEY = ['notifications']

export function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  const qc = useQueryClient()
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => http.get<NotificationList>('/api/notifications'),
    refetchInterval: 60_000,
  })
  const onSuccess = (data: NotificationList) => qc.setQueryData(KEY, data)
  const markRead = useMutation({
    mutationFn: (id: number) => http.post<NotificationList>(`/api/notifications/${id}/read`),
    onSuccess,
  })
  const markAll = useMutation({
    mutationFn: () => http.post<NotificationList>('/api/notifications/read-all'),
    onSuccess,
  })

  const unread = list.data?.unread_count ?? 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-lg p-2 text-ink-600 hover:bg-ivory-200 hover:text-ink-900"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-ink-900">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-in overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button
              onClick={() => markAll.mutate()}
              disabled={!unread || markAll.isPending}
              className="text-sm font-medium text-mustard-700 hover:underline disabled:text-ink-500 disabled:no-underline"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.isPending ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : list.isError ? (
              <div className="p-4 text-sm text-ink-600">
                Couldn't load notifications.{' '}
                <button onClick={() => list.refetch()} className="font-medium text-mustard-700 underline">
                  Retry
                </button>
              </div>
            ) : list.data.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-500">You're all caught up.</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => !n.is_read && markRead.mutate(n.id)}
                      className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-ivory-100', !n.is_read && 'bg-gold-50/60')}
                    >
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-gold-500')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-sm text-ink-600">{n.body}</span>}
                        <span className="mt-1 block text-xs text-ink-500">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.is_read && <span className="sr-only">Unread</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
