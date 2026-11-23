import { Camera, CheckCircle2, FlaskConical, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, ErrorState, ExternalButton, Field, Input, Loading, PageHeader, SectionTitle, Select, Textarea } from '@/components/ui'
import { repository, nowIso } from '@/data'
import { IDEAL_RANGES, type ReadingKey, classify, suggestCorrections } from '@/domain/chemistry'
import { parseIsoDate } from '@/domain/dates'
import { whatsappLink } from '@/domain/format'
import { visitReportMessage } from '@/domain/messages'
import { type Client, type Pool, type ProductUsage, VISIT_TASKS, type Visit } from '@/domain/types'
import { useCatalog, useClients, useDeleteVisit, usePools, useSaveVisit, useSettings, useVisit } from '@/hooks/data'
import { PdfButton } from '@/components/pdf-button'
import { loadPdf, slug } from '@/lib/share'
import { cn } from '@/lib/cn'
import { compressImage } from '@/lib/images'

export function VisitPage() {
  const { visitId = '' } = useParams()
  const visit = useVisit(visitId)
  const clients = useClients()
  const pools = usePools()

  if (visit.isPending || clients.isPending || pools.isPending) return <Loading />
  if (visit.error) return <ErrorState error={visit.error} />
  const pool = pools.data?.find((p) => p.id === visit.data?.poolId)
  const client = clients.data?.find((c) => c.id === visit.data?.clientId)
  if (!visit.data || !pool || !client) return <ErrorState error={new Error('Visita não encontrada.')} />
  return <VisitEditor key={visit.data.id} initial={visit.data} pool={pool} client={client} />
}

const PRODUCT_UNITS: ProductUsage['unit'][] = ['g', 'kg', 'ml', 'L', 'un']
const READING_KEYS = Object.keys(IDEAL_RANGES) as ReadingKey[]

