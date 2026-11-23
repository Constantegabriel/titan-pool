import { describe, expect, it } from 'vitest'
import { describeRecurrence, nextOccurrence, occursOn } from './recurrence'
import { buildAgenda } from './schedule'
import type { Client, Pool, Visit } from './types'

const rule = (over: Partial<Pool>) => ({ recurrence: 'weekly', visitDays: [], monthDays: [], anchorDate: null, ...over }) as Pool

describe('recorrência', () => {
  it('semanal', () => {
    const r = rule({ visitDays: [1, 4] })
    expect(occursOn(r, '2026-11-23')).toBe(true) // segunda
    expect(occursOn(r, '2026-11-24')).toBe(false)
    expect(occursOn(r, '2026-11-26')).toBe(true) // quinta
  })
  it('quinzenal a partir da semana de referência', () => {
    const r = rule({ recurrence: 'biweekly', visitDays: [2], anchorDate: '2026-11-24' })
    expect(occursOn(r, '2026-11-24')).toBe(true)
    expect(occursOn(r, '2026-12-01')).toBe(false)
    expect(occursOn(r, '2026-12-08')).toBe(true)
    expect(occursOn(r, '2026-11-10')).toBe(true)
  })
  it('mensal, com dia 31 caindo no último dia de meses curtos', () => {
    const r = rule({ recurrence: 'monthly', monthDays: [5, 31] })
    expect(occursOn(r, '2026-11-05')).toBe(true)
    expect(occursOn(r, '2026-11-30')).toBe(true)
    expect(occursOn(r, '2026-12-30')).toBe(false)
    expect(occursOn(r, '2026-12-31')).toBe(true)
    expect(occursOn(r, '2027-02-28')).toBe(true)
  })
  it('sem recorrência nunca ocorre', () => {
    expect(occursOn(rule({ recurrence: 'none', visitDays: [1] }), '2026-11-23')).toBe(false)
  })
  it('acha a próxima ocorrência', () => {
    expect(nextOccurrence(rule({ recurrence: 'monthly', monthDays: [10] }), '2026-11-23')).toBe('2026-12-10')
  })
  it('descreve em português', () => {
    expect(describeRecurrence(rule({ visitDays: [1, 4] }), '08:30')).toBe('Toda semana: seg e qui às 08:30')
    expect(describeRecurrence(rule({ visitDays: [3] }))).toBe('Toda quarta-feira')
    expect(describeRecurrence(rule({ visitDays: [6] }))).toBe('Todo sábado')
    expect(describeRecurrence(rule({ recurrence: 'monthly', monthDays: [20, 5] }))).toBe('Todo mês: dias 5 e 20')
    expect(describeRecurrence(rule({ recurrence: 'biweekly', visitDays: [2] }))).toBe('A cada 2 semanas: ter')
  })
})

describe('agenda com visitas agendadas', () => {
  const client = { id: 'c', name: 'Ana', active: true } as Client
  const pool = { ...rule({ visitDays: [1] }), id: 'p', clientId: 'c', routeOrder: 1, preferredTime: '09:00' } as Pool
  const v = (over: Partial<Visit>) => ({ id: 'v', poolId: 'p', clientId: 'c', status: 'scheduled', time: null, checkInAt: null, ...over }) as Visit

  it('mostra a ocorrência da agenda fixa com o horário combinado', () => {
    const [item] = buildAgenda('2026-11-23', [client], [pool], [])
    expect(item).toMatchObject({ key: 'plan:p', visit: null, time: '09:00', plannedDate: '2026-11-23' })
  })
  it('remarcada: some do dia original e aparece no novo dia', () => {
    const moved = v({ date: '2026-11-25', plannedDate: '2026-11-23', time: '14:00' })
    expect(buildAgenda('2026-11-23', [client], [pool], [moved])).toHaveLength(0)
    expect(buildAgenda('2026-11-25', [client], [pool], [moved])[0]).toMatchObject({ moved: true, time: '14:00' })
  })
  it('desmarcada não aparece', () => {
    expect(buildAgenda('2026-11-23', [client], [pool], [v({ date: '2026-11-23', plannedDate: '2026-11-23', status: 'canceled' })])).toHaveLength(0)
  })
  it('visita avulsa agendada aparece como avulsa', () => {
    const [item] = buildAgenda('2026-11-24', [client], [pool], [v({ date: '2026-11-24', plannedDate: null })])
    expect(item).toMatchObject({ extra: true, key: 'v' })
  })
  it('não duplica registro antigo sem data planejada', () => {
    expect(buildAgenda('2026-11-23', [client], [pool], [v({ date: '2026-11-23', plannedDate: null, status: 'done' })])).toHaveLength(1)
  })
})
