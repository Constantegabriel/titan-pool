import { dueDateFor } from './dates'
import type { Charge, Client, IsoDate, Period } from './types'

export type ChargeDraft = Omit<Charge, 'id' | 'createdAt'>

/**
 * Cobranças que faltam gerar na competência: uma por cliente ativo com mensalidade,
 * sem duplicar as que já existem (operação idempotente).
 */
export function chargesToCreate(period: Period, clients: Client[], existing: Charge[]): ChargeDraft[] {
  const already = new Set(existing.filter((c) => c.period === period).map((c) => c.clientId))
  return clients
    .filter((c) => c.active && c.monthlyFeeCents > 0 && !already.has(c.id))
    .map((c) => ({
      clientId: c.id,
      period,
      amountCents: c.monthlyFeeCents,
      dueDate: dueDateFor(period, c.billingDay),
      status: 'pending' as const,
      paidAt: null,
    }))
}

export type ChargeState = 'paid' | 'overdue' | 'open'

export function chargeState(charge: Charge, on: IsoDate): ChargeState {
  if (charge.status === 'paid') return 'paid'
  return charge.dueDate < on ? 'overdue' : 'open'
}

export interface BillingSummary {
  expectedCents: number
  receivedCents: number
  overdueCents: number
  openCents: number
}

export function summarize(charges: Charge[], on: IsoDate): BillingSummary {
  const summary: BillingSummary = { expectedCents: 0, receivedCents: 0, overdueCents: 0, openCents: 0 }
  for (const charge of charges) {
    summary.expectedCents += charge.amountCents
    const state = chargeState(charge, on)
    if (state === 'paid') summary.receivedCents += charge.amountCents
    else if (state === 'overdue') summary.overdueCents += charge.amountCents
    else summary.openCents += charge.amountCents
  }
  return summary
}
