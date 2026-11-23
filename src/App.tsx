import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout'
import { ButtonLink, EmptyState, Loading } from '@/components/ui'
import { AuthGate } from '@/features/auth'
import { TodayPage } from '@/features/today'

// Telas secundárias carregam sob demanda: a primeira abertura baixa só o roteiro do dia.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const clients = () => import('@/features/clients')
const finance = () => import('@/features/finance')
const purchases = () => import('@/features/purchases')
const settings = () => import('@/features/settings')
const suppliers = () => import('@/features/suppliers')

const ClientsPage = page(clients, 'ClientsPage')
const ClientFormPage = page(clients, 'ClientFormPage')
const ClientDetailPage = page(clients, 'ClientDetailPage')
const PoolFormPage = page(() => import('@/features/pools'), 'PoolFormPage')
const VisitPage = page(() => import('@/features/visit'), 'VisitPage')
const FinancePage = page(finance, 'FinancePage')
const TransactionFormPage = page(finance, 'TransactionFormPage')
const PurchasesPage = page(purchases, 'PurchasesPage')
const PurchasePage = page(purchases, 'PurchasePage')
const MorePage = page(settings, 'MorePage')
const SettingsPage = page(settings, 'SettingsPage')
const SuppliersPage = page(suppliers, 'SuppliersPage')
const SupplierFormPage = page(suppliers, 'SupplierFormPage')
const CatalogPage = page(() => import('@/features/catalog'), 'CatalogPage')

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<TodayPage />} />
                <Route path="clientes" element={<ClientsPage />} />
                <Route path="clientes/novo" element={<ClientFormPage />} />
                <Route path="clientes/:clientId" element={<ClientDetailPage />} />
                <Route path="clientes/:clientId/editar" element={<ClientFormPage />} />
                <Route path="clientes/:clientId/piscinas/nova" element={<PoolFormPage />} />
                <Route path="piscinas/:poolId/editar" element={<PoolFormPage />} />
                <Route path="visitas/:visitId" element={<VisitPage />} />
                <Route path="compras" element={<PurchasesPage />} />
                <Route path="compras/nova" element={<PurchasePage />} />
                <Route path="compras/:purchaseId" element={<PurchasePage />} />
                <Route path="financeiro" element={<FinancePage />} />
                <Route path="financeiro/lancamento/novo" element={<TransactionFormPage />} />
                <Route path="financeiro/lancamento/:transactionId" element={<TransactionFormPage />} />
                <Route path="cobranca" element={<Navigate to="/financeiro?aba=mensalidades" replace />} />
                <Route path="mais" element={<MorePage />} />
                <Route path="mais/ajustes" element={<SettingsPage />} />
                <Route path="mais/fornecedores" element={<SuppliersPage />} />
                <Route path="mais/fornecedores/novo" element={<SupplierFormPage />} />
                <Route path="mais/fornecedores/:supplierId" element={<SupplierFormPage />} />
                <Route path="mais/itens" element={<CatalogPage />} />
                <Route path="ajustes" element={<Navigate to="/mais" replace />} />
                <Route path="*" element={<EmptyState icon={null} title="Página não encontrada"><ButtonLink to="/" className="mt-4">Ir para o roteiro</ButtonLink></EmptyState>} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthGate>
    </QueryClientProvider>
  )
}