const toNumber = (text: string): number | null => {
  const value = Number.parseFloat(text.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
const toText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

function VisitEditor({ initial, pool, client }: { initial: Visit; pool: Pool; client: Client }) {
  const [visit, setVisit] = useState(initial)
  const [readingText, setReadingText] = useState(() =>
    Object.fromEntries(READING_KEYS.map((k) => [k, toText(initial.readings[k])])) as Record<ReadingKey, string>,
  )
  const save = useSaveVisit()
  const remove = useDeleteVisit()
  const settings = useSettings()
  const navigate = useNavigate()
  const dirty = useRef(false)
  const [completing, setCompleting] = useState(false)

  const update = (patch: Partial<Visit>) => {
    dirty.current = true
    setVisit((v) => ({ ...v, ...patch }))
  }

  // Salvamento automático: nada se perde se o celular bloquear ou o app fechar no meio da visita.
  const { mutate } = save
  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => mutate(visit), 700)
    return () => clearTimeout(timer)
  }, [visit, mutate])

  const setReading = (key: ReadingKey, text: string) => {
    setReadingText((r) => ({ ...r, [key]: text }))
    update({ readings: { ...visit.readings, [key]: toNumber(text) } })
  }

  const toggleTask = (task: string) =>
    update({ tasks: visit.tasks.includes(task) ? visit.tasks.filter((t) => t !== task) : [...visit.tasks, task] })

  const complete = async () => {
    const done: Visit = { ...visit, status: 'done', completedAt: visit.completedAt ?? nowIso() }
    dirty.current = false
    setCompleting(true)
    setVisit(done)
    try {
      await save.mutateAsync(done)
    } finally {
      setCompleting(false)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const undoSkip = async () => {
    await remove.mutateAsync(visit.id)
    navigate(`/?data=${visit.date}`, { replace: true })
  }

  const suggestions = suggestCorrections(visit.readings, pool.volumeLiters)
  const date = parseIsoDate(visit.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const report = visitReportMessage(visit, pool, client)

  return (
    <>
      <PageHeader title={client.name} subtitle={<span className="inline-block first-letter:uppercase">{pool.name} · {date}</span>} back={`/?data=${visit.date}`} />

      {visit.status === 'done' && (
        <Card className="mb-4 bg-emerald-50 ring-emerald-200">
          <p className="flex items-center gap-2 font-semibold text-emerald-900">
            <CheckCircle2 className="size-5" aria-hidden /> Visita concluída
          </p>
          <p className="mt-1 text-sm text-emerald-900/80">Envie o relatório ao cliente. Alterações abaixo são salvas automaticamente.</p>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <ExternalButton href={whatsappLink(client.phone, report)} variant="whatsapp">
              Enviar no WhatsApp
            </ExternalButton>
            <PdfButton
              label="PDF"
              filename={`relatorio-${visit.date}-${slug(client.name)}.pdf`}
              title={`Relatório de visita — ${client.name}`}
              make={async () => (await loadPdf()).visitReportPdf(visit, pool, client, settings.data!)}
            />
          </div>
        </Card>
      )}

      {visit.status === 'skipped' ? (
        <Card className="space-y-3">
          <p className="font-medium">Visita marcada como não realizada.</p>
          <Field label="Motivo (opcional)">
            <Textarea className="min-h-16" placeholder="Ex.: cliente viajando, chuva forte" value={visit.notes} onChange={(e) => update({ notes: e.target.value })} />
          </Field>
          <Button variant="secondary" onClick={undoSkip} loading={remove.isPending}>
            <Undo2 className="size-4" aria-hidden /> Desfazer e voltar à agenda
          </Button>
        </Card>
      ) : (
        <>
          <SectionTitle>Análise da água</SectionTitle>
          <Card>
            <div className="grid grid-cols-3 gap-3">
              {READING_KEYS.map((key) => {
                const range = IDEAL_RANGES[key]
                const level = classify(key, visit.readings[key])
                return (
                  <Field key={key} label={range.label} hint={`Ideal ${range.min.toLocaleString('pt-BR')}–${range.max.toLocaleString('pt-BR')}${range.unit ? ` ${range.unit}` : ''}`}>
                    <Input
                      inputMode="decimal"
                      value={readingText[key]}
                      onChange={(e) => setReading(key, e.target.value)}
                      className={cn(level === 'ok' && 'ring-emerald-400', (level === 'low' || level === 'high') && 'ring-2 ring-amber-400')}
                      aria-describedby={`${key}-status`}
                    />
                    <span id={`${key}-status`} className="mt-1 block">
                      {level === 'ok' && <Badge tone="success">OK</Badge>}
                      {level === 'low' && <Badge tone="warning">Baixo</Badge>}
                      {level === 'high' && <Badge tone="warning">Alto</Badge>}
                    </span>
                  </Field>
                )
              })}
            </div>
            {suggestions.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                <p className="mb-1 flex items-center gap-1.5 font-semibold">
                  <FlaskConical className="size-4" aria-hidden /> Sugestão de correção ({pool.volumeLiters.toLocaleString('pt-BR')} L)
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {suggestions.map((s) => <li key={s.key}>{s.message}</li>)}
                </ul>
                <p className="mt-2 text-xs text-amber-900/80">Estimativa. Confira sempre a dosagem no rótulo do produto.</p>
              </div>
            )}
          </Card>

          <SectionTitle>Serviços realizados</SectionTitle>
          <Card className="space-y-1 py-2">
            {VISIT_TASKS.map((task) => (
              <label key={task} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" className="size-5 accent-cyan-700" checked={visit.tasks.includes(task)} onChange={() => toggleTask(task)} />
                {task}
              </label>
            ))}
          </Card>

          <SectionTitle>Produtos aplicados</SectionTitle>
          <Products products={visit.products} onChange={(products) => update({ products })} />

          <SectionTitle>Fotos</SectionTitle>
          <Photos visitId={visit.id} photos={visit.photos} onChange={(photos) => update({ photos })} />

          <SectionTitle>Observações</SectionTitle>
          <Textarea placeholder="Ex.: bomba fazendo barulho, sugerir troca da areia do filtro" value={visit.notes} onChange={(e) => update({ notes: e.target.value })} />

          {save.error && <div className="mt-4"><ErrorState error={save.error} /></div>}
          <p className="mt-4 text-center text-xs text-slate-500" aria-live="polite">
            {save.isPending ? 'Salvando…' : save.isSuccess ? 'Alterações salvas' : ''}
          </p>
          {visit.status === 'in_progress' && (
            <Button className="mt-2 w-full" onClick={complete} loading={completing}>
              <CheckCircle2 className="size-5" aria-hidden /> Concluir visita
            </Button>
          )}
        </>
      )}
    </>
  )
}

function Products({ products, onChange }: { products: ProductUsage[]; onChange: (p: ProductUsage[]) => void }) {
  const catalog = useCatalog()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<ProductUsage['unit']>('g')

  const add = () => {
    const qty = toNumber(quantity)
    if (!name.trim() || qty === null) return
    onChange([...products, { name: name.trim(), quantity: qty, unit }])
    setName('')
    setQuantity('')
  }

  return (
    <Card className="space-y-3">
      {products.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {products.map((p, i) => (
            <li key={`${p.name}-${i}`} className="flex items-center justify-between py-2 text-sm">
              <span>{p.name}</span>
              <span className="flex items-center gap-2 text-slate-600">
                {p.quantity.toLocaleString('pt-BR')} {p.unit}
                <button type="button" className="rounded-lg p-1 hover:bg-slate-100" aria-label={`Remover ${p.name}`} onClick={() => onChange(products.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_5rem_4.5rem] gap-2">
        <Input list="product-names" placeholder="Produto" aria-label="Produto" value={name} onChange={(e) => setName(e.target.value)} />
        <Input inputMode="decimal" placeholder="Qtd." aria-label="Quantidade" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <Select aria-label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value as ProductUsage['unit'])}>
          {PRODUCT_UNITS.map((u) => <option key={u}>{u}</option>)}
        </Select>
      </div>
      <datalist id="product-names">
        {[...new Set([...(catalog.data ?? []).map((i) => i.name), 'Cloro granulado', 'Cloro estabilizado', 'Pastilha de cloro', 'Bicarbonato de sódio', 'Redutor de pH', 'Elevador de pH', 'Algicida', 'Clarificante', 'Sulfato de alumínio', 'Barrilha'])].map((p) => <option key={p} value={p} />)}
      </datalist>
      <Button variant="secondary" size="sm" className="w-full" onClick={add} disabled={!name.trim() || toNumber(quantity) === null}>
        <Plus className="size-4" aria-hidden /> Adicionar produto
      </Button>
    </Card>
  )
}

function Photos({ visitId, photos, onChange }: { visitId: string; photos: string[]; onChange: (p: string[]) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const urls: string[] = []
      for (const file of Array.from(files)) urls.push(await repository.uploadPhoto(visitId, await compressImage(file)))
      onChange([...photos, ...urls])
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card>
      {photos.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <li key={src.slice(-40) + i} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
              <img src={src} alt={`Foto ${i + 1} da visita`} loading="lazy" decoding="async" className="size-full object-cover" />
              <button type="button" aria-label={`Remover foto ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" id="visit-photos" onChange={(e) => addFiles(e.target.files)} />
      <Button variant="secondary" size="sm" className="w-full" loading={busy} onClick={() => inputRef.current?.click()}>
        <Camera className="size-4" aria-hidden /> {photos.length ? 'Adicionar foto' : 'Tirar ou escolher foto'}
      </Button>
      {error ? <p className="mt-2 text-sm text-rose-700">Não foi possível salvar a foto.</p> : null}
    </Card>
  )
}
