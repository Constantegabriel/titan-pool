import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, Plus, ReceiptText, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PdfButton } from '@/components/pdf-button'
import {
  Badge, Button, ButtonLink, Card, EmptyState, ErrorState, ExternalButton, Field, Input, ListCard, Loading, PageHeader, SectionTitle, Segmented, Select,
} from '@/components/ui'
import { newId, nowIso } from '@/data'
import { chargeState, chargesToCreate } from '@/domain/billing'
import { parseIsoDate, periodOf, shiftPeriod, today } from '@/domain/dates'
import { clientMargins, monthResult } from '@/domain/finance'
import { centsToInput, formatMoney, formatPeriod, parseMoney, whatsappLink } from '@/domain/format'
import { chargeReminderMessage } from '@/domain/messages'
import { type Charge, type Client, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction, type TransactionKind } from '@/domain/types'
import {
  useChargesByPeriod, useClients, useDeleteTransaction, useGenerateCharges, useSaveCharge, useSaveTransaction, useSettings, useTransactions,
} from '@/hooks/data'
import { cn } from '@/lib/cn'
import { loadPdf } from '@/lib/share'

type Tab = 'resumo' | 'mensalidades' | 'lancamentos'
const STATE_ORDER = { overdue: 0, open: 1, paid: 2 } as const

export function FinancePage() {
  const [params, setParams] = useSearchParams()
  const period = params.get('mes') ?? periodOf(today())
  const tab = (params.get('aba') as Tab | null) ?? 'resumo'
  const go = (next: { mes?: string; aba?: Tab }) => {
    const mes = next.mes ?? period
    const aba = next.aba ?? tab
    const q: Record<string, string> = {}
    if (mes !== periodOf(today())) q.mes = mes
    if (aba !== 'resumo') q.aba = aba
    setParams(q, { replace: true })
  }

  const clients = useClients()
  const charges = useChargesByPeriod(period)
  const transactions = useTransactions(period)
  const error = clients.error ?? charges.error ?? transactions.error
  const ready = clients.data && charges.data && transactions.data

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle={<span className="first-letter:uppercase inline-block">{formatPeriod(period)}</span>}
        action={<ButtonLink to={`/financeiro/lancamento/novo?mes=${period}`} size="sm"><Plus className="size-4" aria-hidden /> Lançar</ButtonLink>}
      />
      <div className="lg:mb-2 lg:flex lg:items-center lg:justify-between lg:gap-6">
      <div className="mb-3 flex items-center gap-2 lg:mb-0">
        <Button variant="secondary" size="sm" aria-label="Mês anterior" onClick={() => go({ mes: shiftPeriod(period, -1) })}><ChevronLeft className="size-4" /></Button>
        <Button variant={period === periodOf(today()) ? 'primary' : 'secondary'} size="sm" onClick={() => go({ mes: periodOf(today()) })}>Mês atual</Button>
        <Button variant="secondary" size="sm" aria-label="Próximo mês" onClick={() => go({ mes: shiftPeriod(period, 1) })}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="lg:w-[28rem]">
      <Segmented label="Seções do financeiro" value={tab} onChange={(aba) => go({ aba })} options={[
        { value: 'resumo', label: 'Resumo' }, { value: 'mensalidades', label: 'Mensalidades' }, { value: 'lancamentos', label: 'Lançamentos' },
      ]} />
      </div>
      </div>
      {error ? <ErrorState error={error} /> : !ready ? <Loading /> : tab === 'resumo' ? (
        <Summary period={period} clients={clients.data!} charges={charges.data!} transactions={transactions.data!} onTab={(aba) => go({ aba })} />
      ) : tab === 'mensalidades' ? (
        <Fees period={period} clients={clients.data!} charges={charges.data!} />
      ) : (
        <Ledger period={period} clients={clients.data!} transactions={transactions.data!} />
      )}
    </>
  )
}

