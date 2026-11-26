import { useEffect, useMemo, useState } from 'react'
import { type Leg, type LegFn, estimatedLeg } from '@/domain/route'
import type { GeoPoint } from '@/domain/types'

/*
 * Rotas de carro de verdade (pelas ruas e estradas), via OSRM com dados do OpenStreetMap.
 * - Matriz de distâncias/tempos entre todos os pontos do dia numa única chamada;
 * - guarda em cache no aparelho (os clientes não mudam de lugar);
 * - sem internet ou com o serviço fora, volta para a estimativa em linha reta.
 */

const OSRM = 'https://router.project-osrm.org'
/** O OSRM calcula sem trânsito: folga para semáforos e trânsito urbano. */
const TRAFFIC = 1.2
/** Minutos fixos para estacionar e chegar ao portão. */
const PARKING = 3
const CACHE_KEY = 'tp-road-legs-v1'
const MAX_CACHE = 4000

type Pair = [km: number, minutes: number]
const keyOf = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`

const cache: Map<string, Pair> = (() => {
  try {
    return new Map(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as Array<[string, Pair]>)
  } catch {
    return new Map()
  }
})()

function persist() {
  try {
    const entries = [...cache.entries()].slice(-MAX_CACHE)
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
  } catch {
    /* sem armazenamento: segue só em memória */
  }
}

const pairKey = (a: GeoPoint, b: GeoPoint) => `${keyOf(a)}>${keyOf(b)}`

/** Trecho pelas ruas se já calculado; senão null. */
export function cachedLeg(a: GeoPoint, b: GeoPoint): Leg | null {
  if (keyOf(a) === keyOf(b)) return { km: 0, minutes: PARKING }
  const hit = cache.get(pairKey(a, b))
  return hit ? { km: hit[0], minutes: hit[1] } : null
}

/** Busca no OSRM os trechos que faltam entre os pontos. */
export async function loadLegs(points: GeoPoint[], signal?: AbortSignal): Promise<boolean> {
  const unique = [...new Map(points.map((p) => [keyOf(p), p])).values()]
  if (unique.length < 2) return true
  const missing = unique.some((a) => unique.some((b) => a !== b && !cache.has(pairKey(a, b))))
  if (!missing) return true
  // O servidor público aceita até 100 pontos por matriz.
  const list = unique.slice(0, 100)
  const coords = list.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
  const res = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=duration,distance`, { signal })
  if (!res.ok) return false
  const data = (await res.json()) as { code: string; durations?: (number | null)[][]; distances?: (number | null)[][] }
  if (data.code !== 'Ok' || !data.durations || !data.distances) return false
  list.forEach((a, i) => list.forEach((b, j) => {
    const sec = data.durations![i][j]
    const m = data.distances![i][j]
    if (i !== j && sec !== null && m !== null) cache.set(pairKey(a, b), [m / 1000, (sec / 60) * TRAFFIC + PARKING])
  }))
  persist()
  return true
}

const geometryCache = new Map<string, Array<[number, number]>>()

/** Desenho do caminho pelas ruas, na ordem dada. */
export async function loadPath(points: GeoPoint[], signal?: AbortSignal): Promise<Array<[number, number]> | null> {
  if (points.length < 2) return null
  const coords = points.slice(0, 100).map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
  const hit = geometryCache.get(coords)
  if (hit) return hit
  const res = await fetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal })
  if (!res.ok) return null
  const data = (await res.json()) as { code: string; routes?: Array<{ geometry: { coordinates: Array<[number, number]> } }> }
  const line = data.code === 'Ok' ? data.routes?.[0]?.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) : null
  if (line) geometryCache.set(coords, line)
  return line ?? null
}

export type RoadStatus = 'loading' | 'road' | 'estimate'

/**
 * Trechos de carro entre os pontos do dia. Enquanto carrega (ou sem internet) usa a estimativa;
 * quando chegam as rotas reais, a agenda recalcula sozinha.
 */
export function useRoadLegs(points: GeoPoint[], speedKmh: number): { leg: LegFn; status: RoadStatus } {
  const signature = [...new Set(points.map(keyOf))].sort().join(';')
  const [state, setState] = useState<{ sig: string; status: RoadStatus }>({ sig: '', status: 'loading' })

  useEffect(() => {
    const list = signature ? signature.split(';').map((k) => { const [lat, lng] = k.split(',').map(Number); return { lat, lng } }) : []
    const ctrl = new AbortController()
    // Espera um instante: o GPS pode mudar várias vezes seguidas.
    const timer = setTimeout(() => {
      loadLegs(list, ctrl.signal)
        .then((ok) => setState({ sig: signature, status: ok ? 'road' : 'estimate' }))
        .catch(() => { if (!ctrl.signal.aborted) setState({ sig: signature, status: 'estimate' }) })
    }, 300)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [signature])

  const status: RoadStatus = state.sig === signature ? state.status : 'loading'
  const leg = useMemo<LegFn>(() => {
    const estimate = estimatedLeg(speedKmh)
    return (a, b) => (a && b ? (cachedLeg(a, b) ?? estimate(a, b)) : estimate(a, b))
    // status muda quando o cache recebe as rotas: recria a função para recalcular a agenda.
  }, [speedKmh, status, signature]) // oxlint-disable-line react-hooks/exhaustive-deps
  return { leg, status }
}

/** Caminho pelas ruas para desenhar no mapa (null enquanto não há). */
export function useRoadPath(points: GeoPoint[]): Array<[number, number]> | null {
  const signature = points.map(keyOf).join(';')
  const [path, setPath] = useState<{ sig: string; line: Array<[number, number]> | null }>({ sig: '', line: null })
  useEffect(() => {
    if (!signature) return
    const list = signature.split(';').map((k) => { const [lat, lng] = k.split(',').map(Number); return { lat, lng } })
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      loadPath(list, ctrl.signal).then((line) => setPath({ sig: signature, line })).catch(() => {})
    }, 300)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [signature])
  return path.sig === signature ? path.line : null
}
