import { CalendarDays, Menu, ShoppingBag, Users, Wallet } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { trialDaysLeft } from '@/domain/account'
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

export function Layout() {
  return (
    <div className="min-h-svh">
      <TrialBanner />
      <main className="mx-auto max-w-2xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-32">
        <Outlet />
      </main>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200/70 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_-12px_rgb(16_24_40/0.12)]">
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
