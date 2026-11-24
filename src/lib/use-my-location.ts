import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoPoint } from '@/domain/types'

export type LocationStatus = 'idle' | 'asking' | 'on' | 'denied' | 'unavailable'

/**
 * Acompanha a posição do aparelho para mostrar "você está aqui" no mapa.
 * Só pede permissão quando a pessoa toca no botão; se ela já permitiu antes, liga sozinho.
 */
export function useMyLocation() {
  const [point, setPoint] = useState<GeoPoint | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [status, setStatus] = useState<LocationStatus>('idle')
  const watch = useRef<number | null>(null)

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) return setStatus('unavailable')
    if (watch.current !== null) return
    setStatus((s) => (s === 'on' ? s : 'asking'))
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setAccuracy(pos.coords.accuracy)
        setStatus('on')
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
        watch.current = null
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )
  }, [])

  useEffect(() => {
    let alive = true
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then((p) => { if (alive && p.state === 'granted') start() })
      .catch(() => {})
    return () => {
      alive = false
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
      watch.current = null
    }
  }, [start])

  return { point, accuracy, status, start }
}
