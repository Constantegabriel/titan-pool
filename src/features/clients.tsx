import { CalendarPlus, ChevronRight, MapPin, Pencil, Phone, Plus, Repeat, Search, ShoppingCart, Trash2, Users, Waves } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AddressField } from '@/components/address-field'
import {
  Avatar, Badge, Button, ButtonLink, Card, EmptyState, ErrorState, ExternalButton, Field, Input, Loading, PageHeader, SectionTitle, Textarea,
} from '@/components/ui'
import { newId, nowIso } from '@/data'
import { chargeState } from '@/domain/billing'
import { parseIsoDate, today } from '@/domain/dates'
import { centsToInput, formatLiters, formatMoney, formatPeriod, parseMoney, whatsappLink } from '@/domain/format'
import type { Client } from '@/domain/types'
import { useChargesByClient, useClients, useDeleteClient, usePools, useSaveClient, useSettings, useVisitsByClient } from '@/hooks/data'
import { describeRecurrence, hasRecurrence, nextOccurrence } from '@/domain/recurrence'
import type { Pool } from '@/domain/types'

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function ClientsPage() {
  const clients = useClients()
  const pools = usePools()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return (clients.data ?? [])
      .filter((c) => !q || normalize(`${c.name} ${c.neighborhood} ${c.address} ${c.phone}`).includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [clients.data, query])

  const poolCount = (id: string) => pools.data?.filter((p) => p.clientId === id).length ?? 0

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={clients.data ? `${clients.data.filter((c) => c.active).length} ativos` : undefined}
        action={<ButtonLink to="/clientes/novo" size="sm"><Plus className="size-4" aria-hidden /> Novo</ButtonLink>}
      />
      {clients.error ? (
        <ErrorState error={clients.error} />
      ) : clients.isPending ? (
        <Loading />
      ) : clients.data.length === 0 ? (
        <EmptyState icon={<Users className="size-9" />} title="Nenhum cliente ainda">
          Cadastre clientes, as piscinas deles e os dias de visita.
        </EmptyState>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-3 left-3 size-5 text-slate-400" aria-hidden />
            <Input className="pl-10" placeholder="Buscar por nome, bairro ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar clientes" />
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-card">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link to={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{c.name}</span>
                      {!c.active && <Badge>Inativo</Badge>}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {[c.neighborhood, `${poolCount(c.id)} piscina(s)`, c.monthlyFeeCents ? formatMoney(c.monthlyFeeCents) : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nenhum cliente encontrado.</li>}
          </ul>
        </>
      )}
    </>
  )
}

const blankClient = (): Client => ({
  id: newId(), name: '', phone: '', address: '', neighborhood: '', notes: '', monthlyFeeCents: 0, billingDay: 10, active: true, lat: null, lng: null, createdAt: nowIso(),
})

export function ClientFormPage() {
  const { clientId } = useParams()
  const clients = useClients()
  if (clientId && clients.isPending) return <Loading />
  const existing = clientId ? clients.data?.find((c) => c.id === clientId) : undefined
  if (clientId && !existing) return <ErrorState error={new Error('Cliente não encontrado.')} />
  return <ClientForm initial={existing ?? blankClient()} isNew={!existing} />
}

