import type { Charge, Client, Id, Pool, Visit } from '@/domain/types'
import { type Repository, type Snapshot, nowIso } from './repository'

type Collections = { clients: Client; pools: Pool; visits: Visit; charges: Charge }
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

export class LocalRepository implements Repository {
  readonly mode = 'local' as const
  private db = openDb()
  private cache = new Map<Name, unknown[]>()

  private async read<N extends Name>(name: N): Promise<Collections[N][]> {
    const cached = this.cache.get(name)
    if (cached) return cached as Collections[N][]
    const db = await this.db
    const rows = await new Promise<Collections[N][]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(name)
      req.onsuccess = () => resolve((req.result as Collections[N][] | undefined) ?? [])
      req.onerror = () => reject(req.error)
    })
    this.cache.set(name, rows)
    return rows
  }

  private async write<N extends Name>(name: N, rows: Collections[N][]): Promise<void> {
    const db = await this.db
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(rows, name)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    this.cache.set(name, rows)
  }

  private async upsert<N extends Name>(name: N, items: Collections[N][]): Promise<void> {
    const rows = [...(await this.read(name))]
    for (const item of items) {
      const index = rows.findIndex((r) => r.id === item.id)
      if (index >= 0) rows[index] = item
      else rows.push(item)
    }
    await this.write(name, rows)
  }

  private async remove<N extends Name>(name: N, predicate: (row: Collections[N]) => boolean) {
    await this.write(name, (await this.read(name)).filter((r) => !predicate(r)))
  }

  listClients = () => this.read('clients')
  listPools = () => this.read('pools')

  saveClient = async (client: Client) => (await this.upsert('clients', [client]), client)
  savePool = async (pool: Pool) => (await this.upsert('pools', [pool]), pool)
  saveVisit = async (visit: Visit) => (await this.upsert('visits', [visit]), visit)
  saveCharges = async (charges: Charge[]) => (await this.upsert('charges', charges), charges)

  async deleteClient(id: Id) {
    const pools = (await this.read('pools')).filter((p) => p.clientId === id).map((p) => p.id)
    await this.remove('clients', (c) => c.id === id)
    await this.remove('pools', (p) => p.clientId === id)
    await this.remove('visits', (v) => v.clientId === id || pools.includes(v.poolId))
    await this.remove('charges', (c) => c.clientId === id)
  }

  async deletePool(id: Id) {
    await this.remove('pools', (p) => p.id === id)
    await this.remove('visits', (v) => v.poolId === id)
  }

  deleteVisit = (id: Id) => this.remove('visits', (v) => v.id === id)

  getVisit = async (id: Id) => (await this.read('visits')).find((v) => v.id === id) ?? null
  listVisitsByDate = async (date: string) => (await this.read('visits')).filter((v) => v.date === date)
  async listVisitsByClient(clientId: Id, limit: number) {
    return (await this.read('visits'))
      .filter((v) => v.clientId === clientId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
  }

  listChargesByPeriod = async (period: string) => (await this.read('charges')).filter((c) => c.period === period)
  async listChargesByClient(clientId: Id, limit: number) {
    return (await this.read('charges'))
      .filter((c) => c.clientId === clientId)
      .sort((a, b) => b.period.localeCompare(a.period))
      .slice(0, limit)
  }

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
    }
  }

  async importAll(snapshot: Snapshot) {
    await this.upsert('clients', snapshot.clients)
    await this.upsert('pools', snapshot.pools)
    await this.upsert('visits', snapshot.visits)
    await this.upsert('charges', snapshot.charges)
  }
}
