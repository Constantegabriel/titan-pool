import type { IsoDate, Period, Weekday } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseIsoDate(value: IsoDate): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): IsoDate {
  return toIsoDate(new Date())
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const date = parseIsoDate(value)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function weekdayOf(value: IsoDate): Weekday {
  return parseIsoDate(value).getDay() as Weekday
}

export function periodOf(value: IsoDate): Period {
  return value.slice(0, 7)
}

export function shiftPeriod(period: Period, months: number): Period {
  const [y, m] = period.split('-').map(Number)
  const date = new Date(y, m - 1 + months, 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

/** Vencimento dentro da competência, limitado ao último dia do mês. */
export function dueDateFor(period: Period, billingDay: number): IsoDate {
  const [y, m] = period.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${period}-${pad(Math.min(Math.max(1, billingDay), lastDay))}`
}

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