function ClientForm({ initial, isNew }: { initial: Client; isNew: boolean }) {
  const [client, setClient] = useState(initial)
  const [fee, setFee] = useState(centsToInput(initial.monthlyFeeCents))
  const settings = useSettings()
  const save = useSaveClient()
  const navigate = useNavigate()
  const set = <K extends keyof Client>(key: K, value: Client[K]) => setClient((c) => ({ ...c, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    await save.mutateAsync({ ...client, name: client.name.trim(), monthlyFeeCents: parseMoney(fee) })
    navigate(isNew ? `/clientes/${client.id}/piscinas/nova` : `/clientes/${client.id}`, { replace: true })
  }

  return (
    <>
      <PageHeader title={isNew ? 'Novo cliente' : 'Editar cliente'} back={isNew ? '/clientes' : `/clientes/${client.id}`} />
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Nome">
            <Input required maxLength={120} autoComplete="off" value={client.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="WhatsApp / telefone">
            <Input type="tel" inputMode="tel" placeholder="(11) 98888-7777" value={client.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </Card>
        <SectionTitle>Endereço da piscina</SectionTitle>
        <Card>
          <AddressField
            near={settings.data?.base}
            value={{ address: client.address, area: client.neighborhood, point: client.lat !== null && client.lng !== null ? { lat: client.lat, lng: client.lng } : null }}
            onChange={(p) => setClient((c) => ({
              ...c,
              ...(p.address !== undefined && { address: p.address }),
              ...(p.area !== undefined && { neighborhood: p.area }),
              ...(p.point !== undefined && { lat: p.point?.lat ?? null, lng: p.point?.lng ?? null }),
            }))}
          />
        </Card>
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mensalidade (R$)">
              <Input inputMode="decimal" placeholder="0,00" value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
            <Field label="Dia do vencimento">
              <Input type="number" min={1} max={28} required value={client.billingDay} onChange={(e) => set('billingDay', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea value={client.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="size-5 accent-brand-700" checked={client.active} onChange={(e) => set('active', e.target.checked)} />
            Cliente ativo (entra na agenda e na cobrança)
          </label>
        </Card>
        {save.error && <ErrorState error={save.error} />}
        <Button type="submit" className="w-full" loading={save.isPending}>
          {isNew ? 'Salvar e cadastrar piscina' : 'Salvar'}
        </Button>
      </form>
    </>
  )
}

export function ClientDetailPage() {
  const { clientId = '' } = useParams()
  const clients = useClients()
  const pools = usePools()
  const visits = useVisitsByClient(clientId)
  const charges = useChargesByClient(clientId)
  const remove = useDeleteClient()
  const navigate = useNavigate()

  if (clients.isPending || pools.isPending) return <Loading />
  if (clients.error) return <ErrorState error={clients.error} />
  const client = clients.data.find((c) => c.id === clientId)
  if (!client) return <ErrorState error={new Error('Cliente não encontrado.')} />
  const clientPools = (pools.data ?? []).filter((p) => p.clientId === clientId)
  const history = (visits.data ?? []).filter((v) => v.status === 'done' || v.status === 'skipped' || v.status === 'in_progress')
  const address = [client.address, client.neighborhood].filter(Boolean).join(', ')

  async function onDelete() {
    if (!confirm(`Excluir ${client!.name} com piscinas, visitas e cobranças? Esta ação não pode ser desfeita.`)) return
    await remove.mutateAsync(client!.id)
    navigate('/clientes', { replace: true })
  }

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={client.active ? (client.monthlyFeeCents ? `${formatMoney(client.monthlyFeeCents)}/mês · vence dia ${client.billingDay}` : 'Sem mensalidade') : 'Inativo'}
        back="/clientes"
        action={<ButtonLink to={`/clientes/${client.id}/editar`} variant="secondary" size="sm" aria-label="Editar cliente"><Pencil className="size-4" /></ButtonLink>}
      />

      <div className="grid grid-cols-2 gap-2">
        {client.phone && (
          <>
            <ExternalButton href={whatsappLink(client.phone, `Olá, ${client.name.split(' ')[0]}!`)} variant="whatsapp">WhatsApp</ExternalButton>
            <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium border border-slate-200">
              <Phone className="size-4" aria-hidden /> Ligar
            </a>
          </>
        )}
        {address && (
          <ExternalButton
            href={client.lat !== null && client.lng !== null ? `https://www.google.com/maps/search/?api=1&query=${client.lat},${client.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            variant="secondary"
            className="col-span-2"
          >
            <MapPin className="size-4 shrink-0" aria-hidden /> <span className="truncate">{address}</span>
          </ExternalButton>
        )}
        {client.lat === null && (
          <Link to={`/clientes/${client.id}/editar`} className="col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-900">
            Sem localização no mapa — toque para definir e ter previsões exatas
          </Link>
        )}
        <ButtonLink to={`/compras/nova?cliente=${client.id}`} variant="secondary" className="col-span-2">
          <ShoppingCart className="size-4" aria-hidden /> Fazer pedido de compra para este cliente
        </ButtonLink>
      </div>
      {client.notes && <Card className="mt-3 text-sm whitespace-pre-line text-slate-700">{client.notes}</Card>}

      <SectionTitle action={<ButtonLink to={`/clientes/${client.id}/piscinas/nova`} variant="ghost" size="sm"><Plus className="size-4" aria-hidden /> Piscina</ButtonLink>}>
        Piscinas
      </SectionTitle>
      {clientPools.length === 0 ? (
        <EmptyState icon={<Waves className="size-8" />} title="Nenhuma piscina cadastrada" />
      ) : (
        <ul className="space-y-3">
          {clientPools.map((pool) => (
            <li key={pool.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{pool.name}</p>
                    <p className="text-sm text-slate-600">
                      {formatLiters(pool.volumeLiters)} · {pool.type} · {pool.sanitizer === 'sal' ? 'cloração salina' : 'cloro'}
                    </p>
                  </div>
                  <ButtonLink to={`/piscinas/${pool.id}/editar`} variant="ghost" size="sm" aria-label={`Editar ${pool.name}`}><Pencil className="size-4" /></ButtonLink>
                </div>
                <PoolSchedule pool={pool} />
                {pool.equipment && <p className="mt-2 text-sm text-slate-600">Equipamentos: {pool.equipment}</p>}
                <ButtonLink to={`/agenda/nova?piscina=${pool.id}`} variant="secondary" size="sm" className="mt-3 w-full">
                  <CalendarPlus className="size-4" aria-hidden /> Agendar visita
                </ButtonLink>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Últimas visitas</SectionTitle>
      {visits.isPending ? <Loading /> : history.length ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-card">
          {history.map((v) => (
            <li key={v.id}>
              <Link to={`/visitas/${v.id}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50">
                <span>
                  {parseIsoDate(v.date).toLocaleDateString('pt-BR')} · {clientPools.find((p) => p.id === v.poolId)?.name ?? 'Piscina'}
                </span>
                {v.status === 'done' ? <Badge tone="success">Concluída</Badge> : v.status === 'skipped' ? <Badge>Não realizada</Badge> : v.status === 'scheduled' ? <Badge tone="info">Agendada</Badge> : v.status === 'canceled' ? <Badge>Desmarcada</Badge> : <Badge tone="info">Em andamento</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">Nenhuma visita registrada.</p>}

      <SectionTitle>Cobranças</SectionTitle>
      {charges.isPending ? <Loading /> : charges.data?.length ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-card">
          {charges.data.map((c) => {
            const state = chargeState(c, today())
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="inline-block first-letter:uppercase">{formatPeriod(c.period)} · {formatMoney(c.amountCents)}</span>
                <Badge tone={state === 'paid' ? 'success' : state === 'overdue' ? 'danger' : 'warning'}>
                  {state === 'paid' ? 'Pago' : state === 'overdue' ? 'Atrasado' : 'Em aberto'}
                </Badge>
              </li>
            )
          })}
        </ul>
      ) : <p className="text-sm text-slate-500">Nenhuma cobrança gerada.</p>}

      <Button variant="danger" className="mt-8 w-full" onClick={onDelete} loading={remove.isPending}>
        <Trash2 className="size-4" aria-hidden /> Excluir cliente
      </Button>
    </>
  )
}

function PoolSchedule({ pool }: { pool: Pool }) {
  if (!hasRecurrence(pool)) return <p className="mt-2 text-sm text-slate-500">Sem agenda fixa · visitas avulsas</p>
  const next = nextOccurrence(pool, today())
  return (
    <div className="mt-2 rounded-xl bg-brand-50/70 px-3 py-2 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-brand-800"><Repeat className="size-4" aria-hidden />{describeRecurrence(pool, pool.preferredTime)}</p>
      {next && (
        <p className="mt-0.5 text-brand-700/80">
          Próxima: {next === today() ? 'hoje' : parseIsoDate(next).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
        </p>
      )}
    </div>
  )
}
