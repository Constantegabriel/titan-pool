import { CalendarCheck, Menu, ShoppingCart, Users, Wallet } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { repository } from '@/data'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/', label: 'Hoje', icon: CalendarCheck, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users, end: false },
  { to: '/compras', label: 'Compras', icon: ShoppingCart, end: false },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, end: false },
  { to: '/mais', label: 'Mais', icon: Menu, end: false },
]

export function Layout() {
  return (
    <div className="min-h-svh">
      {repository.mode === 'local' && (
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">Modo local: os dados ficam salvos só neste aparelho.</div>
      )}
      <main className="mx-auto max-w-2xl px-4 pt-5 pb-28">
        <Outlet />
      </main>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-cyan-700' : 'text-slate-500 hover:text-slate-800')}
              >
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-cyan-50')}>
                      <Icon className="size-[22px]" aria-hidden />
                    </span>
                    {label}
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
