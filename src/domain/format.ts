import type { Period } from './types'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatMoney = (cents: number) => brl.format(cents / 100)

/** Converte "150", "150,50" ou "1.234,56" em centavos. */
export function parseMoney(input: string): number {
  const normalized = input.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

export function centsToInput(cents: number): string {
  return cents ? (cents / 100).toFixed(2).replace('.', ',') : ''
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function formatPeriod(period: Period): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS[m - 1]} de ${y}`
}

export const formatLiters = (liters: number) => `${liters.toLocaleString('pt-BR')} L`

/** Mantém apenas dígitos e acrescenta o DDI 55 quando ausente. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
}

export function whatsappLink(phone: string, text: string): string {
  const number = whatsappNumber(phone)
  const query = `text=${encodeURIComponent(text)}`
  return number ? `https://wa.me/${number}?${query}` : `https://wa.me/?${query}`
}
