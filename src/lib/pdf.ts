import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { IDEAL_RANGES, type ReadingKey, classify } from '@/domain/chemistry'
import { parseIsoDate } from '@/domain/dates'
import { type MonthResult, type ClientMargin, formatOrderNumber, purchaseTotalCents } from '@/domain/finance'
import { formatMoney, formatPeriod } from '@/domain/format'
import type { Charge, Client, Pool, Purchase, Settings, Supplier, Transaction, Visit } from '@/domain/types'

/*
 * Documentos em PDF gerados no próprio aparelho (sem servidor). Este módulo é carregado
 * sob demanda, então não pesa na abertura do app.
 */

const BRAND: [number, number, number] = [14, 116, 144]
const MUTED: [number, number, number] = [100, 116, 139]
const M = 16

const fmtDate = (iso: string) => parseIsoDate(iso.slice(0, 10)).toLocaleDateString('pt-BR')

function header(doc: jsPDF, settings: Settings, title: string, subtitle?: string): number {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, w, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(16).text(settings.businessName || 'Titan Pool', M, 12)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  const contact = [settings.ownerName, settings.phone, settings.document].filter(Boolean).join('  ·  ')
  if (contact) doc.text(contact, M, 19)
  doc.setTextColor(15, 23, 42).setFont('helvetica', 'bold').setFontSize(14).text(title, M, 38)
  if (subtitle) doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED).text(subtitle, M, 44)
  doc.setTextColor(15, 23, 42)
  return subtitle ? 52 : 46
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8).setTextColor(...MUTED)
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, M, h - 8)
    doc.text(`${i}/${pages}`, w - M, h - 8, { align: 'right' })
  }
}

function infoBlock(doc: jsPDF, y: number, rows: Array<[string, string]>): number {
  const filtered = rows.filter(([, v]) => v)
  autoTable(doc, {
    startY: y,
    body: filtered,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 } },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED } },
    margin: { left: M, right: M },
  })
  return lastY(doc) + 4
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

function section(doc: jsPDF, y: number, title: string): number {
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage()
    y = 20
  }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BRAND).text(title.toUpperCase(), M, y)
  doc.setTextColor(15, 23, 42).setFont('helvetica', 'normal')
  return y + 3
}

const table = (doc: jsPDF, y: number, head: string[], body: Array<Array<string>>, opts: { alignRight?: number[]; foot?: string[] } = {}) => {
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    foot: opts.foot ? [opts.foot.map((content, i) => ({ content, styles: { halign: (opts.alignRight ?? []).includes(i) ? ('right' as const) : ('left' as const) } }))] : undefined,
    theme: 'striped',
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    styles: { fontSize: 9.5 },
    columnStyles: Object.fromEntries((opts.alignRight ?? []).map((i) => [i, { halign: 'right' as const }])),
    margin: { left: M, right: M },
  })
  return lastY(doc) + 8
}

