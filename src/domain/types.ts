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
  visitDays: Weekday[]
  /** Posição no roteiro do dia (menor primeiro). */
  routeOrder: number
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

export type VisitStatus = 'in_progress' | 'done' | 'skipped'

export interface Visit {
  id: Id
  poolId: Id
  clientId: Id
  date: IsoDate
  status: VisitStatus
  checkInAt: string
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
