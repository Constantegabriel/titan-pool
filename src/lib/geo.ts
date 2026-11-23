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

export interface GeocodeResult extends GeoPoint {
  label: string
}

/**
 * Busca o endereço no OpenStreetMap (Nominatim). Uso leve e pontual — um pedido por toque
 * do usuário, como pede a política do serviço. Para volume alto, troque por um provedor pago aqui.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', countrycodes: 'br', limit: '5', 'accept-language': 'pt-BR' })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!res.ok) throw new Error('Busca de endereço indisponível agora.')
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  return data.map((d) => ({ lat: Number(d.lat), lng: Number(d.lon), label: d.display_name }))
}

export const formatKm = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`

export const formatDuration = (minutes: number) => {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
}
