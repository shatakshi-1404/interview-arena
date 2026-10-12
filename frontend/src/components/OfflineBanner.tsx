import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-2 bg-ink-900 px-4 py-2 text-sm text-ivory-100">
      <WifiOff className="h-4 w-4" aria-hidden />
      You're offline. Some things won't work until your connection returns. Exam answers keep retrying automatically.
    </div>
  )
}
