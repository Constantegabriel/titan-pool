import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout'
import { EmptyState, ButtonLink, Loading } from '@/components/ui'
import { AuthGate } from '@/features/auth'
import { TodayPage } from '@/features/today'

// Telas secundárias carregam sob demanda: a primeira abertura baixa só a agenda.
const ClientsPage = lazy(() => import('@/features/clients').then((m) => ({ default: m.ClientsPage })))
const ClientFormPage = lazy(() => import('@/features/clients').then((m) => ({ default: m.ClientFormPage })))
const ClientDetailPage = lazy(() => import('@/features/clients').then((m) => ({ default: m.ClientDetailPage })))
const PoolFormPage = lazy(() => import('@/features/pools').then((m) => ({ default: m.PoolFormPage })))
const VisitPage = lazy(() => import('@/features/visit').then((m) => ({ default: m.VisitPage })))
const BillingPage = lazy(() => import('@/features/billing').then((m) => ({ default: m.BillingPage })))
const SettingsPage = lazy(() => import('@/features/settings').then((m) => ({ default: m.SettingsPage })))

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
                <Route path="cobranca" element={<BillingPage />} />
                <Route path="ajustes" element={<SettingsPage />} />
                <Route path="*" element={<EmptyState icon={null} title="Página não encontrada"><ButtonLink to="/" className="mt-4">Ir para a agenda</ButtonLink></EmptyState>} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthGate>
    </QueryClientProvider>
  )
}
