import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from '@/config'
import { LocalRepository } from './local-repository'
import type { Repository } from './repository'
import { SupabaseRepository } from './supabase-repository'

/** Cliente Supabase quando configurado; sem ele, o app funciona 100% no aparelho. */
export const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

export const repository: Repository = supabase ? new SupabaseRepository(supabase) : new LocalRepository()

/** Dados que ficaram salvos só neste navegador (antes de ligar o banco), para enviar à nuvem. */
export const deviceRepository = (): Repository => (repository.mode === 'local' ? repository : new LocalRepository())

export * from './repository'
