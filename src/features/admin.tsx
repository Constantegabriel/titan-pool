import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, BadgeCheck, Ban, Building2, CalendarPlus, Check, Copy, Hourglass, Infinity as InfinityIcon, Link2, LogOut, Plus, RotateCcw, Search,
  Settings2, ShieldCheck, Trash2, UserPlus,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet } from '@/components/sheet'
import { Avatar, Badge, Button, EmptyState, ErrorState, ExternalButton, Field, Input, Loading, Segmented, Select, Textarea } from '@/components/ui'
import { rpc } from '@/data'
import { type AdminOrg, type OrgStatus, type PublicSettings, accessGroup, accessLabel } from '@/domain/account'
import { addDays, today } from '@/domain/dates'
import { whatsappLink } from '@/domain/format'
import { useAccount } from '@/lib/account-context'
import { cn } from '@/lib/cn'

const inviteUrl = (token: string) => `${window.location.origin}/convite/${token}`
const fmtDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—')

type Filter = 'all' | 'trial' | 'active' | 'blocked'

function useOrgs() {
  return useQuery({ queryKey: ['admin', 'orgs'], queryFn: () => rpc<AdminOrg[]>('admin_list_organizations') })
}

function useAdminAction() {
  const qc = useQueryClient()
  const { refresh } = useAccount()
  return useMutation({
    mutationFn: ({ fn, args }: { fn: string; args: Record<string, unknown> }) => rpc<unknown>(fn, args),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] })
      await refresh()
    },
  })
}

