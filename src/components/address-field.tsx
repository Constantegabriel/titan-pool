import { Check, Crosshair, LoaderCircle, MapPin, MapPinOff, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { GeoPoint } from '@/domain/types'
import { cn } from '@/lib/cn'
import { type PlaceSuggestion, currentPosition, formatCep, lookupCep, onlyDigits, searchPlaces } from '@/lib/geo'
import { Button, Field, Input } from './ui'

export interface AddressValue {
  address: string
  area: string
  point: GeoPoint | null
}

/**
 * Endereço do jeito prático:
 * - CEP → preenche rua, bairro e cidade;
 * - digitando o endereço → aparecem sugestões (com localização no mapa);
 * - "Estou no local" → pega o GPS.
 * Quando falta só a localização, ela é buscada sozinha ao sair do campo.
 */
export function AddressField({ value, onChange, near, areaLabel = 'Bairro e cidade' }: {
  value: AddressValue
  onChange: (patch: Partial<AddressValue>) => void
  near?: GeoPoint | null
  areaLabel?: string
}) {
  const [cep, setCep] = useState('')
  const [cepState, setCepState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [cepError, setCepError] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(-1)
  const [locating, setLocating] = useState<'gps' | 'auto' | null>(null)
  const [gpsError, setGpsError] = useState('')
  const addressRef = useRef<HTMLInputElement>(null)
  const typed = useRef(false)
  const listId = useId()

  // Sugestões enquanto digita (espera a pessoa parar ~300 ms).
  useEffect(() => {
    const q = [value.address, value.area].filter(Boolean).join(', ').trim()
    if (!typed.current || value.address.trim().length < 4) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchPlaces(q, near, ctrl.signal))
        setActive(-1)
      } catch {
        if (!ctrl.signal.aborted) setResults([])
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [value.address, value.area, near])

  async function onCep(raw: string) {
    const masked = formatCep(raw)
    setCep(masked)
    setCepError('')
    if (onlyDigits(masked).length !== 8) return
    setCepState('loading')
    try {
      const r = await lookupCep(masked)
      typed.current = false
      onChange({ address: r.street ? `${r.street}, ` : value.address, area: r.area, point: null })
      setCepState('idle')
      // Leva o cursor para o número.
      requestAnimationFrame(() => {
        const el = addressRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        }
      })
    } catch (e) {
      setCepState('error')
      setCepError((e as Error).message)
    }
  }

  function pick(s: PlaceSuggestion) {
    typed.current = false
    setOpen(false)
    setResults([])
    onChange({ address: s.hasNumber ? s.address : `${s.address}, `, area: s.area || value.area, point: { lat: s.lat, lng: s.lng } })
    if (!s.hasNumber) requestAnimationFrame(() => addressRef.current?.focus())
  }

  /** Ao sair do campo sem localização: busca o endereço completo e usa o primeiro resultado. */
  async function autoLocate() {
    setTimeout(() => setOpen(false), 150)
    if (value.point || value.address.trim().length < 4) return
    setLocating('auto')
    try {
      const [first] = await searchPlaces([value.address, value.area].filter(Boolean).join(', '), near)
      if (first) onChange({ point: { lat: first.lat, lng: first.lng } })
    } catch {
      /* sem localização: o app usa estimativa */
    } finally {
      setLocating(null)
    }
  }

  async function useGps() {
    setLocating('gps')
    setGpsError('')
    try {
      onChange({ point: await currentPosition() })
    } catch (e) {
      setGpsError((e as Error).message)
    } finally {
      setLocating(null)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  const showList = open && (results.length > 0 || searching)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[8.5rem_1fr] items-end gap-3">
        <Field label="CEP">
          <div className="relative">
            <Input inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={cep} onChange={(e) => onCep(e.target.value)} aria-invalid={cepState === 'error'} />
            {cepState === 'loading' && <LoaderCircle className="absolute top-3 right-3 size-5 animate-spin text-brand-500" aria-hidden />}
          </div>
        </Field>
        <p className="pb-3 text-xs text-slate-500">{cepError ? <span className="text-rose-600">{cepError}</span> : 'Digite o CEP ou busque o endereço abaixo.'}</p>
      </div>

      <div className="relative">
        <Field label="Endereço (rua e número)">
          <div className="relative">
            <Search className="pointer-events-none absolute top-3 left-3.5 size-5 text-slate-400" aria-hidden />
            <Input
              ref={addressRef}
              className="pl-11"
              placeholder="Comece a digitar: Rua das Palmeiras, 120"
              autoComplete="off"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              value={value.address}
              onChange={(e) => {
                typed.current = true
                setOpen(true)
                onChange({ address: e.target.value, point: null })
              }}
              onFocus={() => results.length && setOpen(true)}
              onBlur={autoLocate}
              onKeyDown={onKeyDown}
            />
          </div>
        </Field>
        {showList && (
          <ul id={listId} role="listbox" className="tp-fade absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
            {searching && results.length === 0 && (
              <li className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" aria-hidden />Buscando endereços…</li>
            )}
            {results.map((r, i) => (
              <li key={`${r.address}-${r.area}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}
                  className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{r.address}</span>
                    <span className="block truncate text-[13px] text-slate-500">{r.area}</span>
                  </span>
                </button>
              </li>
            ))}
            <li className="px-3 pt-1 pb-0.5 text-right text-[10px] text-slate-400">© OpenStreetMap</li>
          </ul>
        )}
      </div>

      <Field label={areaLabel}>
        <Input placeholder="Ex.: Cambuí, Campinas - SP" value={value.area} onChange={(e) => { typed.current = true; onChange({ area: e.target.value, point: null }) }} onBlur={autoLocate} />
      </Field>

      <div className={cn('flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm', value.point ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-600')}>
        {locating ? <LoaderCircle className="size-5 shrink-0 animate-spin text-brand-500" aria-hidden />
          : value.point ? <Check className="size-5 shrink-0 text-emerald-600" aria-hidden />
          : <MapPinOff className="size-5 shrink-0 text-slate-400" aria-hidden />}
        <span className="min-w-0 flex-1">
          {locating ? 'Localizando no mapa…' : value.point ? 'Localização no mapa definida' : 'Sem localização no mapa: a rota usa estimativa'}
          {gpsError && <span className="block text-xs text-rose-600">{gpsError}</span>}
        </span>
        <Button variant="secondary" size="sm" onClick={useGps} disabled={locating !== null}><Crosshair className="size-4" aria-hidden /> Estou no local</Button>
      </div>
    </div>
  )
}
