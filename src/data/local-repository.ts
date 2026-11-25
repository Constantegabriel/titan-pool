import { periodOf } from '@/domain/dates'
import {
  type CatalogItem, type Charge, type DayPlan, type Client, DEFAULT_SETTINGS, type Id, type Pool, type Purchase, type Settings,
  type Supplier, type Transaction, type Visit,
} from '@/domain/types'
import { type Repository, type Snapshot, nowIso } from './repository'

type Collections = {
  clients: Client
  pools: Pool
  visits: Visit
  charges: Charge
  suppliers: Supplier
  catalog: CatalogItem
  purchases: Purchase
  transactions: Transaction
  dayPlans: DayPlan
}
type Name = keyof Collections

const DB_NAME = 'piscineiro'
const STORE = 'collections'

/** IndexedDB guarda bem mais que o localStorage (fotos incluídas) e não bloqueia a interface. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Registros antigos ganham os campos novos com valores padrão. */
const MIGRATE: Partial<{ [N in Name]: (row: Collections[N]) => Collections[N] }> = {
  clients: (c) => ({ ...c, lat: c.lat ?? null, lng: c.lng ?? null }),
  pools: (p) => ({
    ...p,
    serviceMinutes: p.serviceMinutes ?? null,
    recurrence: p.recurrence ?? (p.visitDays?.length ? 'weekly' : 'none'),
    monthDays: p.monthDays ?? [],
    anchorDate: p.anchorDate ?? null,
    preferredTime: p.preferredTime ?? null,
  }),
  visits: (v) => ({ ...v, plannedDate: v.plannedDate ?? null, time: v.time ?? null }),
}

export class LocalRepository implements Repository {
  readonly mode = 'local' as const
  private db = openDb()
  private cache = new Map<string, unknown>()

