import type { Charge, Client, Id, IsoDate, Period, Pool, Visit } from '@/domain/types'

/**
 * Contrato único de acesso a dados. As telas dependem só disto, então trocar o
 * armazenamento (aparelho → Supabase → API própria) não exige mudar a interface.
 * Coleções pequenas (clientes, piscinas) são listadas inteiras; as que crescem
 * com o tempo (visitas, cobranças) são sempre consultadas por recorte.
 */
export interface Repository {
  readonly mode: 'local' | 'cloud'

  listClients(): Promise<Client[]>
  saveClient(client: Client): Promise<Client>
  deleteClient(id: Id): Promise<void>

  listPools(): Promise<Pool[]>
  savePool(pool: Pool): Promise<Pool>
  deletePool(id: Id): Promise<void>

  getVisit(id: Id): Promise<Visit | null>
  listVisitsByDate(date: IsoDate): Promise<Visit[]>
  listVisitsByClient(clientId: Id, limit: number): Promise<Visit[]>
  saveVisit(visit: Visit): Promise<Visit>
  deleteVisit(id: Id): Promise<void>

  listChargesByPeriod(period: Period): Promise<Charge[]>
  listChargesByClient(clientId: Id, limit: number): Promise<Charge[]>
  saveCharges(charges: Charge[]): Promise<Charge[]>

  /** Armazena a foto (já comprimida) e devolve uma URL exibível. */
  uploadPhoto(visitId: Id, photo: Blob): Promise<string>

  exportAll(): Promise<Snapshot>
  importAll(snapshot: Snapshot): Promise<void>
}

export interface Snapshot {
  version: 1
  exportedAt: string
  clients: Client[]
  pools: Pool[]
  visits: Visit[]
  charges: Charge[]
}

export const newId = (): Id => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()
