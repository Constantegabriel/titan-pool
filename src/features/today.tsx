import {
  ArrowDown, ArrowUp, CalendarDays, Car, CheckCircle2, ChevronLeft, ChevronRight, Clock, Flag, KeyRound, MapPin,
  MapPinOff, Navigation, Route as RouteIcon, Sparkles, Waves,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, ExternalButton, Loading } from '@/components/ui'
import { addDays, parseIsoDate, today } from '@/domain/dates'
import { formatLiters } from '@/domain/format'
import {
  type StopInput, type StopPlan, buildTimeline, formatClock, minutesOfDay, navigationUrl, optimizeOrder, parseClock,
} from '@/domain/route'
import { type AgendaItem, agendaProgress, arrangeByProgress, buildAgenda, reassignRouteOrder, routeUrl } from '@/domain/schedule'
import type { GeoPoint, Settings } from '@/domain/types'
import { emptyVisit, useClients, usePools, useSavePools, useSaveVisit, useSettings, useVisitsByDate } from '@/hooks/data'
import { cn } from '@/lib/cn'
import { formatDuration, formatKm } from '@/lib/geo'

const pointOf = (item: AgendaItem): GeoPoint | null =>
  item.client.lat !== null && item.client.lng !== null ? { lat: item.client.lat, lng: item.client.lng } : null

function toLocalDay(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Minutos do dia de um registro, só se ele aconteceu na data exibida. */
const clockOf = (iso: string | null | undefined, date: string) => (iso && toLocalDay(iso) === date ? minutesOfDay(new Date(iso)) : null)

/** Minuto atual, atualizado a cada 30 s para as previsões andarem sozinhas. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function greeting(date: Date) {
  const h = date.getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

interface Stop {
  item: AgendaItem
  plan: StopPlan
  /** 1º, 2º… na ordem de chegada; null para visitas puladas. */
  position: number | null
}

function planDay(items: AgendaItem[], settings: Settings, date: string, nowDate: Date): Stop[] {
  const arranged = arrangeByProgress(items)
  const isToday = date === today()
  const stops: StopInput[] = arranged.map((item) => {
    const v = item.visit
    return {
      point: pointOf(item),
      serviceMinutes: item.pool.serviceMinutes ?? settings.defaultServiceMinutes,
      state: v ? v.status : 'pending',
      startedAt: v ? clockOf(v.checkInAt, date) : null,
      finishedAt: v ? clockOf(v.completedAt, date) : null,
    }
  })
  const plans = buildTimeline({
    base: settings.base,
    dayStart: parseClock(settings.dayStart),
    speedKmh: settings.avgSpeedKmh,
    now: isToday ? minutesOfDay(nowDate) : null,
    stops,
  })
  let n = 0
  return arranged.map((item, i) => ({ item, plan: plans[i], position: item.visit?.status === 'skipped' ? null : ++n }))
}

