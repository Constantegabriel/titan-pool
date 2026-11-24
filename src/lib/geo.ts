import type { GeoPoint } from '@/domain/types'

/** Posição atual do aparelho (pede permissão na primeira vez). */
export function currentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este aparelho não informa a localização.'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Permita o acesso à localização nas configurações do navegador.' : 'Não foi possível obter a localização.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}

export interface PlaceSuggestion extends GeoPoint {
  /** Rua e número, como vai para o campo Endereço. */
  address: string
  /** "Bairro, Cidade - UF". */
  area: string
  /** Veio com número da casa (localização mais precisa). */
  hasNumber: boolean
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; district?: string
    locality?: string; county?: string; state?: string; countrycode?: string; osm_key?: string; type?: string
  }
}

const UF: Record<string, string> = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
  Goiás: 'GO', Maranhão: 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG', Pará: 'PA', Paraíba: 'PB', Paraná: 'PR',
  Pernambuco: 'PE', Piauí: 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO', Roraima: 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
}

/** Converte um resultado do Photon no formato dos campos do cadastro. */
export function photonToSuggestion(f: PhotonFeature): PlaceSuggestion | null {
  const p = f.properties
  if (p.countrycode && p.countrycode !== 'BR') return null
  const street = p.street ?? (p.osm_key === 'highway' ? p.name : undefined) ?? p.name
  if (!street) return null
  const address = p.housenumber ? `${street}, ${p.housenumber}` : street
  const city = p.city ?? p.county
  const uf = p.state ? (UF[p.state] ?? p.state) : undefined
  const hood = p.district ?? p.locality
  const area = [hood !== city ? hood : undefined, [city, uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ')
  const [lng, lat] = f.geometry.coordinates
  return { address, area, lat, lng, hasNumber: Boolean(p.housenumber) }
}

const BRAZIL_BBOX = '-74.1,-33.8,-34.7,5.3'

/**
 * Sugestões de endereço enquanto a pessoa digita (Photon, base OpenStreetMap, feito para
 * busca-enquanto-digita). `near` puxa os resultados para perto do piscineiro.
 */
export async function searchPlaces(query: string, near?: GeoPoint | null, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: '8', bbox: BRAZIL_BBOX })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lon', String(near.lng))
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal })
  if (!res.ok) throw new Error('Busca de endereço indisponível agora.')
  const data = (await res.json()) as { features: PhotonFeature[] }
  const seen = new Set<string>()
  const out: PlaceSuggestion[] = []
  for (const f of data.features) {
    const s = photonToSuggestion(f)
    if (!s) continue
    const key = `${s.address}|${s.area}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out.slice(0, 6)
}

export interface CepResult {
  street: string
  area: string
  city: string
  uf: string
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '')
export const formatCep = (s: string) => {
  const d = onlyDigits(s).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Endereço pelo CEP (ViaCEP, gratuito). */
export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepResult> {
  const digits = onlyDigits(cep)
  if (digits.length !== 8) throw new Error('CEP precisa ter 8 números.')
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal })
  if (!res.ok) throw new Error('Não foi possível consultar o CEP agora.')
  const d = (await res.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
  if (d.erro) throw new Error('CEP não encontrado.')
  const city = d.localidade ?? ''
  return { street: d.logradouro ?? '', city, uf: d.uf ?? '', area: [d.bairro, [city, d.uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ') }
}

export const formatKm = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

export const formatDuration = (minutes: number) => {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
}
