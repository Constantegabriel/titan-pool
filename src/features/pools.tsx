import { Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorState, Field, Input, Loading, PageHeader, Select, Textarea } from '@/components/ui'
import { newId, nowIso } from '@/data'
import { WEEKDAY_SHORT } from '@/domain/dates'
import type { Pool, Weekday } from '@/domain/types'
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
    equipment: '', accessNotes: '', visitDays: [], routeOrder: nextOrder, serviceMinutes: null, createdAt: nowIso(),
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

  const toggleDay = (day: Weekday) =>
    set('visitDays', pool.visitDays.includes(day) ? pool.visitDays.filter((d) => d !== day) : [...pool.visitDays, day].sort())

  async function submit(event: FormEvent) {
    event.preventDefault()
    await save.mutateAsync({ ...pool, name: pool.name.trim() || 'Principal' })
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
        <Card className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Dias de visita</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_SHORT.map((label, day) => {
                const active = pool.visitDays.includes(day as Weekday)
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDay(day as Weekday)}
                    className={cn('h-11 rounded-xl text-sm font-medium ring-1', active ? 'bg-cyan-700 text-white ring-cyan-700' : 'bg-white text-slate-700 ring-slate-300')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>
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
