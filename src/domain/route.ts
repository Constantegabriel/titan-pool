import type { GeoPoint } from './types'

const EARTH_KM = 6371
const rad = (deg: number) => (deg * Math.PI) / 180

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

/** Ruas não são linha reta: fator médio de desvio urbano. */
export const ROAD_FACTOR = 1.35
/** Tempo quando não há coordenadas para estimar. */
export const UNKNOWN_TRAVEL_MINUTES = 15

export function roadKm(a: GeoPoint | null, b: GeoPoint | null): number | null {
  return a && b ? haversineKm(a, b) * ROAD_FACTOR : null
}

export function travelMinutes(km: number | null, speedKmh: number): number {
  if (km === null) return UNKNOWN_TRAVEL_MINUTES
  // + 3 min fixos para estacionar e chegar ao portão.
  return Math.max(3, Math.round((km / Math.max(5, speedKmh)) * 60) + 3)
}

function pathLength(start: GeoPoint | null, points: GeoPoint[], order: number[]): number {
  let total = 0
  let prev = start
  for (const i of order) {
    if (prev) total += haversineKm(prev, points[i])
    prev = points[i]
  }
  return total
}

/**
 * Melhor ordem de visita (caminho aberto, a partir de `start`): vizinho mais próximo
 * seguido de 2-opt. Para as dezenas de paradas de um dia fica bem perto do ótimo e roda em milissegundos.
 */
export function optimizeOrder(start: GeoPoint | null, points: GeoPoint[]): number[] {
  const n = points.length
  if (n <= 1) return points.map((_, i) => i)

  const left = new Set(points.map((_, i) => i))
  const order: number[] = []
  let current: GeoPoint | null = start
  if (!current) {
    // Sem ponto de partida: começa pela parada mais periférica (extremo oeste).
    const first = [...left].sort((a, b) => points[a].lng - points[b].lng)[0]
    order.push(first)
    left.delete(first)
    current = points[first]
  }
  while (left.size) {
    let best = -1
    let bestDist = Infinity
    for (const i of left) {
      const d = haversineKm(current, points[i])
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    order.push(best)
    left.delete(best)
    current = points[best]
  }

  let improved = true
  let length = pathLength(start, points, order)
  while (improved) {
    improved = false
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)]
        const candidateLength = pathLength(start, points, candidate)
        if (candidateLength + 1e-9 < length) {
          order.splice(0, n, ...candidate)
          length = candidateLength
          improved = true
        }
      }
    }
  }
  return order
}

/** "08:30" → minutos desde 00:00. */
export function parseClock(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60

export type StopState = 'pending' | 'in_progress' | 'done' | 'skipped'

export interface StopInput {
  point: GeoPoint | null
  serviceMinutes: number
  state: StopState
  /** Minutos do dia em que a visita começou (check-in). */
  startedAt: number | null
  /** Minutos do dia em que terminou. */
  finishedAt: number | null
}

export interface StopPlan {
  /** Distância de rua estimada desde a parada anterior. */
  km: number | null
  travelMinutes: number
  arrival: number
  departure: number
  /** true quando o horário veio do registro real, não de previsão. */
  actual: boolean
}

export interface TimelineInput {
  base: GeoPoint | null
  dayStart: number
  speedKmh: number
  /** Agora, em minutos do dia — só para o dia corrente; null para outros dias. */
  now: number | null
  stops: StopInput[]
}

/**
 * Horários de chegada e saída de cada parada. Paradas concluídas usam os horários reais;
 * as seguintes são reprojetadas a partir de agora, então a previsão se corrige ao longo do dia.
 */
export function buildTimeline({ base, dayStart, speedKmh, now, stops }: TimelineInput): StopPlan[] {
  const plans: StopPlan[] = []
  let clock = dayStart
  let position = base

  for (const stop of stops) {
    const km = roadKm(position, stop.point)
    const travel = travelMinutes(km, speedKmh)

    if (stop.state === 'skipped') {
      plans.push({ km: null, travelMinutes: 0, arrival: clock, departure: clock, actual: true })
      continue
    }

    if (stop.state === 'done' || stop.state === 'in_progress') {
      const arrival = stop.startedAt ?? clock + travel
      const departure =
        stop.state === 'done'
          ? (stop.finishedAt ?? arrival + stop.serviceMinutes)
          : Math.max(arrival + stop.serviceMinutes, now ?? 0)
      plans.push({ km, travelMinutes: travel, arrival, departure, actual: stop.state === 'done' })
      clock = departure
    } else {
      // Se o dia já começou, a próxima saída não pode ser antes de agora.
      const leave = now !== null && now > clock ? now : clock
      const arrival = leave + travel
      const departure = arrival + stop.serviceMinutes
      plans.push({ km, travelMinutes: travel, arrival, departure, actual: false })
      clock = departure
    }
    if (stop.point) position = stop.point
  }
  return plans
}

/** Link de navegação até um ponto ou endereço. */
export function navigationUrl(target: GeoPoint | null, address: string, app: 'google' | 'waze' = 'google'): string {
  if (app === 'waze') {
    return target
      ? `https://waze.com/ul?ll=${target.lat},${target.lng}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
  }
  const destination = target ? `${target.lat},${target.lng}` : address
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`
}
