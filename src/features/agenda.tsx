import {
  CalendarClock, CalendarPlus, CalendarX, Car, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  GripVertical, Home, KeyRound, LoaderCircle, LocateFixed, MapPin, MapPinOff, MoreHorizontal, Navigation, Pencil, Plus, Route as RouteIcon, SkipForward, Sparkles, Undo2, Waves,
} from 'lucide-react'
import { type ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { MapStop } from '@/components/route-map'
import { Sheet } from '@/components/sheet'
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, ExternalButton, Field, Input, Loading, Select } from '@/components/ui'
import { newId, nowIso } from '@/data'
import { WEEKDAY_SHORT, addDays, parseIsoDate, today, weekdayOf } from '@/domain/dates'
import { formatLiters } from '@/domain/format'
import {
  type StopInput, type StopPlan, buildTimeline, formatClock, mergeByTime, minutesOfDay, navigationUrl, optimizeOrder, parseClock, type LegFn,
} from '@/domain/route'
import { applyOrder, emptyDayPlan, moveItem } from '@/domain/day-plan'
import { type AgendaItem, agendaProgress, arrangeByProgress, buildAgenda, isPending, routeUrl } from '@/domain/schedule'
import type { Client, DayPlan, GeoPoint, Pool, Settings } from '@/domain/types'
import { newVisit, useClients, useDayPlan, useDeleteVisit, usePools, useSaveDayPlan, useSavePool, useSaveVisit, useSettings, useVisitsInRange } from '@/hooks/data'
import { ClientPicker } from '@/components/client-picker'

