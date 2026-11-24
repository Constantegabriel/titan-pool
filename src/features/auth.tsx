import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Check, Droplets, Eye, EyeOff, FlaskConical, Lock, LogOut, Mail, MailCheck, MessageCircle, Wallet } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, ErrorState, ExternalButton, Field, Input, Loading } from '@/components/ui'
import { rpc, supabase } from '@/data'
import { type OrgInfo, accessLabel } from '@/domain/account'
import { whatsappLink } from '@/domain/format'
import { clearPending, readPending, savePending, useAccount } from '@/lib/account-context'
import { cn } from '@/lib/cn'

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

const BENEFITS: Array<[ReactNode, string, string]> = [
  [<CalendarDays key="c" className="size-5" />, 'Agenda e rota do dia', 'Visitas na melhor ordem, com horário de chegada.'],
  [<FlaskConical key="f" className="size-5" />, 'Relatório da piscina', 'Análise da água, fotos e envio pelo WhatsApp.'],
  [<Wallet key="w" className="size-5" />, 'Financeiro em dia', 'Mensalidades, compras e lucro de cada mês.'],
]

/** Moldura das telas de entrada: painel da marca com prévia animada no notebook, cabeçalho azul no celular. */
function AuthShell({ title, subtitle, children, footer, tabs }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; tabs?: 'login' | 'signup' }) {
  return (
    <div className="min-h-svh bg-white md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-10 text-white md:flex md:flex-col">
        <div className="tp-blob absolute -top-24 -right-24 size-80 rounded-full bg-brand-400/30 blur-3xl" aria-hidden />
        <div className="tp-blob absolute bottom-10 -left-20 size-72 rounded-full bg-sky-300/20 blur-3xl [animation-delay:-6s]" aria-hidden />
        <Waves />
        <Link to="/inicio" className="relative inline-flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><Droplets className="size-5" aria-hidden /></span>
          <span className="text-xl font-bold tracking-tight">Titan Pool</span>
        </Link>
        <div className="relative my-auto max-w-md py-10">
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight xl:text-5xl">O dia do piscineiro, organizado no celular.</h2>
          <ul className="mt-8 space-y-5">
            {BENEFITS.map(([icon, t, d], i) => (
              <li key={t} className="tp-rise flex gap-3" style={{ animationDelay: `${150 + i * 120}ms` }}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">{icon}</span>
                <span><span className="block font-semibold">{t}</span><span className="block text-sm text-brand-100">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <AuthPreview />
        <p className="relative mt-6 text-sm text-brand-200">© {YEAR} Titan Pool</p>
      </aside>

      <div className="flex min-h-svh flex-col">
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-16 text-white md:hidden">
          <Waves />
          <Link to="/inicio" className="relative inline-flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/15"><Droplets className="size-5" aria-hidden /></span>
            <span className="text-lg font-bold">Titan Pool</span>
          </Link>
          <p className="relative mt-3 max-w-xs text-sm text-brand-100">Agenda, rota, relatórios e financeiro da sua piscina em um só lugar.</p>
        </div>
        <div className="-mt-10 flex flex-1 flex-col px-4 pb-10 md:mt-0 md:items-center md:justify-center md:px-10">
          <div className="tp-page w-full rounded-3xl bg-white p-5 shadow-card md:max-w-sm md:p-0 md:shadow-none">
            {tabs && (
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Entrar ou criar conta">
                <Link to="/entrar" role="tab" aria-selected={tabs === 'login'} className={cn('flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition-colors', tabs === 'login' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700')}>Entrar</Link>
                <Link to="/cadastro" role="tab" aria-selected={tabs === 'signup'} className={cn('flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition-colors', tabs === 'signup' ? 'bg-white text-brand-700 shadow-card' : 'text-slate-500 hover:text-slate-700')}>Criar conta</Link>
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[15px] text-slate-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Cartões flutuando no painel azul: o que a pessoa vai ver depois de entrar. */
function AuthPreview() {
  return (
    <div className="relative h-40" aria-hidden>
      <div className="tp-float absolute left-0 top-2 w-64 rounded-2xl bg-white p-3.5 text-slate-900 shadow-2xl">
        <p className="flex justify-between text-[11px] font-medium text-slate-500"><span>Próxima visita · 2ª do dia</span><span>10 min</span></p>
        <div className="mt-1 flex items-end justify-between"><p className="font-bold">Cond. Vila Azul</p><p className="text-2xl font-bold text-brand-600">09:00</p></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="tp-progress h-full rounded-full bg-brand-500" /></div>
      </div>
      <div className="tp-float absolute top-16 left-56 flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-2xl [animation-delay:-2s]">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#25d366] text-white"><Check className="size-4" /></span>Relatório enviado
      </div>
      <div className="tp-float absolute top-0 left-72 hidden rounded-2xl bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur xl:block [animation-delay:-4s]">22,5 km · 5 visitas</div>
    </div>
  )
}

const YEAR = new Date().getFullYear()

/** Ondas decorativas do painel azul. */
function Waves() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-white/10" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden>
      <path d="M0 80 C 60 50, 120 110, 200 80 S 340 50, 400 80 L400 160 L0 160Z" fill="currentColor" />
      <path d="M0 110 C 70 85, 130 135, 210 110 S 330 85, 400 110 L400 160 L0 160Z" fill="currentColor" />
    </svg>
  )
}

/** Senha com botão de mostrar/ocultar. */
function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pr-12" />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-600">
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
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

  /** Link de acesso no e-mail: entra sem digitar a senha. */
  async function magicLink() {
    if (!email.trim()) return setMsg({ tone: 'error', text: 'Digite seu e-mail acima para receber o link de acesso.' })
    setBusy(true)
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } })
    setBusy(false)
    setMsg(error ? { tone: 'error', text: authMessage(error) } : { tone: 'info', text: 'Enviamos um link de acesso. Abra o e-mail neste aparelho e toque no link para entrar.' })
  }

  async function forgot() {
    if (!email.trim()) return setMsg({ tone: 'error', text: 'Digite seu e-mail acima para receber o link.' })
    setBusy(true)
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` })
    setBusy(false)
    setMsg(error ? { tone: 'error', text: authMessage(error) } : { tone: 'info', text: 'Enviamos um link para criar uma nova senha. Confira seu e-mail.' })
  }

  return (
    <AuthShell tabs="login" title="Bem-vindo de volta" subtitle="Entre para ver a agenda e os dados da sua empresa.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Senha"><PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {msg && <Message tone={msg.tone}>{msg.text}</Message>}
        <Button type="submit" className="h-12 w-full text-base" loading={busy}>Entrar</Button>
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={forgot} className="font-medium text-slate-500 hover:text-brand-700">Esqueci minha senha</button>
          <button type="button" onClick={magicLink} className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800"><Mail className="size-4" aria-hidden />Entrar sem senha</button>
        </div>
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
      tabs={invite ? undefined : 'signup'}
      title={invite ? 'Ativar seu acesso' : `Teste grátis por ${trialDays} dias`}
      subtitle={invite
        ? (inviteInfo.data ? <>Você foi convidado para a conta <strong>{inviteInfo.data.org_name}</strong>. Crie seu login:</> : 'Carregando convite…')
        : 'Sem cartão de crédito. Configure em poucos minutos.'}
      footer={invite ? <>Já tem conta? <Link to="/entrar" className="font-semibold text-brand-700">Entrar</Link></> : undefined}
    >
      {invalidInvite ? (
        <Message tone="error">Este link de acesso não é válido ou já foi usado. Peça um novo para o suporte.</Message>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!invite && (
            <Field label="Nome da sua empresa"><Input required maxLength={120} placeholder="Ex.: Piscinas Silva" value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></Field>
          )}
          <Field label="E-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Crie uma senha" hint="Mínimo de 6 caracteres"><PasswordInput autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
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
          <Field label="Nova senha" hint="Mínimo de 6 caracteres"><PasswordInput autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
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
