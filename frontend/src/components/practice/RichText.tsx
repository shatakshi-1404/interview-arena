import { Fragment } from 'react'
import { cn } from '@/lib/cn'

/** Plain text with `inline code` highlighting. Never renders HTML, so authored content can't inject markup. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn('whitespace-pre-wrap leading-relaxed', className)}>
      {text.split(/(`[^`\n]+`)/g).map((part, i) =>
        part.length > 2 && part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="rounded bg-ivory-200 px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  )
}
