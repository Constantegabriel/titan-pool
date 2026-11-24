/**
 * Está abrindo a página inicial e não há sessão salva neste navegador?
 * Então é (quase certamente) um visitante: carregamos só a landing, sem o app.
 */
import { SUPABASE_KEY, SUPABASE_URL } from '@/config'

export function isLikelyVisitor(): boolean {
  // Sem banco (modo só no aparelho) não há login nem landing: abre direto o app.
  if (!SUPABASE_URL || !SUPABASE_KEY) return false
  if (!['/', '/inicio'].includes(window.location.pathname)) return false
  try {
    return !Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  } catch {
    return true
  }
}
