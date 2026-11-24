import {
  ArrowDown, ArrowUp, CalendarClock, CalendarPlus, CalendarX, Car, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  KeyRound, LoaderCircle, LocateFixed, MapPin, MapPinOff, MoreHorizontal, Navigation, Pencil, Plus, Route as RouteIcon, SkipForward, Sparkles, Undo2, Waves,
} from 'lucide-react'
import { type ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { MapStop } from '@/components/route-map'
import { Sheet } from '@/components/sheet'
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, ExternalButton, Field, Input, Loading } from '@/components/ui'
import { nowIso } from '@/data'
import { WEEKDAY_SHORT, addDays, parseIsoDate, today, weekdayOf } from '@/domain/dates'
import { formatLiters } from '@/domain/format'
import {
  type StopInput, type StopPlan, buildTimeline, formatClock, mergeByTime, minutesOfDay, navigationUrl, optimizeOrder, parseClock,
} from '@/domain/route'
import { type AgendaItem, agendaProgress, arrangeByProgress, buildAgenda, isPending, reassignRouteOrder, routeUrl } from '@/domain/schedule'
import type { GeoPoint, Settings } from '@/domain/types'
import { newVisit, useClients, useDeleteVisit, usePools, useSavePools, useSaveVisit, useSettings, useVisitsInRange } from '@/hooks/data'
import { cn } from '@/lib/cn'
import { formatDuration, formatKm } from '@/lib/geo'
import { useMyLocation } from '@/lib/use-my-location'

const RouteMap = lazy(() => import('@/components/route-map'))

const pointOf = (item: AgendaItem): GeoPoint | null =>
  item.client.lat !== null && item.client.lng !== null ? { lat: item.client.lat, lng: item.client.lng } : null

function toLocalDay(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Minutos do dia de um registro, só se ele aconteceu na data exibida. */
const clockOf = (iso: string | null | undefined, date: string) => (iso && toLocalDay(iso) === date ? minutesOfDay(new Date(iso)) : null)

/** Relógio atualizado a cada 30 s para as previsões andarem sozinhas. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const greeting = (d: Date) => (d.getHours() < 12 ? 'Bom dia' : d.getHours() < 18 ? 'Boa tarde' : 'Boa noite')

/** Segunda-feira da semana da data. */
const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7))

interface Stop {
  item: AgendaItem
  plan: StopPlan
  /** 1ª, 2ª… na ordem de chegada; null para visita pulada. */
  position: number | null
}

function toStopInput(item: AgendaItem, settings: Settings, date: string): StopInput {
  const v = item.visit
  return {
    point: pointOf(item),
    serviceMinutes: item.pool.serviceMinutes ?? settings.defaultServiceMinutes,
    state: !v || v.status === 'scheduled' || v.status === 'canceled' ? 'pending' : v.status,
    startedAt: v ? clockOf(v.checkInAt, date) : null,
    finishedAt: v ? clockOf(v.completedAt, date) : null,
    notBefore: item.time ? parseClock(item.time) : null,
  }
}

function planDay(items: AgendaItem[], settings: Settings, date: string, now: Date, current: GeoPoint | null): Stop[] {
  const timeline = (list: AgendaItem[]) =>
    buildTimeline({
      base: settings.base,
      dayStart: parseClock(settings.dayStart),
      speedKmh: settings.avgSpeedKmh,
      now: date === today() ? minutesOfDay(now) : null,
      current,
      stops: list.map((i) => toStopInput(i, settings, date)),
    })
  const arranged = arrangeByProgress(items)
  const started = arranged.filter((i) => !isPending(i) && i.visit?.status !== 'skipped')
  const skipped = arranged.filter((i) => i.visit?.status === 'skipped')
  const pending = arranged.filter(isPending)
  // Pendentes sem horário seguem a rota; as com horário marcado entram no ponto certo do dia.
  const untimed = pending.filter((i) => !i.time)
  const draft = timeline([...started, ...untimed]).slice(started.length)
  const ordered = mergeByTime(
    untimed.map((item, i) => ({ item, arrival: draft[i].arrival })),
    pending.filter((i) => i.time).map((item) => ({ item, time: parseClock(item.time!) })),
  )
  const final = [...started, ...ordered, ...skipped]
  const plans = timeline(final)
  let n = 0
  return final.map((item, i) => ({ item, plan: plans[i], position: item.visit?.status === 'skipped' ? null : ++n }))
}

