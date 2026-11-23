import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, EmptyState, ErrorState, Input, ListCard, Loading, PageHeader, Select } from '@/components/ui'
import { newId, nowIso } from '@/data'
import { centsToInput, formatMoney, parseMoney } from '@/domain/format'
import { type CatalogItem, ITEM_UNITS, type ItemUnit } from '@/domain/types'
import { useCatalog, useDeleteCatalogItem, useSaveCatalogItems } from '@/hooks/data'

export function CatalogPage() {
  const catalog = useCatalog()
  const save = useSaveCatalogItems()
  const remove = useDeleteCatalogItem()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<ItemUnit>('un')
  const [price, setPrice] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const exists = (n: string, ignore?: string) => catalog.data?.some((i) => i.id !== ignore && i.name.toLowerCase() === n.trim().toLowerCase())

  function add() {
    if (!name.trim() || exists(name)) return
    save.mutate([{ id: newId(), name: name.trim(), unit, lastPriceCents: price ? parseMoney(price) : null, createdAt: nowIso() }])
    setName('')
    setPrice('')
  }

  return (
    <>
      <PageHeader title="Lista de itens" subtitle="Produtos e materiais que você compra com frequência" back="/mais" />
      <Card className="mb-4 space-y-2">
        <Input placeholder="Novo item (ex.: Cloro granulado 10 kg)" aria-label="Nome do item" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-[6rem_1fr_auto] gap-2">
          <Select aria-label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value as ItemUnit)}>{ITEM_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
          <Input inputMode="decimal" placeholder="Preço (opcional)" aria-label="Preço" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Button onClick={add} disabled={!name.trim() || exists(name)} aria-label="Adicionar item"><Plus className="size-5" /></Button>
        </div>
        {name.trim() && exists(name) && <p className="text-sm text-amber-800">Este item já está na lista.</p>}
      </Card>
      {catalog.error ? <ErrorState error={catalog.error} /> : catalog.isPending ? <Loading /> : catalog.data.length === 0 ? (
        <EmptyState icon={<ListChecks className="size-9" />} title="Lista vazia">Itens usados nos pedidos também entram aqui automaticamente.</EmptyState>
      ) : (
        <ListCard>
          {[...catalog.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((item) =>
            editing === item.id ? (
              <EditRow key={item.id} item={item} onDone={(next) => { if (next) save.mutate([next]); setEditing(null) }} />
            ) : (
              <li key={item.id} className="flex items-center gap-2 px-4 py-2.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(item.id)}>
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.unit}{item.lastPriceCents !== null && ` · último preço ${formatMoney(item.lastPriceCents)}`}</p>
                </button>
                <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Excluir ${item.name}`} onClick={() => confirm(`Excluir ${item.name}?`) && remove.mutate(item.id)}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ),
          )}
        </ListCard>
      )}
    </>
  )
}

function EditRow({ item, onDone }: { item: CatalogItem; onDone: (next: CatalogItem | null) => void }) {
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit)
  const [price, setPrice] = useState(item.lastPriceCents !== null ? centsToInput(item.lastPriceCents) : '')
  return (
    <li className="space-y-2 bg-brand-50/50 px-4 py-3">
      <Input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <Select aria-label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value as ItemUnit)}>{ITEM_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
        <Input inputMode="decimal" aria-label="Preço" placeholder="Preço" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={!name.trim()} onClick={() => onDone({ ...item, name: name.trim(), unit, lastPriceCents: price ? parseMoney(price) : null })}>Salvar</Button>
        <Button size="sm" variant="ghost" onClick={() => onDone(null)}>Cancelar</Button>
      </div>
    </li>
  )
}
