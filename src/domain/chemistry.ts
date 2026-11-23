import type { Readings } from './types'

export type ReadingKey = keyof Readings
export type ReadingLevel = 'low' | 'ok' | 'high' | 'unknown'

export interface Range {
  min: number
  max: number
  unit: string
  label: string
}

/** Faixas de referência usuais para piscinas residenciais. */
export const IDEAL_RANGES: Record<ReadingKey, Range> = {
  ph: { min: 7.2, max: 7.6, unit: '', label: 'pH' },
  chlorine: { min: 1, max: 3, unit: 'ppm', label: 'Cloro livre' },
  alkalinity: { min: 80, max: 120, unit: 'ppm', label: 'Alcalinidade' },
}

export function classify(key: ReadingKey, value: number | null): ReadingLevel {
  if (value === null || Number.isNaN(value)) return 'unknown'
  const range = IDEAL_RANGES[key]
  if (value < range.min) return 'low'
  if (value > range.max) return 'high'
  return 'ok'
}

export interface Suggestion {
  key: ReadingKey
  message: string
}

const round = (value: number, step: number) => Math.round(value / step) * step

/**
 * Gramas de cloro granulado (65% de cloro ativo) para subir o cloro livre até o centro da faixa.
 * 1 ppm em 1.000 L equivale a 1 g de cloro ativo.
 */
export function chlorineDoseGrams(volumeLiters: number, currentPpm: number, targetPpm = 2, activePercent = 65) {
  const delta = targetPpm - currentPpm
  if (delta <= 0 || volumeLiters <= 0) return 0
  return round((delta * volumeLiters) / 1000 / (activePercent / 100), 5)
}

/** Gramas de bicarbonato de sódio para subir a alcalinidade (≈1,7 g por 1.000 L para +1 ppm). */
export function alkalinityDoseGrams(volumeLiters: number, currentPpm: number, targetPpm = 100) {
  const delta = targetPpm - currentPpm
  if (delta <= 0 || volumeLiters <= 0) return 0
  return round(delta * 1.7 * (volumeLiters / 1000), 10)
}

const formatGrams = (grams: number) =>
  grams >= 1000 ? `${(grams / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg` : `${grams} g`

/**
 * Sugestões de correção. A ordem segue a prática comum: alcalinidade primeiro, depois pH, depois cloro.
 * São estimativas — o rótulo do produto usado sempre prevalece.
 */
export function suggestCorrections(readings: Readings, volumeLiters: number): Suggestion[] {
  const out: Suggestion[] = []
  const alk = classify('alkalinity', readings.alkalinity)
  const ph = classify('ph', readings.ph)
  const cl = classify('chlorine', readings.chlorine)

  if (alk === 'low' && readings.alkalinity !== null) {
    const grams = alkalinityDoseGrams(volumeLiters, readings.alkalinity)
    out.push({ key: 'alkalinity', message: `Alcalinidade baixa: cerca de ${formatGrams(grams)} de bicarbonato de sódio para chegar a 100 ppm.` })
  } else if (alk === 'high') {
    out.push({ key: 'alkalinity', message: 'Alcalinidade alta: aplique redutor de pH/alcalinidade aos poucos, conforme o rótulo.' })
  }

  if (ph === 'low') {
    out.push({ key: 'ph', message: alk === 'low' ? 'pH baixo: corrija a alcalinidade primeiro e meça de novo.' : 'pH baixo: use elevador de pH conforme o rótulo.' })
  } else if (ph === 'high') {
    out.push({ key: 'ph', message: 'pH alto: use redutor de pH conforme o rótulo, em doses fracionadas.' })
  }

  if (cl === 'low' && readings.chlorine !== null) {
    const grams = chlorineDoseGrams(volumeLiters, readings.chlorine)
    out.push({ key: 'chlorine', message: `Cloro baixo: cerca de ${formatGrams(grams)} de cloro granulado 65% para chegar a 2 ppm.` })
  } else if (cl === 'high') {
    out.push({ key: 'chlorine', message: 'Cloro alto: suspenda a cloração e evite banho até voltar a 3 ppm ou menos.' })
  }

  return out
}
