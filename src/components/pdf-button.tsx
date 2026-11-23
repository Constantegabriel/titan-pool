import { FileDown } from 'lucide-react'
import { useState } from 'react'
import { shareOrDownload } from '@/lib/share'
import { Button } from './ui'

/** Botão que gera um PDF sob demanda e o compartilha/baixa. */
export function PdfButton({ make, filename, title, label = 'PDF', variant = 'secondary', size = 'md', className }: {
  make: () => Promise<Blob>; filename: string; title: string; label?: string
  variant?: 'secondary' | 'ghost' | 'primary'; size?: 'md' | 'sm'; className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function run() {
    setBusy(true)
    setError(false)
    try {
      await shareOrDownload(await make(), filename, title)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant={variant} size={size} className={className} onClick={run} loading={busy} aria-label={error ? 'Erro ao gerar PDF, tentar de novo' : undefined}>
      {!busy && <FileDown className="size-4" aria-hidden />} {error ? 'Tentar de novo' : label}
    </Button>
  )
}
