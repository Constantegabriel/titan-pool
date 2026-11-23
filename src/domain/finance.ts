import { periodOf } from './dates'
import type { Charge, Client, Id, Period, Purchase, Transaction } from './types'

export const purchaseTotalCents = (purchase: Pick<Purchase, 'lines'>): number | null => {
  if (!purchase.lines.length || purchase.lines.some((l) => l.unitPriceCents === null)) return null
  return purchase.lines.reduce((sum, l) => sum + Math.round((l.unitPriceCents ?? 0) * l.quantity), 0)
}

export const formatOrderNumber = (n: number) => `#${String(n).padStart(4, '0')}`

export interface MonthResult {
  /** Mensalidades recebidas na competência. */
  feesReceivedCents: number
  feesPendingCents: number
  otherIncomeCents: number
  expensesCents: number
  /** Receita total recebida (mensalidades pagas + outras receitas pagas). */
  incomeCents: number
  profitCents: number
  expensesByCategory: Array<{ category: string; cents: number }>
}

/** Resultado do mês: mensalidades + lançamentos avulsos. Só entra no caixa o que foi pago. */
export function monthResult(charges: Charge[], transactions: Transaction[]): MonthResult {
  let feesReceived = 0
  let feesPending = 0
  for (const c of charges) {
    if (c.status === 'paid') feesReceived += c.amountCents
    else feesPending += c.amountCents
  }
  let otherIncome = 0
  let expenses = 0
  const byCategory = new Map<string, number>()
  for (const t of transactions) {
    if (!t.paid) continue
    if (t.kind === 'income') otherIncome += t.amountCents
    else {
      expenses += t.amountCents
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amountCents)
    }
  }
  const income = feesReceived + otherIncome
  return {
    feesReceivedCents: feesReceived,
    feesPendingCents: feesPending,
    otherIncomeCents: otherIncome,
    expensesCents: expenses,
    incomeCents: income,
    profitCents: income - expenses,
    expensesByCategory: [...byCategory].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  }
}

export interface ClientMargin {
  client: Client
  revenueCents: number
  costCents: number
  marginCents: number
}

/** Margem por cliente no mês: mensalidade + receitas do cliente − gastos lançados para ele. */
export function clientMargins(period: Period, clients: Client[], charges: Charge[], transactions: Transaction[]): ClientMargin[] {
  const revenue = new Map<Id, number>()
  const cost = new Map<Id, number>()
  for (const c of charges) if (c.period === period) revenue.set(c.clientId, (revenue.get(c.clientId) ?? 0) + c.amountCents)
  for (const t of transactions) {
    if (!t.clientId || periodOf(t.date) !== period) continue
    const map = t.kind === 'income' ? revenue : cost
    map.set(t.clientId, (map.get(t.clientId) ?? 0) + t.amountCents)
  }
  return clients
    .filter((c) => revenue.has(c.id) || cost.has(c.id))
    .map((client) => {
      const r = revenue.get(client.id) ?? 0
      const k = cost.get(client.id) ?? 0
      return { client, revenueCents: r, costCents: k, marginCents: r - k }
    })
    .sort((a, b) => a.marginCents - b.marginCents)
}
