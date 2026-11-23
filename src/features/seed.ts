import { newId, nowIso, type Snapshot } from '@/data'
import { DEFAULT_SETTINGS, type CatalogItem, type Client, type Pool, type Supplier, type Weekday } from '@/domain/types'

type Person = [name: string, address: string, neighborhood: string, lat: number, lng: number, liters: number, days: Weekday[], fee: number]

/** Dados de exemplo (Campinas/SP) para conhecer o app sem digitar tudo. */
export function demoSnapshot(): Snapshot {
  const people: Person[] = [
    ['Mariana Alves', 'Rua das Palmeiras, 120', 'Cambuí, Campinas', -22.8937, -47.0498, 32000, [1, 3, 5], 280],
    ['Carlos Pereira', 'Av. Brasil, 845', 'Jardim Guanabara, Campinas', -22.8869, -47.0731, 18000, [1, 4], 200],
    ['Condomínio Vila Azul', 'Rua Ipê Amarelo, 50', 'Taquaral, Campinas', -22.8746, -47.0545, 90000, [1, 2, 3, 4, 5, 6], 650],
    ['Fernanda Lima', 'Rua dos Girassóis, 33', 'Nova Campinas, Campinas', -22.9031, -47.0379, 25000, [2, 4, 6], 250],
    ['Roberto Santos', 'Rua Projetada, 9', 'Barão Geraldo, Campinas', -22.8234, -47.0820, 45000, [1, 3, 5, 6], 320],
    ['Juliana Costa', 'Rua Coronel Quirino, 410', 'Cambuí, Campinas', -22.8975, -47.0560, 28000, [2, 4, 5], 260],
    ['Paulo Mendes', 'Av. Princesa D\'Oeste, 1500', 'Jardim Proença, Campinas', -22.9183, -47.0512, 22000, [1, 2, 3, 6], 220],
  ]
  // Ordem de rota propositalmente ruim, para o "Otimizar" mostrar a diferença.
  const scrambled = [4, 1, 6, 2, 7, 3, 5]
  const clients: Client[] = []
  const pools: Pool[] = []
  people.forEach(([name, address, neighborhood, lat, lng, liters, days, fee], i) => {
    const client: Client = {
      id: newId(), name, phone: `(19) 99${String(712 + i * 37).padStart(3, '0')}-${String(4100 + i * 211)}`,
      address, neighborhood, notes: '', monthlyFeeCents: fee * 100, billingDay: [5, 10, 10, 15, 20, 10, 5][i],
      active: true, lat, lng, createdAt: nowIso(),
    }
    clients.push(client)
    pools.push({
      id: newId(), clientId: client.id, name: i === 2 ? 'Adulto' : 'Principal', volumeLiters: liters, type: i % 2 ? 'fibra' : 'vinil',
      sanitizer: i === 2 ? 'sal' : 'cloro', equipment: '', accessNotes: i === 2 ? 'Retirar chave na portaria' : i === 4 ? 'Cachorro no quintal — avisar ao chegar' : '',
      visitDays: days, routeOrder: scrambled[i], serviceMinutes: i === 2 ? 70 : null, createdAt: nowIso(),
    })
  })
  const suppliers: Supplier[] = [
    { id: newId(), name: 'Aqua Center Piscinas', phone: '(19) 3251-4400', contact: 'Pedro', notes: 'Entrega em 24 h', createdAt: nowIso() },
    { id: newId(), name: 'Distribuidora Cristal', phone: '(19) 99820-1133', contact: 'Ana', notes: 'Melhor preço em cloro a granel', createdAt: nowIso() },
  ]
  const catalog: CatalogItem[] = [
    ['Cloro granulado 10 kg', 'balde', 21000], ['Bicarbonato de sódio', 'kg', 1500], ['Redutor de pH', 'L', 2400],
    ['Algicida de manutenção', 'L', 2900], ['Clarificante', 'L', 2600], ['Margarida (escova)', 'un', 4500],
    ['Peneira de superfície', 'un', 3800], ['Aspirador com mangueira', 'un', 18900], ['Pastilha de cloro', 'un', 650],
    ['Estojo de teste pH/cloro', 'un', 3500],
  ].map(([name, unit, price]) => ({ id: newId(), name: name as string, unit: unit as CatalogItem['unit'], lastPriceCents: price as number, createdAt: nowIso() }))
  return {
    version: 1, exportedAt: nowIso(), clients, pools, visits: [], charges: [], suppliers, catalog, purchases: [], transactions: [],
    settings: { ...DEFAULT_SETTINGS, base: { lat: -22.9064, lng: -47.0616 }, baseLabel: 'Casa' },
  }
}
