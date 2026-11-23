import { Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RecurrenceEditor } from '@/components/recurrence-editor'
import { Button, Card, ErrorState, Field, Input, Loading, PageHeader, SectionTitle, Select, Textarea } from '@/components/ui'
import { newId, nowIso } from '@/data'
import { today } from '@/domain/dates'
import { hasRecurrence } from '@/domain/recurrence'
import type { Pool } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useClients, useDeletePool, usePools, useSavePool } from '@/hooks/data'

export function PoolFormPage() {
  const { clientId, poolId } = useParams()
  const pools = usePools()
  const clients = useClients()
  if (pools.isPending || clients.isPending) return <Loading />
  const existing = poolId ? pools.data?.find((p) => p.id === poolId) : undefined
  const ownerId = existing?.clientId ?? clientId
  const client = clients.data?.find((c) => c.id === ownerId)
  if (!client || (poolId && !existing)) return <ErrorState error={new Error('Piscina não encontrada.')} />

  const nextOrder = Math.max(0, ...(pools.data ?? []).map((p) => p.routeOrder)) + 1
  const initial: Pool = existing ?? {
    id: newId(), clientId: client.id, name: 'Principal', volumeLiters: 0, type: 'vinil', sanitizer: 'cloro',
    equipment: '', accessNotes: '', recurrence: 'weekly', visitDays: [], monthDays: [], anchorDate: today(), preferredTime: null,
    routeOrder: nextOrder, serviceMinutes: null, createdAt: nowIso(),
  }
  return <PoolForm initial={initial} clientName={client.name} isNew={!existing} />
}

function PoolForm({ initial, clientName, isNew }: { initial: Pool; clientName: string; isNew: boolean }) {
  const [pool, setPool] = useState(initial)
  const save = useSavePool()
  const remove = useDeletePool()
  const navigate = useNavigate()
  const set = <K extends keyof Pool>(key: K, value: Pool[K]) => setPool((p) => ({ ...p, [key]: value }))
  const back = `/clientes/${pool.clientId}`

  const [fixed, setFixed] = useState(initial.recurrence !== 'none' || isNew)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const recurrence = fixed && hasRecurrence(pool) ? pool.recurrence : 'none'
    await save.mutateAsync({ ...pool, recurrence, anchorDate: pool.anchorDate ?? today(), name: pool.name.trim() || 'Principal' })
    navigate(back, { replace: true })
  }

  async function onDelete() {
    if (!confirm('Excluir esta piscina e o histórico de visitas dela?')) return
    await remove.mutateAsync(pool.id)
    navigate(back, { replace: true })
  }

  return (
    <>
      <PageHeader title={isNew ? 'Nova piscina' : 'Editar piscina'} subtitle={clientName} back={back} />
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Identificação">
              <Input value={pool.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Volume (litros)" hint="Usado no cálculo de produtos">
              <Input type="number" inputMode="numeric" min={0} step={500} required value={pool.volumeLiters || ''} onChange={(e) => set('volumeLiters', Number(e.target.value))} />
            </Field>
            <Field label="Revestimento">
              <Select value={pool.type} onChange={(e) => set('type', e.target.value as Pool['type'])}>
                <option value="vinil">Vinil</option>
                <option value="alvenaria">Alvenaria / azulejo</option>
                <option value="fibra">Fibra</option>
              </Select>
            </Field>
            <Field label="Tratamento">
              <Select value={pool.sanitizer} onChange={(e) => set('sanitizer', e.target.value as Pool['sanitizer'])}>
                <option value="cloro">Cloro</option>
                <option value="sal">Cloração salina</option>
              </Select>
            </Field>
          </div>
        </Card>
        <SectionTitle>Agenda fixa</SectionTitle>
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/50 p-1" role="radiogroup" aria-label="Visita fixa">
            {[{ v: true, l: 'Tem visita fixa' }, { v: false, l: 'Só avulsa' }].map((o) => (
              <button key={o.l} type="button" role="radio" aria-checked={fixed === o.v} onClick={() => setFixed(o.v)}
                className={cn('h-9 rounded-xl text-[13px] font-semibold', fixed === o.v ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500')}>
                {o.l}
              </button>
            ))}
          </div>
          {fixed ? (
            <RecurrenceEditor value={pool} onChange={(r) => setPool((p) => ({ ...p, ...r }))} />
          ) : (
            <p className="text-sm text-slate-500">Sem dias fixos: agende visitas avulsas pela agenda quando precisar.</p>
          )}
        </Card>

        <SectionTitle>Rotina</SectionTitle>
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tempo de serviço (min)" hint="Vazio = padrão dos ajustes">
              <Input type="number" inputMode="numeric" min={5} max={600} step={5} value={pool.serviceMinutes ?? ''} onChange={(e) => set('serviceMinutes', e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="Ordem na rota" hint="Ou use “Otimizar” na agenda">
              <Input type="number" inputMode="numeric" min={0} value={pool.routeOrder} onChange={(e) => set('routeOrder', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Equipamentos">
            <Input placeholder="Ex.: filtro 50 kg, bomba 1/2 cv" value={pool.equipment} onChange={(e) => set('equipment', e.target.value)} />
          </Field>
          <Field label="Acesso">
            <Textarea className="min-h-16" placeholder="Ex.: chave com o porteiro, cachorro no quintal" value={pool.accessNotes} onChange={(e) => set('accessNotes', e.target.value)} />
          </Field>
        </Card>
        {save.error && <ErrorState error={save.error} />}
        <Button type="submit" className="w-full" loading={save.isPending}>Salvar piscina</Button>
        {!isNew && (
          <Button variant="danger" className="w-full" onClick={onDelete} loading={remove.isPending}>
            <Trash2 className="size-4" aria-hidden /> Excluir piscina
          </Button>
        )}
      </form>
    </>
  )
}
