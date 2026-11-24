import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { Account } from '@/domain/account'

export interface AccountState {
  /** false = sem banco (modo só no aparelho): não há login. */
  enabled: boolean
  /** undefined enquanto carrega. */
  session: Session | null | undefined
  account: Account | null | undefined
  accountError: unknown
  refresh: () => Promise<unknown>
  signOut: () => Promise<void>
}

export const Ctx = createContext<AccountState | null>(null)

/** Convite ou nome da empresa guardados até o e-mail ser confirmado. */
const PENDING_KEY = 'titan-pool:pending-signup'
export interface PendingSignup {
  invite?: string
  businessName?: string
}
export const savePending = (p: PendingSignup) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p))
  } catch {
    /* sem armazenamento: o usuário preenche de novo */
  }
}
export const readPending = (): PendingSignup | null => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as PendingSignup | null
  } catch {
    return null
  }
}
export const clearPending = () => {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* nada a limpar */
  }
}

export function useAccount() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAccount fora do AccountProvider')
  return ctx
}
