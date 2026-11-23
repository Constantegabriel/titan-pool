import { CalendarCheck, Repeat } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RecurrenceEditor, type RecurrenceValue } from '@/components/recurrence-editor'
import { Button, Card, ErrorState, Field, Input, Loading, PageHeader, Segmented, Select } from '@/components/ui'
import { parseIsoDate, today } from '@/domain/dates'
import { describeRecurrence, hasRecurrence, nextOccurrence } from '@/domain/recurrence'
import type { Pool } from '@/domain/types'
import { newVisit, useClients, usePools, useSavePool, useSaveVisit } from '@/hooks/data'

type Kind = 'once' | 'recurring'

/** Agendar visita: única (um dia, com horário opcional) ou fixa (repete toda semana, a cada 2 semanas ou todo mês). */
export function ScheduleVisitPage() {
  const [params] = useSearchParams()
  const clients = useClients()
  const pools = usePools()
  if (clients.isPending || pools.isPending) return <Loading />
  if (clients.error ?? pools.error) return <ErrorState error={clients.error ?? pools.error} />
  return (
    <ScheduleForm
      clients={clients.data!.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))}
      pools={pools.data!}
      initialDate={params.get('data') ?? today()}
      initialClient={params.get('cliente')}
      initialPool={params.get('piscina')}
      initialKind={params.get('tipo') === 'fixa' ? 'recurring' : 'once'}
    />
  )
}

function ScheduleForm({ clients, pools, initialDate, initialClient, initialPool, initialKind }: {
  clients: Array<{ id: string; name: string }>; pools: Pool[]; initialDate: string; initialClient: string | null; initialPool: string | null; initialKind: Kind
}) {
  const navigate = useNavigate()
  const saveVisit = useSaveVisit()
  const savePool = useSavePool()
  const startPool = initialPool ? pools.find((p) => p.id === initialPool) : undefined
  const [clientId, setClientId] = useState(startPool?.clientId ?? initialClient ?? '')
  const clientPools = useMemo(() => pools.filter((p) => p.clientId === clientId), [pools, clientId])
  const [poolId, setPoolId] = useState(startPool?.id ?? '')
  const pool = clientPools.find((p) => p.id === poolId) ?? clientPools[0]
  const [kind, setKind] = useState<Kind>(initialKind)
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState('')
  const [rule, setRule] = useState<RecurrenceValue | null>(null)

  const currentRule: RecurrenceValue = rule ?? (pool
    ? {
        recurrence: pool.recurrence === 'none' ? 'weekly' : pool.recurrence,
        visitDays: pool.visitDays.length ? pool.visitDays : [parseIsoDate(date).getDay() as Pool['visitDays'][number]],
        monthDays: pool.monthDays.length ? pool.monthDays : [parseIsoDate(date).getDate()],
        anchorDate: pool.anchorDate ?? date,
        preferredTime: pool.preferredTime,
      }
    : { recurrence: 'weekly', visitDays: [], monthDays: [], anchorDate: date, preferredTime: null })

  const valid = Boolean(pool) && (kind === 'once' ? Boolean(date) : hasRecurrence(currentRule))
  const busy = saveVisit.isPending || savePool.isPending

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!pool) return
    if (kind === 'once') {
      await saveVisit.mutateAsync(newVisit(pool, date, { status: 'scheduled', time: time || null }))
      navigate(date === today() ? '/' : `/?data=${date}`, { replace: true })
    } else {
      const anchor = currentRule.recurrence === 'biweekly' ? (currentRule.anchorDate ?? date) : null
      await savePool.mutateAsync({ ...pool, ...currentRule, anchorDate: anchor })
      const first = nextOccurrence(currentRule, today())
      navigate(!first || first === today() ? '/' : `/?data=${first}`, { replace: true })
    }
  }

  return (
    <>
      <PageHeader title="Agendar visita" back={`/?data=${initialDate}`} />
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Cliente">
            <Select required value={clientId} onChange={(e) => { setClientId(e.target.value); setPoolId(''); setRule(null) }}>
              <option value="" disabled>Escolha o cliente</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {clientId && clientPools.length === 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              Este cliente ainda não tem piscina cadastrada. <Link className="font-semibold underline" to={`/clientes/${clientId}/piscinas/nova`}>Cadastrar piscina</Link>
            </p>
          )}
          {clientPools.length > 1 && (
            <Field label="Piscina">
              <Select value={pool?.id ?? ''} onChange={(e) => { setPoolId(e.target.value); setRule(null) }}>
                {clientPools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          )}
          {pool && hasRecurrence(pool) && (
            <p className="flex items-center gap-2 text-sm text-slate-600"><Repeat className="size-4 text-brand-600" aria-hidden />Agenda atual: {describeRecurrence(pool, pool.preferredTime)}</p>
          )}
        </Card>

        <Segmented label="Tipo de visita" value={kind} onChange={setKind} options={[{ value: 'once', label: 'Visita única' }, { value: 'recurring', label: 'Visita fixa (repete)' }]} />

        {kind === 'once' ? (
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia"><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Horário (opcional)"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            </div>
            <p className="flex items-center gap-2 text-sm text-slate-500"><CalendarCheck className="size-4" aria-hidden />Entra na agenda do dia como visita avulsa.</p>
          </Card>
        ) : (
          <Card>
            <RecurrenceEditor value={currentRule} onChange={setRule} />
            {pool && hasRecurrence(pool) && <p className="mt-3 text-xs text-slate-500">Substitui a agenda fixa atual desta piscina. Visitas já registradas não mudam.</p>}
          </Card>
        )}

        {(saveVisit.error ?? savePool.error) && <ErrorState error={saveVisit.error ?? savePool.error} />}
        <Button type="submit" className="h-12 w-full text-base" disabled={!valid} loading={busy}>
          {kind === 'once' ? 'Agendar visita' : 'Salvar agenda fixa'}
        </Button>
      </form>
    </>
  )
}
