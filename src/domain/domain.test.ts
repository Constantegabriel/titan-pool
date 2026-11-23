import { describe, expect, it } from 'vitest'
import { chargeState, chargesToCreate, summarize } from './billing'
import { alkalinityDoseGrams, chlorineDoseGrams, classify, suggestCorrections } from './chemistry'
import { dueDateFor, shiftPeriod, weekdayOf } from './dates'
import { parseMoney, whatsappNumber } from './format'
import { agendaProgress, buildAgenda, routeUrl } from './schedule'
import type { Charge, Client, Pool, Visit } from './types'

const client = (over: Partial<Client> = {}): Client => ({
  id: 'c1', name: 'Ana Souza', phone: '(11) 98888-7777', address: 'Rua A, 10', neighborhood: 'Centro', notes: '',
  monthlyFeeCents: 25000, billingDay: 10, active: true, lat: null, lng: null, createdAt: '', ...over,
})
const pool = (over: Partial<Pool> = {}): Pool => ({
  id: 'p1', clientId: 'c1', name: 'Principal', volumeLiters: 30000, type: 'vinil', sanitizer: 'cloro',
  equipment: '', accessNotes: '', visitDays: [1, 4], routeOrder: 1, serviceMinutes: null, createdAt: '', ...over,
})
const visit = (over: Partial<Visit> = {}): Visit => ({
  id: 'v1', poolId: 'p1', clientId: 'c1', date: '2026-11-23', status: 'done', checkInAt: '', completedAt: null,
  readings: { ph: null, chlorine: null, alkalinity: null }, tasks: [], products: [], notes: '', photos: [], ...over,
})

describe('química', () => {
  it('classifica leituras pela faixa ideal', () => {
    expect(classify('ph', 7.4)).toBe('ok')
    expect(classify('ph', 6.9)).toBe('low')
    expect(classify('chlorine', 5)).toBe('high')
    expect(classify('alkalinity', null)).toBe('unknown')
  })
  it('calcula doses de cloro e bicarbonato', () => {
    // 30.000 L, de 0,5 para 2 ppm = 45 g ativo / 0,65 ≈ 69 g → arredondado a 70 g
    expect(chlorineDoseGrams(30000, 0.5)).toBe(70)
    expect(chlorineDoseGrams(30000, 2.5)).toBe(0)
    // 30.000 L, de 60 para 100 ppm = 40 × 1,7 × 30 = 2.040 g
    expect(alkalinityDoseGrams(30000, 60)).toBe(2040)
  })
  it('sugere corrigir a alcalinidade antes do pH', () => {
    const s = suggestCorrections({ ph: 6.8, chlorine: 2, alkalinity: 50 }, 30000)
    expect(s.map((x) => x.key)).toEqual(['alkalinity', 'ph'])
    expect(s[1].message).toContain('alcalinidade primeiro')
  })
})

describe('datas', () => {
  it('limita o vencimento ao fim do mês', () => {
    expect(dueDateFor('2026-02', 31)).toBe('2026-02-28')
    expect(dueDateFor('2026-11', 5)).toBe('2026-11-05')
  })
  it('desloca competências entre anos', () => {
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01')
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12')
  })
  it('calcula o dia da semana em horário local', () => {
    expect(weekdayOf('2026-11-23')).toBe(1)
  })
})

describe('agenda', () => {
  it('inclui piscinas do dia e visitas avulsas, ordenadas pela rota', () => {
    const clients = [client(), client({ id: 'c2', name: 'Bruno' }), client({ id: 'c3', name: 'Inativo', active: false })]
    const pools = [
      pool({ id: 'p1', routeOrder: 2 }),
      pool({ id: 'p2', clientId: 'c2', routeOrder: 1 }),
      pool({ id: 'p3', clientId: 'c3' }),
      pool({ id: 'p4', clientId: 'c2', visitDays: [3], routeOrder: 3 }),
    ]
    const visits = [visit({ id: 'v4', poolId: 'p4', clientId: 'c2', status: 'in_progress' })]
    const agenda = buildAgenda('2026-11-23', clients, pools, visits)
    expect(agenda.map((a) => a.pool.id)).toEqual(['p2', 'p1', 'p4'])
    expect(agenda[2].extra).toBe(true)
    expect(agendaProgress(agenda)).toEqual({ total: 3, done: 0, skipped: 0, remaining: 3 })
  })
  it('gera rota só com paradas pendentes', () => {
    const agenda = buildAgenda('2026-11-23', [client()], [pool()], [visit()])
    expect(routeUrl(agenda)).toBeNull()
    const url = routeUrl(buildAgenda('2026-11-23', [client()], [pool()], []))
    expect(url).toContain('destination=Rua+A%2C+10%2C+Centro')
  })
})

describe('cobrança', () => {
  it('gera cobranças sem duplicar', () => {
    const clients = [client(), client({ id: 'c2', monthlyFeeCents: 0 }), client({ id: 'c3', billingDay: 31 })]
    const existing: Charge[] = [{ id: 'x', clientId: 'c1', period: '2026-11', amountCents: 1, dueDate: '2026-11-10', status: 'pending', paidAt: null, createdAt: '' }]
    const drafts = chargesToCreate('2026-11', clients, existing)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ clientId: 'c3', dueDate: '2026-11-30', amountCents: 25000 })
  })
  it('resume recebido, em aberto e atrasado', () => {
    const base = { clientId: 'c1', period: '2026-11', paidAt: null, createdAt: '' }
    const charges: Charge[] = [
      { ...base, id: 'a', amountCents: 100, dueDate: '2026-11-10', status: 'paid' },
      { ...base, id: 'b', amountCents: 200, dueDate: '2026-11-10', status: 'pending' },
      { ...base, id: 'c', amountCents: 300, dueDate: '2026-11-30', status: 'pending' },
    ]
    expect(chargeState(charges[1], '2026-11-23')).toBe('overdue')
    expect(summarize(charges, '2026-11-23')).toEqual({ expectedCents: 600, receivedCents: 100, overdueCents: 200, openCents: 300 })
  })
})

describe('formatação', () => {
  it('interpreta valores em reais', () => {
    expect(parseMoney('250')).toBe(25000)
    expect(parseMoney('1.234,56')).toBe(123456)
    expect(parseMoney('R$ 99,9')).toBe(9990)
  })
  it('normaliza números de WhatsApp', () => {
    expect(whatsappNumber('(11) 98888-7777')).toBe('5511988887777')
    expect(whatsappNumber('+55 11 98888-7777')).toBe('5511988887777')
  })
})
