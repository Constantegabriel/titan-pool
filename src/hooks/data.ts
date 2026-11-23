import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository, newId, nowIso } from '@/data'
import { chargesToCreate } from '@/domain/billing'
import type { Charge, Client, Id, IsoDate, Period, Pool, Visit } from '@/domain/types'

export const keys = {
  clients: ['clients'] as const,
  pools: ['pools'] as const,
  visit: (id: Id) => ['visit', id] as const,
  visitsByDate: (date: IsoDate) => ['visits', 'date', date] as const,
  visitsByClient: (clientId: Id) => ['visits', 'client', clientId] as const,
  chargesByPeriod: (period: Period) => ['charges', 'period', period] as const,
  chargesByClient: (clientId: Id) => ['charges', 'client', clientId] as const,
}

export const useClients = () => useQuery({ queryKey: keys.clients, queryFn: repository.listClients })
export const usePools = () => useQuery({ queryKey: keys.pools, queryFn: repository.listPools })

export const useVisit = (id: Id) => useQuery({ queryKey: keys.visit(id), queryFn: () => repository.getVisit(id) })
export const useVisitsByDate = (date: IsoDate) =>
  useQuery({ queryKey: keys.visitsByDate(date), queryFn: () => repository.listVisitsByDate(date) })
export const useVisitsByClient = (clientId: Id) =>
  useQuery({ queryKey: keys.visitsByClient(clientId), queryFn: () => repository.listVisitsByClient(clientId, 20) })

export const useChargesByPeriod = (period: Period) =>
  useQuery({ queryKey: keys.chargesByPeriod(period), queryFn: () => repository.listChargesByPeriod(period) })
export const useChargesByClient = (clientId: Id) =>
  useQuery({ queryKey: keys.chargesByClient(clientId), queryFn: () => repository.listChargesByClient(clientId, 12) })

function useInvalidate() {
  const qc = useQueryClient()
  return (...prefixes: string[]) => Promise.all(prefixes.map((p) => qc.invalidateQueries({ queryKey: [p] })))
}

export function useSaveClient() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (client: Client) => repository.saveClient(client),
    onSuccess: () => invalidate('clients'),
  })
}

export function useDeleteClient() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: Id) => repository.deleteClient(id),
    onSuccess: () => invalidate('clients', 'pools', 'visits', 'charges'),
  })
}

export function useSavePool() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (pool: Pool) => repository.savePool(pool),
    onSuccess: () => invalidate('pools'),
  })
}

export function useDeletePool() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: Id) => repository.deletePool(id),
    onSuccess: () => invalidate('pools', 'visits'),
  })
}

export function emptyVisit(pool: Pool, date: IsoDate, status: Visit['status'] = 'in_progress'): Visit {
  return {
    id: newId(), poolId: pool.id, clientId: pool.clientId, date, status, checkInAt: nowIso(),
    completedAt: status === 'in_progress' ? null : nowIso(),
    readings: { ph: null, chlorine: null, alkalinity: null }, tasks: [], products: [], notes: '', photos: [],
  }
}

export function useSaveVisit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (visit: Visit) => repository.saveVisit(visit),
    onSuccess: (visit) => {
      qc.setQueryData(keys.visit(visit.id), visit)
      return qc.invalidateQueries({ queryKey: ['visits'] })
    },
  })
}

export function useDeleteVisit() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: Id) => repository.deleteVisit(id), onSuccess: () => invalidate('visits', 'visit') })
}

export function useGenerateCharges() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ period, clients }: { period: Period; clients: Client[] }) => {
      const existing = await repository.listChargesByPeriod(period)
      const drafts = chargesToCreate(period, clients, existing)
      const charges: Charge[] = drafts.map((d) => ({ ...d, id: newId(), createdAt: nowIso() }))
      return repository.saveCharges(charges)
    },
    onSuccess: () => invalidate('charges'),
  })
}

export function useSaveCharge() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (charge: Charge) => repository.saveCharges([charge]),
    onSuccess: () => invalidate('charges'),
  })
}
