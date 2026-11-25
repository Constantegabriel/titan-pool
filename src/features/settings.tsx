import { cn } from '@/lib/cn'
import { Building2, ChevronRight, Download, HardDrive, ListChecks, LogOut, MessageCircle, ShieldCheck, Sparkles, Store, Upload } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddressField } from '@/components/address-field'
import { Badge, Button, ButtonLink, Card, ErrorState, ExternalButton, Field, Input, ListCard, Loading, PageHeader, SectionTitle } from '@/components/ui'
import { deviceRepository, repository, type Snapshot } from '@/data'
import { accessLabel } from '@/domain/account'
import { whatsappLink } from '@/domain/format'
import { useAccount } from '@/lib/account-context'
import { today } from '@/domain/dates'
import type { Settings } from '@/domain/types'
import { useClients, useSaveSettings, useSettings } from '@/hooks/data'
import { demoSnapshot } from './seed'

function MenuLink({ to, icon, title, hint }: { to: string; icon: ReactNode; title: string; hint: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block truncate text-sm text-slate-500">{hint}</span>
        </span>
        <ChevronRight className="size-5 text-slate-400" aria-hidden />
      </Link>
    </li>
  )
}

export function MorePage() {
  const qc = useQueryClient()
  const clients = useClients()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(task: () => Promise<string>) {
    setBusy(true)
    setStatus(null)
    try {
      setStatus(await task())
      await qc.invalidateQueries()
    } catch (e) {
      setStatus(`Erro: ${e instanceof Error ? e.message : 'falha inesperada'}`)
    } finally {
      setBusy(false)
    }
  }

  const exportBackup = () => run(async () => {
    const data = await repository.exportAll()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `titan-pool-backup-${today()}.json` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return `Backup gerado com ${data.clients.length} cliente(s).`
  })
  const importBackup = (file: File) => run(async () => {
    const data = JSON.parse(await file.text()) as Snapshot
    if (data.version !== 1 || !Array.isArray(data.clients)) throw new Error('arquivo de backup inválido')
    await repository.importAll(data)
    return `Backup restaurado: ${data.clients.length} cliente(s).`
  })
  const loadDemo = () => run(async () => {
    await repository.importAll(demoSnapshot())
    return 'Dados de exemplo adicionados: clientes, fornecedores e lista de itens.'
  })

  return (
    <>
      <div className="lg:hidden"><PageHeader title="Mais" /></div>
      <div className="hidden lg:block"><PageHeader title="Conta e dados" subtitle="Sua conta, backup e dados salvos no aparelho" /></div>
      <div className="lg:hidden">
      <ListCard>
        <MenuLink to="/mais/fornecedores" icon={<Store className="size-5" />} title="Fornecedores" hint="Lojas e distribuidores com WhatsApp" />
        <MenuLink to="/mais/itens" icon={<ListChecks className="size-5" />} title="Lista de itens" hint="Produtos e materiais que você compra" />
        <MenuLink to="/mais/ajustes" icon={<Building2 className="size-5" />} title="Empresa e roteiro" hint="Nome nos PDFs, horário de saída, ponto de partida" />
      </ListCard>
      </div>

      <div className={cn(repository.mode === 'cloud' ? 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-8' : 'lg:max-w-2xl')}>
      {repository.mode === 'cloud' && <div><AccountCard /></div>}
      <div className="lg:[&>div:first-child]:mt-0">
      <SectionTitle>Seus dados</SectionTitle>
      {repository.mode === 'local' && (
        <Card className="flex items-start gap-3">
          <HardDrive className="mt-0.5 size-5 text-amber-700" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Salvos neste aparelho</p>
            <p className="text-slate-600">Sem banco de dados configurado. Faça backup com frequência.</p>
          </div>
        </Card>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={exportBackup} loading={busy}><Download className="size-4" aria-hidden /> Backup</Button>
        <input ref={fileRef} type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="size-4" aria-hidden /> Restaurar</Button>
      </div>
      {clients.data?.length === 0 && (
        <Button variant="ghost" className="mt-2 w-full" onClick={loadDemo} disabled={busy}><Sparkles className="size-4" aria-hidden /> Carregar dados de exemplo</Button>
      )}
      {status && <p role="status" className="mt-2 text-center text-sm text-slate-600">{status}</p>}

      {repository.mode === 'cloud' && <DeviceDataImport onDone={() => qc.invalidateQueries()} />}
      </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">Titan Pool · para instalar, use “Adicionar à tela inicial” no navegador do celular.</p>
    </>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  if (settings.isPending) return <Loading />
  if (settings.error) return <ErrorState error={settings.error} />
  return <SettingsForm initial={settings.data} />
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial)
  const save = useSaveSettings()
  const [saved, setSaved] = useState(false)
  // Só a localização é guardada; os campos servem para achá-la.
  const [baseAddress, setBaseAddress] = useState({ address: '', area: '' })
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setSaved(false); setS((x) => ({ ...x, [k]: v })) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await save.mutateAsync(s)
    setSaved(true)
  }

  return (
    <>
      <PageHeader title="Empresa e roteiro" back="/mais" />
      <form onSubmit={submit} className="space-y-4">
        <SectionTitle>Aparece nos PDFs e mensagens</SectionTitle>
        <Card className="space-y-4">
          <Field label="Nome da empresa"><Input required value={s.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
          <Field label="Seu nome"><Input value={s.ownerName} onChange={(e) => set('ownerName', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone"><Input type="tel" inputMode="tel" value={s.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="CPF / CNPJ"><Input value={s.document} onChange={(e) => set('document', e.target.value)} /></Field>
          </div>
        </Card>

        <SectionTitle>Previsões do roteiro</SectionTitle>
        <Card className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Saída"><Input type="time" required value={s.dayStart} onChange={(e) => set('dayStart', e.target.value)} /></Field>
            <Field label="Min/piscina"><Input type="number" inputMode="numeric" min={5} max={600} required value={s.defaultServiceMinutes} onChange={(e) => set('defaultServiceMinutes', Number(e.target.value))} /></Field>
            <Field label="Km/h médio"><Input type="number" inputMode="numeric" min={5} max={120} required value={s.avgSpeedKmh} onChange={(e) => set('avgSpeedKmh', Number(e.target.value))} /></Field>
          </div>
          <Field label="Nome do ponto de partida"><Input placeholder="Ex.: Casa, Depósito" value={s.baseLabel} onChange={(e) => set('baseLabel', e.target.value)} /></Field>
          <AddressField
            areaLabel="Bairro e cidade da partida"
            value={{ address: baseAddress.address, area: baseAddress.area, point: s.base }}
            onChange={(p) => {
              setBaseAddress((b) => ({ address: p.address ?? b.address, area: p.area ?? b.area }))
              if (p.point !== undefined) set('base', p.point)
            }}
          />
        </Card>
        {save.error && <ErrorState error={save.error} />}
        <Button type="submit" className="w-full" loading={save.isPending}>{saved ? 'Salvo ✓' : 'Salvar'}</Button>
      </form>
    </>
  )
}

/**
 * Dados cadastrados antes do banco ficaram só no navegador deste aparelho.
 * Este cartão aparece quando há algo assim e envia tudo para a nuvem com um toque.
 */
function DeviceDataImport({ onDone }: { onDone: () => void }) {
  const local = useQuery({ queryKey: ['device-snapshot'], queryFn: () => deviceRepository().exportAll(), staleTime: Infinity })
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const data = local.data
  const count = data ? data.clients.length + (data.suppliers?.length ?? 0) + (data.purchases?.length ?? 0) + (data.transactions?.length ?? 0) : 0
  if (!data || count === 0) return null

  async function send() {
    setState('busy')
    try {
      // Os ajustes do aparelho não sobrescrevem os da nuvem.
      await repository.importAll({ ...data!, settings: undefined })
      setState('done')
      onDone()
    } catch {
      setState('error')
    }
  }

  return (
    <Card className="mt-3 border-brand-100 bg-brand-50/60">
      <p className="font-semibold text-brand-900">Dados salvos só neste aparelho</p>
      <p className="mt-0.5 text-sm text-brand-900/80">
        Encontramos {data.clients.length} cliente(s), {data.suppliers?.length ?? 0} fornecedor(es) e {data.purchases?.length ?? 0} pedido(s)
        cadastrados antes do banco de dados. Envie para a nuvem para ver em todos os aparelhos.
      </p>
      {state === 'done' ? (
        <p className="mt-3 text-sm font-semibold text-emerald-700">Pronto! Os dados já estão no banco.</p>
      ) : (
        <Button className="mt-3 w-full" onClick={send} loading={state === 'busy'}>Enviar para a nuvem</Button>
      )}
      {state === 'error' && <p className="mt-2 text-sm text-rose-700">Não foi possível enviar agora. Tente de novo.</p>}
    </Card>
  )
}

/** Conta, situação do plano, suporte e sair. */
function AccountCard() {
  const { account, signOut } = useAccount()
  if (!account?.org) return null
  const { label, tone } = accessLabel(account.org)
  const support = account.settings.support_whatsapp
  return (
    <>
      <SectionTitle>Sua conta</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{account.org.name}</p>
            <p className="truncate text-sm text-slate-500">{account.email}</p>
          </div>
          <Badge tone={tone}>{label}</Badge>
        </div>
        {support && account.org.status === 'trialing' && (
          <ExternalButton href={whatsappLink(support, `Olá! Quero assinar o Titan Pool (conta ${account.org.name}).`)} variant="whatsapp" size="sm" className="w-full">
            <MessageCircle className="size-4" aria-hidden /> Assinar / falar com o suporte
          </ExternalButton>
        )}
        {account.is_admin && (
          <ButtonLink to="/admin" variant="secondary" size="sm" className="w-full"><ShieldCheck className="size-4" aria-hidden /> Painel do super admin</ButtonLink>
        )}
        <Button variant="ghost" size="sm" className="w-full" onClick={signOut}><LogOut className="size-4" aria-hidden /> Sair</Button>
      </Card>
    </>
  )
}
