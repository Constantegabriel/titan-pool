import { CalendarDays, CalendarPlus, Droplets, Menu, ShieldCheck, ShoppingBag, Users, Wallet } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { accessLabel, trialDaysLeft } from '@/domain/account'
import { useAccount } from '@/lib/account-context'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/', label: 'Agenda', icon: CalendarDays, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users, end: false },
  { to: '/compras', label: 'Compras', icon: ShoppingBag, end: false },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, end: false },
  { to: '/mais', label: 'Mais', icon: Menu, end: false },
]

function TrialBanner() {
  const { account } = useAccount()
  const org = account?.org
  if (!org || org.status !== 'trialing') return null
  const left = trialDaysLeft(org)
  if (left === null || left > 5) return null
  return (
    <Link to="/mais" className="block bg-brand-600 px-4 py-2 text-center text-[13px] font-medium text-white">
      {left <= 0 ? 'Seu teste grátis termina hoje' : `Seu teste grátis termina em ${left} ${left === 1 ? 'dia' : 'dias'}`} · ver plano
    </Link>
  )
}

/** Menu lateral no notebook (lg+). */
function Sidebar() {
  const { account } = useAccount()
  const org = account?.org
  const status = org ? accessLabel(org) : null
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/70 bg-white lg:flex">
      <Link to="/" className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-float"><Droplets className="size-5" aria-hidden /></span>
        <span className="text-lg font-bold tracking-tight">Titan Pool</span>
      </Link>
      <div className="px-4">
        <Link to="/agenda/nova" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700">
          <CalendarPlus className="size-4" aria-hidden /> Agendar visita
        </Link>
      </div>
      <nav aria-label="Principal" className="mt-5 flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>
            {({ isActive }) => (<><Icon className="size-5" strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />{label}</>)}
          </NavLink>
        ))}
        {account?.is_admin && (
          <Link to="/admin" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold text-slate-600 hover:bg-slate-50">
            <ShieldCheck className="size-5" aria-hidden /> Super admin
          </Link>
        )}
      </nav>
      {org && (
        <Link to="/mais" className="m-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 hover:border-brand-200">
          <p className="truncate text-sm font-semibold">{org.name}</p>
          <p className="truncate text-xs text-slate-500">{account?.email}</p>
          {status && <p className={cn('mt-1.5 text-xs font-semibold', status.tone === 'danger' ? 'text-rose-600' : status.tone === 'warning' ? 'text-amber-600' : status.tone === 'success' ? 'text-emerald-600' : 'text-brand-700')}>{status.label}</p>}
        </Link>
      )}
    </aside>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  // A agenda usa duas colunas no notebook; as demais telas ficam numa coluna confortável de ler.
  const wide = pathname === '/'
  return (
    <div className="min-h-svh">
      <Sidebar />
      <div className="lg:pl-64">
        <TrialBanner />
        <main key={pathname} className={cn('tp-page mx-auto px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-32 lg:px-8 lg:pt-8 lg:pb-12', wide ? 'max-w-2xl lg:max-w-6xl' : 'max-w-2xl lg:max-w-3xl')}>
          <Outlet />
        </main>
      </div>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200/70 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_-12px_rgb(16_24_40/0.12)] lg:hidden">
        <ul className="mx-auto grid max-w-2xl grid-cols-5 px-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className="group flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-semibold">
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive ? 'bg-brand-50 text-brand-600' : 'text-slate-400 group-hover:text-slate-600')}>
                      <Icon className="size-[22px]" strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />
                    </span>
                    <span className={isActive ? 'text-brand-700' : 'text-slate-500'}>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
