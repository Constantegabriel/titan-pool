import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from '@/components/layout'
import { ButtonLink, EmptyState, Loading } from '@/components/ui'
import { AgendaPage } from '@/features/agenda'
import { RequireAccess, RequireAdmin } from '@/features/auth'
import { AccountProvider } from '@/lib/account'
import { useAccount } from '@/lib/account-context'

// Telas carregam sob demanda: quem abre o app baixa só a agenda; quem abre o site, só a landing.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const auth = () => import('@/features/auth')
const clients = () => import('@/features/clients')
const finance = () => import('@/features/finance')
const purchases = () => import('@/features/purchases')
const settings = () => import('@/features/settings')
const suppliers = () => import('@/features/suppliers')

const LandingPage = page(() => import('@/features/landing'), 'LandingPage')
const LoginPage = page(auth, 'LoginPage')
const SignupPage = page(auth, 'SignupPage')
const NewPasswordPage = page(auth, 'NewPasswordPage')
const InviteRedirect = page(auth, 'InviteRedirect')
const AdminPage = page(() => import('@/features/admin'), 'AdminPage')
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
const ScheduleVisitPage = page(() => import('@/features/schedule-visit'), 'ScheduleVisitPage')

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

/** "/" é a landing page para quem não entrou e o app para quem entrou. */
function AppShell() {
  const { enabled, session } = useAccount()
  const location = useLocation()
  if (enabled && session === undefined) return <Loading />
  if (enabled && !session && location.pathname === '/') return <LandingPage />
  return (
    <RequireAccess>
      <Layout />
    </RequireAccess>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="inicio" element={<LandingPage />} />
              <Route path="entrar" element={<LoginPage />} />
              <Route path="cadastro" element={<SignupPage />} />
              <Route path="nova-senha" element={<NewPasswordPage />} />
              <Route path="convite/:token" element={<InviteRedirect />} />
              <Route path="admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
              <Route element={<AppShell />}>
                <Route index element={<AgendaPage />} />
                <Route path="agenda/nova" element={<ScheduleVisitPage />} />
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
                <Route path="*" element={<EmptyState icon={null} title="Página não encontrada"><ButtonLink to="/" className="mt-4">Ir para a agenda</ButtonLink></EmptyState>} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AccountProvider>
    </QueryClientProvider>
  )
}
