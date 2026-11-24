import { X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

/**
 * Painel de ações: sobe de baixo no celular e abre como gaveta lateral no notebook.
 * `wide` dá mais espaço para formulários maiores (ex.: gerenciar conta no admin).
 */
export function Sheet({ open, title, subtitle, onClose, children, wide }: {
  open: boolean; title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center md:items-stretch md:justify-end">
      <button type="button" aria-label="Fechar" className="tp-fade absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`tp-sheet relative flex max-h-[88svh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl outline-none md:h-full md:max-h-none md:rounded-none md:rounded-l-3xl ${wide ? 'md:max-w-xl' : 'md:max-w-md'}`}
      >
        <div className="px-4 pt-3 md:px-6 md:pt-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 md:hidden" aria-hidden />
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold md:text-xl">{title}</h2>
              {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X className="size-5" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:pb-6">{children}</div>
      </div>
    </div>
  )
}
