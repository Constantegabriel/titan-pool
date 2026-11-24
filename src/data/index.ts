import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from '@/config'
import { LocalRepository } from './local-repository'
import type { Repository } from './repository'
import { SupabaseRepository } from './supabase-repository'

/** Cliente Supabase quando configurado; sem ele (VITE_SUPABASE_URL vazio), o app funciona só no aparelho. */
export const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

export const repository: Repository = supabase ? new SupabaseRepository(supabase) : new LocalRepository()

/** Dados que ficaram salvos só neste navegador (antes do banco), para enviar à conta. */
export const deviceRepository = (): Repository => (repository.mode === 'local' ? repository : new LocalRepository())

export { getWorkspaceId, setWorkspaceId } from './workspace'

/** Chama uma função do banco e devolve o resultado, com a mensagem de erro em português. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Banco de dados não configurado.')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export * from './repository'
