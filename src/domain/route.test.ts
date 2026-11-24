import { describe, expect, it } from 'vitest'
import { clientMargins, monthResult, purchaseTotalCents } from './finance'
import { purchaseMessage } from './messages'
import { buildTimeline, formatClock, haversineKm, optimizeOrder, parseClock, travelMinutes } from './route'
import type { Charge, Client, Transaction } from './types'

// Pontos em linha, ~1,1 km entre cada um (0,01° de latitude).
const P = (i: number) => ({ lat: -23.5 + i * 0.01, lng: -46.6 })

describe('roteiro', () => {
  it('mede distâncias em km', () => {
    expect(haversineKm(P(0), P(1))).toBeCloseTo(1.11, 1)
  })
  it('ordena paradas pela menor distância a partir da base', () => {
    const points = [P(3), P(1), P(4), P(2)]
    expect(optimizeOrder(P(0), points)).toEqual([1, 3, 0, 2])
  })
  it('desfaz cruzamentos com 2-opt', () => {
    // Quadrado: base no canto, sem 2-opt o vizinho mais próximo pode cruzar.
    const sq = [{ lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }, { lat: 0, lng: 0.1 }]
    const order = optimizeOrder({ lat: 0, lng: 0 }, sq)
    expect(order[0]).toBe(3)
    expect(order).toHaveLength(4)
  })
  it('estima tempo de deslocamento', () => {
    expect(travelMinutes(10, 30)).toBe(23)
    expect(travelMinutes(null, 30)).toBe(15)
  })
  it('converte horários', () => {
    expect(parseClock('08:30')).toBe(510)
    expect(formatClock(510)).toBe('08:30')
    expect(formatClock(1445)).toBe('00:05')
  })
  it('projeta chegadas e reprojeta a partir de agora', () => {
    const base = { base: P(0), dayStart: 480, speedKmh: 30 }
    const stops = [
      { point: P(1), serviceMinutes: 40, state: 'pending' as const, startedAt: null, finishedAt: null },
      { point: P(2), serviceMinutes: 40, state: 'pending' as const, startedAt: null, finishedAt: null },
    ]
    const plan = buildTimeline({ ...base, now: null, stops })
    expect(plan[0].arrival).toBe(480 + plan[0].travelMinutes)
    expect(plan[1].arrival).toBe(plan[0].departure + plan[1].travelMinutes)

    // Primeira concluída às 09:30; agora são 10:00 → a segunda sai de agora.
    const later = buildTimeline({
      ...base,
      now: 600,
      stops: [{ ...stops[0], state: 'done', startedAt: 500, finishedAt: 570 }, stops[1]],
    })
    expect(later[0]).toMatchObject({ arrival: 500, departure: 570, actual: true })
    expect(later[1].arrival).toBe(600 + later[1].travelMinutes)
  })
  it('ignora paradas puladas', () => {
    const plan = buildTimeline({
      base: null, dayStart: 480, speedKmh: 30, now: null,
      stops: [
        { point: null, serviceMinutes: 30, state: 'skipped', startedAt: null, finishedAt: null },
        { point: null, serviceMinutes: 30, state: 'pending', startedAt: null, finishedAt: null },
      ],
    })
    expect(plan[1].arrival).toBe(480 + 15)
  })
})

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't', kind: 'expense', category: 'Produtos', description: '', amountCents: 0, date: '2026-11-10',
  clientId: null, purchaseId: null, paid: true, createdAt: '', ...over,
})

