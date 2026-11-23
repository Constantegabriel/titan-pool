import { CheckCircle2, ChevronRight, Minus, PackageCheck, Plus, Send, ShoppingCart, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PdfButton } from '@/components/pdf-button'
import {
  Badge, Button, ButtonLink, Card, EmptyState, ErrorState, Field, Input, ListCard, Loading, PageHeader, SectionTitle, Segmented, Select, Textarea,
} from '@/components/ui'
import { newId, nowIso, repository } from '@/data'
import { parseIsoDate, today } from '@/domain/dates'
import { formatOrderNumber, purchaseTotalCents } from '@/domain/finance'
import { centsToInput, formatMoney, parseMoney, whatsappLink } from '@/domain/format'
import { purchaseMessage } from '@/domain/messages'
import { type CatalogItem, ITEM_UNITS, type ItemUnit, type Purchase, type PurchaseLine, type PurchaseStatus } from '@/domain/types'
import {
  useCatalog, useClients, useDeletePurchase, usePurchase, usePurchases, useSaveCatalogItems, useSavePurchase, useSaveTransaction,
  useSettings, useSuppliers,
} from '@/hooks/data'
import { cn } from '@/lib/cn'
import { loadPdf, slug } from '@/lib/share'

const STATUS: Record<PurchaseStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  sent: { label: 'Enviado', tone: 'info' },
  received: { label: 'Recebido', tone: 'success' },
  canceled: { label: 'Cancelado', tone: 'danger' },
}

type Filter = 'open' | 'received' | 'all'