/** Ações sobre uma visita do dia: iniciar, pular, remarcar, desmarcar. */
function useVisitActions(date: string) {
  const save = useSaveVisit()
  const remove = useDeleteVisit()
  const navigate = useNavigate()
  const origin = (item: AgendaItem) => ({ plannedDate: item.plannedDate, time: item.time })
  return {
    busy: save.isPending || remove.isPending,
    start: async (item: AgendaItem) => {
      const v = item.visit ? { ...item.visit, status: 'in_progress' as const, checkInAt: nowIso() } : newVisit(item.pool, date, origin(item))
      await save.mutateAsync(v)
      navigate(`/visitas/${v.id}`)
    },
    skip: (item: AgendaItem) =>
      save.mutateAsync(item.visit ? { ...item.visit, status: 'skipped', completedAt: nowIso() } : newVisit(item.pool, date, { ...origin(item), status: 'skipped' })),
    reschedule: (item: AgendaItem, newDate: string, time: string | null) =>
      save.mutateAsync(
        item.visit
          ? { ...item.visit, date: newDate, time, status: 'scheduled', checkInAt: null, completedAt: null }
          : newVisit(item.pool, newDate, { status: 'scheduled', plannedDate: item.plannedDate, time }),
      ),
    cancel: (item: AgendaItem) =>
      item.visit && item.extra
        ? remove.mutateAsync(item.visit.id)
        : save.mutateAsync(item.visit ? { ...item.visit, status: 'canceled' } : newVisit(item.pool, date, { ...origin(item), status: 'canceled' })),
    reopen: (item: AgendaItem) =>
      item.visit ? save.mutateAsync({ ...item.visit, status: 'scheduled', checkInAt: null, completedAt: null }) : Promise.resolve(),
  }
}
type VisitActions = ReturnType<typeof useVisitActions>

