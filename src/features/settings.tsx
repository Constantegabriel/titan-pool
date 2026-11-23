import { Building2, ChevronRight, Cloud, Download, HardDrive, ListChecks, LogOut, Sparkles, Store, Upload } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LocationPicker } from '@/components/location-picker'
import { Button, Card, ErrorState, Field, Input, ListCard, Loading, PageHeader, SectionTitle } from '@/components/ui'
import { OPEN_ACCESS } from '@/config'
import { deviceRepository, repository, supabase, type Snapshot } from '@/data'
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
      <PageHeader title="Mais" />
      <ListCard>
        <MenuLink to="/mais/fornecedores" icon={<Store className="size-5" />} title="Fornecedores" hint="Lojas e distribuidores com WhatsApp" />
        <MenuLink to="/mais/itens" icon={<ListChecks className="size-5" />} title="Lista de itens" hint="Produtos e materiais que você compra" />
        <MenuLink to="/mais/ajustes" icon={<Building2 className="size-5" />} title="Empresa e roteiro" hint="Nome nos PDFs, horário de saída, ponto de partida" />
      </ListCard>

      <SectionTitle>Seus dados</SectionTitle>
      <Card className="flex items-start gap-3">
        {repository.mode === 'cloud' ? <Cloud className="mt-0.5 size-5 text-brand-700" aria-hidden /> : <HardDrive className="mt-0.5 size-5 text-amber-700" aria-hidden />}
        <div className="text-sm">
          <p className="font-semibold">{repository.mode === 'cloud' ? 'Sincronizado na nuvem' : 'Salvos neste aparelho'}</p>
          <p className="text-slate-600">
            {repository.mode === 'cloud'
              ? OPEN_ACCESS
                ? 'Tudo fica salvo no banco de dados e aparece igual no celular, no notebook e para quem tiver o link.'
                : 'Seus dados ficam na sua conta e aparecem em qualquer aparelho em que você entrar.'
              : 'Funciona sem internet e sem conta. Faça backup com frequência: limpar o navegador apaga os dados.'}
          </p>
        </div>
      </Card>
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

      {supabase && !OPEN_ACCESS && (
        <Button variant="secondary" className="mt-6 w-full" onClick={() => supabase!.auth.signOut()}><LogOut className="size-4" aria-hidden /> Sair da conta</Button>
      )}
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
          <LocationPicker value={s.base} address={s.baseLabel} onChange={(base) => set('base', base)} />
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
