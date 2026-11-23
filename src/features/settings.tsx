import { Cloud, Download, HardDrive, LogOut, Sparkles, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Button, Card, PageHeader, SectionTitle } from '@/components/ui'
import { repository, supabase, type Snapshot } from '@/data'
import { today } from '@/domain/dates'
import { useClients } from '@/hooks/data'
import { demoSnapshot } from './seed'

export function SettingsPage() {
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

  const exportBackup = () =>
    run(async () => {
      const data = await repository.exportAll()
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
      const link = Object.assign(document.createElement('a'), { href: url, download: `piscineiro-backup-${today()}.json` })
      link.click()
      URL.revokeObjectURL(url)
      return `Backup gerado com ${data.clients.length} cliente(s).`
    })

  const importBackup = (file: File) =>
    run(async () => {
      const data = JSON.parse(await file.text()) as Snapshot
      if (data.version !== 1 || !Array.isArray(data.clients)) throw new Error('arquivo de backup inválido')
      await repository.importAll(data)
      return `Backup restaurado: ${data.clients.length} cliente(s).`
    })

  const loadDemo = () =>
    run(async () => {
      await repository.importAll(demoSnapshot())
      return 'Clientes de exemplo adicionados. Veja a agenda de segunda-feira.'
    })

  return (
    <>
      <PageHeader title="Ajustes" />
      <Card className="flex items-start gap-3">
        {repository.mode === 'cloud' ? <Cloud className="mt-0.5 size-5 text-cyan-700" aria-hidden /> : <HardDrive className="mt-0.5 size-5 text-amber-700" aria-hidden />}
        <div className="text-sm">
          <p className="font-semibold">{repository.mode === 'cloud' ? 'Sincronizado na nuvem' : 'Dados neste aparelho'}</p>
          <p className="text-slate-600">
            {repository.mode === 'cloud'
              ? 'Seus dados ficam na sua conta e aparecem em qualquer aparelho em que você entrar.'
              : 'Funciona sem internet e sem conta. Faça backups com frequência; ao limpar o navegador os dados são apagados.'}
          </p>
        </div>
      </Card>

      <SectionTitle>Backup</SectionTitle>
      <Card className="space-y-2">
        <Button variant="secondary" className="w-full" onClick={exportBackup} loading={busy}>
          <Download className="size-4" aria-hidden /> Baixar backup (.json)
        </Button>
        <input ref={fileRef} type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
        <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="size-4" aria-hidden /> Restaurar backup
        </Button>
        {clients.data?.length === 0 && (
          <Button variant="ghost" className="w-full" onClick={loadDemo} disabled={busy}>
            <Sparkles className="size-4" aria-hidden /> Carregar clientes de exemplo
          </Button>
        )}
        {status && <p role="status" className="pt-1 text-center text-sm text-slate-600">{status}</p>}
      </Card>

      {supabase && (
        <>
          <SectionTitle>Conta</SectionTitle>
          <Button variant="secondary" className="w-full" onClick={() => supabase!.auth.signOut()}>
            <LogOut className="size-4" aria-hidden /> Sair
          </Button>
        </>
      )}

      <p className="mt-8 text-center text-xs text-slate-400">
        Para instalar: no navegador do celular, use “Adicionar à tela inicial”.
      </p>
    </>
  )
}
