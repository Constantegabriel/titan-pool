import { ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, ErrorState, ExternalButton, Loading, PageHeader } from '@/components/ui'
import { nowIso } from '@/data'
import { chargeState, chargesToCreate, summarize } from '@/domain/billing'
import { parseIsoDate, periodOf, shiftPeriod, today } from '@/domain/dates'
import { formatMoney, formatPeriod, whatsappLink } from '@/domain/format'
import { chargeReminderMessage } from '@/domain/messages'
import type { Charge, Client } from '@/domain/types'
import { useChargesByPeriod, useClients, useGenerateCharges, useSaveCharge } from '@/hooks/data'

const STATE_ORDER = { overdue: 0, open: 1, paid: 2 } as const

export function BillingPage() {
  const [params, setParams] = useSearchParams()
  const period = params.get('mes') ?? periodOf(today())
  const setPeriod = (next: string) => setParams(next === periodOf(today()) ? {} : { mes: next }, { replace: true })
  const clients = useClients()
  const charges = useChargesByPeriod(period)
  const generate = useGenerateCharges()

  const error = clients.error ?? charges.error
  if (error) return <ErrorState error={error} />

  const on = today()
  const clientById = new Map((clients.data ?? []).map((c) => [c.id, c]))
  const list = [...(charges.data ?? [])].sort(
    (a, b) => STATE_ORDER[chargeState(a, on)] - STATE_ORDER[chargeState(b, on)] || a.dueDate.localeCompare(b.dueDate),
  )
  const summary = summarize(list, on)
  const pendingDrafts = clients.data && charges.data ? chargesToCreate(period, clients.data, charges.data).length : 0

  return (
    <>
      <PageHeader title="Cobrança" subtitle={<span className="inline-block first-letter:uppercase">{formatPeriod(period)}</span>} />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="sm" aria-label="Mês anterior" onClick={() => setPeriod(shiftPeriod(period, -1))}><ChevronLeft className="size-4" /></Button>
        <Button variant="secondary" size="sm" disabled={period === periodOf(on)} onClick={() => setPeriod(periodOf(on))}>Mês atual</Button>
        <Button variant="secondary" size="sm" aria-label="Próximo mês" onClick={() => setPeriod(shiftPeriod(period, 1))}><ChevronRight className="size-4" /></Button>
      </div>

      {clients.isPending || charges.isPending ? <Loading /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Stat label="Recebido" value={formatMoney(summary.receivedCents)} tone="text-emerald-700" />
            <Stat label="A receber" value={formatMoney(summary.openCents)} tone="text-slate-900" />
            <Stat label="Atrasado" value={formatMoney(summary.overdueCents)} tone={summary.overdueCents ? 'text-rose-700' : 'text-slate-900'} />
            <Stat label="Total do mês" value={formatMoney(summary.expectedCents)} tone="text-slate-900" />
          </div>

          {pendingDrafts > 0 && (
            <Card className="mb-4 bg-cyan-50 ring-cyan-200">
              <p className="text-sm text-cyan-950">
                {pendingDrafts} cliente(s) ativo(s) ainda sem cobrança em {formatPeriod(period)}.
              </p>
              <Button className="mt-3 w-full" loading={generate.isPending} onClick={() => generate.mutate({ period, clients: clients.data! })}>
                Gerar cobranças do mês
              </Button>
              {generate.error && <p className="mt-2 text-sm text-rose-700">Não foi possível gerar as cobranças.</p>}
            </Card>
          )}

          {list.length === 0 ? (
            <EmptyState icon={<ReceiptText className="size-9" />} title="Nenhuma cobrança neste mês">
              {pendingDrafts === 0 && 'Cadastre a mensalidade dos clientes para gerar cobranças.'}
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {list.map((charge) => {
                const client = clientById.get(charge.clientId)
                return client ? <ChargeCard key={charge.id} charge={charge} client={client} /> : null
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
    </Card>
  )
}

function ChargeCard({ charge, client }: { charge: Charge; client: Client }) {
  const save = useSaveCharge()
  const state = chargeState(charge, today())
  const toggle = () =>
    save.mutate(charge.status === 'paid' ? { ...charge, status: 'pending', paidAt: null } : { ...charge, status: 'paid', paidAt: nowIso() })

  return (
    <li>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/clientes/${client.id}`} className="font-semibold hover:underline">{client.name}</Link>
            <p className="text-sm text-slate-600">
              {formatMoney(charge.amountCents)} · vence {parseIsoDate(charge.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </p>
          </div>
          <Badge tone={state === 'paid' ? 'success' : state === 'overdue' ? 'danger' : 'warning'}>
            {state === 'paid' ? 'Pago' : state === 'overdue' ? 'Atrasado' : 'Em aberto'}
          </Badge>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant={charge.status === 'paid' ? 'ghost' : 'primary'} size="sm" className="flex-1" onClick={toggle} loading={save.isPending}>
            {charge.status === 'paid' ? 'Desfazer pagamento' : 'Marcar como pago'}
          </Button>
          {charge.status !== 'paid' && client.phone && (
            <ExternalButton href={whatsappLink(client.phone, chargeReminderMessage(charge, client))} variant="whatsapp" size="sm">
              Lembrar
            </ExternalButton>
          )}
        </div>
      </Card>
    </li>
  )
}