async function toDataUrl(src: string): Promise<string | null> {
  if (src.startsWith('data:')) return src
  try {
    const blob = await (await fetch(src)).blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const LEVEL = { ok: 'Ideal', low: 'Baixo', high: 'Alto', unknown: '—' } as const

export async function visitReportPdf(visit: Visit, pool: Pool, client: Client, settings: Settings): Promise<Blob> {
  const doc = new jsPDF()
  let y = header(doc, settings, 'Relatório de visita', `${fmtDate(visit.date)} · ${client.name}`)
  y = infoBlock(doc, y, [
    ['Cliente', client.name],
    ['Endereço', [client.address, client.neighborhood].filter(Boolean).join(', ')],
    ['Piscina', `${pool.name} · ${pool.volumeLiters.toLocaleString('pt-BR')} L · ${pool.type} · ${pool.sanitizer === 'sal' ? 'cloração salina' : 'cloro'}`],
    ['Status', visit.status === 'done' ? 'Concluída' : visit.status === 'skipped' ? 'Não realizada' : 'Em andamento'],
  ])
  const keys = Object.keys(IDEAL_RANGES) as ReadingKey[]
  if (keys.some((k) => visit.readings[k] !== null)) {
    y = section(doc, y, 'Análise da água')
    y = table(doc, y, ['Parâmetro', 'Medido', 'Faixa ideal', 'Situação'], keys.map((k) => {
      const r = IDEAL_RANGES[k]
      const v = visit.readings[k]
      return [r.label, v === null ? '—' : `${v.toLocaleString('pt-BR')} ${r.unit}`.trim(), `${r.min.toLocaleString('pt-BR')}–${r.max.toLocaleString('pt-BR')} ${r.unit}`.trim(), LEVEL[classify(k, v)]]
    }))
  }
  if (visit.tasks.length) {
    y = section(doc, y, 'Serviços realizados')
    y = table(doc, y, ['Serviço'], visit.tasks.map((t) => [t]))
  }
  if (visit.products.length) {
    y = section(doc, y, 'Produtos aplicados')
    y = table(doc, y, ['Produto', 'Quantidade'], visit.products.map((p) => [p.name, `${p.quantity.toLocaleString('pt-BR')} ${p.unit}`]), { alignRight: [1] })
  }
  if (visit.notes.trim()) {
    y = section(doc, y, 'Observações')
    const lines = doc.setFontSize(10).splitTextToSize(visit.notes.trim(), doc.internal.pageSize.getWidth() - M * 2)
    doc.text(lines, M, y + 4)
    y += 8 + lines.length * 5
  }
  if (visit.photos.length) {
    y = section(doc, y, 'Fotos')
    const size = 56
    let x = M
    y += 2
    for (const src of visit.photos.slice(0, 9)) {
      const data = await toDataUrl(src)
      if (!data) continue
      if (y + size > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage()
        y = 20
      }
      doc.addImage(data, 'JPEG', x, y, size, size * 0.75, undefined, 'FAST')
      x += size + 4
      if (x + size > doc.internal.pageSize.getWidth() - M + 1) {
        x = M
        y += size * 0.75 + 4
      }
    }
  }
  footer(doc)
  return doc.output('blob')
}

export function purchasePdf(purchase: Purchase, supplier: Supplier | undefined, client: Client | undefined, settings: Settings): Blob {
  const doc = new jsPDF()
  let y = header(doc, settings, `Pedido de compra ${formatOrderNumber(purchase.number)}`, fmtDate(purchase.date))
  y = infoBlock(doc, y, [
    ['Fornecedor', supplier ? [supplier.name, supplier.contact, supplier.phone].filter(Boolean).join(' · ') : 'Não definido'],
    ['Para o cliente', client ? `${client.name}${client.address ? ` — ${client.address}` : ''}` : 'Uso geral / estoque'],
  ])
  const total = purchaseTotalCents(purchase)
  y = table(
    doc, y, ['#', 'Item', 'Qtd.', 'Un.', 'Preço un.', 'Subtotal'],
    purchase.lines.map((l, i) => [
      String(i + 1), l.note ? `${l.name}\n${l.note}` : l.name, l.quantity.toLocaleString('pt-BR'), l.unit,
      l.unitPriceCents === null ? '—' : formatMoney(l.unitPriceCents),
      l.unitPriceCents === null ? '—' : formatMoney(Math.round(l.unitPriceCents * l.quantity)),
    ]),
    { alignRight: [2, 4, 5], foot: total !== null ? ['', 'Total', '', '', '', formatMoney(total)] : undefined },
  )
  if (purchase.notes.trim()) {
    y = section(doc, y, 'Observações')
    doc.setFontSize(10).text(doc.splitTextToSize(purchase.notes.trim(), doc.internal.pageSize.getWidth() - M * 2), M, y + 4)
  }
  footer(doc)
  return doc.output('blob')
}

export function receiptPdf(charge: Charge, client: Client, settings: Settings): Blob {
  const doc = new jsPDF()
  let y = header(doc, settings, 'Recibo', `Mensalidade de ${formatPeriod(charge.period)}`)
  doc.setFontSize(28).setFont('helvetica', 'bold').text(formatMoney(charge.amountCents), M, y + 10)
  y += 22
  const payer = settings.ownerName || settings.businessName
  const text = `Recebi de ${client.name} a importância de ${formatMoney(charge.amountCents)}, referente à manutenção de piscina no mês de ${formatPeriod(charge.period)}${charge.paidAt ? `, paga em ${fmtDate(charge.paidAt)}` : ''}.`
  const lines = doc.setFont('helvetica', 'normal').setFontSize(12).splitTextToSize(text, doc.internal.pageSize.getWidth() - M * 2)
  doc.text(lines, M, y)
  y += lines.length * 6 + 30
  const w = doc.internal.pageSize.getWidth()
  doc.setDrawColor(...MUTED).line(w / 2 - 50, y, w / 2 + 50, y)
  doc.setFontSize(10).text(payer, w / 2, y + 6, { align: 'center' })
  if (settings.document) doc.setTextColor(...MUTED).text(settings.document, w / 2, y + 11, { align: 'center' })
  footer(doc)
  return doc.output('blob')
}

export function monthReportPdf(input: {
  period: string; result: MonthResult; charges: Charge[]; transactions: Transaction[]; margins: ClientMargin[]; clients: Client[]; settings: Settings
}): Blob {
  const { period, result, charges, transactions, margins, clients, settings } = input
  const name = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? '—' : '—')
  const doc = new jsPDF()
  let y = header(doc, settings, 'Relatório financeiro', formatPeriod(period).replace(/^./, (c) => c.toUpperCase()))
  y = table(doc, y, ['Resumo', 'Valor'], [
    ['Mensalidades recebidas', formatMoney(result.feesReceivedCents)],
    ['Outras receitas', formatMoney(result.otherIncomeCents)],
    ['Despesas', `- ${formatMoney(result.expensesCents)}`],
    ['Mensalidades em aberto', formatMoney(result.feesPendingCents)],
  ], { alignRight: [1], foot: ['Lucro do mês', formatMoney(result.profitCents)] })
  if (result.expensesByCategory.length) {
    y = section(doc, y, 'Despesas por categoria')
    y = table(doc, y, ['Categoria', 'Valor'], result.expensesByCategory.map((c) => [c.category, formatMoney(c.cents)]), { alignRight: [1] })
  }
  if (charges.length) {
    y = section(doc, y, 'Mensalidades')
    y = table(doc, y, ['Cliente', 'Vencimento', 'Situação', 'Valor'], charges.map((c) => [name(c.clientId), fmtDate(c.dueDate), c.status === 'paid' ? 'Pago' : 'Em aberto', formatMoney(c.amountCents)]), { alignRight: [3] })
  }
  if (transactions.length) {
    y = section(doc, y, 'Lançamentos')
    y = table(doc, y, ['Data', 'Descrição', 'Cliente', 'Valor'], transactions.map((t) => [
      fmtDate(t.date), `${t.category}${t.description ? ` — ${t.description}` : ''}${t.paid ? '' : ' (pendente)'}`, name(t.clientId),
      `${t.kind === 'expense' ? '- ' : ''}${formatMoney(t.amountCents)}`,
    ]), { alignRight: [3] })
  }
  if (margins.length) {
    y = section(doc, y, 'Margem por cliente')
    table(doc, y, ['Cliente', 'Receita', 'Custos', 'Margem'], margins.map((m) => [m.client.name, formatMoney(m.revenueCents), formatMoney(m.costCents), formatMoney(m.marginCents)]), { alignRight: [1, 2, 3] })
  }
  footer(doc)
  return doc.output('blob')
}
