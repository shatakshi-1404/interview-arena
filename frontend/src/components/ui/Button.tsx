import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50'
const variants: Record<Variant, string> = {
  primary: 'bg-gold-500 text-ink-900 shadow-card hover:bg-gold-400 active:bg-gold-600',
  secondary: 'border border-line-strong bg-white text-ink-900 hover:bg-ivory-200',
  ghost: 'text-ink-700 hover:bg-ivory-200',
  danger: 'bg-danger text-white hover:bg-danger/90',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function buttonClasses(o: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[o.variant ?? 'primary'], sizes[o.size ?? 'md'], o.className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
})

export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses({ variant, size, className })} {...rest} />
}