  private async get<T>(key: string, fallback: T): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T
    const db = await this.db
    const value = await new Promise<T>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? fallback)
      req.onerror = () => reject(req.error)
    })
    this.cache.set(key, value)
    return value
  }

  private async put(key: string, value: unknown): Promise<void> {
    const db = await this.db
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    this.cache.set(key, value)
  }

  private async read<N extends Name>(name: N): Promise<Collections[N][]> {
    const rows = await this.get<Collections[N][]>(name, [])
    const migrate = MIGRATE[name] as ((row: Collections[N]) => Collections[N]) | undefined
    return migrate ? rows.map(migrate) : rows
  }

  private async upsert<N extends Name>(name: N, items: Collections[N][]): Promise<Collections[N][]> {
    const rows = [...(await this.read(name))]
    for (const item of items) {
      const index = rows.findIndex((r) => r.id === item.id)
      if (index >= 0) rows[index] = item
      else rows.push(item)
    }
    await this.put(name, rows)
    return items
  }

  private async remove<N extends Name>(name: N, predicate: (row: Collections[N]) => boolean) {
    await this.put(name, (await this.read(name)).filter((r) => !predicate(r)))
  }

  getSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await this.get<Partial<Settings>>('settings', {})) })
  saveSettings = async (settings: Settings) => (await this.put('settings', settings), settings)

  listClients = () => this.read('clients')
  saveClient = async (client: Client) => (await this.upsert('clients', [client]))[0]
  async deleteClient(id: Id) {
    const pools = (await this.read('pools')).filter((p) => p.clientId === id).map((p) => p.id)
    await this.remove('clients', (c) => c.id === id)
    await this.remove('pools', (p) => p.clientId === id)
    await this.remove('visits', (v) => v.clientId === id || pools.includes(v.poolId))
    await this.remove('charges', (c) => c.clientId === id)
    // Compras e lançamentos continuam no financeiro, só perdem o vínculo.
    const purchases = (await this.read('purchases')).filter((p) => p.clientId === id)
    await this.upsert('purchases', purchases.map((p) => ({ ...p, clientId: null })))
    const transactions = (await this.read('transactions')).filter((t) => t.clientId === id)
    await this.upsert('transactions', transactions.map((t) => ({ ...t, clientId: null })))
  }

  listPools = () => this.read('pools')
  savePool = async (pool: Pool) => (await this.upsert('pools', [pool]))[0]
  savePools = (pools: Pool[]) => this.upsert('pools', pools)
  async deletePool(id: Id) {
    await this.remove('pools', (p) => p.id === id)
    await this.remove('visits', (v) => v.poolId === id)
  }

  getVisit = async (id: Id) => (await this.read('visits')).find((v) => v.id === id) ?? null
  listVisitsInRange = async (from: string, to: string) =>
    (await this.read('visits')).filter((v) => (v.date >= from && v.date <= to) || (v.plannedDate !== null && v.plannedDate >= from && v.plannedDate <= to))
  async listVisitsByClient(clientId: Id, limit: number) {
    return (await this.read('visits')).filter((v) => v.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
  }
  saveVisit = async (visit: Visit) => (await this.upsert('visits', [visit]))[0]
  deleteVisit = (id: Id) => this.remove('visits', (v) => v.id === id)

  listChargesByPeriod = async (period: string) => (await this.read('charges')).filter((c) => c.period === period)
  async listChargesByClient(clientId: Id, limit: number) {
    return (await this.read('charges')).filter((c) => c.clientId === clientId).sort((a, b) => b.period.localeCompare(a.period)).slice(0, limit)
  }
  saveCharges = (charges: Charge[]) => this.upsert('charges', charges)

  listSuppliers = () => this.read('suppliers')
  saveSupplier = async (supplier: Supplier) => (await this.upsert('suppliers', [supplier]))[0]
  async deleteSupplier(id: Id) {
    await this.remove('suppliers', (s) => s.id === id)
    const purchases = (await this.read('purchases')).filter((p) => p.supplierId === id)
    await this.upsert('purchases', purchases.map((p) => ({ ...p, supplierId: null })))
  }

  listCatalog = () => this.read('catalog')
  saveCatalogItems = (items: CatalogItem[]) => this.upsert('catalog', items)
  deleteCatalogItem = (id: Id) => this.remove('catalog', (i) => i.id === id)

  async listPurchases(limit: number) {
    return (await this.read('purchases')).sort((a, b) => b.number - a.number).slice(0, limit)
  }
  getPurchase = async (id: Id) => (await this.read('purchases')).find((p) => p.id === id) ?? null
  savePurchase = async (purchase: Purchase) => (await this.upsert('purchases', [purchase]))[0]
  async deletePurchase(id: Id) {
    await this.remove('purchases', (p) => p.id === id)
    await this.remove('transactions', (t) => t.purchaseId === id)
  }
  nextPurchaseNumber = async () => Math.max(0, ...(await this.read('purchases')).map((p) => p.number)) + 1

  listTransactionsByPeriod = async (period: string) => (await this.read('transactions')).filter((t) => periodOf(t.date) === period)
  saveTransaction = async (t: Transaction) => (await this.upsert('transactions', [t]))[0]
  deleteTransaction = (id: Id) => this.remove('transactions', (t) => t.id === id)

  listDayPlans = async (from: string, to: string) => (await this.read('dayPlans')).filter((p) => p.id >= from && p.id <= to)
  saveDayPlan = async (plan: DayPlan) => (await this.upsert('dayPlans', [plan]))[0]
  deleteDayPlan = (date: string) => this.remove('dayPlans', (p) => p.id === date)

  uploadPhoto(_visitId: Id, photo: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(photo)
    })
  }

  async exportAll(): Promise<Snapshot> {
    return {
      version: 1,
      exportedAt: nowIso(),
      clients: await this.read('clients'),
      pools: await this.read('pools'),
      visits: await this.read('visits'),
      charges: await this.read('charges'),
      suppliers: await this.read('suppliers'),
      catalog: await this.read('catalog'),
      purchases: await this.read('purchases'),
      transactions: await this.read('transactions'),
      dayPlans: await this.read('dayPlans'),
      settings: await this.getSettings(),
    }
  }

  async importAll(s: Snapshot) {
    await this.upsert('clients', s.clients)
    await this.upsert('pools', s.pools)
    await this.upsert('visits', s.visits)
    await this.upsert('charges', s.charges)
    await this.upsert('suppliers', s.suppliers ?? [])
    await this.upsert('catalog', s.catalog ?? [])
    await this.upsert('purchases', s.purchases ?? [])
    await this.upsert('transactions', s.transactions ?? [])
    await this.upsert('dayPlans', s.dayPlans ?? [])
    if (s.settings) await this.saveSettings({ ...DEFAULT_SETTINGS, ...s.settings })
  }
}
