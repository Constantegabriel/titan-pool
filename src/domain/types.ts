/** Identificadores são UUIDs gerados no cliente, o que permite criar registros offline. */
export type Id = string

/** Data local no formato AAAA-MM-DD. */
export type IsoDate = string

/** Competência de cobrança no formato AAAA-MM. */
export type Period = string

/** 0 = domingo … 6 = sábado (mesma convenção de Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type PoolType = 'alvenaria' | 'vinil' | 'fibra'
export type Sanitizer = 'cloro' | 'sal'

export interface Client {
  id: Id
  name: string
  phone: string
  address: string
  neighborhood: string
  notes: string
  /** Valor da mensalidade em centavos, para evitar erros de ponto flutuante. */
  monthlyFeeCents: number
  /** Dia do mês para vencimento (1–28). */
  billingDay: number
  active: boolean
  /** Coordenadas da casa do cliente, usadas no roteiro e nas previsões de chegada. */
  lat: number | null
  lng: number | null
  createdAt: string
}

export interface Pool {
  id: Id
  clientId: Id
  name: string
  volumeLiters: number
  type: PoolType
  sanitizer: Sanitizer
  equipment: string
  accessNotes: string
  /** Como as visitas fixas se repetem. */
  recurrence: Recurrence
  /** Dias da semana (semanal/quinzenal). */
  visitDays: Weekday[]
  /** Dias do mês (mensal); 31 vira o último dia em meses mais curtos. */
  monthDays: number[]
  /** Semana de referência da recorrência quinzenal. */
  anchorDate: IsoDate | null
  /** Horário combinado com o cliente (HH:MM), se houver. */
  preferredTime: string | null
  /** Posição no roteiro do dia (menor primeiro). */
  routeOrder: number
  /** Duração do serviço; null usa o padrão dos ajustes. */
  serviceMinutes: number | null
  createdAt: string
}

export interface Readings {
  ph: number | null
  /** Cloro livre em ppm. */
  chlorine: number | null
  /** Alcalinidade total em ppm. */
  alkalinity: number | null
}

export interface ProductUsage {
  name: string
  quantity: number
  unit: 'g' | 'kg' | 'ml' | 'L' | 'un'
}

export type Recurrence = 'none' | 'weekly' | 'biweekly' | 'monthly'

/** scheduled = agendada; canceled = desmarcada (some da agenda, fica no histórico). */
export type VisitStatus = 'scheduled' | 'in_progress' | 'done' | 'skipped' | 'canceled'

export interface Visit {
  id: Id
  poolId: Id
  clientId: Id
  /** Data em que a visita acontece (ou vai acontecer). */
  date: IsoDate
  /** Data original da recorrência que esta visita representa; null para visita avulsa. */
  plannedDate: IsoDate | null
  /** Horário marcado (HH:MM), se houver. */
  time: string | null
  status: VisitStatus
  checkInAt: string | null
  completedAt: string | null
  readings: Readings
  tasks: string[]
  products: ProductUsage[]
  notes: string
  photos: string[]
}

export type ChargeStatus = 'pending' | 'paid'

export interface Charge {
  id: Id
  clientId: Id
  period: Period
  amountCents: number
  dueDate: IsoDate
  status: ChargeStatus
  paidAt: string | null
  createdAt: string
}

export type NewClient = Omit<Client, 'id' | 'createdAt'>
export type NewPool = Omit<Pool, 'id' | 'createdAt'>

export const VISIT_TASKS = [
  'Peneirar superfície',
  'Aspirar fundo',
  'Escovar paredes e bordas',
  'Limpar skimmer e pré-filtro',
  'Retrolavar filtro',
  'Aplicar produtos',
] as const

export interface GeoPoint {
  lat: number
  lng: number
}

/** Preferências do piscineiro (uma linha por conta). */
export interface Settings {
  businessName: string
  ownerName: string
  phone: string
  document: string
  /** Horário de saída padrão, HH:MM. */
  dayStart: string
  defaultServiceMinutes: number
  /** Velocidade média no trânsito urbano, km/h. */
  avgSpeedKmh: number
  /** Ponto de partida do dia (casa/depósito). */
  base: GeoPoint | null
  baseLabel: string
}

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'Titan Pool',
  ownerName: '',
  phone: '',
  document: '',
  dayStart: '08:00',
  defaultServiceMinutes: 40,
  avgSpeedKmh: 30,
  base: null,
  baseLabel: '',
}

export interface Supplier {
  id: Id
  name: string
  phone: string
  contact: string
  notes: string
  createdAt: string
}

export type ItemUnit = 'un' | 'kg' | 'g' | 'L' | 'ml' | 'cx' | 'balde' | 'pct'
export const ITEM_UNITS: ItemUnit[] = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'balde', 'pct']

/** Item da lista de compras recorrentes (catálogo). */
export interface CatalogItem {
  id: Id
  name: string
  unit: ItemUnit
  /** Último preço unitário pago, em centavos. */
  lastPriceCents: number | null
  createdAt: string
}

export interface PurchaseLine {
  name: string
  quantity: number
  unit: ItemUnit
  note: string
  /** Preço unitário informado pelo fornecedor. */
  unitPriceCents: number | null
}

export type PurchaseStatus = 'draft' | 'sent' | 'received' | 'canceled'

export interface Purchase {
  id: Id
  /** Número sequencial legível (ex.: 12), exibido como #0012. */
  number: number
  supplierId: Id | null
  clientId: Id | null
  lines: PurchaseLine[]
  notes: string
  status: PurchaseStatus
  /** Data em que o pedido foi criado. */
  date: IsoDate
  sentAt: string | null
  receivedAt: string | null
  /** Repassar o custo ao cliente na cobrança do mês. */
  billToClient: boolean
  createdAt: string
}

export type TransactionKind = 'income' | 'expense'

export interface Transaction {
  id: Id
  kind: TransactionKind
  category: string
  description: string
  amountCents: number
  date: IsoDate
  clientId: Id | null
  purchaseId: Id | null
  paid: boolean
  createdAt: string
}

export const EXPENSE_CATEGORIES = ['Produtos', 'Combustível', 'Equipamentos', 'Manutenção do veículo', 'Alimentação', 'Impostos', 'Outros'] as const
export const INCOME_CATEGORIES = ['Serviço avulso', 'Repasse de produtos', 'Instalação/reparo', 'Outros'] as const

/** De onde a rota do dia começa. auto = hoje sai de onde a pessoa está (se o GPS estiver ligado), senão de casa. */
export type StartMode = 'auto' | 'base' | 'gps'

/** Rota montada para um dia específico (ordem das visitas e como o dia começa/termina). */
export interface DayPlan {
  /** A própria data (AAAA-MM-DD): um plano por dia. */
  id: IsoDate
  /** Piscinas na ordem de visita. Paradas fora da lista entram no fim. */
  order: Id[]
  /** Horário de saída só deste dia; null usa o padrão dos ajustes. */
  startTime: string | null
  startMode: StartMode
  returnToBase: boolean
  updatedAt: string
}
