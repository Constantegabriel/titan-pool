import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LocalRepository } from './local-repository'
import type { Repository } from './repository'
import { SupabaseRepository } from './supabase-repository'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Cliente Supabase quando configurado; sem ele, o app funciona 100% no aparelho. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

export const repository: Repository = supabase ? new SupabaseRepository(supabase) : new LocalRepository()

export * from './repository'
