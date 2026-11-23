import { newId, nowIso, type Snapshot } from '@/data'
import type { Client, Pool, Weekday } from '@/domain/types'

/** Dados de exemplo para conhecer o app sem digitar tudo. */
export function demoSnapshot(): Snapshot {
  const people: Array<[string, string, string, number, Weekday[], number]> = [
    ['Mariana Alves', 'Rua das Palmeiras, 120', 'Jardim Europa', 32000, [1, 4], 280],
    ['Carlos Pereira', 'Av. Brasil, 845', 'Centro', 18000, [1], 200],
    ['Condomínio Vila Azul', 'Rua Ipê Amarelo, 50', 'Vila Nova', 90000, [1, 3, 5], 650],
    ['Fernanda Lima', 'Rua dos Girassóis, 33', 'Jardim América', 25000, [2, 5], 250],
    ['Roberto Santos', 'Rua Projetada, 9', 'Chácaras Primavera', 45000, [3], 320],
  ]
  const clients: Client[] = []
  const pools: Pool[] = []
  people.forEach(([name, address, neighborhood, volume, days, fee], i) => {
    const client: Client = {
      id: newId(), name, phone: `(11) 9${String(8000_0000 + i * 1111_111).slice(0, 4)}-${String(1000 + i * 1234).slice(0, 4)}`,
      address, neighborhood, notes: '', monthlyFeeCents: fee * 100, billingDay: [5, 10, 10, 15, 20][i], active: true, createdAt: nowIso(),
    }
    clients.push(client)
    pools.push({
      id: newId(), clientId: client.id, name: i === 2 ? 'Adulto' : 'Principal', volumeLiters: volume, type: i % 2 ? 'fibra' : 'vinil',
      sanitizer: i === 2 ? 'sal' : 'cloro', equipment: '', accessNotes: i === 2 ? 'Retirar chave na portaria' : '', visitDays: days, routeOrder: i + 1, createdAt: nowIso(),
    })
  })
  return { version: 1, exportedAt: nowIso(), clients, pools, visits: [], charges: [] }
}
