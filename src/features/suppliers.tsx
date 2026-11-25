import { ChevronRight, Phone, Plus, ShoppingCart, Store, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, ButtonLink, Card, EmptyState, ErrorState, ExternalButton, Field, Input, ListCard, Loading, PageHeader, Textarea } from '@/components/ui'
import { newId, nowIso } from '@/data'
import { whatsappLink } from '@/domain/format'
import type { Supplier } from '@/domain/types'
import { useDeleteSupplier, useSaveSupplier, useSuppliers } from '@/hooks/data'

export function SuppliersPage() {
  const suppliers = useSuppliers()
  return (
    <>
      <PageHeader title="Fornecedores" back="/mais" action={<ButtonLink to="/mais/fornecedores/novo" size="sm"><Plus className="size-4" aria-hidden /> Novo</ButtonLink>} />
      {suppliers.error ? <ErrorState error={suppliers.error} /> : suppliers.isPending ? <Loading /> : suppliers.data.length === 0 ? (
        <EmptyState icon={<Store className="size-9" />} title="Nenhum fornecedor">Cadastre lojas e distribuidores com o WhatsApp para enviar pedidos com um toque.</EmptyState>
      ) : (
        <ListCard className="lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:overflow-visible lg:border-0 lg:bg-transparent lg:shadow-none xl:grid-cols-3">
          {[...suppliers.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((s) => (
            <li key={s.id}>
              <Link to={`/mais/fornecedores/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 lg:h-full lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white lg:p-4 lg:shadow-card lg:transition-shadow lg:hover:bg-white lg:hover:shadow-float">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-sm text-slate-500">{[s.contact, s.phone].filter(Boolean).join(' · ') || 'Sem telefone'}</p>
                </div>
                <ChevronRight className="size-5 text-slate-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ListCard>
      )}
    </>
  )
}

export function SupplierFormPage() {
  const { supplierId } = useParams()
  const suppliers = useSuppliers()
  if (supplierId && suppliers.isPending) return <Loading />
  const existing = supplierId ? suppliers.data?.find((s) => s.id === supplierId) : undefined
  if (supplierId && !existing) return <ErrorState error={new Error('Fornecedor não encontrado.')} />
  return <SupplierForm initial={existing ?? { id: newId(), name: '', phone: '', contact: '', notes: '', createdAt: nowIso() }} isNew={!existing} />
}

function SupplierForm({ initial, isNew }: { initial: Supplier; isNew: boolean }) {
  const [s, setS] = useState(initial)
  const save = useSaveSupplier()
  const remove = useDeleteSupplier()
  const navigate = useNavigate()
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K]) => setS((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    await save.mutateAsync({ ...s, name: s.name.trim() })
    navigate('/mais/fornecedores', { replace: true })
  }
  async function onDelete() {
    if (!confirm(`Excluir ${s.name}? Os pedidos continuam no histórico.`)) return
    await remove.mutateAsync(s.id)
    navigate('/mais/fornecedores', { replace: true })
  }

  return (
    <>
      <PageHeader title={isNew ? 'Novo fornecedor' : s.name} back="/mais/fornecedores" />
      {!isNew && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <ButtonLink to={`/compras/nova?fornecedor=${s.id}`}><ShoppingCart className="size-4" aria-hidden /> Novo pedido</ButtonLink>
          {s.phone ? <ExternalButton href={whatsappLink(s.phone, `Olá, ${s.contact || s.name}!`)} variant="whatsapp">WhatsApp</ExternalButton>
            : <a className="inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm text-slate-400 border border-slate-200"><Phone className="size-4" /> Sem número</a>}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Nome da loja / fornecedor"><Input required maxLength={120} value={s.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="WhatsApp" hint="Os pedidos são enviados para este número"><Input type="tel" inputMode="tel" placeholder="(19) 99999-9999" value={s.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Falar com"><Input placeholder="Nome do vendedor" value={s.contact} onChange={(e) => set('contact', e.target.value)} /></Field>
          <Field label="Observações"><Textarea className="min-h-16" placeholder="Prazo de entrega, formas de pagamento…" value={s.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </Card>
        {save.error && <ErrorState error={save.error} />}
        <Button type="submit" className="w-full" loading={save.isPending}>Salvar</Button>
        {!isNew && <Button variant="danger" className="w-full" onClick={onDelete} loading={remove.isPending}><Trash2 className="size-4" aria-hidden /> Excluir fornecedor</Button>}
      </form>
    </>
  )
}