function Summary({ period, clients, charges, transactions, onTab }: { period: string; clients: Client[]; charges: Charge[]; transactions: Transaction[]; onTab: (t: Tab) => void }) {
  const settings = useSettings()
  const r = monthResult(charges, transactions)
  const margins = clientMargins(period, clients, charges, transactions)
  const receivable = r.feesPendingCents + transactions.filter((t) => t.kind === 'income' && !t.paid).reduce((s, t) => s + t.amountCents, 0)
  const maxCat = Math.max(1, ...r.expensesByCategory.map((c) => c.cents))

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
    <div>
      <section className={cn('rounded-3xl p-4 text-white shadow-lg', r.profitCents >= 0 ? 'bg-gradient-to-br from-brand-700 to-brand-700 shadow-brand-900/20' : 'bg-gradient-to-br from-rose-700 to-rose-800 shadow-rose-900/20')}>
        <p className="text-sm text-white/80">Lucro do mês (recebido − gasto)</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(r.profitCents)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/10 p-2.5">
            <p className="flex items-center gap-1 text-white/80"><TrendingUp className="size-4" aria-hidden /> Entradas</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(r.incomeCents)}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-2.5">
            <p className="flex items-center gap-1 text-white/80"><TrendingDown className="size-4" aria-hidden /> Saídas</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(r.expensesCents)}</p>
          </div>
        </div>
      </section>

      <button type="button" onClick={() => onTab('mensalidades')} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left border border-slate-100 shadow-card">
        <span className="text-sm text-slate-600">A receber neste mês</span>
        <span className="font-semibold tabular-nums text-amber-700">{formatMoney(receivable)}</span>
      </button>

      <SectionTitle>Gastos por categoria</SectionTitle>
      {r.expensesByCategory.length === 0 ? <p className="text-sm text-slate-500">Nenhum gasto lançado.</p> : (
        <Card className="space-y-3">
          {r.expensesByCategory.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-sm"><span>{c.category}</span><span className="font-medium tabular-nums">{formatMoney(c.cents)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(c.cents / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </Card>
      )}

    </div>
    <div className="lg:[&>div:first-child]:mt-0">
      <SectionTitle>Margem por cliente</SectionTitle>
      {margins.length === 0 ? <p className="text-sm text-slate-500">Gere as mensalidades para ver a margem de cada cliente.</p> : (
        <ListCard>
          {margins.map((m) => (
            <li key={m.client.id}>
              <Link to={`/clientes/${m.client.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.client.name}</p>
                  <p className="text-xs text-slate-500 tabular-nums">{formatMoney(m.revenueCents)} − {formatMoney(m.costCents)} de custos</p>
                </div>
                <span className={cn('font-semibold tabular-nums', m.marginCents < 0 ? 'text-rose-700' : 'text-emerald-700')}>{formatMoney(m.marginCents)}</span>
              </Link>
            </li>
          ))}
        </ListCard>
      )}

      <PdfButton
        className="mt-5 w-full"
        label="Relatório do mês em PDF"
        filename={`financeiro-${period}.pdf`}
        title={`Financeiro ${formatPeriod(period)}`}
        make={async () => (await loadPdf()).monthReportPdf({ period, result: r, charges, transactions, margins, clients, settings: settings.data! })}
      />
    </div>
    </div>
  )
}

function Fees({ period, clients, charges }: { period: string; clients: Client[]; charges: Charge[] }) {
  const generate = useGenerateCharges()
  const on = today()
  const byId = new Map(clients.map((c) => [c.id, c]))
  const list = [...charges].sort((a, b) => STATE_ORDER[chargeState(a, on)] - STATE_ORDER[chargeState(b, on)] || a.dueDate.localeCompare(b.dueDate))
  const missing = chargesToCreate(period, clients, charges).length
  const sum = (state: 'paid' | 'open' | 'overdue') => list.filter((c) => chargeState(c, on) === state).reduce((s, c) => s + c.amountCents, 0)

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center lg:gap-4">
        <MiniStat label="Recebido" value={formatMoney(sum('paid'))} className="text-emerald-700" />
        <MiniStat label="Em aberto" value={formatMoney(sum('open'))} />
        <MiniStat label="Atrasado" value={formatMoney(sum('overdue'))} className={sum('overdue') ? 'text-rose-700' : undefined} />
      </div>
      {missing > 0 && (
        <Card className="mb-4 bg-brand-50 ring-brand-200">
          <p className="text-sm text-brand-950">{missing} cliente(s) ativo(s) ainda sem mensalidade em {formatPeriod(period)}.</p>
          <Button className="mt-3 w-full" loading={generate.isPending} onClick={() => generate.mutate({ period, clients })}>Gerar mensalidades do mês</Button>
        </Card>
      )}
      {list.length === 0 ? (
        <EmptyState icon={<ReceiptText className="size-9" />} title="Nenhuma mensalidade neste mês">{missing === 0 && 'Cadastre o valor da mensalidade nos clientes.'}</EmptyState>
      ) : (
        <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">{list.map((c) => byId.get(c.clientId) && <FeeCard key={c.id} charge={c} client={byId.get(c.clientId)!} />)}</ul>
      )}
    </>
  )
}

function MiniStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-2.5 border border-slate-100 shadow-card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums', className)}>{value}</p>
    </div>
  )
}

function FeeCard({ charge, client }: { charge: Charge; client: Client }) {
  const save = useSaveCharge()
  const settings = useSettings()
  const state = chargeState(charge, today())
  const toggle = () => save.mutate(charge.status === 'paid' ? { ...charge, status: 'pending', paidAt: null } : { ...charge, status: 'paid', paidAt: nowIso() })
  return (
    <li>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/clientes/${client.id}`} className="font-semibold hover:underline">{client.name}</Link>
            <p className="text-sm text-slate-600">{formatMoney(charge.amountCents)} · vence {parseIsoDate(charge.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p>
          </div>
          <Badge tone={state === 'paid' ? 'success' : state === 'overdue' ? 'danger' : 'warning'}>{state === 'paid' ? 'Pago' : state === 'overdue' ? 'Atrasado' : 'Em aberto'}</Badge>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant={charge.status === 'paid' ? 'ghost' : 'primary'} size="sm" className="flex-1" onClick={toggle} loading={save.isPending}>
            {charge.status === 'paid' ? 'Desfazer' : 'Recebi'}
          </Button>
          {charge.status === 'paid' ? (
            <PdfButton size="sm" label="Recibo" filename={`recibo-${charge.period}-${client.name.split(' ')[0].toLowerCase()}.pdf`} title="Recibo" make={async () => (await loadPdf()).receiptPdf(charge, client, settings.data!)} />
          ) : client.phone && (
            <ExternalButton href={whatsappLink(client.phone, chargeReminderMessage(charge, client))} variant="whatsapp" size="sm">Lembrar</ExternalButton>
          )}
        </div>
      </Card>
    </li>
  )
}

function Ledger({ period, clients, transactions }: { period: string; clients: Client[]; transactions: Transaction[] }) {
  const save = useSaveTransaction()
  const name = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name : undefined)
  const list = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 lg:max-w-md">
        <ButtonLink to={`/financeiro/lancamento/novo?tipo=income&mes=${period}`} variant="secondary"><ArrowUpCircle className="size-4 text-emerald-600" aria-hidden /> Entrada</ButtonLink>
        <ButtonLink to={`/financeiro/lancamento/novo?tipo=expense&mes=${period}`} variant="secondary"><ArrowDownCircle className="size-4 text-rose-600" aria-hidden /> Saída</ButtonLink>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Wallet className="size-9" />} title="Nenhum lançamento">Combustível, produtos, serviços avulsos… Compras recebidas entram aqui sozinhas.</EmptyState>
      ) : (
        <ListCard>
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <Link to={`/financeiro/lancamento/${t.id}?mes=${period}`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.description || t.category}</p>
                <p className="truncate text-xs text-slate-500">
                  {parseIsoDate(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {t.category}{name(t.clientId) ? ` · ${name(t.clientId)}` : ''}
                </p>
              </Link>
              <div className="text-right">
                <p className={cn('font-semibold tabular-nums', t.kind === 'income' ? 'text-emerald-700' : 'text-rose-700')}>{t.kind === 'income' ? '+' : '−'} {formatMoney(t.amountCents)}</p>
                {!t.paid && (
                  <button type="button" className="text-xs font-medium text-amber-700 underline" onClick={() => save.mutate({ ...t, paid: true })}>
                    {t.kind === 'income' ? 'a receber · marcar' : 'a pagar · marcar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ListCard>
      )}
    </>
  )
}

export function TransactionFormPage() {
  const { transactionId } = useParams()
  const [params] = useSearchParams()
  const period = params.get('mes') ?? periodOf(today())
  const transactions = useTransactions(period)
  if (transactionId && transactions.isPending) return <Loading />
  const existing = transactionId ? transactions.data?.find((t) => t.id === transactionId) : undefined
  if (transactionId && !existing) return <ErrorState error={new Error('Lançamento não encontrado.')} />
  const kind = (params.get('tipo') as TransactionKind | null) ?? 'expense'
  const date = period === periodOf(today()) ? today() : `${period}-01`
  return (
    <TransactionForm
      period={period}
      initial={existing ?? { id: newId(), kind, category: kind === 'expense' ? 'Combustível' : 'Serviço avulso', description: '', amountCents: 0, date, clientId: null, purchaseId: null, paid: true, createdAt: nowIso() }}
      isNew={!existing}
    />
  )
}

function TransactionForm({ initial, isNew, period }: { initial: Transaction; isNew: boolean; period: string }) {
  const [t, setT] = useState(initial)
  const [amount, setAmount] = useState(initial.amountCents ? centsToInput(initial.amountCents) : '')
  const clients = useClients()
  const save = useSaveTransaction()
  const remove = useDeleteTransaction()
  const navigate = useNavigate()
  const back = `/financeiro?aba=lancamentos${period !== periodOf(today()) ? `&mes=${period}` : ''}`
  const set = <K extends keyof Transaction>(k: K, v: Transaction[K]) => setT((x) => ({ ...x, [k]: v }))
  const categories: readonly string[] = t.kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  async function submit(e: FormEvent) {
    e.preventDefault()
    await save.mutateAsync({ ...t, amountCents: parseMoney(amount), description: t.description.trim() })
    navigate(back, { replace: true })
  }
  async function onDelete() {
    if (!confirm('Excluir este lançamento?')) return
    await remove.mutateAsync(t.id)
    navigate(back, { replace: true })
  }

  return (
    <>
      <PageHeader title={isNew ? 'Novo lançamento' : 'Lançamento'} back={back} />
      <form onSubmit={submit} className="space-y-4">
        <Segmented label="Tipo" value={t.kind} onChange={(kind) => setT((x) => ({ ...x, kind, category: kind === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0] }))}
          options={[{ value: 'expense', label: 'Saída (gasto)' }, { value: 'income', label: 'Entrada' }]} />
        <Card className="space-y-4">
          <Field label="Valor (R$)">
            <Input inputMode="decimal" required autoFocus={isNew} placeholder="0,00" className="text-2xl font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Categoria">
            <Select value={t.category} onChange={(e) => set('category', e.target.value)}>
              {[...new Set([...categories, t.category])].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Descrição"><Input placeholder={t.kind === 'expense' ? 'Ex.: gasolina' : 'Ex.: troca de areia do filtro'} value={t.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" required value={t.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <Field label="Cliente (opcional)">
              <Select value={t.clientId ?? ''} onChange={(e) => set('clientId', e.target.value || null)}>
                <option value="">—</option>
                {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="size-5 accent-brand-700" checked={t.paid} onChange={(e) => set('paid', e.target.checked)} />
            {t.kind === 'expense' ? 'Já foi pago' : 'Já recebi'}
          </label>
          {t.purchaseId && <p className="text-xs text-slate-500">Lançamento criado por um pedido de compra. <Link className="underline" to={`/compras/${t.purchaseId}`}>Ver pedido</Link></p>}
        </Card>
        {save.error && <ErrorState error={save.error} />}
        <Button type="submit" className="w-full" loading={save.isPending} disabled={parseMoney(amount) <= 0}>Salvar</Button>
        {!isNew && <Button variant="danger" className="w-full" onClick={onDelete} loading={remove.isPending}>Excluir</Button>}
      </form>
    </>
  )
}
