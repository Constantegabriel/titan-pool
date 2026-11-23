import { Check, Crosshair, MapPin, Search } from 'lucide-react'
import { useState } from 'react'
import type { GeoPoint } from '@/domain/types'
import { currentPosition, geocodeAddress, type GeocodeResult } from '@/lib/geo'
import { Button } from './ui'

/**
 * Define as coordenadas de um local: pelo GPS (ideal quando o piscineiro está no cliente)
 * ou buscando o endereço digitado.
 */
export function LocationPicker({ value, address, onChange }: { value: GeoPoint | null; address: string; onChange: (p: GeoPoint | null) => void }) {
  const [busy, setBusy] = useState<'gps' | 'search' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GeocodeResult[] | null>(null)

  async function useGps() {
    setBusy('gps')
    setError(null)
    setResults(null)
    try {
      onChange(await currentPosition())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function search() {
    if (!address.trim()) return setError('Preencha o endereço primeiro.')
    setBusy('search')
    setError(null)
    try {
      const found = await geocodeAddress(address)
      if (!found.length) setError('Endereço não encontrado. Tente incluir número e cidade, ou use o GPS no local.')
      else if (found.length === 1) onChange(found[0])
      else setResults(found)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">Localização no mapa</p>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <Check className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Definida ({value.lat.toFixed(5)}, {value.lng.toFixed(5)})</span>
          <button type="button" className="font-medium underline" onClick={() => onChange(null)}>Remover</button>
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          Sem localização: o roteiro usa uma estimativa de 15 min até este cliente.
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={useGps} loading={busy === 'gps'} disabled={busy !== null}>
          <Crosshair className="size-4" aria-hidden /> Estou no local
        </Button>
        <Button variant="secondary" size="sm" onClick={search} loading={busy === 'search'} disabled={busy !== null}>
          <Search className="size-4" aria-hidden /> Buscar endereço
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      {results && (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50" onClick={() => { onChange(r); setResults(null) }}>
                <MapPin className="mt-0.5 size-4 shrink-0 text-cyan-700" aria-hidden /> {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