export function PurchasesPage() {
  const purchases = usePurchases()
  const suppliers = useSuppliers()
  const clients = useClients()
  const [filter, setFilter] = useState<Filter>('open')

  const list = (purchases.data ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'open' ? p.status === 'draft' || p.status === 'sent' : p.status === 'received',
  )
  const nameOf = (id: string | null, from?: Array<{ id: string; name: string }>) => (id ? from?.find((x) => x.id === id)?.name : undefined)

  return (
    <>
      <PageHeader title="Compras" subtitle="Pedidos e orçamentos com fornecedores" action={<ButtonLink to="/compras/nova" size="sm"><Plus className="size-4" aria-hidden /> Novo</ButtonLink>} />
      <Segmented label="Filtrar pedidos" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Em aberto' }, { value: 'received', label: 'Recebidos' }, { value: 'all', label: 'Todos' }]} />
      {purchases.error ? <ErrorState error={purchases.error} /> : purchases.isPending ? <Loading /> : list.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="size-9" />} title={filter === 'open' ? 'Nenhum pedido em aberto' : 'Nenhum pedido'}>
          Monte a lista de itens, escolha o fornecedor e o cliente, e envie pelo WhatsApp.
          <ButtonLink to="/compras/nova" className="mt-4">Fazer pedido</ButtonLink>
        </EmptyState>
      ) : (
        <ListCard>
          {list.map((p) => {
            const total = purchaseTotalCents(p)
            return (
              <li key={p.id}>
                <Link to={`/compras/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatOrderNumber(p.number)}</span>
                      <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                    </p>
                    <p className="truncate text-sm text-slate-600">{nameOf(p.supplierId, suppliers.data) ?? 'Sem fornecedor'} · {p.lines.length} item(ns)</p>
                    <p className="truncate text-xs text-slate-500">
                      {parseIsoDate(p.date).toLocaleDateString('pt-BR')}{nameOf(p.clientId, clients.data) ? ` · para ${nameOf(p.clientId, clients.data)}` : ''}
                    </p>
                  </div>
                  {total !== null && <span className="text-sm font-semibold tabular-nums">{formatMoney(total)}</span>}
                  <ChevronRight className="size-5 text-slate-400" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ListCard>
      )}
    </>
  )
}

export function PurchasePage() {
  const { purchaseId } = useParams()
  const [params] = useSearchParams()
  const existing = usePurchase(purchaseId ?? '')
  const [draft, setDraft] = useState<Purchase | null>(null)

  useEffect(() => {
    if (purchaseId) return
    let alive = true
    repository.nextPurchaseNumber().then((number) => {
      if (!alive) return
      setDraft({
        id: newId(), number, supplierId: params.get('fornecedor'), clientId: params.get('cliente'), lines: [], notes: '', status: 'draft',
        date: today(), sentAt: null, receivedAt: null, billToClient: false, createdAt: nowIso(),
      })
    })
    return () => { alive = false }
  }, [purchaseId, params])

  if (purchaseId) {
    if (existing.isPending) return <Loading />
    if (existing.error) return <ErrorState error={existing.error} />
    if (!existing.data) return <ErrorState error={new Error('Pedido não encontrado.')} />
    return <PurchaseEditor key={existing.data.id} initial={existing.data} persisted />
  }
  return draft ? <PurchaseEditor key={draft.id} initial={draft} persisted={false} /> : <Loading />
}

function PurchaseEditor({ initial, persisted }: { initial: Purchase; persisted: boolean }) {
  const [p, setP] = useState(initial)
  const clients = useClients()
  const suppliers = useSuppliers()
  const catalog = useCatalog()
  const settings = useSettings()
  const save = useSavePurchase()
  const saveCatalog = useSaveCatalogItems()
  const saveTx = useSaveTransaction()
  const remove = useDeletePurchase()
  const navigate = useNavigate()
  const dirty = useRef(false)
  const saved = useRef(persisted)
  const [isSaved, setIsSaved] = useState(persisted)
  const [receiving, setReceiving] = useState(false)

  const editable = p.status === 'draft' || p.status === 'sent'
  const supplier = suppliers.data?.find((s) => s.id === p.supplierId)
  const client = clients.data?.find((c) => c.id === p.clientId)
  const total = purchaseTotalCents(p)

  const update = (patch: Partial<Purchase>) => {
    dirty.current = true
    setP((x) => ({ ...x, ...patch }))
  }

  // Salva sozinho assim que o pedido tem algum item (ou já existia).
  const { mutate } = save
  useEffect(() => {
    if (!dirty.current || (!saved.current && p.lines.length === 0)) return
    const t = setTimeout(() => {
      mutate(p, {
        onSuccess: () => {
          if (!saved.current) {
            saved.current = true
            setIsSaved(true)
            navigate(`/compras/${p.id}`, { replace: true })
          }
        },
      })
    }, 600)
    return () => clearTimeout(t)
  }, [p, mutate, navigate])

  /** Itens novos do pedido entram na lista de itens; preços informados atualizam o último preço. */
  function syncCatalog(lines: PurchaseLine[]) {
    const known = new Map((catalog.data ?? []).map((i) => [i.name.toLowerCase(), i]))
    const changed: CatalogItem[] = []
    for (const l of lines) {
      const item = known.get(l.name.toLowerCase())
      if (!item) changed.push({ id: newId(), name: l.name, unit: l.unit, lastPriceCents: l.unitPriceCents, createdAt: nowIso() })
      else if (l.unitPriceCents !== null && l.unitPriceCents !== item.lastPriceCents) changed.push({ ...item, lastPriceCents: l.unitPriceCents })
    }
    if (changed.length) saveCatalog.mutate(changed)
  }

  const message = purchaseMessage(p, { supplierName: supplier?.contact || supplier?.name, clientName: client?.name, senderName: settings.data?.businessName })

  function markSent() {
    const next: Purchase = { ...p, status: 'sent', sentAt: p.sentAt ?? nowIso() }
    dirty.current = false
    setP(next)
    saved.current = true
    setIsSaved(true)
    save.mutate(next, { onSuccess: () => navigate(`/compras/${p.id}`, { replace: true }) })
    syncCatalog(next.lines)
  }

  async function receive(amountCents: number) {
    const next: Purchase = { ...p, status: 'received', receivedAt: nowIso() }
    dirty.current = false
    setP(next)
    await save.mutateAsync(next)
    syncCatalog(next.lines)
    const label = `Pedido ${formatOrderNumber(p.number)}${supplier ? ` — ${supplier.name}` : ''}`
    await saveTx.mutateAsync({
      id: p.id, kind: 'expense', category: 'Produtos', description: label, amountCents, date: today(),
      clientId: p.clientId, purchaseId: p.id, paid: true, createdAt: nowIso(),
    })
    if (p.billToClient && p.clientId) {
      await saveTx.mutateAsync({
        id: newId(), kind: 'income', category: 'Repasse de produtos', description: label, amountCents, date: today(),
        clientId: p.clientId, purchaseId: p.id, paid: false, createdAt: nowIso(),
      })
    }
    setReceiving(false)
  }

  async function onDelete() {
    if (!confirm(p.status === 'received' ? 'Excluir o pedido e os lançamentos dele no financeiro?' : 'Excluir este pedido?')) return
    if (saved.current) await remove.mutateAsync(p.id)
    navigate('/compras', { replace: true })
  }

  if (clients.isPending || suppliers.isPending || catalog.isPending) return <Loading />

  return (
    <>
      <PageHeader
        title={`Pedido ${formatOrderNumber(p.number)}`}
        subtitle={<span className="flex items-center gap-2"><Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>{parseIsoDate(p.date).toLocaleDateString('pt-BR')}</span>}
        back="/compras"
      />

      <Card className="space-y-3">
        <Field label="Para qual cliente?">
          <Select value={p.clientId ?? ''} disabled={!editable} onChange={(e) => update({ clientId: e.target.value || null, billToClient: e.target.value ? p.billToClient : false })}>
            <option value="">Uso geral / estoque</option>
            {[...clients.data!].filter((c) => c.active || c.id === p.clientId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Fornecedor">
          <Select value={p.supplierId ?? ''} disabled={!editable} onChange={(e) => update({ supplierId: e.target.value || null })}>
            <option value="">Escolher depois</option>
            {suppliers.data!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        {suppliers.data!.length === 0 && <Link to="/mais/fornecedores/novo" className="block text-sm font-medium text-brand-700">+ Cadastrar fornecedor</Link>}
        {supplier && !supplier.phone && <p className="text-sm text-amber-800">Este fornecedor está sem WhatsApp cadastrado: você escolherá o contato ao enviar.</p>}
      </Card>

      <SectionTitle>Itens</SectionTitle>
      <LinesEditor lines={p.lines} editable={editable} showPrices={p.status !== 'draft'} catalog={catalog.data!} onChange={(lines) => update({ lines })} />

      <SectionTitle>Observações</SectionTitle>
      <Textarea className="min-h-16" disabled={!editable} placeholder="Ex.: entregar na casa do cliente até sexta" value={p.notes} onChange={(e) => update({ notes: e.target.value })} />

      {p.clientId && (
        <label className="mt-3 flex items-start gap-3 rounded-xl bg-white p-3 text-sm border border-slate-200">
          <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" disabled={p.status === 'received'} checked={p.billToClient} onChange={(e) => update({ billToClient: e.target.checked })} />
          <span><span className="font-medium">Repassar o valor ao cliente</span><br /><span className="text-slate-500">Ao receber, lança uma receita a receber de {client?.name}.</span></span>
        </label>
      )}

      {total !== null && (
        <Card className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-600">Total do pedido</span>
          <span className="text-xl font-bold tabular-nums">{formatMoney(total)}</span>
        </Card>
      )}

      <div className="mt-5 space-y-2">
        {editable && (
          <a
            href={whatsappLink(supplier?.phone ?? '', message)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => (p.lines.length ? markSent() : e.preventDefault())}
            aria-disabled={!p.lines.length}
            className={cn('flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700', !p.lines.length && 'pointer-events-none opacity-50')}
          >
            <Send className="size-5" aria-hidden /> {p.status === 'sent' ? 'Reenviar no WhatsApp' : `Enviar para ${supplier?.name ?? 'fornecedor'}`}
          </a>
        )}
        {p.status === 'sent' && !receiving && (
          <Button className="w-full" onClick={() => setReceiving(true)}><PackageCheck className="size-5" aria-hidden /> Marcar como recebido</Button>
        )}
        {receiving && <ReceivePanel suggested={total} onCancel={() => setReceiving(false)} onConfirm={receive} busy={save.isPending || saveTx.isPending} />}
        {p.status === 'received' && (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="size-4" aria-hidden /> Recebido em {new Date(p.receivedAt!).toLocaleDateString('pt-BR')} · lançado no financeiro
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <PdfButton
            make={async () => (await loadPdf()).purchasePdf(p, supplier, client, settings.data!)}
            filename={`pedido-${p.number}-${slug(supplier?.name ?? 'fornecedor')}.pdf`}
            title={`Pedido ${formatOrderNumber(p.number)}`}
            label="Gerar PDF"
          />
          {p.status === 'sent' ? (
            <Button variant="ghost" onClick={() => update({ status: 'canceled' })}><X className="size-4" aria-hidden /> Cancelar</Button>
          ) : (
            <Button variant="danger" onClick={onDelete} loading={remove.isPending}><Trash2 className="size-4" aria-hidden /> Excluir</Button>
          )}
        </div>
        <p className="text-center text-xs text-slate-500" aria-live="polite">{save.isPending ? 'Salvando…' : isSaved && save.isSuccess ? 'Pedido salvo' : ''}</p>
      </div>
    </>
  )
}

function ReceivePanel({ suggested, onCancel, onConfirm, busy }: { suggested: number | null; onCancel: () => void; onConfirm: (cents: number) => void; busy: boolean }) {
  const [value, setValue] = useState(suggested !== null ? centsToInput(suggested) : '')
  const cents = parseMoney(value)
  return (
    <Card className="space-y-3 ring-2 ring-brand-600">
      <Field label="Valor pago (R$)" hint="Vai para o financeiro como despesa de produtos">
        <Input inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
      </Field>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={cents <= 0} loading={busy} onClick={() => onConfirm(cents)}>Confirmar recebimento</Button>
        <Button variant="ghost" onClick={onCancel}>Voltar</Button>
      </div>
    </Card>
  )
}

function LinesEditor({ lines, editable, showPrices, catalog, onChange }: {
  lines: PurchaseLine[]; editable: boolean; showPrices: boolean; catalog: CatalogItem[]; onChange: (l: PurchaseLine[]) => void
}) {
  const [query, setQuery] = useState('')
  const [pricing, setPricing] = useState(showPrices)
  const inList = useMemo(() => new Set(lines.map((l) => l.name.toLowerCase())), [lines])
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((i) => !inList.has(i.name.toLowerCase()) && (!q || i.name.toLowerCase().includes(q))).slice(0, q ? 6 : 8)
  }, [catalog, query, inList])

  const add = (name: string, unit: ItemUnit = 'un', price: number | null = null) => {
    const clean = name.trim()
    if (!clean || inList.has(clean.toLowerCase())) return
    onChange([...lines, { name: clean, quantity: 1, unit, note: '', unitPriceCents: price }])
    setQuery('')
  }
  const patch = (i: number, change: Partial<PurchaseLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...change } : l)))

  return (
    <div className="space-y-3">
      {lines.length > 0 && (
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li key={`${l.name}-${i}`}>
              <Card className="p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{i + 1}</span>
                  <p className="min-w-0 flex-1 font-medium">{l.name}</p>
                  {editable && (
                    <button type="button" aria-label={`Remover ${l.name}`} className="-mt-1 -mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-xl border border-slate-200">
                    <button type="button" aria-label="Diminuir" disabled={!editable || l.quantity <= 1} className="flex size-10 items-center justify-center text-slate-600 disabled:opacity-30" onClick={() => patch(i, { quantity: Math.max(1, l.quantity - 1) })}><Minus className="size-4" /></button>
                    <input
                      aria-label={`Quantidade de ${l.name}`}
                      inputMode="decimal"
                      disabled={!editable}
                      className="w-12 bg-transparent text-center text-base font-semibold tabular-nums focus:outline-none"
                      value={String(l.quantity).replace('.', ',')}
                      onChange={(e) => {
                        const n = Number.parseFloat(e.target.value.replace(',', '.'))
                        if (Number.isFinite(n) && n > 0) patch(i, { quantity: n })
                      }}
                    />
                    <button type="button" aria-label="Aumentar" disabled={!editable} className="flex size-10 items-center justify-center text-slate-600 disabled:opacity-30" onClick={() => patch(i, { quantity: l.quantity + 1 })}><Plus className="size-4" /></button>
                  </div>
                  <Select aria-label={`Unidade de ${l.name}`} disabled={!editable} className="h-10 w-24" value={l.unit} onChange={(e) => patch(i, { unit: e.target.value as ItemUnit })}>
                    {ITEM_UNITS.map((u) => <option key={u}>{u}</option>)}
                  </Select>
                  {pricing && (
                    <Input
                      aria-label={`Preço unitário de ${l.name}`}
                      inputMode="decimal"
                      placeholder="R$ un."
                      disabled={!editable}
                      className="h-10 min-w-0 flex-1"
                      defaultValue={l.unitPriceCents !== null ? centsToInput(l.unitPriceCents) : ''}
                      onChange={(e) => patch(i, { unitPriceCents: e.target.value.trim() ? parseMoney(e.target.value) : null })}
                    />
                  )}
                </div>
                {editable ? (
                  <input
                    aria-label={`Observação de ${l.name}`}
                    placeholder="Observação (marca, tamanho…)"
                    className="mt-2 w-full border-b border-dashed border-slate-200 bg-transparent py-1 text-sm text-slate-600 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none"
                    value={l.note}
                    onChange={(e) => patch(i, { note: e.target.value })}
                  />
                ) : l.note && <p className="mt-1 text-sm text-slate-500">{l.note}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <Card className="space-y-2 p-3">
          <form onSubmit={(e) => { e.preventDefault(); const match = catalog.find((c) => c.name.toLowerCase() === query.trim().toLowerCase()); add(query, match?.unit, match?.lastPriceCents ?? null) }} className="flex gap-2">
            <Input placeholder="Adicionar item (ex.: cloro, margarida…)" aria-label="Adicionar item" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" aria-label="Adicionar" disabled={!query.trim()}><Plus className="size-5" /></Button>
          </form>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s.id} type="button" onClick={() => add(s.name, s.unit, s.lastPriceCents)} className="rounded-full bg-brand-50 px-3 py-1.5 text-sm text-brand-900 ring-1 ring-brand-200 hover:bg-brand-100">
                  + {s.name}
                </button>
              ))}
            </div>
          )}
          {!pricing && lines.length > 0 && (
            <button type="button" className="text-sm font-medium text-brand-700" onClick={() => setPricing(true)}>Informar preços</button>
          )}
        </Card>
      )}
    </div>
  )
}
