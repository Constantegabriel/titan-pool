import type { SupabaseClient } from '@supabase/supabase-js'
import { SHARED_WORKSPACE_ID } from '@/config'
import { shiftPeriod } from '@/domain/dates'
import {
  type CatalogItem, type Charge, type Client, DEFAULT_SETTINGS, type Id, type Pool, type Purchase, type Settings,
  type Supplier, type Transaction, type Visit,
} from '@/domain/types'
import { type Repository, type Snapshot, nowIso } from './repository'

/*
 * Mapeamento camelCase (app) ↔ snake_case (Postgres), só no primeiro nível:
 * campos jsonb (itens, produtos, coordenadas) passam intactos.
 * owner_id é preenchido pelo banco (default auth.uid()) e nunca é enviado.
 */
type Row = Record<string, unknown>
const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function toRow(entity: object): Row {
  return Object.fromEntries(Object.entries(entity).map(([k, v]) => [snake(k), v]))
}
function fromRow<T>(row: Row): T {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) if (k !== 'owner_id') out[camel(k)] = v
  return out as T
}
/** Colunas numeric chegam como string no PostgREST. */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

const visitToRow = ({ readings, ...v }: Visit): Row => ({ ...toRow(v), ph: readings.ph, chlorine: readings.chlorine, alkalinity: readings.alkalinity })
function rowToVisit(row: Row): Visit {
  const { ph, chlorine, alkalinity, ...rest } = fromRow<Visit & { ph: unknown; chlorine: unknown; alkalinity: unknown }>(row)
  return { ...rest, readings: { ph: num(ph), chlorine: num(chlorine), alkalinity: num(alkalinity) } }
}
const rowToClient = (row: Row): Client => {
  const c = fromRow<Client>(row)
  return { ...c, lat: num(c.lat), lng: num(c.lng) }
}

const PHOTO_BUCKET = 'visit-photos'

export class SupabaseRepository implements Repository {
  readonly mode = 'cloud' as const
  private readonly sb: SupabaseClient
  constructor(sb: SupabaseClient) {
    this.sb = sb
  }

