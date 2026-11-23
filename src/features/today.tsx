import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Navigation, Waves } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, ExternalButton, Loading, PageHeader } from '@/components/ui'
import { addDays, parseIsoDate, today } from '@/domain/dates'
import { formatLiters } from '@/domain/format'
import { type AgendaItem, agendaProgress, buildAgenda, routeUrl } from '@/domain/schedule'
import { emptyVisit, useClients, usePools, useSaveVisit, useVisitsByDate } from '@/hooks/data'

export function TodayPage() {
  const [params, setParams] = useSearchParams()
  const date = params.get('data') ?? today()
  const clients = useClients()
  const pools = usePools()
  const visits = useVisitsByDate(date)

  const setDate = (next: string) => setParams(next === today() ? {} : { data: next }, { replace: true })
  const isToday = date === today()
  const label = parseIsoDate(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const error = clients.error ?? pools.error ?? visits.error
  const loading = clients.isPending || pools.isPending || visits.isPending
  const agenda = loading || error ? [] : buildAgenda(date, clients.data!, pools.data!, visits.data!)
  const progress = agendaProgress(agenda)
  const route = routeUrl(agenda)

  return (
    <>
      <PageHeader title={isToday ? 'Hoje' : 'Agenda'} subtitle={<span className="inline-block first-letter:uppercase">{label}</span>} />

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Dia anterior">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDate(today())} disabled={isToday}>
          Hoje
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="Próximo dia">
          <ChevronRight className="size-4" />
        </Button>
        <input
          type="date"
          aria-label="Escolher data"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="ml-auto h-9 rounded-xl bg-white px-2 text-sm ring-1 ring-slate-300"
        />
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : loading ? (
        <Loading />
      ) : agenda.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-9" />} title="Nenhuma visita neste dia">
          {clients.data!.length === 0 ? (
            <ButtonLink to="/clientes/novo" className="mt-4">Cadastrar primeiro cliente</ButtonLink>
          ) : (
            'Defina os dias de visita na piscina de cada cliente.'
          )}
        </EmptyState>
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {progress.done} de {progress.total} concluídas
              </span>
              <span className="text-slate-500">{progress.remaining} restantes</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done + progress.skipped}>
              <div
                className="h-full rounded-full bg-cyan-600 transition-[width]"
                style={{ width: `${((progress.done + progress.skipped) / progress.total) * 100}%` }}
              />
            </div>
            {route && (
              <ExternalButton href={route} variant="secondary" size="sm" className="mt-3 w-full">
                <Navigation className="size-4" aria-hidden /> Abrir rota no Google Maps
              </ExternalButton>
            )}
          </Card>
          <ol className="space-y-3">
            {agenda.map((item, index) => (
              <AgendaCard key={item.pool.id} item={item} position={index + 1} date={date} />
            ))}
          </ol>
        </>
      )}
    </>
  )
}

function AgendaCard({ item, position, date }: { item: AgendaItem; position: number; date: string }) {
  const { pool, client, visit } = item
  const save = useSaveVisit()
  const navigate = useNavigate()
  const address = [client.address, client.neighborhood].filter(Boolean).join(', ')

  const start = async () => {
    const created = await save.mutateAsync(emptyVisit(pool, date))
    navigate(`/visitas/${created.id}`)
  }
  const skip = () => save.mutate(emptyVisit(pool, date, 'skipped'))

  return (
    <li>
      <Card className={visit?.status === 'done' || visit?.status === 'skipped' ? 'opacity-70' : undefined}>
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-sm font-semibold text-cyan-800">
            {position}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{client.name}</p>
              {visit?.status === 'done' && <Badge tone="success">Concluída</Badge>}
              {visit?.status === 'in_progress' && <Badge tone="info">Em andamento</Badge>}
              {visit?.status === 'skipped' && <Badge>Não realizada</Badge>}
              {item.extra && <Badge tone="warning">Avulsa</Badge>}
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-600">
              <Waves className="size-3.5 shrink-0" aria-hidden /> {pool.name} · {formatLiters(pool.volumeLiters)}
            </p>
            {address && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                <MapPin className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{address}</span>
              </p>
            )}
            {pool.accessNotes && <p className="mt-1 text-xs text-amber-800">Acesso: {pool.accessNotes}</p>}
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {!visit && (
            <>
              <Button className="flex-1" onClick={start} loading={save.isPending}>Iniciar visita</Button>
              <Button variant="ghost" onClick={skip} disabled={save.isPending}>Pular</Button>
            </>
          )}
          {visit?.status === 'in_progress' && <ButtonLink to={`/visitas/${visit.id}`} className="flex-1">Continuar visita</ButtonLink>}
          {(visit?.status === 'done' || visit?.status === 'skipped') && (
            <ButtonLink to={`/visitas/${visit.id}`} variant="secondary" className="flex-1">
              {visit.status === 'done' ? 'Ver relatório' : 'Ver registro'}
            </ButtonLink>
          )}
        </div>
      </Card>
    </li>
  )
}
