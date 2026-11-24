import { Search, X } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import type { Client } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Avatar, Input } from './ui'

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * Escolher cliente buscando com a lupa: nome, bairro ou telefone.
 * Mostra a lista ao focar, filtra enquanto digita e aceita setas + Enter.
 */
export function ClientPicker({ clients, value, onChange, poolCount, label = 'Cliente' }: {
  clients: Client[]
  value: string
  onChange: (id: string) => void
  poolCount?: (id: string) => number
  label?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const selected = clients.find((c) => c.id === value)

  const results = useMemo(() => {
    const q = normalize(query.trim())
    const digits = query.replace(/\D/g, '')
    return clients
      .filter((c) => !q || normalize(`${c.name} ${c.neighborhood} ${c.address}`).includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 50)
  }, [clients, query])

  function choose(c: Client) {
    onChange(c.id)
    setQuery('')
    setOpen(false)
  }

  if (selected && !open) {
    return (
      <div>
        <p className="mb-1.5 block text-[13px] font-medium text-slate-600">{label}</p>
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 px-3 py-2.5">
          <Avatar name={selected.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{selected.name}</p>
            <p className="truncate text-xs text-slate-500">{selected.neighborhood || selected.address || 'Sem endereço'}</p>
          </div>
          <button type="button" onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-100">Trocar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-slate-600">{label}</span>
        <div className="relative">
          <Search className="pointer-events-none absolute top-3 left-3.5 size-5 text-slate-400" aria-hidden />
          <Input
            ref={inputRef}
            className="pr-10 pl-11"
            placeholder="Buscar por nome, bairro ou telefone"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
              else if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); choose(results[active]) }
              else if (e.key === 'Escape') setOpen(false)
            }}
          />
          {query && (
            <button type="button" aria-label="Limpar busca" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery('')} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600">
              <X className="size-4" />
            </button>
          )}
        </div>
      </label>
      {open && (
        <ul id={listId} role="listbox" className="tp-fade absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-slate-500">Nenhum cliente encontrado.</li>
          ) : results.map((c, i) => {
            const pools = poolCount?.(c.id)
            return (
              <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c)}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                  <Avatar name={c.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}{!c.active && <span className="ml-1.5 text-xs text-slate-400">(inativo)</span>}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[c.neighborhood, pools === 0 ? 'sem piscina cadastrada' : pools ? `${pools} piscina(s)` : null].filter(Boolean).join(' · ') || 'Sem endereço'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