describe('financeiro', () => {
  it('soma o pedido só quando todos os itens têm preço', () => {
    expect(purchaseTotalCents({ lines: [{ name: 'Cloro', quantity: 2, unit: 'kg', note: '', unitPriceCents: 3500 }] })).toBe(7000)
    expect(purchaseTotalCents({ lines: [{ name: 'Cloro', quantity: 2, unit: 'kg', note: '', unitPriceCents: null }] })).toBeNull()
  })
  it('calcula o resultado do mês', () => {
    const base = { clientId: 'c1', period: '2026-11', dueDate: '2026-11-10', paidAt: null, createdAt: '' }
    const charges: Charge[] = [
      { ...base, id: 'a', amountCents: 30000, status: 'paid' },
      { ...base, id: 'b', amountCents: 20000, status: 'pending' },
    ]
    const r = monthResult(charges, [
      tx({ amountCents: 8000 }),
      tx({ amountCents: 2000, category: 'Combustível' }),
      tx({ kind: 'income', amountCents: 5000, category: 'Serviço avulso' }),
      tx({ amountCents: 99999, paid: false }),
    ])
    expect(r).toMatchObject({ feesReceivedCents: 30000, feesPendingCents: 20000, otherIncomeCents: 5000, expensesCents: 10000, profitCents: 25000 })
    expect(r.expensesByCategory[0]).toEqual({ category: 'Produtos', cents: 8000 })
  })
  it('mostra a margem por cliente, piores primeiro', () => {
    const c = (id: string) => ({ id, name: id }) as Client
    const charges = [{ id: 'x', clientId: 'a', period: '2026-11', amountCents: 25000, dueDate: '', status: 'pending', paidAt: null, createdAt: '' }] as Charge[]
    const m = clientMargins('2026-11', [c('a'), c('b')], charges, [tx({ clientId: 'b', amountCents: 4000 }), tx({ clientId: 'a', amountCents: 5000 })])
    expect(m.map((x) => [x.client.id, x.marginCents])).toEqual([['b', -4000], ['a', 20000]])
  })
  it('monta a mensagem do pedido para o fornecedor', () => {
    const msg = purchaseMessage(
      { number: 7, notes: 'Entregar até sexta', lines: [{ name: 'Cloro granulado', quantity: 10, unit: 'kg', note: '', unitPriceCents: null }, { name: 'Margarida', quantity: 1, unit: 'un', note: 'cabo 3 m', unitPriceCents: null }] },
      { supplierName: 'Pedro Silva', clientName: 'Mariana Alves' },
    )
    expect(msg).toContain('Olá, Pedro!')
    expect(msg).toContain('#0007')
    expect(msg).toContain('2. Margarida — 1 un (cabo 3 m)')
    expect(msg).toContain('Para o cliente: Mariana Alves')
  })
})

import { arrangeByProgress, reassignRouteOrder } from './schedule'
import type { AgendaItem } from './schedule'
import type { Pool } from './types'

describe('ordem do dia', () => {
  const item = (id: string, status?: 'done' | 'in_progress' | 'skipped', checkInAt = '') =>
    ({ pool: { id }, client: {}, visit: status ? { status, checkInAt } : null, extra: false }) as unknown as AgendaItem
  it('coloca feitas e em andamento antes das pendentes, e puladas no fim', () => {
    const out = arrangeByProgress([item('a'), item('b', 'skipped'), item('c', 'done', '2026-11-24T10:00'), item('d', 'in_progress', '2026-11-24T11:00'), item('e', 'done', '2026-11-24T08:00')])
    expect(out.map((i) => i.pool.id)).toEqual(['e', 'c', 'd', 'a', 'b'])
  })
  it('reaproveita os números de rota existentes', () => {
    const pools = [{ id: 'a', routeOrder: 2 }, { id: 'b', routeOrder: 5 }, { id: 'c', routeOrder: 9 }] as Pool[]
    const changed = reassignRouteOrder(pools, ['c', 'a', 'b'])
    expect(changed.map((p) => [p.id, p.routeOrder])).toEqual([['c', 2], ['a', 5], ['b', 9]])
  })
})

import { mergeByTime } from './route'

describe('visitas com horário', () => {
  it('encaixa cada horário marcado na posição certa do dia', () => {
    const untimed = [{ item: 'a', arrival: 490 }, { item: 'b', arrival: 545 }, { item: 'c', arrival: 600 }]
    expect(mergeByTime(untimed, [{ item: 'T15', time: 930 }, { item: 'T9', time: 540 }])).toEqual(['a', 'T9', 'b', 'c', 'T15'])
  })
})

describe('localização atual', () => {
  it('calcula a ida para a próxima parada a partir de onde a pessoa está', () => {
    const stop = { point: P(5), serviceMinutes: 30, state: 'pending' as const, startedAt: null, finishedAt: null }
    const fromBase = buildTimeline({ base: P(0), dayStart: 480, speedKmh: 30, now: 600, stops: [stop] })
    const fromHere = buildTimeline({ base: P(0), dayStart: 480, speedKmh: 30, now: 600, stops: [stop], current: P(4) })
    expect(fromHere[0].km!).toBeLessThan(fromBase[0].km!)
    expect(fromHere[0].arrival).toBe(600 + fromHere[0].travelMinutes)
  })
  it('ignora a localização em outros dias', () => {
    const stop = { point: P(5), serviceMinutes: 30, state: 'pending' as const, startedAt: null, finishedAt: null }
    const a = buildTimeline({ base: P(0), dayStart: 480, speedKmh: 30, now: null, stops: [stop], current: P(4) })
    const b = buildTimeline({ base: P(0), dayStart: 480, speedKmh: 30, now: null, stops: [stop] })
    expect(a).toEqual(b)
  })
})
