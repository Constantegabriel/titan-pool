import type {
  CatalogItem, DayPlan, Charge, Client, Id, IsoDate, Period, Pool, Purchase, Settings, Supplier, Transaction, Visit,
} from '@/domain/types'

/**
 * Contrato único de acesso a dados. As telas dependem só disto, então trocar o
 * armazenamento (aparelho → Supabase → API própria) não exige mudar a interface.
 * Coleções pequenas (clientes, piscinas, fornecedores, itens) são listadas inteiras;
 * as que crescem com o tempo (visitas, cobranças, compras, lançamentos) são sempre
 * consultadas por recorte.
 */
export interface Repository {
  readonly mode: 'local' | 'cloud'

  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>

  listClients(): Promise<Client[]>
  saveClient(client: Client): Promise<Client>
  deleteClient(id: Id): Promise<void>

  listPools(): Promise<Pool[]>
  savePool(pool: Pool): Promise<Pool>
  savePools(pools: Pool[]): Promise<Pool[]>
  deletePool(id: Id): Promise<void>

  getVisit(id: Id): Promise<Visit | null>
  /** Visitas cuja data ou data planejada cai no intervalo (inclusive). */
  listVisitsInRange(from: IsoDate, to: IsoDate): Promise<Visit[]>
  listVisitsByClient(clientId: Id, limit: number): Promise<Visit[]>
  saveVisit(visit: Visit): Promise<Visit>
  deleteVisit(id: Id): Promise<void>

  listChargesByPeriod(period: Period): Promise<Charge[]>
  listChargesByClient(clientId: Id, limit: number): Promise<Charge[]>
  saveCharges(charges: Charge[]): Promise<Charge[]>

  listSuppliers(): Promise<Supplier[]>
  saveSupplier(supplier: Supplier): Promise<Supplier>
  deleteSupplier(id: Id): Promise<void>

  listCatalog(): Promise<CatalogItem[]>
  saveCatalogItems(items: CatalogItem[]): Promise<CatalogItem[]>
  deleteCatalogItem(id: Id): Promise<void>

  listPurchases(limit: number): Promise<Purchase[]>
  getPurchase(id: Id): Promise<Purchase | null>
  savePurchase(purchase: Purchase): Promise<Purchase>
  deletePurchase(id: Id): Promise<void>
  nextPurchaseNumber(): Promise<number>

  listTransactionsByPeriod(period: Period): Promise<Transaction[]>
  saveTransaction(transaction: Transaction): Promise<Transaction>
  deleteTransaction(id: Id): Promise<void>

  /** Rotas montadas por dia (vazio quando o banco ainda não tem a tabela). */
  listDayPlans(from: IsoDate, to: IsoDate): Promise<DayPlan[]>
  saveDayPlan(plan: DayPlan): Promise<DayPlan>
  deleteDayPlan(date: IsoDate): Promise<void>

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
  suppliers?: Supplier[]
  catalog?: CatalogItem[]
  purchases?: Purchase[]
  transactions?: Transaction[]
  dayPlans?: DayPlan[]
  settings?: Settings
}

export const newId = (): Id => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()
