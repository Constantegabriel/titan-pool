export type OrgStatus = 'exempt' | 'trialing' | 'active' | 'suspended'

export interface OrgInfo {
  id: string
  name: string
  owner_email: string | null
  status: OrgStatus
  trial_ends_at: string | null
  paid_until: string | null
  notes: string
  created_at: string
  has_access: boolean
}

export interface PublicSettings {
  trial_days: number
  allow_self_signup: boolean
  support_whatsapp: string
}

export interface Account {
  email: string
  is_admin: boolean
  org: OrgInfo | null
  settings: PublicSettings
}

/** Conta como aparece no painel do super admin. */
export interface AdminOrg extends OrgInfo {
  members: number
  member_emails: string[]
  clients: number
  last_visit: string | null
  pending_invite: string | null
  invite_token?: string
}

const DAY = 86_400_000

/** Dias inteiros que faltam no teste (0 no último dia, negativo se já acabou). */
export function trialDaysLeft(org: Pick<OrgInfo, 'trial_ends_at'>, now = new Date()): number | null {
  if (!org.trial_ends_at) return null
  return Math.ceil((new Date(org.trial_ends_at).getTime() - now.getTime()) / DAY) - 1
}

const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR')

export type AccessTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

/** Texto e cor da situação da conta, iguais no app e no painel do admin. */
export function accessLabel(org: OrgInfo, now = new Date()): { label: string; tone: AccessTone } {
  switch (org.status) {
    case 'exempt':
      return { label: 'Sem cobrança', tone: 'neutral' }
    case 'suspended':
      return { label: 'Suspensa', tone: 'danger' }
    case 'active':
      if (!org.paid_until) return { label: 'Plano ativo', tone: 'success' }
      return org.has_access
        ? { label: `Plano ativo até ${fmt(org.paid_until)}`, tone: 'success' }
        : { label: `Plano vencido em ${fmt(org.paid_until)}`, tone: 'danger' }
    case 'trialing': {
      const left = trialDaysLeft(org, now)
      if (!org.has_access || left === null || left < 0) return { label: 'Teste encerrado', tone: 'danger' }
      if (left === 0) return { label: 'Teste grátis termina hoje', tone: 'warning' }
      return { label: `Teste grátis · ${left} ${left === 1 ? 'dia restante' : 'dias restantes'}`, tone: left <= 3 ? 'warning' : 'info' }
    }
  }
}

/** Grupo usado nos filtros do painel. */
export function accessGroup(org: OrgInfo): 'trial' | 'active' | 'blocked' {
  if (!org.has_access) return 'blocked'
  return org.status === 'trialing' ? 'trial' : 'active'
}