  private async rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
    const { data, error } = await query
    if (error) throw error
    return (data as Row[] | null) ?? []
  }
  private async exec(query: PromiseLike<{ error: unknown }>) {
    const { error } = await query
    if (error) throw error
  }
  private upsert(table: string, rows: Row[]) {
    return rows.length ? this.exec(this.sb.from(table).upsert(rows)) : Promise.resolve()
  }
  private remove(table: string, id: Id) {
    return this.exec(this.sb.from(table).delete().eq('id', id))
  }

  async getSettings(): Promise<Settings> {
    const [row] = await this.rows(this.sb.from('settings').select('*').limit(1))
    return { ...DEFAULT_SETTINGS, ...(row ? fromRow<Partial<Settings>>(row) : {}) }
  }
  async saveSettings(settings: Settings) {
    await this.exec(this.sb.from('settings').upsert(toRow(settings), { onConflict: 'owner_id' }))
    return settings
  }

  async listClients() {
    return (await this.rows(this.sb.from('clients').select('*').order('name'))).map(rowToClient)
  }
  saveClient = async (client: Client) => (await this.upsert('clients', [toRow(client)]), client)
  deleteClient = (id: Id) => this.remove('clients', id)

  async listPools() {
    return (await this.rows(this.sb.from('pools').select('*'))).map((r) => fromRow<Pool>(r))
  }
  savePool = async (pool: Pool) => (await this.upsert('pools', [toRow(pool)]), pool)
  savePools = async (pools: Pool[]) => (await this.upsert('pools', pools.map(toRow)), pools)
  deletePool = (id: Id) => this.remove('pools', id)

  async getVisit(id: Id) {
    const [row] = await this.rows(this.sb.from('visits').select('*').eq('id', id).limit(1))
    return row ? rowToVisit(row) : null
  }
  async listVisitsInRange(from: string, to: string) {
    const filter = `and(date.gte.${from},date.lte.${to}),and(planned_date.gte.${from},planned_date.lte.${to})`
    return (await this.rows(this.sb.from('visits').select('*').or(filter))).map(rowToVisit)
  }
  async listVisitsByClient(clientId: Id, limit: number) {
    return (await this.rows(this.sb.from('visits').select('*').eq('client_id', clientId).order('date', { ascending: false }).limit(limit))).map(rowToVisit)
  }
  saveVisit = async (visit: Visit) => (await this.upsert('visits', [visitToRow(visit)]), visit)
  deleteVisit = (id: Id) => this.remove('visits', id)

  async listChargesByPeriod(period: string) {
    return (await this.rows(this.sb.from('charges').select('*').eq('period', period))).map((r) => fromRow<Charge>(r))
  }
  async listChargesByClient(clientId: Id, limit: number) {
    return (await this.rows(this.sb.from('charges').select('*').eq('client_id', clientId).order('period', { ascending: false }).limit(limit))).map((r) => fromRow<Charge>(r))
  }
  saveCharges = async (charges: Charge[]) => (await this.upsert('charges', charges.map(toRow)), charges)

  async listSuppliers() {
    return (await this.rows(this.sb.from('suppliers').select('*').order('name'))).map((r) => fromRow<Supplier>(r))
  }
  saveSupplier = async (s: Supplier) => (await this.upsert('suppliers', [toRow(s)]), s)
  deleteSupplier = (id: Id) => this.remove('suppliers', id)

  async listCatalog() {
    return (await this.rows(this.sb.from('catalog_items').select('*').order('name'))).map((r) => fromRow<CatalogItem>(r))
  }
  saveCatalogItems = async (items: CatalogItem[]) => (await this.upsert('catalog_items', items.map(toRow)), items)
  deleteCatalogItem = (id: Id) => this.remove('catalog_items', id)

  async listPurchases(limit: number) {
    return (await this.rows(this.sb.from('purchases').select('*').order('number', { ascending: false }).limit(limit))).map((r) => fromRow<Purchase>(r))
  }
  async getPurchase(id: Id) {
    const [row] = await this.rows(this.sb.from('purchases').select('*').eq('id', id).limit(1))
    return row ? fromRow<Purchase>(row) : null
  }
  savePurchase = async (p: Purchase) => (await this.upsert('purchases', [toRow(p)]), p)
  deletePurchase = (id: Id) => this.remove('purchases', id)
  async nextPurchaseNumber() {
    const [row] = await this.rows(this.sb.from('purchases').select('number').order('number', { ascending: false }).limit(1))
    return ((row?.number as number | undefined) ?? 0) + 1
  }

  async listTransactionsByPeriod(period: string) {
    const from = `${period}-01`
    const to = `${shiftPeriod(period, 1)}-01`
    return (await this.rows(this.sb.from('transactions').select('*').gte('date', from).lt('date', to).order('date'))).map((r) => fromRow<Transaction>(r))
  }
  saveTransaction = async (t: Transaction) => (await this.upsert('transactions', [toRow(t)]), t)
  deleteTransaction = (id: Id) => this.remove('transactions', id)

  async uploadPhoto(visitId: Id, photo: Blob) {
    const { data: auth } = await this.sb.auth.getUser()
    // Pasta = dono dos dados (usuário logado ou o espaço compartilhado do acesso aberto).
    const path = `${auth.user?.id ?? SHARED_WORKSPACE_ID}/${visitId}/${crypto.randomUUID()}.jpg`
    const { error } = await this.sb.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: 'image/jpeg' })
    if (error) throw error
    // URL assinada de longa duração: o bucket é privado e só o dono lista/grava.
    const { data, error: signError } = await this.sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365)
    if (signError) throw signError
    return data.signedUrl
  }

  async exportAll(): Promise<Snapshot> {
    const all = (table: string) => this.rows(this.sb.from(table).select('*'))
    const [clients, pools, visits, charges, suppliers, catalog, purchases, transactions, settings] = await Promise.all([
      this.listClients(), this.listPools(), all('visits').then((r) => r.map(rowToVisit)),
      all('charges').then((r) => r.map((x) => fromRow<Charge>(x))), this.listSuppliers(), this.listCatalog(),
      all('purchases').then((r) => r.map((x) => fromRow<Purchase>(x))), all('transactions').then((r) => r.map((x) => fromRow<Transaction>(x))),
      this.getSettings(),
    ])
    return { version: 1, exportedAt: nowIso(), clients, pools, visits, charges, suppliers, catalog, purchases, transactions, settings }
  }

  async importAll(s: Snapshot) {
    await this.upsert('clients', s.clients.map((c) => toRow({ ...c, lat: c.lat ?? null, lng: c.lng ?? null })))
    await this.upsert('pools', s.pools.map((p) => toRow({
      ...p, serviceMinutes: p.serviceMinutes ?? null, recurrence: p.recurrence ?? (p.visitDays.length ? 'weekly' : 'none'),
      monthDays: p.monthDays ?? [], anchorDate: p.anchorDate ?? null, preferredTime: p.preferredTime ?? null,
    })))
    await this.upsert('visits', s.visits.map((v) => visitToRow({ ...v, plannedDate: v.plannedDate ?? null, time: v.time ?? null })))
    await this.upsert('charges', s.charges.map(toRow))
    await this.upsert('suppliers', (s.suppliers ?? []).map(toRow))
    await this.upsert('catalog_items', (s.catalog ?? []).map(toRow))
    await this.upsert('purchases', (s.purchases ?? []).map(toRow))
    await this.upsert('transactions', (s.transactions ?? []).map(toRow))
    if (s.settings) await this.saveSettings({ ...DEFAULT_SETTINGS, ...s.settings })
  }
}
