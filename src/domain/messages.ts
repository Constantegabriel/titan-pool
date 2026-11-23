import { IDEAL_RANGES, classify, type ReadingKey } from './chemistry'
import { parseIsoDate } from './dates'
import { formatMoney, formatPeriod } from './format'
import type { Charge, Client, Pool, Visit } from './types'

const LEVEL_MARK = { ok: '✅', low: '⬇️', high: '⬆️', unknown: '' } as const

function readingLine(key: ReadingKey, value: number | null) {
  if (value === null) return null
  const range = IDEAL_RANGES[key]
  const unit = range.unit ? ` ${range.unit}` : ''
  return `${LEVEL_MARK[classify(key, value)]} ${range.label}: ${value.toLocaleString('pt-BR')}${unit}`.trim()
}

/** Texto do relatório de visita para envio pelo WhatsApp do próprio piscineiro. */
export function visitReportMessage(visit: Visit, pool: Pool, client: Client): string {
  const date = parseIsoDate(visit.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const lines = [`Olá, ${client.name.split(' ')[0]}! Relatório da visita à piscina (${pool.name}) — ${date}.`]

  const readings = (Object.keys(IDEAL_RANGES) as ReadingKey[])
    .map((key) => readingLine(key, visit.readings[key]))
    .filter(Boolean)
  if (readings.length) lines.push('', '*Análise da água*', ...(readings as string[]))
  if (visit.tasks.length) lines.push('', '*Serviços*', ...visit.tasks.map((t) => `• ${t}`))
  if (visit.products.length) {
    lines.push('', '*Produtos aplicados*', ...visit.products.map((p) => `• ${p.name}: ${p.quantity.toLocaleString('pt-BR')} ${p.unit}`))
  }
  if (visit.notes.trim()) lines.push('', `*Observações:* ${visit.notes.trim()}`)
  if (visit.photos.length) lines.push('', `📷 ${visit.photos.length} foto(s) registradas.`)
  return lines.join('\n')
}

export function chargeReminderMessage(charge: Charge, client: Client): string {
  const due = parseIsoDate(charge.dueDate).toLocaleDateString('pt-BR')
  return `Olá, ${client.name.split(' ')[0]}! Lembrete da mensalidade de manutenção da piscina referente a ${formatPeriod(charge.period)}: ${formatMoney(charge.amountCents)}, vencimento em ${due}. Obrigado!`
}