export function TodayPage() {
  const [params, setParams] = useSearchParams()
  const date = params.get('data') ?? today()
  const now = useNow()
  const clients = useClients()
  const pools = usePools()
  const visits = useVisitsByDate(date)
  const settings = useSettings()
  const savePools = useSavePools()
  const [reordering, setReordering] = useState(false)

  const setDate = (next: string) => {
    setReordering(false)
    setParams(next === today() ? {} : { data: next }, { replace: true })
  }
  const isToday = date === today()

  const error = clients.error ?? pools.error ?? visits.error ?? settings.error
  const ready = clients.data && pools.data && visits.data && settings.data
  const agenda = useMemo(
    () => (ready ? buildAgenda(date, clients.data!, pools.data!, visits.data!) : []),
    [ready, date, clients.data, pools.data, visits.data],
  )
  const stops = ready ? planDay(agenda, settings.data!, date, now) : []
  const progress = agendaProgress(agenda)
  const next = stops.find((s) => !s.item.visit || s.item.visit.status === 'in_progress')
  const pendingStops = stops.filter((s) => !s.item.visit)
  const missingLocation = stops.filter((s) => !s.item.visit && !pointOf(s.item)).length
  const totalKm = stops.reduce((sum, s) => sum + (s.plan.km ?? 0), 0)
  const lastActive = [...stops].reverse().find((s) => s.item.visit?.status !== 'skipped')
  const route = routeUrl(agenda)

  const persistOrder = (orderedPending: AgendaItem[]) => {
    const changed = reassignRouteOrder(pools.data!, orderedPending.map((i) => i.pool.id))
    if (changed.length) savePools.mutate(changed)
  }

  function optimize() {
    const lastDone = [...stops].reverse().find((s) => s.item.visit && s.item.visit.status !== 'skipped' && pointOf(s.item))
    const start = lastDone ? pointOf(lastDone.item) : settings.data!.base
    const located = pendingStops.filter((s) => pointOf(s.item))
    const order = optimizeOrder(start, located.map((s) => pointOf(s.item)!))
    persistOrder([...order.map((i) => located[i].item), ...pendingStops.filter((s) => !pointOf(s.item)).map((s) => s.item)])
  }

  function move(index: number, delta: number) {
    const list = pendingStops.map((s) => s.item)
    const target = index + delta
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    persistOrder(list)
  }

  const dateLabel = parseIsoDate(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <header className="mb-4">
        <p className="text-sm text-slate-500 first-letter:uppercase">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {isToday ? `${greeting(now)}${settings.data?.ownerName ? `, ${settings.data.ownerName.split(' ')[0]}` : ''}` : 'Agenda'}
        </h1>
      </header>

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Dia anterior"><ChevronLeft className="size-4" /></Button>
        <Button variant={isToday ? 'primary' : 'secondary'} size="sm" onClick={() => setDate(today())}>Hoje</Button>
        <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="Próximo dia"><ChevronRight className="size-4" /></Button>
        <input
          type="date"
          aria-label="Escolher data"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="ml-auto h-9 min-w-0 rounded-xl bg-white px-2 text-sm ring-1 ring-slate-300"
        />
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : !ready ? (
        <Loading />
      ) : agenda.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-9" />} title="Nenhuma visita neste dia">
          {clients.data!.length === 0 ? (
            <ButtonLink to="/clientes/novo" className="mt-4">Cadastrar primeiro cliente</ButtonLink>
          ) : 'Defina os dias de visita na piscina de cada cliente.'}
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Stat icon={<Flag className="size-4" />} label="Visitas" value={`${progress.done}/${progress.total}`} />
            <Stat icon={<Car className="size-4" />} label="Percurso" value={totalKm ? `≈ ${formatKm(totalKm)}` : '—'} />
            <Stat icon={<Clock className="size-4" />} label="Término" value={lastActive ? formatClock(lastActive.plan.departure) : '—'} />
          </div>

          {next ? <NextStopCard stop={next} date={date} /> : (
            <Card className="mb-4 bg-emerald-50 text-center ring-emerald-200">
              <CheckCircle2 className="mx-auto size-8 text-emerald-700" aria-hidden />
              <p className="mt-1 font-semibold text-emerald-900">Roteiro concluído!</p>
            </Card>
          )}

          {missingLocation > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{missingLocation} cliente(s) sem localização: previsões estimadas. Defina no cadastro do cliente.</span>
            </p>
          )}

          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ordem de chegada</h2>
            {pendingStops.length > 1 && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={optimize} loading={savePools.isPending} disabled={pendingStops.length - missingLocation < 2}>
                  <Sparkles className="size-4" aria-hidden /> Otimizar
                </Button>
                <Button variant={reordering ? 'primary' : 'ghost'} size="sm" onClick={() => setReordering(!reordering)} aria-pressed={reordering}>
                  {reordering ? 'Pronto' : 'Ajustar'}
                </Button>
              </div>
            )}
          </div>

          <Timeline
            stops={stops}
            settings={settings.data!}
            date={date}
            reordering={reordering}
            onMove={(poolId, delta) => move(pendingStops.findIndex((s) => s.item.pool.id === poolId), delta)}
            pendingIds={pendingStops.map((s) => s.item.pool.id)}
          />

          {route && (
            <ExternalButton href={route} variant="secondary" className="mt-4 w-full">
              <RouteIcon className="size-4" aria-hidden /> Abrir roteiro completo no Maps
            </ExternalButton>
          )}
          <p className="mt-3 text-center text-xs text-slate-400">
            Previsões com {settings.data!.avgSpeedKmh} km/h de média e {settings.data!.defaultServiceMinutes} min por piscina. <Link to="/mais/ajustes" className="underline">Ajustar</Link>
          </p>
        </>
      )}
    </>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70">
      <p className="flex items-center gap-1 text-xs text-slate-500">{icon}{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
    </div>
  )
}

