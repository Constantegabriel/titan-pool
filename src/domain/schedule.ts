import { occursOn } from './recurrence'
import type { Client, IsoDate, Pool, Visit } from './types'

export interface AgendaItem {
  /** Chave estável: id da visita, ou `plan:<piscina>` para ocorrência da agenda fixa ainda não registrada. */
  key: string
  pool: Pool
  client: Client
  /** Registro da visita, se já existe (agendada, em andamento, feita, pulada). */
  visit: Visit | null
  /** Data original na agenda fixa; null para visita avulsa. */
  plannedDate: IsoDate | null
  /** Horário marcado, se houver. */
  time: string | null
  /** Visita avulsa (fora da agenda fixa). */
  extra: boolean
  /** Veio de outro dia (remarcada). */
  moved: boolean
}

const ACTIVE = (v: Visit) => v.status !== 'canceled'

/**
 * Visitas de um dia: as registradas para a data (agendadas, avulsas, remarcadas para cá)
 * mais as da agenda fixa (semanal, quinzenal, mensal) de clientes ativos que ainda não têm
 * registro. Uma ocorrência remarcada ou desmarcada some da data original.
 */
export function buildAgenda(date: IsoDate, clients: Client[], pools: Pool[], visits: Visit[]): AgendaItem[] {
  const clientById = new Map(clients.map((c) => [c.id, c]))
  const poolById = new Map(pools.map((p) => [p.id, p]))
  const items: AgendaItem[] = []
  const handled = new Set<string>()

  for (const v of visits) {
    if (v.plannedDate === date || v.date === date) handled.add(v.poolId)
    if (v.date !== date || !ACTIVE(v)) continue
    const pool = poolById.get(v.poolId)
    const client = pool && clientById.get(pool.clientId)
    if (!pool || !client) continue
    items.push({
      key: v.id, pool, client, visit: v, plannedDate: v.plannedDate, time: v.time,
      extra: v.plannedDate === null, moved: v.plannedDate !== null && v.plannedDate !== date,
    })
  }

  for (const pool of pools) {
    if (handled.has(pool.id)) continue
    const client = clientById.get(pool.clientId)
    if (!client?.active || !occursOn(pool, date)) continue
    items.push({ key: `plan:${pool.id}`, pool, client, visit: null, plannedDate: date, time: pool.preferredTime, extra: false, moved: false })
  }

  return items.sort(
    (a, b) => a.pool.routeOrder - b.pool.routeOrder || a.client.name.localeCompare(b.client.name, 'pt-BR'),
  )
}

/** Ainda por fazer: sem registro ou só agendada. */
export const isPending = (item: AgendaItem) => !item.visit || item.visit.status === 'scheduled'

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
    .filter(isPending)
    .map((i) =>
      i.client.lat !== null && i.client.lng !== null
        ? `${i.client.lat},${i.client.lng}`
        : [i.client.address, i.client.neighborhood].filter(Boolean).join(', '),
    )
    .filter(Boolean)
  if (stops.length === 0) return null
  const destination = stops[stops.length - 1]
  const waypoints = stops.slice(0, -1).slice(0, 9)
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'driving' })
  if (waypoints.length) params.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/**
 * Ordem real do dia: primeiro o que já foi feito (pela hora de chegada), depois a visita em
 * andamento, e então as pendentes na ordem da rota. É a ordem em que o piscineiro de fato chega.
 */
export function arrangeByProgress(items: AgendaItem[]): AgendaItem[] {
  const rank = (i: AgendaItem) => (i.visit?.status === 'done' ? 0 : 1)
  const started = items
    .filter((i) => i.visit?.status === 'done' || i.visit?.status === 'in_progress')
    .sort((a, b) => rank(a) - rank(b) || (a.visit!.checkInAt ?? '').localeCompare(b.visit!.checkInAt ?? ''))
  const pending = items.filter(isPending)
  const skipped = items.filter((i) => i.visit?.status === 'skipped')
  return [...started, ...pending, ...skipped]
}

/**
 * Novos valores de routeOrder para que `orderedPoolIds` fique nessa sequência, reaproveitando
 * os números que essas piscinas já tinham — assim a ordem dos outros dias quase não muda.
 */
export function reassignRouteOrder(pools: Pool[], orderedPoolIds: string[]): Pool[] {
  const byId = new Map(pools.map((p) => [p.id, p]))
  const targets = orderedPoolIds.map((id) => byId.get(id)).filter((p): p is Pool => Boolean(p))
  let values = targets.map((p) => p.routeOrder).sort((a, b) => a - b)
  if (new Set(values).size !== values.length) {
    const start = values[0] ?? 1
    values = targets.map((_, i) => start + i)
  }
  return targets.map((p, i) => ({ ...p, routeOrder: values[i] })).filter((p, i) => p.routeOrder !== targets[i].routeOrder)
}
