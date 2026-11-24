import { useMutation } from '@tanstack/react-query'
import { Droplets, Lock, LogOut, MailCheck, MessageCircle } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, ErrorState, ExternalButton, Field, Input, Loading } from '@/components/ui'
import { rpc, supabase } from '@/data'
import { type OrgInfo, accessLabel } from '@/domain/account'
import { whatsappLink } from '@/domain/format'
import { clearPending, readPending, savePending, useAccount } from '@/lib/account-context'

/** Mensagens do Supabase Auth em português. */
function authMessage(error: { message: string } | null | undefined): string {
  const m = error?.message ?? ''
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem cadastro. Entre com sua senha.'
  if (/password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  return m || 'Não foi possível concluir. Tente de novo.'
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-float"><Droplets className="size-5" aria-hidden /></span>
      <span className="text-xl font-bold tracking-tight text-slate-900">Titan Pool</span>
    </Link>
  )
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-4 py-10">
      <Brand className="mb-8 self-center" />
      <Card className="p-5">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </Card>
      {footer && <div className="mt-5 text-center text-sm text-slate-600">{footer}</div>}
    </div>
  )
}

const Message = ({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) => (
  <p role="status" className={tone === 'error' ? 'rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700' : 'rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-800'}>{children}</p>
)

export function LoginPage() {
  const { session } = useAccount()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (session) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg({ tone: 'error', text: authMessage(error) })
  }

  async function forgot() {
    if (!email.trim()) return setMsg({ tone: 'error', text: 'Digite seu e-mail acima para receber o link.' })
    setBusy(true)
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` })
    setBusy(false)
    setMsg(error ? { tone: 'error', text: authMessage(error) } : { tone: 'info', text: 'Enviamos um link para criar uma nova senha. Confira seu e-mail.' })
  }

  return (
    <AuthShell title="Entrar" subtitle="Acesse a agenda e os dados da sua empresa." footer={<>Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-brand-700">Teste grátis</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Senha"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {msg && <Message tone={msg.tone}>{msg.text}</Message>}
        <Button type="submit" className="h-12 w-full text-base" loading={busy}>Entrar</Button>
        <button type="button" onClick={forgot} className="block w-full text-center text-sm font-medium text-slate-500 hover:text-brand-700">Esqueci minha senha</button>
      </form>
    </AuthShell>
  )
}

export function SignupPage() {
  const { session, account } = useAccount()
  const [params] = useSearchParams()
  const invite = params.get('convite')
  const navigate = useNavigate()
  const [businessName, setBusinessName] = useState('')
  const [typedEmail, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const inviteInfo = useInvitation(invite)
  const trialDays = useTrialDays()
  // O e-mail do convite vem preenchido, mas a pessoa pode trocar.
  const email = typedEmail ?? inviteInfo.data?.email ?? ''

  // Já logado: o onboarding resolve convite/empresa pendente.
  if (session && account !== undefined) {
    if (invite) savePending({ invite })
    return <Navigate to="/" replace />
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    savePending(invite ? { invite } : { businessName: businessName.trim() })
    const { data, error: err } = await supabase!.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    setBusy(false)
    if (err) return setError(authMessage(err))
    // Supabase devolve usuário sem identidades quando o e-mail já existe.
    if (data.user && data.user.identities?.length === 0) return setError('Este e-mail já tem cadastro. Entre com sua senha.')
    if (data.session) navigate('/', { replace: true })
    else setSentTo(email.trim())
  }

  if (sentTo) {
    return (
      <AuthShell title="Confirme seu e-mail">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600"><MailCheck className="size-7" aria-hidden /></span>
          <p className="mt-3 text-sm text-slate-600">Enviamos um link para <strong>{sentTo}</strong>. Abra o e-mail e toque no link para ativar sua conta.</p>
          <p className="mt-2 text-xs text-slate-400">Não chegou? Confira a caixa de spam.</p>
        </div>
      </AuthShell>
    )
  }

  const invalidInvite = invite && inviteInfo.isSuccess && (!inviteInfo.data || !inviteInfo.data.valid)
  return (
    <AuthShell
      title={invite ? 'Ativar seu acesso' : `Teste grátis por ${trialDays} dias`}
      subtitle={invite
        ? (inviteInfo.data ? <>Você foi convidado para a conta <strong>{inviteInfo.data.org_name}</strong>. Crie seu login:</> : 'Carregando convite…')
        : 'Sem cartão de crédito. Configure em poucos minutos.'}
      footer={<>Já tem conta? <Link to="/entrar" className="font-semibold text-brand-700">Entrar</Link></>}
    >
      {invalidInvite ? (
        <Message tone="error">Este link de acesso não é válido ou já foi usado. Peça um novo para o suporte.</Message>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!invite && (
            <Field label="Nome da sua empresa"><Input required maxLength={120} placeholder="Ex.: Piscinas Silva" value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></Field>
          )}
          <Field label="E-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Crie uma senha" hint="Mínimo de 6 caracteres"><Input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <Message tone="error">{error}</Message>}
          <Button type="submit" className="h-12 w-full text-base" loading={busy}>{invite ? 'Ativar acesso' : 'Criar conta grátis'}</Button>
          <p className="text-center text-xs text-slate-400">Ao continuar você concorda em usar o Titan Pool para gerenciar seus clientes e serviços.</p>
        </form>
      )}
    </AuthShell>
  )
}

/** /convite/:token vira o cadastro com o convite. */
export function InviteRedirect() {
  const { token } = useParams()
  return <Navigate to={`/cadastro?convite=${token ?? ''}`} replace />
}

export function NewPasswordPage() {
  const { session } = useAccount()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error: err } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (err) setError(authMessage(err))
    else navigate('/', { replace: true })
  }

  if (session === undefined) return <Loading />
  return (
    <AuthShell title="Nova senha" footer={<Link to="/entrar" className="font-semibold text-brand-700">Voltar para entrar</Link>}>
      {!session ? (
        <Message tone="error">Link expirado. Peça um novo em “Esqueci minha senha”.</Message>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nova senha" hint="Mínimo de 6 caracteres"><Input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <Message tone="error">{error}</Message>}
          <Button type="submit" className="h-12 w-full text-base" loading={busy}>Salvar senha</Button>
        </form>
      )}
    </AuthShell>
  )
}

function useInvitation(token: string | null) {
  const [state, setState] = useState<{ isSuccess: boolean; data: { org_name: string; email: string | null; valid: boolean } | null }>({ isSuccess: false, data: null })
  useEffect(() => {
    if (!token) return
    rpc<{ org_name: string; email: string | null; valid: boolean } | null>('invitation_info', { p_token: token })
      .then((data) => setState({ isSuccess: true, data }))
      .catch(() => setState({ isSuccess: true, data: null }))
  }, [token])
  return state
}

function useTrialDays() {
  const [days, setDays] = useState(14)
  useEffect(() => {
    rpc<{ trial_days: number }>('public_settings').then((s) => setDays(s.trial_days)).catch(() => {})
  }, [])
  return days
}

/** Logado e sem conta: aceita o convite ou cria a empresa (automático se veio do cadastro). */
function Onboarding() {
  const { account, refresh, signOut } = useAccount()
  const pending = readPending()
  const [name, setName] = useState(pending?.businessName ?? '')
  const started = useRef(false)
  const create = useMutation({
    mutationFn: async (p: { invite?: string; businessName?: string }) => {
      if (p.invite) await rpc('accept_invitation', { p_token: p.invite })
      else await rpc('create_my_organization', { p_name: p.businessName })
    },
    onSuccess: async () => {
      clearPending()
      await refresh()
    },
  })

  useEffect(() => {
    if (started.current || !pending || (!pending.invite && !pending.businessName)) return
    started.current = true
    create.mutate(pending)
  }, [pending, create])

  if (create.isPending) return <Loading />
  return (
    <AuthShell title="Quase lá!" subtitle={`Entrou como ${account?.email ?? ''}. Qual é o nome da sua empresa?`}
      footer={<button type="button" onClick={signOut} className="font-semibold text-slate-500">Sair</button>}>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate({ businessName: name.trim() }) }} className="space-y-4">
        <Field label="Nome da empresa"><Input required maxLength={120} placeholder="Ex.: Piscinas Silva" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {create.error && <Message tone="error">{(create.error as Error).message}</Message>}
        <Button type="submit" className="h-12 w-full text-base">Começar teste grátis</Button>
      </form>
    </AuthShell>
  )
}

/** Conta sem acesso: teste acabou, plano venceu ou foi suspensa. */
function Blocked({ org }: { org: OrgInfo }) {
  const { account, signOut } = useAccount()
  const support = account?.settings.support_whatsapp
  const title = org.status === 'suspended' ? 'Conta suspensa' : org.status === 'trialing' ? 'Seu teste grátis terminou' : 'Seu plano venceu'
  return (
    <AuthShell title={title} subtitle={<>Conta <strong>{org.name}</strong> · {accessLabel(org).label}</>}
      footer={<button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 font-semibold text-slate-500"><LogOut className="size-4" aria-hidden />Sair</button>}>
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock className="size-7" aria-hidden /></span>
        <p className="mt-3 text-sm text-slate-600">Seus dados estão guardados. Fale com a gente para continuar usando o Titan Pool.</p>
        {support && (
          <ExternalButton href={whatsappLink(support, `Olá! Quero continuar usando o Titan Pool (conta ${org.name}, ${account?.email}).`)} variant="whatsapp" className="mt-4 w-full">
            <MessageCircle className="size-4" aria-hidden /> Falar no WhatsApp
          </ExternalButton>
        )}
      </div>
    </AuthShell>
  )
}

/** Protege o app: exige login, conta e acesso em dia. Sem banco configurado, libera direto. */
export function RequireAccess({ children }: { children: ReactNode }) {
  const { enabled, session, account, accountError } = useAccount()
  const location = useLocation()
  if (!enabled) return children
  if (session === undefined) return <Loading />
  if (!session) return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />
  if (accountError) return <div className="p-4"><ErrorState error={accountError} /></div>
  if (account === undefined) return <Loading />
  if (!account?.org) return <Onboarding />
  if (!account.org.has_access) return <Blocked org={account.org} />
  return children
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { enabled, session, account } = useAccount()
  if (!enabled) return <Navigate to="/" replace />
  if (session === undefined || (session && account === undefined)) return <Loading />
  if (!session) return <Navigate to="/entrar" replace state={{ from: '/admin' }} />
  if (!account?.is_admin) return <Navigate to="/" replace />
  return children
}
