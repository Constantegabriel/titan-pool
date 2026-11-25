import type { DayPlan, IsoDate } from './types'

export const emptyDayPlan = (date: IsoDate): DayPlan => ({
  id: date, order: [], startTime: null, startMode: 'auto', returnToBase: false, updatedAt: new Date().toISOString(),
})

/**
 * Aplica a ordem salva: quem está no plano vem na ordem do plano; quem não está (ex.: parada
 * adicionada depois) mantém a ordem original e vai para o fim.
 */
export function applyOrder<T>(items: T[], order: string[], idOf: (item: T) => string): T[] {
  if (!order.length) return items
  const pos = new Map(order.map((id, i) => [id, i]))
  const inPlan = items.filter((i) => pos.has(idOf(i))).sort((a, b) => pos.get(idOf(a))! - pos.get(idOf(b))!)
  const rest = items.filter((i) => !pos.has(idOf(i)))
  return [...inPlan, ...rest]
}

/** Move um item de posição (arrastar e soltar). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}
