import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository, newId, nowIso } from '@/data'
import { chargesToCreate } from '@/domain/billing'
import type { CatalogItem, Charge, Client, Id, IsoDate, Period, Pool, Purchase, Settings, Supplier, Transaction, Visit } from '@/domain/types'

export const keys = {
  clients: ['clients'] as const,
  pools: ['pools'] as const,
  visit: (id: Id) => ['visit', id] as const,
  visitsInRange: (from: IsoDate, to: IsoDate) => ['visits', 'range', from, to] as const,
  visitsByClient: (clientId: Id) => ['visits', 'client', clientId] as const,
  chargesByPeriod: (period: Period) => ['charges', 'period', period] as const,
  chargesByClient: (clientId: Id) => ['charges', 'client', clientId] as const,
  settings: ['settings'] as const,
  suppliers: ['suppliers'] as const,
  catalog: ['catalog'] as const,
  purchases: ['purchases'] as const,
  purchase: (id: Id) => ['purchase', id] as const,
  transactionsByPeriod: (period: Period) => ['transactions', period] as const,
}

export const useClients = (opts: { refetchOnMount?: 'always' } = {}) => useQuery({ queryKey: keys.clients, queryFn: () => repository.listClients(), ...opts })
export const usePools = (opts: { refetchOnMount?: 'always' } = {}) => useQuery({ queryKey: keys.pools, queryFn: () => repository.listPools(), ...opts })

export const useVisit = (id: Id) => useQuery({ queryKey: keys.visit(id), queryFn: () => repository.getVisit(id) })
export const useVisitsInRange = (from: IsoDate, to: IsoDate) =>
  useQuery({ queryKey: keys.visitsInRange(from, to), queryFn: () => repository.listVisitsInRange(from, to) })
export const useVisitsByDate = (date: IsoDate) => useVisitsInRange(date, date)
export const useVisitsByClient = (clientId: Id) =>
  useQuery({ queryKey: keys.visitsByClient(clientId), queryFn: () => repository.listVisitsByClient(clientId, 20) })

export const useChargesByPeriod = (period: Period) =>
  useQuery({ queryKey: keys.chargesByPeriod(period), queryFn: () => repository.listChargesByPeriod(period) })
export const useChargesByClient = (clientId: Id) =>
  useQuery({ queryKey: keys.chargesByClient(clientId), queryFn: () => repository.listChargesByClient(clientId, 12) })

/** Coloca os registros salvos direto no cache, para a próxima tela já enxergá-los sem esperar a rede. */
function useUpsertCache() {
  const qc = useQueryClient()
  return <T extends { id: Id }>(key: readonly unknown[], items: T[]) =>
    qc.setQueryData<T[]>(key, (old) => {
      if (!old) return old
      const next = [...old]
      for (const item of items) {
        const i = next.findIndex((x) => x.id === item.id)
        if (i >= 0) next[i] = item
        else next.push(item)
      }
      return next
    })
}

function useInvalidate() {
  const qc = useQueryClient()
  return (...prefixes: string[]) => Promise.all(prefixes.map((p) => qc.invalidateQueries({ queryKey: [p] })))
}

export function useSaveClient() {
  const invalidate = useInvalidate()
  const cache = useUpsertCache()
  return useMutation({
    mutationFn: (client: Client) => repository.saveClient(client),
    onSuccess: (client) => {
      cache(keys.clients, [client])
      void invalidate('clients')
    },
  })
}

export function useDeleteClient() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: Id) => repository.deleteClient(id),
    onSuccess: () => invalidate('clients', 'pools', 'visits', 'charges'),
  })
}

export function useSavePools() {
  const invalidate = useInvalidate()
  const cache = useUpsertCache()
  return useMutation({
    mutationFn: (pools: Pool[]) => repository.savePools(pools),
    onSuccess: (pools) => {
      cache(keys.pools, pools)
      void invalidate('pools')
    },
  })
}

export function useSavePool() {
  const invalidate = useInvalidate()
  const cache = useUpsertCache()
  return useMutation({
    mutationFn: (pool: Pool) => repository.savePool(pool),
    onSuccess: (pool) => {
      cache(keys.pools, [pool])
      void invalidate('pools')
    },
  })
}

export function useDeletePool() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: Id) => repository.deletePool(id),
    onSuccess: () => invalidate('pools', 'visits'),
  })
}

/** Novo registro de visita para uma piscina. */
export function newVisit(pool: Pool, date: IsoDate, opts: { status?: Visit['status']; plannedDate?: IsoDate | null; time?: string | null } = {}): Visit {
  const status = opts.status ?? 'in_progress'
  return {
    id: newId(), poolId: pool.id, clientId: pool.clientId, date, plannedDate: opts.plannedDate ?? null, time: opts.time ?? null, status,
    checkInAt: status === 'in_progress' ? nowIso() : null,
    completedAt: status === 'skipped' ? nowIso() : null,
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

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => repository.getSettings(), staleTime: Infinity })
export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: Settings) => repository.saveSettings(settings),
    onSuccess: (settings) => qc.setQueryData(keys.settings, settings),
  })
}

export const useSuppliers = () => useQuery({ queryKey: keys.suppliers, queryFn: () => repository.listSuppliers() })
export function useSaveSupplier() {
  const invalidate = useInvalidate()
  const cache = useUpsertCache()
  return useMutation({
    mutationFn: (s: Supplier) => repository.saveSupplier(s),
    onSuccess: (s) => {
      cache(keys.suppliers, [s])
      void invalidate('suppliers')
    },
  })
}
export function useDeleteSupplier() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: Id) => repository.deleteSupplier(id), onSuccess: () => invalidate('suppliers', 'purchases', 'purchase') })
}

export const useCatalog = () => useQuery({ queryKey: keys.catalog, queryFn: () => repository.listCatalog() })
export function useSaveCatalogItems() {
  const invalidate = useInvalidate()
  const cache = useUpsertCache()
  return useMutation({
    mutationFn: (items: CatalogItem[]) => repository.saveCatalogItems(items),
    onSuccess: (items) => {
      cache(keys.catalog, items)
      void invalidate('catalog')
    },
  })
}
export function useDeleteCatalogItem() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: Id) => repository.deleteCatalogItem(id), onSuccess: () => invalidate('catalog') })
}

export const usePurchases = () => useQuery({ queryKey: keys.purchases, queryFn: () => repository.listPurchases(200) })
export const usePurchase = (id: Id) => useQuery({ queryKey: keys.purchase(id), queryFn: () => repository.getPurchase(id), enabled: Boolean(id) })
export function useSavePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Purchase) => repository.savePurchase(p),
    onSuccess: (p) => {
      qc.setQueryData(keys.purchase(p.id), p)
      return qc.invalidateQueries({ queryKey: keys.purchases })
    },
  })
}
export function useDeletePurchase() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: Id) => repository.deletePurchase(id), onSuccess: () => invalidate('purchases', 'transactions') })
}

export const useTransactions = (period: Period) =>
  useQuery({ queryKey: keys.transactionsByPeriod(period), queryFn: () => repository.listTransactionsByPeriod(period) })
export function useSaveTransaction() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (t: Transaction) => repository.saveTransaction(t), onSuccess: () => invalidate('transactions') })
}
export function useDeleteTransaction() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: Id) => repository.deleteTransaction(id), onSuccess: () => invalidate('transactions') })
}