import { type DraggableAttributes, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { cn } from '@/lib/cn'
import { formatDuration, formatKm } from '@/lib/geo'
import { useMyLocation } from '@/lib/use-my-location'
import { useRoadLegs, useRoadPath } from '@/lib/road-routing'

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

function toStopInput(item: AgendaItem, settings: Settings, date: string, ignoreTimes = false): StopInput {
  const v = item.visit
  return {
    point: pointOf(item),
    serviceMinutes: item.pool.serviceMinutes ?? settings.defaultServiceMinutes,
    state: !v || v.status === 'scheduled' || v.status === 'canceled' ? 'pending' : v.status,
    startedAt: v ? clockOf(v.checkInAt, date) : null,
    finishedAt: v ? clockOf(v.completedAt, date) : null,
    notBefore: item.time && !ignoreTimes ? parseClock(item.time) : null,
  }
}

interface DayResult {
  stops: Stop[]
  /** Volta para casa no fim do dia, se escolhida. */
  back: { km: number | null; minutes: number; arrival: number } | null
  totals: { km: number; driveMinutes: number; end: number | null }
}

/** De onde sai a primeira ida do dia, conforme o plano e o GPS. */
const startPoint = (plan: DayPlan | null, current: GeoPoint | null) => (plan?.startMode === 'base' ? null : current)

/**
 * Calcula o dia: visitas já feitas na ordem em que aconteceram, depois as pendentes —
 * na ordem salva do dia (se houver) ou na ordem padrão, com as de horário marcado no ponto certo.
 */
interface PlanOptions {
  /** Ordem forçada (ids das piscinas pendentes). */
  order?: string[]
  /** Simula o dia inteiro a partir do horário de saída, sem considerar a hora atual. */
  simulate?: boolean
}

/**
 * Com uma rota montada para o dia, a ordem escolhida manda: horários combinados não
 * seguram a parada esperando (o card avisa quando a chegada fica longe do combinado).
 */
function planDay(items: AgendaItem[], settings: Settings, date: string, now: Date, current: GeoPoint | null, plan: DayPlan | null, leg: LegFn, opts: PlanOptions = {}): DayResult {
  const forceOrder = opts.order
  const ignoreTimes = Boolean(forceOrder?.length || plan?.order.length)
  const dayStart = parseClock(plan?.startTime ?? settings.dayStart)
  const here = startPoint(plan, current)
  const timeline = (list: AgendaItem[]) =>
    buildTimeline({
      base: settings.base,
      dayStart,
      speedKmh: settings.avgSpeedKmh,
      now: date === today() && !opts.simulate ? minutesOfDay(now) : null,
      current: here,
      leg,
      stops: list.map((i) => toStopInput(i, settings, date, ignoreTimes)),
    })
  const arranged = arrangeByProgress(items)
  const started = arranged.filter((i) => !isPending(i) && i.visit?.status !== 'skipped')
  const skipped = arranged.filter((i) => i.visit?.status === 'skipped')
  const pending = arranged.filter(isPending)
  const order = forceOrder ?? plan?.order ?? []
  let ordered: AgendaItem[]
  if (order.length) {
    ordered = applyOrder(pending, order, (i) => i.pool.id)
  } else {
    // Ordem padrão: sem horário seguem a rota; com horário marcado entram no ponto certo do dia.
    const untimed = pending.filter((i) => !i.time)
    const draft = timeline([...started, ...untimed]).slice(started.length)
    ordered = mergeByTime(
      untimed.map((item, i) => ({ item, arrival: draft[i].arrival })),
      pending.filter((i) => i.time).map((item) => ({ item, time: parseClock(item.time!) })),
    )
  }
  const final = [...started, ...ordered, ...skipped]
  const plans = timeline(final)
  let n = 0
  const stops = final.map((item, i) => ({ item, plan: plans[i], position: item.visit?.status === 'skipped' ? null : ++n }))

  const active = stops.filter((st) => st.item.visit?.status !== 'skipped')
  const last = active.at(-1)
  let back: DayResult['back'] = null
  if (plan?.returnToBase && settings.base && last) {
    const lastPoint = [...active].reverse().map((st) => pointOf(st.item)).find(Boolean) ?? null
    const { km, minutes } = leg(lastPoint, settings.base)
    back = { km, minutes, arrival: last.plan.departure + minutes }
  }
  const km = active.reduce((sum, st) => sum + (st.plan.km ?? 0), 0) + (back?.km ?? 0)
  const driveMinutes = active.reduce((sum, st) => sum + st.plan.travelMinutes, 0) + (back?.minutes ?? 0)
  return { stops, back, totals: { km, driveMinutes, end: back?.arrival ?? last?.plan.departure ?? null } }
}

/**
 * Melhor ordem para as pendentes: as com localização pelo caminho mais curto (a partir de onde o
 * dia começa ou da última visita feita), as com horário marcado encaixadas pelo horário e as sem
 * localização no fim.
 */
function bestOrder(result: DayResult, settings: Settings, plan: DayPlan | null, current: GeoPoint | null, leg: LegFn): string[] {
  const pending = result.stops.filter((st) => isPending(st.item))
  const lastDone = [...result.stops].reverse().find((st) => st.item.visit && !isPending(st.item) && st.item.visit.status !== 'skipped' && pointOf(st.item))
  const from = lastDone ? pointOf(lastDone.item) : (startPoint(plan, current) ?? settings.base)
  // Só o caminho importa: menor tempo de carro pelas ruas, independente de horários combinados.
  const located = pending.filter((st) => pointOf(st.item))
  const idx = optimizeOrder(from, located.map((st) => pointOf(st.item)!), (a, b) => leg(a, b).minutes)
  const noPoint = pending.filter((st) => !pointOf(st.item))
  return [...idx.map((i) => located[i]), ...noPoint].map((st) => st.item.pool.id)
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
  const dayPlan = useDayPlan(date)
  const savePlan = useSaveDayPlan()
  const actions = useVisitActions(date)
  const [menuFor, setMenuFor] = useState<AgendaItem | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [planner, setPlanner] = useState(false)
  const [adding, setAdding] = useState(false)

  const setDate = (next: string) => {
    setHighlight(null)
    setParams(next === today() ? {} : { data: next }, { replace: true })
  }
  const isToday = date === today()
  const error = clients.error ?? pools.error ?? visits.error ?? settings.error
  const ready = Boolean(clients.data && pools.data && visits.data && settings.data && !dayPlan.isPending)

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
  const plan = dayPlan.data ?? null
  // A previsão usa a posição real só no dia de hoje.
  // Arredonda o GPS (~100 m) para não recalcular a rota a cada passo.
  const current = useMemo(() => (isToday && me.point ? { lat: Math.round(me.point.lat * 1000) / 1000, lng: Math.round(me.point.lng * 1000) / 1000 } : null), [isToday, me.point])
  const roadPoints = useMemo(
    () => [settings.data?.base, current, ...agenda.map(pointOf)].filter((p): p is GeoPoint => Boolean(p)),
    [settings.data?.base, current, agenda],
  )
  const road = useRoadLegs(roadPoints, settings.data?.avgSpeedKmh ?? 30)
  const leg = road.leg
  const result = ready ? planDay(agenda, settings.data!, date, now, current, plan, leg) : null
  const stops = result?.stops ?? []
  const progress = agendaProgress(agenda)
  const pendingStops = stops.filter((st) => isPending(st.item))
  const next = isToday ? (stops.find((st) => st.item.visit?.status === 'in_progress') ?? pendingStops[0]) : undefined
  const missingLocation = pendingStops.filter((st) => !pointOf(st.item)).length
  const route = routeUrl(agenda)

  const mapSignature = `${stops.map((st) => `${st.item.key}:${st.position}:${st.item.visit?.status}`).join('|')}#${next?.item.key ?? ''}`
  const mapStops = useMemo<MapStop[]>(
    () =>
      stops.flatMap((st) => {
        const p = pointOf(st.item)
        if (!p) return []
        const v = st.item.visit?.status
        const state: MapStop['state'] = v === 'done' ? 'done' : v === 'skipped' ? 'skipped' : next?.item.key === st.item.key ? 'next' : 'pending'
        return [{ key: st.item.key, point: p, label: st.position ? String(st.position) : '–', title: st.item.client.name, state }]
      }),
    [mapSignature], // oxlint-disable-line react-hooks/exhaustive-deps
  )
  // Caminho pelas ruas na ordem do dia (com a volta para casa, se marcada).
  const pathPoints = useMemo(() => {
    const base = settings.data?.base
    const list = stops.filter((st) => st.item.visit?.status !== 'skipped').map((st) => pointOf(st.item)).filter((p): p is GeoPoint => Boolean(p))
    return [...(base ? [base] : []), ...list, ...(base && plan?.returnToBase && list.length ? [base] : [])]
  }, [mapSignature, settings.data?.base, plan?.returnToBase]) // oxlint-disable-line react-hooks/exhaustive-deps
  const roadPath = useRoadPath(pathPoints)
  const onSelectStop = useCallback((key: string) => {
    setHighlight(key)
    document.getElementById(`stop-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  /** Salva o plano do dia com as mudanças (ordem, saída, volta). */
  const updatePlan = (patch: Partial<DayPlan>) =>
    savePlan.mutate({ ...(plan ?? emptyDayPlan(date)), ...patch, id: date, updatedAt: new Date().toISOString() })

  // Arrastar e soltar: mouse no notebook, segurar a alça no celular.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const keys = pendingStops.map((st) => st.item.key)
    const from = keys.indexOf(String(e.active.id))
    const to = keys.indexOf(String(e.over.id))
    if (from < 0 || to < 0) return
    updatePlan({ order: moveItem(pendingStops, from, to).map((st) => st.item.pool.id) })
  }

  const dateLabel = parseIsoDate(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const s = settings.data
  const startLabel = plan?.startMode === 'base' || !current ? (s?.baseLabel || 'Casa') : 'Onde você está'

  return (
    <>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 first-letter:uppercase">{dateLabel}</p>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight lg:text-3xl">
            {isToday ? `${greeting(now)}${s?.ownerName ? `, ${s.ownerName.split(' ')[0]}` : ''}` : 'Agenda'}
          </h1>
        </div>
        <ButtonLink to={`/agenda/nova?data=${date}`} size="sm" className="mt-1 shrink-0 lg:hidden"><Plus className="size-4" aria-hidden /> Agendar</ButtonLink>
      </header>

      <WeekStrip week={week} weekStart={weekStart} selected={date} onSelect={setDate} onShift={(d) => setDate(addDays(date, d * 7))} />

      {error ? <ErrorState error={error} /> : !ready ? <Loading /> : agenda.length === 0 ? (
        <EmptyState icon={<CalendarPlus className="size-8" />} title={isToday ? 'Nenhuma visita hoje' : 'Nenhuma visita neste dia'}>
          {clients.data!.length === 0 ? 'Cadastre um cliente e defina os dias de visita.' : 'Adicione paradas a este dia ou defina a agenda fixa dos clientes.'}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {clients.data!.length === 0
              ? <ButtonLink to="/clientes/novo">Cadastrar cliente</ButtonLink>
              : <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Adicionar parada</Button>}
          </div>
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
                  <RouteMap base={s!.base} stops={mapStops} onSelect={onSelectStop} me={me.point} accuracy={me.accuracy} focusMe={focusMe} loop={Boolean(plan?.returnToBase)} path={roadPath} />
                </Suspense>
              </div>
              <div className="grid grid-cols-4 divide-x divide-slate-100 border-t border-slate-100">
                <Metric label="Visitas" value={`${progress.done}/${progress.total}`} />
                <Metric label="Percurso" value={result!.totals.km ? (result!.totals.km >= 100 ? `${Math.round(result!.totals.km)} km` : formatKm(result!.totals.km)) : '—'} />
                <Metric label="Dirigindo" value={result!.totals.driveMinutes ? formatDuration(result!.totals.driveMinutes) : '—'} />
                <Metric label={result!.back ? 'Em casa' : 'Término'} value={result!.totals.end !== null ? formatClock(result!.totals.end) : '—'} />
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
            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2 lg:mt-0">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-800">Ordem de chegada</h2>
                <p className="text-xs text-slate-500">{plan?.order.length ? 'Rota montada para este dia' : 'Ordem padrão'} · arraste para mudar</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Parada</Button>
                <Button size="sm" onClick={() => setPlanner(true)}><Sparkles className="size-4" aria-hidden /> Montar rota</Button>
              </div>
            </div>

            <p className="mb-1.5 flex items-center gap-1.5 pl-1 text-xs text-slate-500">
              <Home className="size-3.5" aria-hidden /> Saída {plan?.startTime ?? s!.dayStart} · {startLabel}
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={pendingStops.map((st) => st.item.key)} strategy={verticalListSortingStrategy}>
                <ol className="space-y-2.5">
                  {stops.map((stop) => (
                    <SortableStop
                      key={stop.item.key}
                      stop={stop}
                      highlighted={highlight === stop.item.key}
                      onStart={() => actions.start(stop.item)}
                      onMenu={() => setMenuFor(stop.item)}
                      allowStart={date <= today()}
                      busy={actions.busy}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {result!.back && (
              <p className="mt-2.5 flex items-center gap-1.5 pl-1 text-xs text-slate-500">
                <Car className="size-3.5" aria-hidden /> Volta para {s!.baseLabel || 'casa'}: {formatDuration(result!.back.minutes)}{result!.back.km !== null && ` · ${formatKm(result!.back.km)}`} · chega {formatClock(result!.back.arrival)}
              </p>
            )}
            {savePlan.error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{(savePlan.error as Error).message}</p>}

            {route && (
              <ExternalButton href={route} variant="secondary" className="mt-4 w-full">
                <RouteIcon className="size-4" aria-hidden /> Abrir rota completa no Google Maps
              </ExternalButton>
            )}
            <p className="mt-3 text-center text-xs text-slate-400">
              {road.status === 'road' ? 'Tempos e distâncias pelas ruas e estradas' : road.status === 'loading' ? 'Calculando rotas pelas ruas…' : `Sem conexão com o mapa de ruas: estimativa a ${s!.avgSpeedKmh} km/h`} · {s!.defaultServiceMinutes} min por piscina · <Link to="/mais/ajustes" className="underline">ajustar</Link>
            </p>
          </div>
        </div>
      )}

      {menuFor && <VisitMenu key={menuFor.key} item={menuFor} date={date} onClose={() => setMenuFor(null)} actions={actions} />}
      {planner && result && (
        <RoutePlanner
          date={date}
          plan={plan}
          settings={s!}
          hasGps={Boolean(current)}
          current={result}
          compute={(patch, order) => planDay(agenda, s!, date, now, current, { ...(plan ?? emptyDayPlan(date)), ...patch }, leg, { order, simulate: true })}
          best={(patch) => bestOrder(planDay(agenda, s!, date, now, current, { ...(plan ?? emptyDayPlan(date)), ...patch }, leg, { simulate: true }), s!, { ...(plan ?? emptyDayPlan(date)), ...patch }, current, leg)}
          onSave={(patch) => updatePlan(patch)}
          onClose={() => setPlanner(false)}
        />
      )}
      {adding && clients.data && pools.data && (
        <AddStopSheet
          date={date}
          clients={clients.data}
          pools={pools.data}
          busyIds={new Set(agenda.map((i) => i.pool.id))}
          onAdded={(poolId) => { if (plan?.order.length) updatePlan({ order: [...plan.order, poolId] }) }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  )
}

/** Monta a rota do dia: saída, de onde, volta para casa e a melhor ordem comparada com a atual. */
function RoutePlanner({ date, plan, settings, hasGps, current, compute, best, onSave, onClose }: {
  date: string; plan: DayPlan | null; settings: Settings; hasGps: boolean; current: DayResult
  compute: (patch: Partial<DayPlan>, order?: string[]) => DayResult
  best: (patch: Partial<DayPlan>) => string[]
  onSave: (patch: Partial<DayPlan>) => void
  onClose: () => void
}) {
  const [startTime, setStartTime] = useState(plan?.startTime ?? settings.dayStart)
  const [startMode, setStartMode] = useState<DayPlan['startMode']>(plan?.startMode ?? 'auto')
  const [returnToBase, setReturnToBase] = useState(plan?.returnToBase ?? false)
  const patch: Partial<DayPlan> = { startTime: startTime === settings.dayStart ? null : startTime, startMode, returnToBase }
  const nowResult = compute(patch)
  const nowIds = nowResult.stops.filter((st) => isPending(st.item)).map((st) => st.item.pool.id)
  // Horários combinados podem fazer a sugestão sair pior: aí a ordem atual continua sendo a melhor.
  const suggested = best(patch)
  const suggestedResult = compute(patch, suggested)
  const better = suggestedResult.totals.driveMinutes < nowResult.totals.driveMinutes - 0.5 || suggestedResult.totals.km < nowResult.totals.km - 0.5
  const bestIds = better ? suggested : nowIds
  const bestResult = better ? suggestedResult : nowResult
  const savedKm = nowResult.totals.km - bestResult.totals.km
  const savedMin = nowResult.totals.driveMinutes - bestResult.totals.driveMinutes
  const sameOrder = !better
  const timedCount = nowResult.stops.filter((st) => isPending(st.item) && st.item.time).length
  void current
  const label = parseIsoDate(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Sheet open wide title="Montar rota" subtitle={<span className="first-letter:uppercase">{label}</span>} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Saída">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value || settings.dayStart)} />
          </Field>
          <Field label="Começar de">
            <Select value={startMode} onChange={(e) => setStartMode(e.target.value as DayPlan['startMode'])}>
              <option value="auto">{hasGps ? 'Onde estou' : 'Automático'}</option>
              <option value="base">{settings.baseLabel || 'Casa'}</option>
            </Select>
          </Field>
        </div>
        <label className={cn('flex items-center gap-3 rounded-2xl border border-slate-100 p-3.5 text-sm', !settings.base && 'opacity-60')}>
          <input type="checkbox" className="size-5 accent-brand-600" disabled={!settings.base} checked={returnToBase} onChange={(e) => setReturnToBase(e.target.checked)} />
          <span className="flex-1"><span className="block font-semibold">Voltar para {settings.baseLabel || 'casa'} no fim</span>
            <span className="text-slate-500">{settings.base ? 'Soma a volta no percurso e no horário de término.' : 'Defina o ponto de partida em Empresa e roteiro.'}</span></span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <PlanCard title="Ordem atual" result={nowResult} />
          <PlanCard title="Melhor rota" result={bestResult} highlight />
        </div>
        {!sameOrder ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            A melhor rota economiza {[savedKm > 0.05 && formatKm(savedKm), savedMin >= 1 && `${formatDuration(savedMin)} dirigindo`].filter(Boolean).join(' e ')}.
          </p>
        ) : (
          <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">Sua ordem atual já é a melhor rota.</p>
        )}
        {timedCount > 0 && (
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            A sugestão considera só o caminho, sem prender as {timedCount} visita(s) com horário combinado. Se a chegada ficar longe do combinado, o card avisa para você remarcar com o cliente.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => { onSave(patch); onClose() }}>Salvar sem mudar a ordem</Button>
          <Button onClick={() => { onSave({ ...patch, order: bestIds }); onClose() }} disabled={sameOrder}><Sparkles className="size-4" aria-hidden /> Usar a melhor rota</Button>
        </div>
        {plan?.order.length ? (
          <button type="button" className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700" onClick={() => { onSave({ ...patch, order: [] }); onClose() }}>
            Voltar para a ordem padrão
          </button>
        ) : null}
      </div>
    </Sheet>
  )
}

function PlanCard({ title, result, highlight }: { title: string; result: DayResult; highlight?: boolean }) {
  const pending = result.stops.filter((st) => isPending(st.item))
  return (
    <div className={cn('rounded-2xl border p-4', highlight ? 'border-brand-200 bg-brand-50/50' : 'border-slate-100')}>
      <p className={cn('text-sm font-semibold', highlight ? 'text-brand-700' : 'text-slate-600')}>{title}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div><p className="text-[11px] text-slate-500 uppercase">Percurso</p><p className="font-bold tabular-nums">{formatKm(result.totals.km)}</p></div>
        <div><p className="text-[11px] text-slate-500 uppercase">Dirigindo</p><p className="font-bold tabular-nums">{formatDuration(result.totals.driveMinutes)}</p></div>
        <div><p className="text-[11px] text-slate-500 uppercase">Termina</p><p className="font-bold tabular-nums">{result.totals.end !== null ? formatClock(result.totals.end) : '—'}</p></div>
      </div>
      <ol className="mt-3 space-y-1 text-sm">
        {pending.map((st) => (
          <li key={st.item.key} className="flex items-center gap-2">
            <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', highlight ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600')}>{st.position}</span>
            <span className="min-w-0 flex-1 truncate">{st.item.client.name}</span>
            <span className="text-xs text-slate-500 tabular-nums">{formatClock(st.plan.arrival)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Adiciona uma parada a este dia sem sair da agenda. */
function AddStopSheet({ date, clients, pools, busyIds, onAdded, onClose }: {
  date: string; clients: Client[]; pools: Pool[]; busyIds: Set<string>; onAdded: (poolId: string) => void; onClose: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [poolId, setPoolId] = useState('')
  const [time, setTime] = useState('')
  const saveVisit = useSaveVisit()
  const savePool = useSavePool()
  const clientPools = pools.filter((p) => p.clientId === clientId)
  const pool = clientPools.find((p) => p.id === poolId) ?? clientPools[0]
  const already = pool ? busyIds.has(pool.id) : false

  async function add() {
    if (!clientId) return
    let target = pool
    if (!target) {
      // Cliente sem piscina: cria a "Principal" para poder agendar.
      target = {
        id: newId(), clientId, name: 'Principal', volumeLiters: 0, type: 'vinil', sanitizer: 'cloro', equipment: '', accessNotes: '',
        recurrence: 'none', visitDays: [], monthDays: [], anchorDate: null, preferredTime: null,
        routeOrder: Math.max(0, ...pools.map((p) => p.routeOrder)) + 1, serviceMinutes: null, createdAt: new Date().toISOString(),
      }
      await savePool.mutateAsync(target)
    }
    await saveVisit.mutateAsync(newVisit(target, date, { status: 'scheduled', time: time || null }))
    onAdded(target.id)
    onClose()
  }

  return (
    <Sheet open title="Adicionar parada" subtitle={<span className="first-letter:uppercase">{parseIsoDate(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>} onClose={onClose}>
      <div className="space-y-4 pb-2">
        <ClientPicker clients={clients} value={clientId} onChange={(id) => { setClientId(id); setPoolId('') }} poolCount={(id) => pools.filter((p) => p.clientId === id).length} />
        {clientPools.length > 1 && (
          <Field label="Piscina">
            <Select value={pool?.id ?? ''} onChange={(e) => setPoolId(e.target.value)}>
              {clientPools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Horário combinado (opcional)"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        {already && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Esta piscina já está na agenda deste dia.</p>}
        <Button className="h-12 w-full" disabled={!clientId || already} loading={saveVisit.isPending || savePool.isPending} onClick={add}>
          <Plus className="size-4" aria-hidden /> Adicionar ao dia
        </Button>
      </div>
    </Sheet>
  )
}

/** Visita da lista: pendentes podem ser arrastadas. */
function SortableStop(props: Omit<StopCardProps, 'drag'>) {
  const pending = isPending(props.stop.item)
  const sortable = useSortable({ id: props.stop.item.key, disabled: !pending })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
  return (
    <li ref={sortable.setNodeRef} style={style} id={`stop-${props.stop.item.key}`} className={cn('relative', sortable.isDragging && 'z-20')}>
      <StopCard {...props} drag={pending ? { attributes: sortable.attributes, listeners: sortable.listeners, dragging: sortable.isDragging } : null} />
    </li>
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
    <div className="min-w-0 px-1.5 py-2.5 text-center sm:px-3">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px]">{label}</p>
      <p className="whitespace-nowrap text-[15px] font-bold tabular-nums text-slate-800 sm:text-base">{value}</p>
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
          : <Button variant="light" onClick={() => onStart(item)} loading={busy} className="whitespace-nowrap">Cheguei</Button>}
        <a href={navigationUrl(point, address)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white/15 px-3.5 text-sm font-semibold hover:bg-white/25">
          <Navigation className="size-4" aria-hidden /> Maps
        </a>
        <a href={navigationUrl(point, address, 'waze')} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl bg-white/15 px-3.5 text-sm font-semibold hover:bg-white/25">Waze</a>
      </div>
    </section>
  )
}

interface StopCardProps {
  stop: Stop; highlighted: boolean; onStart: () => void; onMenu: () => void; allowStart: boolean; busy: boolean
  drag: { attributes: DraggableAttributes; listeners: SyntheticListenerMap | undefined; dragging: boolean } | null
}

function StopCard({ stop, highlighted, onStart, onMenu, allowStart, busy, drag }: StopCardProps) {
  const { item, plan, position } = stop
  const v = item.visit
  const done = v?.status === 'done'
  const skipped = v?.status === 'skipped'
  const inProgress = v?.status === 'in_progress'
  const leaving = plan.travelMinutes > 0 ? formatClock(plan.arrival - plan.travelMinutes) : null
  return (
    <>
      {!skipped && (
        <p className="mb-1.5 flex items-center gap-1.5 pl-1 text-xs text-slate-400">
          <Car className="size-3.5" aria-hidden />
          {leaving ? `sai ${leaving} · ` : ''}{formatDuration(plan.travelMinutes)}{plan.km !== null ? ` · ${formatKm(plan.km)}` : ' · estimado'}
        </p>
      )}
      <div className={cn(
        'rounded-2xl border bg-white p-3.5 shadow-card transition-[colors,box-shadow]',
        drag?.dragging && 'shadow-float ring-2 ring-brand-300',
        highlighted ? 'border-brand-300 ring-4 ring-brand-100' : 'border-slate-100',
        (done || skipped) && 'bg-slate-50/80',
      )}>
        <div className="flex items-start gap-3">
          {drag && (
            <button
              type="button"
              className="-ml-1.5 flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-300 hover:bg-slate-50 hover:text-slate-500 active:cursor-grabbing"
              aria-label={`Arrastar para mudar a ordem: ${item.client.name}`}
              {...drag.attributes}
              {...drag.listeners}
            >
              <GripVertical className="size-5" aria-hidden />
            </button>
          )}
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
              {item.time && (Math.abs(plan.arrival - parseClock(item.time)) > 20 && isPending(item)
                ? <Badge tone="warning"><Clock className="size-3" aria-hidden />Combinado {item.time}</Badge>
                : <Badge tone="info"><Clock className="size-3" aria-hidden />{item.time}</Badge>)}
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
        {(
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
    </>
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
