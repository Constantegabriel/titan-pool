import { describe, expect, it } from 'vitest'
import { formatCep, photonToSuggestion } from './geo'

const f = (properties: Record<string, string>, coords: [number, number] = [-47.05, -22.9]) => ({ geometry: { coordinates: coords }, properties })

describe('endereço', () => {
  it('formata o CEP enquanto digita', () => {
    expect(formatCep('13025')).toBe('13025')
    expect(formatCep('13025010')).toBe('13025-010')
    expect(formatCep('13.025-0105')).toBe('13025-010')
  })
  it('converte sugestões do Photon no formato do cadastro', () => {
    expect(photonToSuggestion(f({ street: 'Rua das Palmeiras', housenumber: '120', district: 'Cambuí', city: 'Campinas', state: 'São Paulo', countrycode: 'BR' })))
      .toEqual({ address: 'Rua das Palmeiras, 120', area: 'Cambuí, Campinas - SP', lat: -22.9, lng: -47.05, hasNumber: true })
    expect(photonToSuggestion(f({ name: 'Avenida Brasil', osm_key: 'highway', city: 'Campinas', state: 'São Paulo', countrycode: 'BR' })))
      .toMatchObject({ address: 'Avenida Brasil', area: 'Campinas - SP', hasNumber: false })
    expect(photonToSuggestion(f({ street: 'Calle X', countrycode: 'AR' }))).toBeNull()
  })
})
