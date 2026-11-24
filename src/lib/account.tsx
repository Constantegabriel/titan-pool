import type { Session } from '@supabase/supabase-js'
import { type AccountState, Ctx } from './account-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { rpc, setWorkspaceId, supabase } from '@/data'
import type { Account } from '@/domain/account'


export function AccountProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)
  const userId = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const apply = (next: Session | null) => {
      const id = next?.user.id ?? null
      // Trocou de usuário: nada do cache anterior pode vazar para a nova conta.
      if (id !== userId.current) qc.clear()
      userId.current = id
      setSession(next)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => apply(next))
    return () => data.subscription.unsubscribe()
  }, [qc])

  const account = useQuery({
    queryKey: ['account', session?.user.id],
    queryFn: () => rpc<Account>('my_account'),
    enabled: Boolean(supabase && session),
    staleTime: 60_000,
  })

  useEffect(() => {
    setWorkspaceId(account.data?.org?.has_access ? account.data.org.id : null)
  }, [account.data])

  const value: AccountState = {
    enabled: Boolean(supabase),
    session,
    account: !supabase || session === null ? null : account.data,
    accountError: account.error,
    refresh: () => account.refetch(),
    signOut: async () => {
      await supabase?.auth.signOut()
      qc.clear()
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
