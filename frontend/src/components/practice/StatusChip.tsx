import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

export function StatusChip({ status }: { status: 'SOLVED' | 'ATTEMPTED' | null }) {
  if (status === 'SOLVED') {
    return <Badge tone="success"><Check className="mr-1 h-3 w-3" aria-hidden />Solved</Badge>
  }
  if (status === 'ATTEMPTED') return <Badge tone="gold">Attempted</Badge>
  return null
}
