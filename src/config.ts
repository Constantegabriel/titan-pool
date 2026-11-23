/**
 * Conexão com o banco (Supabase). A chave "anon"/"publishable" é pública por definição:
 * ela vai no app de qualquer jeito, e quem protege os dados são as regras do banco.
 * Variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) têm prioridade.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

/**
 * Acesso aberto: sem login, quem tem o link usa os mesmos dados (um espaço de trabalho
 * compartilhado). Para exigir login, defina VITE_OPEN_ACCESS=false.
 */
export const OPEN_ACCESS = import.meta.env.VITE_OPEN_ACCESS !== 'false'

/** Dono dos dados no acesso aberto — o mesmo valor de public.current_owner() no banco. */
export const SHARED_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
