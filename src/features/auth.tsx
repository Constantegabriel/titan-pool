import type { Session } from '@supabase/supabase-js'
import { Droplets } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Button, Card, Field, Input, Loading } from '@/components/ui'
import { supabase } from '@/data'

/** No modo nuvem exige login; no modo local libera direto. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase) return children
  if (session === undefined) return <Loading />
  if (!session) return <LoginScreen />
  return children
}

function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) return setMessage({ tone: 'error', text: error.message })
    if (mode === 'signup' && !data.session) {
      setMessage({ tone: 'info', text: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.' })
      setMode('signin')
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex items-center gap-2 text-cyan-700">
        <Droplets className="size-8" aria-hidden />
        <span className="text-2xl font-bold tracking-tight text-slate-900">Titan Pool</span>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h1 className="text-lg font-semibold">{mode === 'signin' ? 'Entrar' : 'Criar conta'}</h1>
          <Field label="E-mail">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha" hint={mode === 'signup' ? 'Mínimo de 6 caracteres.' : undefined}>
            <Input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {message && (
            <p role="status" className={message.tone === 'error' ? 'text-sm text-rose-700' : 'text-sm text-cyan-800'}>
              {message.text}
            </p>
          )}
          <Button type="submit" className="w-full" loading={busy}>
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
      </Card>
      <button
        type="button"
        className="mt-4 text-sm font-medium text-cyan-700"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setMessage(null)
        }}
      >
        {mode === 'signin' ? 'Ainda não tem conta? Criar conta' : 'Já tem conta? Entrar'}
      </button>
    </div>
  )
}