/** Painel do super admin: contas, acessos, período grátis e configurações da plataforma. */
export function AdminPage() {
  const { account, signOut } = useAccount()
  const orgs = useOrgs()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AdminOrg | null>(null)
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openedAt] = useState(() => Date.now())

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (orgs.data ?? []).filter(
      (o) => (filter === 'all' || accessGroup(o) === filter) &&
        (!q || `${o.name} ${o.owner_email ?? ''} ${o.member_emails.join(' ')}`.toLowerCase().includes(q)),
    )
  }, [orgs.data, filter, query])

  const all = orgs.data ?? []
  const count = (f: Filter) => all.filter((o) => accessGroup(o) === f).length
  const recent = all.filter((o) => new Date(o.created_at).getTime() > openedAt - 30 * 86_400_000).length

  const quickExtend = useAdminAction()

  return (
    <div className="min-h-svh">
      <div className="border-b border-slate-200/70 bg-white">
        <header className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 lg:px-8">
          <Link to="/" className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="Voltar ao app"><ArrowLeft className="size-5" /></Link>
          <span className="hidden size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-float sm:flex"><ShieldCheck className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">Super admin</p>
            <h1 className="truncate text-xl font-bold tracking-tight lg:text-2xl">Contas do Titan Pool</h1>
          </div>
          <p className="hidden text-sm text-slate-500 md:block">{account?.email}</p>
          <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)} aria-label="Configurações da plataforma"><Settings2 className="size-4" /> <span className="hidden md:inline">Configurações</span></Button>
          <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sair"><LogOut className="size-5" /></Button>
        </header>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 pb-16 lg:px-8">
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Building2 className="size-5" />} label="Contas" value={all.length} hint={`${recent} nova(s) em 30 dias`} onClick={() => setFilter('all')} active={filter === 'all'} />
          <Stat icon={<Hourglass className="size-5" />} label="Em teste" value={count('trial')} tone="text-brand-700" onClick={() => setFilter('trial')} active={filter === 'trial'} />
          <Stat icon={<BadgeCheck className="size-5" />} label="Ativas" value={count('active')} tone="text-emerald-600" onClick={() => setFilter('active')} active={filter === 'active'} />
          <Stat icon={<Ban className="size-5" />} label="Bloqueadas" value={count('blocked')} tone={count('blocked') ? 'text-rose-600' : undefined} hint="teste vencido ou suspensas" onClick={() => setFilter('blocked')} active={filter === 'blocked'} />
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 size-5 text-slate-400" aria-hidden />
            <Input className="pl-10" placeholder="Buscar por nome ou e-mail" aria-label="Buscar contas" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="lg:w-[26rem] [&>div]:mb-0">
            <Segmented label="Filtrar contas" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'Todas' }, { value: 'trial', label: 'Em teste' }, { value: 'active', label: 'Ativas' }, { value: 'blocked', label: 'Bloqueadas' },
            ]} />
          </div>
          <Button onClick={() => setCreating(true)}><UserPlus className="size-4" aria-hidden /> Novo acesso</Button>
        </div>

        {orgs.error ? <ErrorState error={orgs.error} /> : orgs.isPending ? <Loading /> : list.length === 0 ? (
          <EmptyState icon={<UserPlus className="size-8" />} title="Nenhuma conta aqui">Crie um acesso ou divulgue o cadastro pelo site.</EmptyState>
        ) : (
          <>
            {/* Notebook: tabela */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Conta</th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3 text-right">Clientes</th>
                    <th className="px-4 py-3">Última visita</th>
                    <th className="px-4 py-3">Criada em</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((o) => {
                    const { label, tone } = accessLabel(o)
                    const mine = o.id === account?.org?.id
                    return (
                      <tr key={o.id} className="cursor-pointer transition-colors hover:bg-brand-50/40" onClick={() => setEditing(o)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={o.name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{o.name}{mine && <span className="ml-1.5 text-xs font-medium text-slate-400">(sua conta)</span>}</p>
                              <p className="truncate text-xs text-slate-500">{o.member_emails[0] ?? o.owner_email ?? 'Sem login ainda'}{o.pending_invite && o.members === 0 && <span className="ml-1.5 font-semibold text-amber-700">· convite pendente</span>}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><Badge tone={tone}>{label}</Badge></td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{o.clients}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(o.last_visit)}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(o.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {o.status !== 'exempt' && (
                              <Button size="sm" variant="ghost" title="Somar 7 dias de teste" disabled={quickExtend.isPending}
                                onClick={() => quickExtend.mutate({ fn: 'admin_extend_trial', args: { p_org_id: o.id, p_days: 7 } })}>
                                <CalendarPlus className="size-4" aria-hidden /> +7 dias
                              </Button>
                            )}
                            <Button size="sm" variant="secondary" onClick={() => setEditing(o)}>Gerenciar</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">{list.length} de {all.length} conta(s)</p>
            </div>

            {/* Celular: cartões */}
            <ul className="space-y-2.5 md:hidden">
              {list.map((o) => {
                const { label, tone } = accessLabel(o)
                const mine = o.id === account?.org?.id
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => setEditing(o)} className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-card transition-colors hover:border-brand-200">
                      <div className="flex items-start gap-3">
                        <Avatar name={o.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{o.name}{mine && <span className="ml-1.5 text-xs font-medium text-slate-400">(sua conta)</span>}</p>
                          <p className="truncate text-sm text-slate-500">{o.member_emails[0] ?? o.owner_email ?? 'Sem login ainda'}</p>
                          <div className="mt-1.5"><Badge tone={tone}>{label}</Badge></div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{o.clients} cliente(s)</span>
                        <span>Última visita: {fmtDate(o.last_visit)}</span>
                        <span>Desde {fmtDate(o.created_at)}</span>
                        {o.pending_invite && o.members === 0 && <span className="font-medium text-amber-700">Convite pendente</span>}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {editing && <ManageSheet org={(orgs.data ?? []).find((o) => o.id === editing.id) ?? editing} isMine={editing.id === account?.org?.id} onClose={() => setEditing(null)} />}
      {creating && <CreateSheet defaultTrial={account?.settings.trial_days ?? 14} onClose={() => setCreating(false)} />}
      {settingsOpen && account && <SettingsSheet initial={account.settings} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function Stat({ icon, label, value, hint, tone, onClick, active }: { icon: ReactNode; label: string; value: number; hint?: string; tone?: string; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('rounded-2xl border bg-white p-4 text-left shadow-card transition-colors hover:border-brand-200', active ? 'border-brand-300 ring-4 ring-brand-50' : 'border-slate-100')}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="flex size-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500">{icon}</span>
      </div>
      <p className={cn('mt-1 text-3xl font-bold tabular-nums', tone)}>{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </button>
  )
}

/** Link de acesso pronto para copiar ou mandar pelo WhatsApp. */
function InviteLink({ token, orgName, phoneHint }: { token: string; orgName: string; phoneHint?: string }) {
  const [copied, setCopied] = useState(false)
  const url = inviteUrl(token)
  const message = `Olá! Seu acesso ao Titan Pool (${orgName}) está pronto. Crie sua senha neste link: ${url}`
  return (
    <div className="rounded-2xl bg-brand-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800"><Link2 className="size-4" aria-hidden />Link de acesso</p>
      <p className="mt-1 break-all text-xs text-brand-900/80">{url}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard?.writeText(url).catch(() => {}); setCopied(true) }}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? 'Copiado' : 'Copiar'}
        </Button>
        <ExternalButton size="sm" variant="whatsapp" href={whatsappLink(phoneHint ?? '', message)}>WhatsApp</ExternalButton>
      </div>
    </div>
  )
}

function CreateSheet({ defaultTrial, onClose }: { defaultTrial: number; onClose: () => void }) {
  const action = useAdminAction()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [kind, setKind] = useState<'trialing' | 'active' | 'exempt'>('trialing')
  const [days, setDays] = useState(defaultTrial)
  const [until, setUntil] = useState(addDays(today(), 30))
  const [created, setCreated] = useState<AdminOrg | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const org = (await action.mutateAsync({
      fn: 'admin_create_organization',
      args: { p_name: name, p_email: email, p_status: kind, p_trial_days: days, p_paid_until: kind === 'active' ? until : null },
    })) as AdminOrg
    setCreated(org)
  }

  return (
    <Sheet open title={created ? 'Acesso criado' : 'Novo acesso'} onClose={onClose}>
      {created ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Mande o link para <strong>{created.name}</strong>. A pessoa abre, cria a senha e já entra na conta.</p>
          <InviteLink token={created.invite_token!} orgName={created.name} />
          <Button variant="secondary" className="w-full" onClick={onClose}>Concluir</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nome da empresa / piscineiro"><Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="E-mail (opcional)" hint="Só para identificar; o login é criado pelo link"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Segmented label="Tipo de acesso" value={kind} onChange={setKind} options={[{ value: 'trialing', label: 'Teste grátis' }, { value: 'active', label: 'Plano pago' }, { value: 'exempt', label: 'Cortesia' }]} />
          {kind === 'trialing' && <Field label="Dias de teste"><Input type="number" min={1} max={365} required value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>}
          {kind === 'active' && <Field label="Plano pago até"><Input type="date" required value={until} onChange={(e) => setUntil(e.target.value)} /></Field>}
          {kind === 'exempt' && <p className="text-sm text-slate-500">Acesso sem data de fim e sem cobrança.</p>}
          {action.error && <ErrorState error={action.error} />}
          <Button type="submit" className="h-12 w-full" loading={action.isPending}><Plus className="size-4" aria-hidden /> Criar acesso e gerar link</Button>
        </form>
      )}
    </Sheet>
  )
}

function ManageSheet({ org, isMine, onClose }: { org: AdminOrg; isMine: boolean; onClose: () => void }) {
  const action = useAdminAction()
  const [until, setUntil] = useState(org.paid_until ?? addDays(today(), 30))
  const [notes, setNotes] = useState(org.notes)
  const [name, setName] = useState(org.name)
  const { label, tone } = accessLabel(org)

  const run = (fn: string, args: Record<string, unknown>) => action.mutate({ fn, args })
  const update = (patch: { status: OrgStatus; trial_ends_at?: string | null; paid_until?: string | null }) =>
    run('admin_update_organization', {
      p_org_id: org.id, p_name: name, p_status: patch.status,
      p_trial_ends_at: patch.trial_ends_at !== undefined ? patch.trial_ends_at : org.trial_ends_at,
      p_paid_until: patch.paid_until !== undefined ? patch.paid_until : org.paid_until,
      p_notes: notes,
    })

  return (
    <Sheet open wide title={org.name} subtitle={org.member_emails.join(', ') || 'Sem login ainda'} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={tone}>{label}</Badge>
          <span className="text-slate-500">{org.clients} cliente(s) · desde {fmtDate(org.created_at)}</span>
        </div>

        <Group title="Período grátis">
          <div className="grid grid-cols-3 gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} variant="secondary" size="sm" onClick={() => run('admin_extend_trial', { p_org_id: org.id, p_days: d })} disabled={action.isPending}>
                <CalendarPlus className="size-4" aria-hidden /> +{d} dias
              </Button>
            ))}
          </div>
          {org.trial_ends_at && <p className="text-xs text-slate-500">Teste até {fmtDate(org.trial_ends_at)}. Somar dias conta a partir de hoje ou do fim atual, o que for depois.</p>}
        </Group>

        <Group title="Plano pago">
          <div className="flex gap-2">
            <Input type="date" aria-label="Plano pago até" value={until} onChange={(e) => setUntil(e.target.value)} />
            <Button size="sm" className="h-11 shrink-0" onClick={() => update({ status: 'active', paid_until: until })} disabled={action.isPending}>Ativar até</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={() => setUntil(addDays(org.paid_until && org.paid_until > today() ? org.paid_until : today(), 30))}>+30 dias na data</Button>
            <Button size="sm" variant="secondary" onClick={() => update({ status: 'exempt' })} disabled={action.isPending}><InfinityIcon className="size-4" aria-hidden /> Cortesia</Button>
          </div>
        </Group>

        <Group title="Acesso">
          {org.status === 'suspended' ? (
            <Button variant="secondary" className="w-full" onClick={() => update({ status: org.paid_until ? 'active' : 'trialing' })} disabled={action.isPending}>
              <RotateCcw className="size-4" aria-hidden /> Reativar
            </Button>
          ) : (
            <Button variant="danger" className="w-full" disabled={isMine || action.isPending} onClick={() => confirm(`Suspender ${org.name}? A pessoa não consegue mais entrar até reativar.`) && update({ status: 'suspended' })}>
              <Ban className="size-4" aria-hidden /> Suspender acesso
            </Button>
          )}
          {org.pending_invite
            ? <InviteLink token={org.pending_invite} orgName={org.name} />
            : <Button variant="ghost" size="sm" className="w-full" onClick={() => run('admin_new_invitation', { p_org_id: org.id })} disabled={action.isPending}><Link2 className="size-4" aria-hidden /> Gerar link de acesso</Button>}
        </Group>

        <Group title="Dados">
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Anotações (só você vê)"><Textarea className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Button variant="secondary" size="sm" className="w-full" onClick={() => update({ status: org.status })} disabled={action.isPending}>Salvar nome e anotações</Button>
          <p className="text-xs text-slate-500">{org.clients} cliente(s) · criada em {fmtDate(org.created_at)} · última visita {fmtDate(org.last_visit)}</p>
        </Group>

        {action.error && <ErrorState error={action.error} />}
        {action.isSuccess && <p className="text-center text-sm font-medium text-emerald-700">Alteração salva.</p>}

        {!isMine && (
          <Button variant="ghost" size="sm" className="w-full text-rose-600" disabled={action.isPending}
            onClick={() => prompt(`Isto apaga a conta e TODOS os dados dela. Digite o nome "${org.name}" para confirmar:`) === org.name && action.mutate({ fn: 'admin_delete_organization', args: { p_org_id: org.id } }, { onSuccess: onClose })}>
            <Trash2 className="size-4" aria-hidden /> Excluir conta e dados
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function SettingsSheet({ initial, onClose }: { initial: PublicSettings; onClose: () => void }) {
  const action = useAdminAction()
  const [days, setDays] = useState(initial.trial_days)
  const [open, setOpen] = useState(initial.allow_self_signup)
  const [whats, setWhats] = useState(initial.support_whatsapp)
  return (
    <Sheet open title="Configurações da plataforma" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); action.mutate({ fn: 'admin_update_settings', args: { p_trial_days: days, p_allow_self_signup: open, p_support_whatsapp: whats } }, { onSuccess: onClose }) }}>
        <Field label="Dias de teste grátis no cadastro pelo site"><Input type="number" min={0} max={365} required value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
        <Field label="Cadastro pelo site">
          <Select value={open ? 'yes' : 'no'} onChange={(e) => setOpen(e.target.value === 'yes')}>
            <option value="yes">Aberto: qualquer pessoa cria conta em teste</option>
            <option value="no">Fechado: só com link de acesso</option>
          </Select>
        </Field>
        <Field label="WhatsApp do suporte" hint="Aparece para quem está em teste ou bloqueado"><Input type="tel" placeholder="(19) 99999-9999" value={whats} onChange={(e) => setWhats(e.target.value)} /></Field>
        {action.error && <ErrorState error={action.error} />}
        <Button type="submit" className="w-full" loading={action.isPending}>Salvar</Button>
      </form>
    </Sheet>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-slate-100 p-3">
      <h3 className="text-[13px] font-semibold text-slate-600">{title}</h3>
      {children}
    </section>
  )
}
