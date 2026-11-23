import { weekdayOf } from './dates'
import type { Client, IsoDate, Pool, Visit } from './types'

export interface AgendaItem {
  pool: Pool
  client: Client
  visit: Visit | null
  /** true quando a visita foi registrada num dia fora da agenda fixa (visita avulsa). */
  extra: boolean
}

/**
 * Monta o roteiro do dia: piscinas com visita fixa naquele dia da semana (de clientes ativos)
 * mais visitas avulsas já registradas na data. Ordenado pela ordem de rota.
 */
export function buildAgenda(date: IsoDate, clients: Client[], pools: Pool[], visits: Visit[]): AgendaItem[] {
  const weekday = weekdayOf(date)
  const clientById = new Map(clients.map((c) => [c.id, c]))
  const visitByPool = new Map(visits.filter((v) => v.date === date).map((v) => [v.poolId, v]))
  const items: AgendaItem[] = []

  for (const pool of pools) {
    const client = clientById.get(pool.clientId)
    if (!client) continue
    const visit = visitByPool.get(pool.id) ?? null
    const scheduled = client.active && pool.visitDays.includes(weekday)
    if (scheduled || visit) items.push({ pool, client, visit, extra: !scheduled })
  }

  return items.sort((a, b) => a.pool.routeOrder - b.pool.routeOrder || a.client.name.localeCompare(b.client.name, 'pt-BR'))
}

export interface AgendaProgress {
  total: number
  done: number
  skipped: number
  remaining: number
}

export function agendaProgress(items: AgendaItem[]): AgendaProgress {
  const done = items.filter((i) => i.visit?.status === 'done').length
  const skipped = items.filter((i) => i.visit?.status === 'skipped').length
  return { total: items.length, done, skipped, remaining: items.length - done - skipped }
}

/** Link do Google Maps com o roteiro (origem = localização atual do aparelho). */
export function routeUrl(items: AgendaItem[]): string | null {
  const stops = items
    .filter((i) => i.visit?.status !== 'done' && i.visit?.status !== 'skipped')
    .map((i) => [i.client.address, i.client.neighborhood].filter(Boolean).join(', '))
    .filter(Boolean)
  if (stops.length === 0) return null
  const destination = stops[stops.length - 1]
  const waypoints = stops.slice(0, -1).slice(0, 9)
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'driving' })
  if (waypoints.length) params.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