export function AgendaPage() {
  const [params, setParams] = useSearchParams()
  const date = params.get('data') ?? today()
  const now = useNow()
  const weekStart = mondayOf(date)

  const clients = useClients()
  const pools = usePools()
  const visits = useVisitsInRange(weekStart, addDays(weekStart, 6))
  const settings = useSettings()
  const savePools = useSavePools()
  const actions = useVisitActions(date)
  const [reordering, setReordering] = useState(false)
  const [menuFor, setMenuFor] = useState<AgendaItem | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)

  const setDate = (next: string) => {
    setReordering(false)
    setHighlight(null)
    setParams(next === today() ? {} : { data: next }, { replace: true })
  }
  const isToday = date === today()
  const error = clients.error ?? pools.error ?? visits.error ?? settings.error
  const ready = Boolean(clients.data && pools.data && visits.data && settings.data)

  const week = useMemo(() => {
    if (!ready) return null
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i)
      const items = buildAgenda(d, clients.data!, pools.data!, visits.data!)
      return { date: d, count: items.length, done: items.filter((x) => x.visit?.status === 'done').length }
    })
  }, [ready, weekStart, clients.data, pools.data, visits.data])

  const agenda = useMemo(
    () => (ready ? buildAgenda(date, clients.data!, pools.data!, visits.data!) : []),
    [ready, date, clients.data, pools.data, visits.data],
  )
  const me = useMyLocation()
  const [focusMe, setFocusMe] = useState(0)
  // A previsão usa a posição real só no dia de hoje.
  const stops = ready ? planDay(agenda, settings.data!, date, now, isToday ? me.point : null) : []
  const progress = agendaProgress(agenda)
  const pendingStops = stops.filter((s) => isPending(s.item))
  const next = isToday ? (stops.find((s) => s.item.visit?.status === 'in_progress') ?? pendingStops[0]) : undefined
  const missingLocation = pendingStops.filter((s) => !pointOf(s.item)).length
  const totalKm = stops.reduce((sum, s) => sum + (s.plan.km ?? 0), 0)
  const last = [...stops].reverse().find((s) => s.item.visit?.status !== 'skipped')
  const route = routeUrl(agenda)

  // Recria os marcadores só quando a ordem ou o estado das paradas muda, não a cada minuto.
  const mapSignature = `${stops.map((s) => `${s.item.key}:${s.position}:${s.item.visit?.status}`).join('|')}#${next?.item.key ?? ''}`
  const mapStops = useMemo<MapStop[]>(
    () =>
      stops.flatMap((s) => {
        const p = pointOf(s.item)
        if (!p) return []
        const st = s.item.visit?.status
        const state: MapStop['state'] = st === 'done' ? 'done' : st === 'skipped' ? 'skipped' : next?.item.key === s.item.key ? 'next' : 'pending'
        return [{ key: s.item.key, point: p, label: s.position ? String(s.position) : '–', title: s.item.client.name, state }]
      }),
    [mapSignature], // oxlint-disable-line react-hooks/exhaustive-deps
  )
  const onSelectStop = useCallback((key: string) => {
    setHighlight(key)
    document.getElementById(`stop-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const persistOrder = (orderedPending: AgendaItem[]) => {
    const changed = reassignRouteOrder(pools.data!, orderedPending.map((i) => i.pool.id))
    if (changed.length) savePools.mutate(changed)
  }
  function optimize() {
    const lastDone = [...stops].reverse().find((s) => s.item.visit && !isPending(s.item) && s.item.visit.status !== 'skipped' && pointOf(s.item))
    const start = lastDone ? pointOf(lastDone.item) : settings.data!.base
    const located = pendingStops.filter((s) => pointOf(s.item))
    const order = optimizeOrder(start, located.map((s) => pointOf(s.item)!))
    persistOrder([...order.map((i) => located[i].item), ...pendingStops.filter((s) => !pointOf(s.item)).map((s) => s.item)])
  }
  function move(key: string, delta: number) {
    const list = pendingStops.map((s) => s.item)
    const i = list.findIndex((x) => x.key === key)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    persistOrder(list)
  }

  const dateLabel = parseIsoDate(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const s = settings.data

  return (
    <>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 first-letter:uppercase">{dateLabel}</p>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            {isToday ? `${greeting(now)}${s?.ownerName ? `, ${s.ownerName.split(' ')[0]}` : ''}` : 'Agenda'}
          </h1>
        </div>
        <ButtonLink to={`/agenda/nova?data=${date}`} size="sm" className="mt-1 shrink-0 lg:hidden"><Plus className="size-4" aria-hidden /> Agendar</ButtonLink>
      </header>

      <WeekStrip week={week} weekStart={weekStart} selected={date} onSelect={setDate} onShift={(d) => setDate(addDays(date, d * 7))} />

      {error ? <ErrorState error={error} /> : !ready ? <Loading /> : agenda.length === 0 ? (
        <EmptyState icon={<CalendarPlus className="size-8" />} title={isToday ? 'Nenhuma visita hoje' : 'Nenhuma visita neste dia'}>
          {clients.data!.length === 0 ? 'Cadastre um cliente e defina os dias de visita.' : 'Agende uma visita avulsa ou defina a agenda fixa dos clientes.'}
          <ButtonLink to={clients.data!.length === 0 ? '/clientes/novo' : `/agenda/nova?data=${date}`} className="mt-4">
            {clients.data!.length === 0 ? 'Cadastrar cliente' : 'Agendar visita'}
          </ButtonLink>
        </EmptyState>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="lg:sticky lg:top-8">
          <section className="mb-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-card">
            <div className="relative z-0 h-56 lg:h-[22rem]">
              <button
                type="button"
                onClick={() => { me.start(); setFocusMe((n) => n + 1) }}
                className={cn('absolute top-3 right-3 z-[500] inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-semibold shadow-card ring-1 ring-slate-200 transition-colors hover:bg-slate-50', me.status === 'on' ? 'text-brand-700' : 'text-slate-700')}
                aria-label="Mostrar minha localização no mapa"
              >
                {me.status === 'asking' ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
                {me.status === 'denied' ? 'Localização bloqueada' : me.status === 'on' ? 'Você' : 'Minha localização'}
              </button>
              <Suspense fallback={<div className="h-full animate-pulse bg-slate-100" />}>
                <RouteMap base={s!.base} stops={mapStops} onSelect={onSelectStop} me={me.point} accuracy={me.accuracy} focusMe={focusMe} />
              </Suspense>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
              <Metric label="Visitas" value={`${progress.done}/${progress.total}`} />
              <Metric label="Percurso" value={totalKm ? formatKm(totalKm) : '—'} />
              <Metric label="Término" value={last ? formatClock(last.plan.departure) : '—'} />
            </div>
          </section>

          {next && <NextCard stop={next} onStart={actions.start} busy={actions.busy} />}
          {isToday && !next && (
            <Card className="mb-4 flex items-center gap-3 bg-emerald-50/60">
              <CheckCircle2 className="size-8 shrink-0 text-emerald-600" aria-hidden />
              <div><p className="font-semibold text-emerald-900">Dia concluído!</p><p className="text-sm text-emerald-800/80">Todas as visitas foram registradas.</p></div>
            </Card>
          )}

          {missingLocation > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
              <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              {missingLocation} cliente(s) sem localização ficam fora do mapa e com previsão estimada.
            </p>
          )}

          </div>
          <div>
          <div className="mt-6 mb-2.5 flex items-center justify-between gap-2 lg:mt-0">
            <h2 className="text-[15px] font-semibold text-slate-800">Ordem de chegada</h2>
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

          <ol className="space-y-2.5">
            {stops.map((stop, i) => (
              <StopCard
                key={stop.item.key}
                stop={stop}
                leaving={i === 0 ? `Saída ${s!.dayStart}${s!.baseLabel ? ` · ${s!.baseLabel}` : ''}` : null}
                highlighted={highlight === stop.item.key}
                reordering={reordering && isPending(stop.item)}
                canUp={pendingStops[0]?.item.key !== stop.item.key}
                canDown={pendingStops.at(-1)?.item.key !== stop.item.key}
                onMove={(d) => move(stop.item.key, d)}
                onStart={() => actions.start(stop.item)}
                onMenu={() => setMenuFor(stop.item)}
                allowStart={date <= today()}
                busy={actions.busy}
              />
            ))}
          </ol>

          {route && (
            <ExternalButton href={route} variant="secondary" className="mt-4 w-full">
              <RouteIcon className="size-4" aria-hidden /> Abrir rota completa no Google Maps
            </ExternalButton>
          )}
          <p className="mt-3 text-center text-xs text-slate-400">
            Previsão com {s!.avgSpeedKmh} km/h de média e {s!.defaultServiceMinutes} min por piscina · <Link to="/mais/ajustes" className="underline">ajustar</Link>
          </p>
          </div>
        </div>
      )}

      {menuFor && <VisitMenu key={menuFor.key} item={menuFor} date={date} onClose={() => setMenuFor(null)} actions={actions} />}
    </>
  )
}

function WeekStrip({ week, weekStart, selected, onSelect, onShift }: {
  week: Array<{ date: string; count: number; done: number }> | null
  weekStart: string
  selected: string
  onSelect: (d: string) => void
  onShift: (d: number) => void
}) {
  const t = today()
  const days = week ?? Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), count: 0, done: 0 }))
  const monthLabel = parseIsoDate(selected).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return (
    <section aria-label="Semana" className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 first-letter:uppercase">{monthLabel}</p>
        <div className="flex items-center gap-1">
          {selected !== t && <button type="button" onClick={() => onSelect(t)} className="mr-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">Hoje</button>}
          <button type="button" aria-label="Semana anterior" onClick={() => onShift(-1)} className="flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><ChevronLeft className="size-5" /></button>
          <button type="button" aria-label="Próxima semana" onClick={() => onShift(1)} className="flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><ChevronRight className="size-5" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const active = d.date === selected
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d.date)}
              aria-pressed={active}
              aria-label={`${parseIsoDate(d.date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })}: ${d.count} visita(s)`}
              className={cn(
                'flex flex-col items-center rounded-2xl border py-2 transition-colors',
                active ? 'border-brand-600 bg-brand-600 text-white shadow-float' : 'border-slate-100 bg-white text-slate-700 shadow-card hover:border-brand-200',
              )}
            >
              <span className={cn('text-[11px] font-medium', active ? 'text-brand-100' : 'text-slate-400')}>{WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
              <span className={cn('mt-0.5 text-lg font-bold tabular-nums', !active && d.date === t && 'text-brand-600')}>{parseIsoDate(d.date).getDate()}</span>
              <span className="mt-1 flex h-1.5 gap-0.5" aria-hidden>
                {Array.from({ length: Math.min(d.count, 4) }, (_, i) => (
                  <span key={i} className={cn('size-1.5 rounded-full', active ? (i < d.done ? 'bg-white' : 'bg-white/50') : i < d.done ? 'bg-emerald-500' : 'bg-brand-300')} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-base font-bold tabular-nums text-slate-800">{value}</p>
    </div>
  )
}

function NextCard({ stop, onStart, busy }: { stop: Stop; onStart: (i: AgendaItem) => void; busy: boolean }) {
  const { item, plan, position } = stop
  const address = [item.client.address, item.client.neighborhood].filter(Boolean).join(', ')
  const point = pointOf(item)
  const inProgress = item.visit?.status === 'in_progress'
  return (
    <section aria-label="Próxima visita" className="mb-4 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-float">
      <div className="flex items-center justify-between text-[13px] font-medium text-brand-100">
        <span>{inProgress ? 'Em atendimento agora' : `Próxima visita · ${position}ª do dia`}</span>
        {!inProgress && (
          <span className="flex items-center gap-1 tabular-nums">
            <Car className="size-4" aria-hidden />{formatDuration(plan.travelMinutes)}{plan.km !== null && ` · ${formatKm(plan.km)}`}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{item.client.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-brand-50"><Waves className="size-3.5 shrink-0" aria-hidden />{item.pool.name} · {formatLiters(item.pool.volumeLiters)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium text-brand-100">{inProgress ? 'saída prevista' : 'chegada'}</p>
          <p className="text-3xl font-bold leading-none tabular-nums">{formatClock(inProgress ? plan.departure : plan.arrival)}</p>
        </div>
      </div>
      {address && <p className="mt-2 flex items-start gap-1 text-sm text-brand-50"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{address}</p>}
      {item.time && <p className="mt-1 flex items-center gap-1 text-sm text-brand-50"><Clock className="size-3.5" aria-hidden />Horário combinado: {item.time}</p>}
      {item.pool.accessNotes && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm"><KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />{item.pool.accessNotes}</p>
      )}
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
        {inProgress
          ? <ButtonLink to={`/visitas/${item.visit!.id}`} variant="light">Continuar visita</ButtonLink>
          : <Button variant="light" onClick={() => onStart(item)} loading={busy}>Cheguei · iniciar</Button>}
        <a href={navigationUrl(point, address)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white/15 px-3.5 text-sm font-semibold hover:bg-white/25">
          <Navigation className="size-4" aria-hidden /> Maps
        </a>
        <a href={navigationUrl(point, address, 'waze')} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl bg-white/15 px-3.5 text-sm font-semibold hover:bg-white/25">Waze</a>
      </div>
    </section>
  )
}

function StopCard({ stop, leaving, highlighted, reordering, canUp, canDown, onMove, onStart, onMenu, allowStart, busy }: {
  stop: Stop; leaving: string | null; highlighted: boolean; reordering: boolean; canUp: boolean; canDown: boolean
  onMove: (d: number) => void; onStart: () => void; onMenu: () => void; allowStart: boolean; busy: boolean
}) {
  const { item, plan, position } = stop
  const v = item.visit
  const done = v?.status === 'done'
  const skipped = v?.status === 'skipped'
  const inProgress = v?.status === 'in_progress'
  return (
    <li id={`stop-${item.key}`}>
      {!skipped && (
        <p className="mb-1.5 flex items-center gap-1.5 pl-1 text-xs text-slate-400">
          <Car className="size-3.5" aria-hidden />
          {leaving ? `${leaving} → ` : ''}{formatDuration(plan.travelMinutes)}{plan.km !== null ? ` · ${formatKm(plan.km)}` : ' · estimado'}
        </p>
      )}
      <div className={cn(
        'rounded-2xl border bg-white p-3.5 shadow-card transition-colors',
        highlighted ? 'border-brand-300 ring-4 ring-brand-100' : 'border-slate-100',
        (done || skipped) && 'bg-slate-50/80',
      )}>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              done ? 'bg-emerald-500 text-white' : inProgress ? 'bg-brand-600 text-white' : skipped ? 'bg-slate-200 text-slate-500' : 'bg-brand-50 text-brand-700',
            )}
            aria-label={position ? `${position}ª visita` : 'não realizada'}
          >
            {done ? <Check className="size-5" strokeWidth={3} /> : (position ?? '–')}
          </span>
          <div className="min-w-0 flex-1">
            <Link to={`/clientes/${item.client.id}`} className={cn('block truncate font-semibold', done || skipped ? 'text-slate-500' : 'text-slate-900')}>{item.client.name}</Link>
            <p className="truncate text-[13px] text-slate-500">{[item.client.neighborhood.split(',')[0], item.pool.name].filter(Boolean).join(' · ')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1 empty:hidden">
              {item.time && <Badge tone="info"><Clock className="size-3" aria-hidden />{item.time}</Badge>}
              {item.extra && <Badge tone="warning">Avulsa</Badge>}
              {item.moved && <Badge tone="warning">Remarcada</Badge>}
              {inProgress && <Badge tone="info">Em andamento</Badge>}
              {skipped && <Badge>Não realizada</Badge>}
              {!pointOf(item) && isPending(item) && <Badge tone="warning">Sem localização</Badge>}
            </div>
          </div>
          {!skipped && (
            <div className="shrink-0 text-right">
              <p className={cn('text-lg font-bold leading-tight tabular-nums', done ? 'text-emerald-600' : 'text-slate-900')}>{formatClock(plan.arrival)}</p>
              <p className="text-[11px] text-slate-400 tabular-nums">{done ? 'chegou' : inProgress ? 'em curso' : `até ${formatClock(plan.departure)}`}</p>
            </div>
          )}
        </div>
        {reordering ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" disabled={!canUp} onClick={() => onMove(-1)} aria-label={`Antes: ${item.client.name}`}><ArrowUp className="size-4" /> Antes</Button>
            <Button variant="secondary" size="sm" disabled={!canDown} onClick={() => onMove(1)} aria-label={`Depois: ${item.client.name}`}><ArrowDown className="size-4" /> Depois</Button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            {isPending(item) ? (
              allowStart
                ? <Button size="sm" variant="secondary" className="flex-1" onClick={onStart} disabled={busy}>Iniciar visita</Button>
                : <span className="flex flex-1 items-center gap-1.5 text-[13px] font-medium text-slate-500"><CalendarClock className="size-4" aria-hidden />Agendada</span>
            ) : (
              <ButtonLink to={`/visitas/${v!.id}`} size="sm" variant="secondary" className="flex-1">
                {done ? 'Ver relatório' : skipped ? 'Ver registro' : 'Continuar visita'}
              </ButtonLink>
            )}
            <Button size="sm" variant="ghost" onClick={onMenu} aria-label={`Mais opções: ${item.client.name}`}><MoreHorizontal className="size-5" /></Button>
          </div>
        )}
      </div>
    </li>
  )
}

function VisitMenu({ item, date, onClose, actions }: { item: AgendaItem; date: string; onClose: () => void; actions: VisitActions }) {
  const [mode, setMode] = useState<'menu' | 'reschedule'>('menu')
  const [newDate, setNewDate] = useState(() => addDays(date, 1))
  const [time, setTime] = useState(item.time ?? '')
  const run = async (p: Promise<unknown>) => {
    await p
    onClose()
  }
  const pending = isPending(item)
  const address = [item.client.address, item.client.neighborhood].filter(Boolean).join(', ')

  return (
    <Sheet open title={item.client.name} onClose={onClose}>
      {mode === 'menu' ? (
        <div className="space-y-1">
          <SheetAction icon={<Navigation className="size-5" />} label="Navegar até o cliente" href={navigationUrl(pointOf(item), address)} />
          {pending && <SheetAction icon={<CalendarClock className="size-5" />} label="Remarcar" hint="Mudar o dia ou o horário só desta visita" onClick={() => setMode('reschedule')} />}
          {pending && <SheetAction icon={<SkipForward className="size-5" />} label="Pular" hint="Fica registrada como não realizada" onClick={() => run(actions.skip(item))} />}
          {pending && (
            <SheetAction icon={<CalendarX className="size-5" />} label="Desmarcar" danger
              hint={item.extra ? 'Remove esta visita avulsa' : 'Tira só esta data da agenda fixa'} onClick={() => run(actions.cancel(item))} />
          )}
          {item.visit?.status === 'skipped' && <SheetAction icon={<Undo2 className="size-5" />} label="Voltar para a agenda" onClick={() => run(actions.reopen(item))} />}
          <SheetAction icon={<Pencil className="size-5" />} label="Editar agenda fixa da piscina" href={`/piscinas/${item.pool.id}/editar`} internal />
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(actions.reschedule(item, newDate, time || null)) }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Novo dia"><Input type="date" required value={newDate} onChange={(e) => setNewDate(e.target.value)} /></Field>
            <Field label="Horário (opcional)"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" loading={actions.busy}>Remarcar visita</Button>
            <Button variant="ghost" onClick={() => setMode('menu')}>Voltar</Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

function SheetAction({ icon, label, hint, onClick, href, internal, danger }: {
  icon: ReactNode; label: string; hint?: string; onClick?: () => void; href?: string; internal?: boolean; danger?: boolean
}) {
  const cls = cn('flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-slate-50', danger ? 'text-rose-600' : 'text-slate-800')
  const body = (
    <>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', danger ? 'bg-rose-50' : 'bg-brand-50 text-brand-600')}>{icon}</span>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-[13px] text-slate-500">{hint}</span>}
      </span>
    </>
  )
  if (href && internal) return <Link to={href} className={cls}>{body}</Link>
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
  return <button type="button" onClick={onClick} className={cls}>{body}</button>
}
