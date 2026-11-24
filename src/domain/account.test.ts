import { describe, expect, it } from 'vitest'
import { type OrgInfo, accessGroup, accessLabel, trialDaysLeft } from './account'

const now = new Date('2026-11-24T10:00:00')
const org = (over: Partial<OrgInfo>): OrgInfo => ({
  id: 'o', name: 'X', owner_email: null, status: 'trialing', trial_ends_at: null, paid_until: null, notes: '', created_at: '', has_access: true, ...over,
})

describe('situação da conta', () => {
  it('conta os dias de teste', () => {
    expect(trialDaysLeft(org({ trial_ends_at: '2026-12-08T10:00:00' }), now)).toBe(13)
    expect(trialDaysLeft(org({ trial_ends_at: '2026-11-24T18:00:00' }), now)).toBe(0)
  })
  it('descreve teste, plano, cortesia e bloqueios', () => {
    expect(accessLabel(org({ trial_ends_at: '2026-12-08T10:00:00' }), now)).toEqual({ label: 'Teste grátis · 13 dias restantes', tone: 'info' })
    expect(accessLabel(org({ trial_ends_at: '2026-11-26T09:00:00' }), now).tone).toBe('warning')
    expect(accessLabel(org({ trial_ends_at: '2026-11-20T09:00:00', has_access: false }), now).label).toBe('Teste encerrado')
    expect(accessLabel(org({ status: 'active', paid_until: '2027-01-31' }), now).label).toBe('Plano ativo até 31/01/2027')
    expect(accessLabel(org({ status: 'active', paid_until: '2026-10-31', has_access: false }), now)).toEqual({ label: 'Plano vencido em 31/10/2026', tone: 'danger' })
    expect(accessLabel(org({ status: 'exempt' }), now).label).toBe('Sem cobrança')
    expect(accessLabel(org({ status: 'suspended', has_access: false }), now).label).toBe('Suspensa')
  })
  it('agrupa para os filtros do painel', () => {
    expect(accessGroup(org({}))).toBe('trial')
    expect(accessGroup(org({ status: 'active' }))).toBe('active')
    expect(accessGroup(org({ status: 'suspended', has_access: false }))).toBe('blocked')
  })
})
