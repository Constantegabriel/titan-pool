/**
 * Conexão com o banco (Supabase). A chave "publishable" é pública por definição:
 * ela vai no app de qualquer jeito, e quem protege os dados são as regras do banco.
 * Variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) têm prioridade.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://waibbaliswdjnailopao.supabase.co'
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_pgfRHzAXnN0pW3f2j-1t2g_meH4jJy1'
