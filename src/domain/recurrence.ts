import { addDays, parseIsoDate, toIsoDate } from './dates'
import type { IsoDate, Pool, Weekday } from './types'

const DAY_MS = 86_400_000
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const
const WEEKDAY_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** Domingo da semana da data (dias inteiros, sem efeito de horário de verão). */
function weekStart(date: IsoDate): number {
  const d = parseIsoDate(date)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
}

export type RecurrenceRule = Pick<Pool, 'recurrence' | 'visitDays' | 'monthDays' | 'anchorDate'>

/** A visita fixa cai nesta data? */
export function occursOn(rule: RecurrenceRule, date: IsoDate): boolean {
  const d = parseIsoDate(date)
  switch (rule.recurrence) {
    case 'weekly':
      return rule.visitDays.includes(d.getDay() as Weekday)
    case 'biweekly': {
      if (!rule.visitDays.includes(d.getDay() as Weekday)) return false
      const weeks = Math.round((weekStart(date) - weekStart(rule.anchorDate ?? date)) / (7 * DAY_MS))
      return weeks % 2 === 0
    }
    case 'monthly': {
      const day = d.getDate()
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      return rule.monthDays.includes(day) || (day === last && rule.monthDays.some((m) => m > last))
    }
    default:
      return false
  }
}

/** Próxima data (a partir de `from`, inclusive) em que a visita fixa acontece. */
export function nextOccurrence(rule: RecurrenceRule, from: IsoDate, horizonDays = 70): IsoDate | null {
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(from, i)
    if (occursOn(rule, date)) return date
  }
  return null
}

const joinPt = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`)

/** "Toda semana: seg e qui", "A cada 2 semanas: ter", "Todo mês: dias 5 e 20". */
export function describeRecurrence(rule: RecurrenceRule, time?: string | null): string {
  const at = time ? ` às ${time}` : ''
  const days = [...rule.visitDays].sort()
  switch (rule.recurrence) {
    case 'weekly':
      if (!days.length) break
      if (days.length === 1) return `Toda ${WEEKDAY_NAMES[days[0]]}${days[0] === 0 || days[0] === 6 ? '' : '-feira'}${at}`.replace('Toda domingo', 'Todo domingo').replace('Toda sábado', 'Todo sábado')
      return `Toda semana: ${joinPt(days.map((d) => WEEKDAY_ABBR[d]))}${at}`
    case 'biweekly':
      if (!days.length) break
      return `A cada 2 semanas: ${joinPt(days.map((d) => WEEKDAY_ABBR[d]))}${at}`
    case 'monthly': {
      const md = [...rule.monthDays].sort((a, b) => a - b)
      if (!md.length) break
      return `Todo mês: ${md.length === 1 ? 'dia' : 'dias'} ${joinPt(md.map(String))}${at}`
    }
  }
  return 'Sem visita fixa'
}

export const hasRecurrence = (rule: RecurrenceRule) =>
  (rule.recurrence === 'weekly' || rule.recurrence === 'biweekly') ? rule.visitDays.length > 0 : rule.recurrence === 'monthly' && rule.monthDays.length > 0

export const todayIso = () => toIsoDate(new Date())