function useStartVisit(date: string) {
  const save = useSaveVisit()
  const navigate = useNavigate()
  const start = async (item: AgendaItem) => {
    const created = await save.mutateAsync(emptyVisit(item.pool, date))
    navigate(`/visitas/${created.id}`)
  }
  return { start, skip: (item: AgendaItem) => save.mutate(emptyVisit(item.pool, date, 'skipped')), busy: save.isPending }
}

function NextStopCard({ stop, date }: { stop: Stop; date: string }) {
  const { item, plan, position } = stop
  const { start, busy } = useStartVisit(date)
  const address = [item.client.address, item.client.neighborhood].filter(Boolean).join(', ')
  const point = pointOf(item)
  const inProgress = item.visit?.status === 'in_progress'

  return (
    <section aria-label="Próximo cliente" className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-700 to-sky-800 p-4 text-white shadow-lg shadow-cyan-900/20">
      <div className="flex items-center justify-between text-sm text-cyan-100">
        <span className="font-medium">{inProgress ? 'Em atendimento' : `Próximo · ${position}º cliente`}</span>
        {!inProgress && (
          <span className="flex items-center gap-1 tabular-nums">
            <Car className="size-4" aria-hidden />
            {formatDuration(plan.travelMinutes)}{plan.km !== null && ` · ${formatKm(plan.km)}`}
          </span>
        )}
      </div>
      <p className="mt-2 text-xl font-bold leading-tight">{item.client.name}</p>
      <p className="mt-0.5 flex items-center gap-1 text-sm text-cyan-50">
        <Waves className="size-3.5 shrink-0" aria-hidden /> {item.pool.name} · {formatLiters(item.pool.volumeLiters)}
      </p>
      {address && <p className="mt-0.5 flex items-start gap-1 text-sm text-cyan-50"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {address}</p>}
      {item.pool.accessNotes && <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-white/10 px-2.5 py-1.5 text-sm"><KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {item.pool.accessNotes}</p>}

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-cyan-100">{inProgress ? 'Saída prevista' : 'Chegada prevista'}</p>
          <p className="text-3xl font-bold tabular-nums">{formatClock(inProgress ? plan.departure : plan.arrival)}</p>
        </div>
        {!inProgress && <p className="text-right text-xs text-cyan-100">saída ≈ {formatClock(plan.departure)}</p>}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
        {inProgress ? (
          <ButtonLink to={`/visitas/${item.visit!.id}`} variant="light">Continuar visita</ButtonLink>
        ) : (
          <Button variant="light" onClick={() => start(item)} loading={busy}>Cheguei · iniciar</Button>
        )}
        <a href={navigationUrl(point, address)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-medium hover:bg-white/25">
          <Navigation className="size-4" aria-hidden /> Maps
        </a>
        <a href={navigationUrl(point, address, 'waze')} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl bg-white/15 px-3 text-sm font-medium hover:bg-white/25">
          Waze
        </a>
      </div>
    </section>
  )
}

function Timeline({ stops, settings, date, reordering, onMove, pendingIds }: {
  stops: Stop[]; settings: Settings; date: string; reordering: boolean; pendingIds: string[]; onMove: (poolId: string, delta: number) => void
}) {
  const { start, skip, busy } = useStartVisit(date)
  return (
    <ol className="relative">
      <li className="flex items-center gap-3 pb-3 text-sm text-slate-500">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600"><Flag className="size-4" aria-hidden /></span>
        Saída {formatClock(parseClock(settings.dayStart))}{settings.baseLabel ? ` · ${settings.baseLabel}` : ''}
      </li>
      {stops.map(({ item, plan, position }, i) => {
        const v = item.visit
        const pendingIndex = pendingIds.indexOf(item.pool.id)
        const done = v?.status === 'done'
        const skipped = v?.status === 'skipped'
        return (
          <li key={item.pool.id} className="relative pl-12">
            <span className="absolute top-0 bottom-0 left-[17px] w-0.5 bg-slate-200" aria-hidden />
            {!skipped && (
              <p className="relative -ml-12 flex items-center gap-3 py-1.5 text-xs text-slate-500">
                <span className="w-9" />
                <Car className="size-3.5" aria-hidden /> {formatDuration(plan.travelMinutes)}{plan.km !== null ? ` · ${formatKm(plan.km)}` : ' · estimado'}
              </p>
            )}
            <span
              className={cn(
                'absolute left-0 mt-3 flex size-9 items-center justify-center rounded-full text-sm font-bold ring-4 ring-slate-50',
                done ? 'bg-emerald-600 text-white' : v?.status === 'in_progress' ? 'bg-cyan-700 text-white' : skipped ? 'bg-slate-200 text-slate-500' : 'bg-white text-cyan-800 ring-cyan-100',
              )}
              aria-hidden
            >
              {done ? <CheckCircle2 className="size-5" /> : position ? `${position}º` : '–'}
            </span>
            <Card className={cn('mb-1 p-3', (done || skipped) && 'opacity-70')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/clientes/${item.client.id}`} className="font-semibold hover:underline">{item.client.name}</Link>
                  <p className="truncate text-xs text-slate-500">
                    {[item.client.neighborhood, item.pool.name].filter(Boolean).join(' · ')}
                    {!pointOf(item) && !v && <span className="text-amber-700"> · sem localização</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {skipped ? <Badge>Não realizada</Badge> : (
                    <>
                      <p className={cn('text-base font-bold tabular-nums', done ? 'text-emerald-700' : 'text-slate-900')}>{formatClock(plan.arrival)}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{done ? 'chegou' : v ? 'em curso' : `até ${formatClock(plan.departure)}`}</p>
                    </>
                  )}
                </div>
              </div>
              {item.extra && <div className="mt-1"><Badge tone="warning">Avulsa</Badge></div>}
              {reordering && pendingIndex >= 0 ? (
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" disabled={pendingIndex === 0} onClick={() => onMove(item.pool.id, -1)} aria-label={`Subir ${item.client.name}`}><ArrowUp className="size-4" /> Antes</Button>
                  <Button variant="secondary" size="sm" className="flex-1" disabled={pendingIndex === pendingIds.length - 1} onClick={() => onMove(item.pool.id, 1)} aria-label={`Descer ${item.client.name}`}><ArrowDown className="size-4" /> Depois</Button>
                </div>
              ) : !v ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => start(item)} disabled={busy}>Iniciar</Button>
                  <Button size="sm" variant="ghost" onClick={() => skip(item)} disabled={busy}>Pular</Button>
                </div>
              ) : (
                <ButtonLink to={`/visitas/${v.id}`} size="sm" variant="ghost" className="mt-1 -ml-2">
                  {done ? 'Ver relatório' : skipped ? 'Ver registro' : 'Continuar visita'}
                </ButtonLink>
              )}
            </Card>
            {i === stops.length - 1 && <span className="absolute bottom-0 left-[17px] h-4 w-0.5 bg-slate-50" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
