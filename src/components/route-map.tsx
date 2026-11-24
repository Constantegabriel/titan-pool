import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { GeoPoint } from '@/domain/types'

export interface MapStop {
  key: string
  point: GeoPoint
  label: string
  title: string
  state: 'done' | 'next' | 'pending' | 'skipped'
}

/**
 * Mapa do dia: ponto de partida, paradas numeradas na ordem de chegada e o trajeto entre elas.
 * Mapa do OpenStreetMap (uso leve); para muitos usuários, troque TILE_URL por um provedor com chave.
 */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '© OpenStreetMap'

export default function RouteMap({ base, stops, onSelect, me, accuracy, focusMe }: {
  base: GeoPoint | null; stops: MapStop[]; onSelect?: (key: string) => void
  /** Posição atual do aparelho. */
  me?: GeoPoint | null
  accuracy?: number | null
  /** Muda quando a pessoa pede para centralizar nela. */
  focusMe?: number
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const meLayer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, tap: true } as L.MapOptions)
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, className: 'tp-tiles' }).addTo(map.current)
    L.control.zoom({ position: 'bottomright' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    meLayer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    const group = layer.current
    if (!m || !group) return
    group.clearLayers()
    const points: L.LatLngExpression[] = []
    if (base) {
      points.push([base.lat, base.lng])
      L.marker([base.lat, base.lng], {
        icon: L.divIcon({ className: '', html: '<div class="tp-pin tp-pin--base" style="width:26px;height:26px">⌂</div>', iconSize: [26, 26] }),
        title: 'Ponto de partida',
      }).addTo(group)
    }
    const active = stops.filter((s) => s.state !== 'skipped')
    for (const s of active) points.push([s.point.lat, s.point.lng])
    if (points.length > 1) {
      L.polyline(points, { color: '#1f62e8', weight: 4, opacity: 0.75, dashArray: '2 8', lineCap: 'round' }).addTo(group)
    }
    for (const s of stops) {
      const size = s.state === 'next' ? 34 : 28
      L.marker([s.point.lat, s.point.lng], {
        icon: L.divIcon({ className: '', html: `<div class="tp-pin tp-pin--${s.state}" style="width:${size}px;height:${size}px">${s.state === 'done' ? '✓' : s.label}</div>`, iconSize: [size, size] }),
        title: s.title,
        zIndexOffset: s.state === 'next' ? 1000 : 0,
      })
        .on('click', () => onSelect?.(s.key))
        .addTo(group)
    }
    const all: L.LatLngExpression[] = [...points, ...stops.filter((s) => s.state === 'skipped').map((s) => [s.point.lat, s.point.lng] as L.LatLngTuple)]
    if (all.length === 1) m.setView(all[0], 14)
    else if (all.length > 1) m.fitBounds(L.latLngBounds(all), { padding: [36, 36], maxZoom: 15 })
    else m.setView([-15.78, -47.93], 4)
  }, [base, stops, onSelect])

  // "Você está aqui": ponto azul pulsando e o círculo de precisão; não mexe no enquadramento.
  useEffect(() => {
    const group = meLayer.current
    if (!group) return
    group.clearLayers()
    if (!me) return
    if (accuracy && accuracy < 1500) {
      L.circle([me.lat, me.lng], { radius: accuracy, color: '#3478f6', weight: 1, opacity: 0.4, fillColor: '#3478f6', fillOpacity: 0.08, interactive: false }).addTo(group)
    }
    L.marker([me.lat, me.lng], {
      icon: L.divIcon({ className: '', html: '<div class="tp-me"><span></span></div>', iconSize: [22, 22] }),
      title: 'Você está aqui',
      zIndexOffset: 2000,
      keyboard: false,
    }).addTo(group)
  }, [me, accuracy])

  useEffect(() => {
    if (focusMe && me && map.current) map.current.setView([me.lat, me.lng], Math.max(map.current.getZoom(), 15), { animate: true })
  }, [focusMe]) // oxlint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-full w-full" role="img" aria-label="Mapa com a rota do dia" />
}
