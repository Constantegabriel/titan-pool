import { ChevronLeft, LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp' | 'light'
type Size = 'md' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-white text-rose-600 border border-rose-100 hover:bg-rose-50',
  whatsapp: 'bg-[#25d366] text-white shadow-sm shadow-emerald-600/20 hover:bg-[#1fbd5a]',
  light: 'bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100',
}
const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[15px] gap-2',
  sm: 'h-9 px-3 text-sm gap-1.5',
}

const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra?: string) =>
  cn(
    'inline-flex items-center justify-center rounded-xl font-semibold transition-all select-none active:scale-[0.98]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-40 disabled:pointer-events-none',
    VARIANTS[variant], SIZES[size], extra,
  )

export function Button({ variant, size, className, loading, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} disabled={loading || props.disabled} {...props}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function ButtonLink({ variant, size, className, ...props }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}

export function ExternalButton({ variant, size, className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)} {...props} />
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-slate-100 bg-white p-4 shadow-card', className)}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-7 mb-2.5 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-semibold text-slate-800">{children}</h2>
      {action}
    </div>
  )
}

const control =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500'

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const Input = ({ className, ...props }: React.ComponentProps<'input'>) => (
  <input className={cn(control, 'h-11', className)} {...props} />
)
export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(control, 'min-h-24 py-2.5', className)} {...props} />
)
export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(control, 'h-11', className)} {...props} />
)

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
}
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', TONES[tone])}>{children}</span>
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start gap-2">
      {back && (
        <Link to={back} className={cn(back === '/mais' && 'lg:hidden', '-ml-1.5 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')} aria-label="Voltar">
          <ChevronLeft className="size-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {action}
    </header>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white px-6 py-10 text-center shadow-card">
      {icon && <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>}
      <p className="font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-16 text-slate-400" role="status" aria-label="Carregando">
      <LoaderCircle className="size-7 animate-spin" />
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Erro inesperado.'
  return <Card className="text-sm text-rose-700">Não foi possível carregar os dados. {message}</Card>
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex gap-1 rounded-2xl bg-slate-200/50 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-9 flex-1 rounded-xl text-sm font-semibold transition-colors', value === o.value ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card', className)}>{children}</ul>
}

const AVATAR_COLORS = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-700']

/** Iniciais com cor fixa por nome — reconhecer o cliente na lista de relance. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const parts = name.trim().split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w))
  const initials = ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' }
  return <span className={cn('flex shrink-0 items-center justify-center rounded-full font-bold', sizes[size], AVATAR_COLORS[h % AVATAR_COLORS.length])} aria-hidden>{initials}</span>
}
