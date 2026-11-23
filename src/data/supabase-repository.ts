import type { SupabaseClient } from '@supabase/supabase-js'
import type { Charge, Client, Id, Pool, Visit, Weekday } from '@/domain/types'
import { type Repository, type Snapshot, nowIso } from './repository'

/* Mapeamento camelCase (app) ↔ snake_case (Postgres). owner_id é preenchido pelo banco (auth.uid()). */

type Row = Record<string, unknown>

const clientToRow = (c: Client): Row => ({
  id: c.id, name: c.name, phone: c.phone, address: c.address, neighborhood: c.neighborhood, notes: c.notes,
  monthly_fee_cents: c.monthlyFeeCents, billing_day: c.billingDay, active: c.active, created_at: c.createdAt,
})
const rowToClient = (r: Row): Client => ({
  id: r.id as Id, name: r.name as string, phone: r.phone as string, address: r.address as string,
  neighborhood: r.neighborhood as string, notes: r.notes as string, monthlyFeeCents: r.monthly_fee_cents as number,
  billingDay: r.billing_day as number, active: r.active as boolean, createdAt: r.created_at as string,
})

const poolToRow = (p: Pool): Row => ({
  id: p.id, client_id: p.clientId, name: p.name, volume_liters: p.volumeLiters, type: p.type, sanitizer: p.sanitizer,
  equipment: p.equipment, access_notes: p.accessNotes, visit_days: p.visitDays, route_order: p.routeOrder, created_at: p.createdAt,
})
const rowToPool = (r: Row): Pool => ({
  id: r.id as Id, clientId: r.client_id as Id, name: r.name as string, volumeLiters: r.volume_liters as number,
  type: r.type as Pool['type'], sanitizer: r.sanitizer as Pool['sanitizer'], equipment: r.equipment as string,
  accessNotes: r.access_notes as string, visitDays: r.visit_days as Weekday[], routeOrder: r.route_order as number,
  createdAt: r.created_at as string,
})

const visitToRow = (v: Visit): Row => ({
  id: v.id, pool_id: v.poolId, client_id: v.clientId, date: v.date, status: v.status, check_in_at: v.checkInAt,
  completed_at: v.completedAt, ph: v.readings.ph, chlorine: v.readings.chlorine, alkalinity: v.readings.alkalinity,
  tasks: v.tasks, products: v.products, notes: v.notes, photos: v.photos,
})
const rowToVisit = (r: Row): Visit => ({
  id: r.id as Id, poolId: r.pool_id as Id, clientId: r.client_id as Id, date: r.date as string,
  status: r.status as Visit['status'], checkInAt: r.check_in_at as string, completedAt: r.completed_at as string | null,
  readings: { ph: r.ph as number | null, chlorine: r.chlorine as number | null, alkalinity: r.alkalinity as number | null },
  tasks: r.tasks as string[], products: r.products as Visit['products'], notes: r.notes as string, photos: r.photos as string[],
})

const chargeToRow = (c: Charge): Row => ({
  id: c.id, client_id: c.clientId, period: c.period, amount_cents: c.amountCents, due_date: c.dueDate,
  status: c.status, paid_at: c.paidAt, created_at: c.createdAt,
})
const rowToCharge = (r: Row): Charge => ({
  id: r.id as Id, clientId: r.client_id as Id, period: r.period as string, amountCents: r.amount_cents as number,
  dueDate: r.due_date as string, status: r.status as Charge['status'], paidAt: r.paid_at as string | null,
  createdAt: r.created_at as string,
})

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

  async listClients() {
    return (await this.rows(this.sb.from('clients').select('*').order('name'))).map(rowToClient)
  }
  async saveClient(client: Client) {
    await this.exec(this.sb.from('clients').upsert(clientToRow(client)))
    return client
  }
  deleteClient = (id: Id) => this.exec(this.sb.from('clients').delete().eq('id', id))

  async listPools() {
    return (await this.rows(this.sb.from('pools').select('*'))).map(rowToPool)
  }
  async savePool(pool: Pool) {
    await this.exec(this.sb.from('pools').upsert(poolToRow(pool)))
    return pool
  }
  deletePool = (id: Id) => this.exec(this.sb.from('pools').delete().eq('id', id))

  async getVisit(id: Id) {
    const [row] = await this.rows(this.sb.from('visits').select('*').eq('id', id).limit(1))
    return row ? rowToVisit(row) : null
  }
  async listVisitsByDate(date: string) {
    return (await this.rows(this.sb.from('visits').select('*').eq('date', date))).map(rowToVisit)
  }
  async listVisitsByClient(clientId: Id, limit: number) {
    return (await this.rows(this.sb.from('visits').select('*').eq('client_id', clientId).order('date', { ascending: false }).limit(limit))).map(rowToVisit)
  }
  async saveVisit(visit: Visit) {
    await this.exec(this.sb.from('visits').upsert(visitToRow(visit)))
    return visit
  }
  deleteVisit = (id: Id) => this.exec(this.sb.from('visits').delete().eq('id', id))

  async listChargesByPeriod(period: string) {
    return (await this.rows(this.sb.from('charges').select('*').eq('period', period))).map(rowToCharge)
  }
  async listChargesByClient(clientId: Id, limit: number) {
    return (await this.rows(this.sb.from('charges').select('*').eq('client_id', clientId).order('period', { ascending: false }).limit(limit))).map(rowToCharge)
  }
  async saveCharges(charges: Charge[]) {
    if (charges.length) await this.exec(this.sb.from('charges').upsert(charges.map(chargeToRow)))
    return charges
  }

  async uploadPhoto(visitId: Id, photo: Blob) {
    const { data: auth } = await this.sb.auth.getUser()
    const path = `${auth.user?.id}/${visitId}/${crypto.randomUUID()}.jpg`
    const { error } = await this.sb.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: 'image/jpeg' })
    if (error) throw error
    // URL assinada de longa duração: o bucket é privado e só o dono lista/grava.
    const { data, error: signError } = await this.sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365)
    if (signError) throw signError
    return data.signedUrl
  }

  async exportAll(): Promise<Snapshot> {
    const [clients, pools, visits, charges] = await Promise.all([
      this.listClients(),
      this.listPools(),
      this.rows(this.sb.from('visits').select('*')).then((r) => r.map(rowToVisit)),
      this.rows(this.sb.from('charges').select('*')).then((r) => r.map(rowToCharge)),
    ])
    return { version: 1, exportedAt: nowIso(), clients, pools, visits, charges }
  }

  async importAll(s: Snapshot) {
    if (s.clients.length) await this.exec(this.sb.from('clients').upsert(s.clients.map(clientToRow)))
    if (s.pools.length) await this.exec(this.sb.from('pools').upsert(s.pools.map(poolToRow)))
    if (s.visits.length) await this.exec(this.sb.from('visits').upsert(s.visits.map(visitToRow)))
    await this.saveCharges(s.charges)
  }
}
