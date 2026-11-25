-- Titan Pool: banco completo. Gerado por scripts/build-setup-sql.mjs — não edite à mão.
-- Cole tudo no Supabase em SQL Editor > New query > Run.

-- ===== 20261123000000_init.sql =====
-- Piscineiro: esquema inicial.
-- Cada linha pertence a um usuário (owner_id). RLS garante que ninguém lê ou grava
-- dados de outro piscineiro, então a mesma base atende de 1 a milhares de contas.
-- Para evoluir para equipes, troque owner_id por organization_id + tabela de membros.

create table public.clients (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  phone text not null default '',
  address text not null default '',
  neighborhood text not null default '',
  notes text not null default '',
  monthly_fee_cents integer not null default 0 check (monthly_fee_cents >= 0),
  billing_day smallint not null default 10 check (billing_day between 1 and 28),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index clients_owner_idx on public.clients (owner_id, name);

create table public.pools (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,
  name text not null default 'Principal',
  volume_liters integer not null default 0 check (volume_liters >= 0),
  type text not null default 'vinil' check (type in ('alvenaria', 'vinil', 'fibra')),
  sanitizer text not null default 'cloro' check (sanitizer in ('cloro', 'sal')),
  equipment text not null default '',
  access_notes text not null default '',
  visit_days smallint[] not null default '{}',
  route_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  -- FKs compostas: impossível vincular registros a clientes de outro usuário.
  foreign key (client_id, owner_id) references public.clients (id, owner_id) on delete cascade
);
create index pools_owner_idx on public.pools (owner_id);
create index pools_client_idx on public.pools (client_id);

create table public.visits (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pool_id uuid not null,
  client_id uuid not null,
  date date not null,
  status text not null check (status in ('in_progress', 'done', 'skipped')),
  check_in_at timestamptz not null default now(),
  completed_at timestamptz,
  ph numeric(4, 2),
  chlorine numeric(5, 2),
  alkalinity numeric(6, 1),
  tasks text[] not null default '{}',
  products jsonb not null default '[]',
  notes text not null default '',
  photos text[] not null default '{}',
  unique (pool_id, date),
  foreign key (pool_id, owner_id) references public.pools (id, owner_id) on delete cascade,
  foreign key (client_id, owner_id) references public.clients (id, owner_id) on delete cascade
);
create index visits_owner_date_idx on public.visits (owner_id, date);
create index visits_client_date_idx on public.visits (client_id, date desc);

create table public.charges (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,
  period char(7) not null check (period ~ '^\d{4}-\d{2}$'),
  amount_cents integer not null check (amount_cents >= 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, period),
  foreign key (client_id, owner_id) references public.clients (id, owner_id) on delete cascade
);
create index charges_owner_period_idx on public.charges (owner_id, period);

-- Row Level Security: cada usuário só enxerga as próprias linhas.
do $$
declare t text;
begin
  foreach t in array array['clients', 'pools', 'visits', 'charges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t || '_owner', t
    );
  end loop;
end $$;

-- Fotos das visitas: bucket privado, pasta = id do usuário.
insert into storage.buckets (id, name, public) values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;

create policy "visit photos owner" on storage.objects for all to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== 20261124000000_routes_purchases_finance.sql =====
-- Titan Pool: roteiro com previsões, fornecedores, compras e financeiro.

alter table public.clients add column lat double precision, add column lng double precision;
alter table public.pools add column service_minutes smallint check (service_minutes between 5 and 600);

create table public.settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  business_name text not null default 'Titan Pool',
  owner_name text not null default '',
  phone text not null default '',
  document text not null default '',
  day_start text not null default '08:00' check (day_start ~ '^\d{2}:\d{2}$'),
  default_service_minutes smallint not null default 40 check (default_service_minutes between 5 and 600),
  avg_speed_kmh smallint not null default 30 check (avg_speed_kmh between 5 and 120),
  base jsonb,
  base_label text not null default ''
);

create table public.suppliers (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  phone text not null default '',
  contact text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index suppliers_owner_idx on public.suppliers (owner_id, name);

create table public.catalog_items (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  unit text not null default 'un',
  last_price_cents integer check (last_price_cents >= 0),
  created_at timestamptz not null default now()
);
create unique index catalog_items_owner_name_idx on public.catalog_items (owner_id, lower(name));

create table public.purchases (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number integer not null,
  supplier_id uuid,
  client_id uuid,
  lines jsonb not null default '[]',
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent', 'received', 'canceled')),
  date date not null default current_date,
  sent_at timestamptz,
  received_at timestamptz,
  bill_to_client boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, number),
  unique (id, owner_id),
  foreign key (supplier_id, owner_id) references public.suppliers (id, owner_id) on delete set null (supplier_id),
  foreign key (client_id, owner_id) references public.clients (id, owner_id) on delete set null (client_id)
);
create index purchases_owner_number_idx on public.purchases (owner_id, number desc);

create table public.transactions (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  category text not null default 'Outros',
  description text not null default '',
  amount_cents integer not null check (amount_cents >= 0),
  date date not null,
  client_id uuid,
  purchase_id uuid,
  paid boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (client_id, owner_id) references public.clients (id, owner_id) on delete set null (client_id),
  foreign key (purchase_id, owner_id) references public.purchases (id, owner_id) on delete cascade
);
create index transactions_owner_date_idx on public.transactions (owner_id, date);

do $$
declare t text;
begin
  foreach t in array array['settings', 'suppliers', 'catalog_items', 'purchases', 'transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t || '_owner', t
    );
  end loop;
end $$;

-- ===== 20261125000000_scheduling.sql =====
-- Titan Pool: agenda com recorrência (semanal, quinzenal, mensal) e visitas agendadas.

alter table public.pools
  add column recurrence text not null default 'weekly' check (recurrence in ('none', 'weekly', 'biweekly', 'monthly')),
  add column month_days smallint[] not null default '{}',
  add column anchor_date date,
  add column preferred_time text check (preferred_time ~ '^\d{2}:\d{2}$');
update public.pools set recurrence = 'none' where cardinality(visit_days) = 0;

alter table public.visits drop constraint visits_status_check;
alter table public.visits add constraint visits_status_check
  check (status in ('scheduled', 'in_progress', 'done', 'skipped', 'canceled'));
alter table public.visits alter column check_in_at drop not null, alter column check_in_at drop default;
alter table public.visits
  add column planned_date date,
  add column time text check (time ~ '^\d{2}:\d{2}$');

-- Uma visita pode ser remarcada para um dia que já tem outra visita da mesma piscina;
-- o que não pode é a mesma ocorrência da agenda fixa ter dois registros.
alter table public.visits drop constraint visits_pool_id_date_key;
create unique index visits_pool_planned_idx on public.visits (pool_id, planned_date) where planned_date is not null;
create index visits_owner_planned_idx on public.visits (owner_id, planned_date);

-- ===== 20261126000000_open_access.sql =====
-- Titan Pool: acesso aberto (sem login) em um espaço de trabalho compartilhado.
-- Quem não está logado usa o dono fixo 00000000-0000-0000-0000-000000000001; quem estiver
-- logado continua com os próprios dados. Para voltar a exigir login, basta tirar a role
-- "anon" das políticas e ligar VITE_OPEN_ACCESS=false no app.

create or replace function public.current_owner() returns uuid
language sql stable
set search_path = ''
as $$ select coalesce(auth.uid(), '00000000-0000-0000-0000-000000000001'::uuid) $$;

do $$
declare t text;
begin
  foreach t in array array['clients', 'pools', 'visits', 'charges', 'settings', 'suppliers', 'catalog_items', 'purchases', 'transactions'] loop
    -- O espaço compartilhado não é um usuário de auth.users.
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_owner_id_fkey');
    execute format('alter table public.%I alter column owner_id set default public.current_owner()', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (owner_id = public.current_owner()) with check (owner_id = public.current_owner())',
      t || '_open', t
    );
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

drop policy if exists "visit photos owner" on storage.objects;
create policy "visit photos open" on storage.objects for all to anon, authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = public.current_owner()::text)
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = public.current_owner()::text);

-- ===== 20261127000000_accounts.sql =====
-- =============================================================================
-- Titan Pool — contas (multi-empresa), período grátis e super admin.
--
-- Cada piscineiro/empresa é uma conta (organizations). Todos os dados levam
-- owner_id = id da conta, e as regras do banco só deixam cada usuário ver a
-- própria conta — e só enquanto ela tem acesso:
--
--   exempt     sem cobrança (conta principal, cortesias)
--   trialing   em teste grátis até trial_ends_at
--   active     plano em dia até paid_until (vazio = sem data de fim)
--   suspended  bloqueada pelo super admin
--
-- O super admin (platform_admins) gerencia as contas pelas funções admin_*.
-- Substitui o acesso aberto (sem login) da migration anterior.
-- =============================================================================

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 120),
  owner_email   text,
  status        text not null default 'trialing' check (status in ('exempt', 'trialing', 'active', 'suspended')),
  trial_ends_at timestamptz,
  paid_until    date,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

-- Um usuário pertence a uma conta.
create table public.memberships (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create index memberships_org_idx on public.memberships (org_id);

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Link de acesso criado pelo super admin: quem abre e cria a senha entra na conta.
create table public.invitations (
  token      text primary key default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  used_by    uuid references auth.users (id) on delete set null
);
create index invitations_org_idx on public.invitations (org_id);

create table public.platform_settings (
  id                boolean primary key default true check (id),
  trial_days        integer not null default 14 check (trial_days between 0 and 365),
  allow_self_signup boolean not null default true,
  support_whatsapp  text not null default ''
);
insert into public.platform_settings default values;

-- Tabelas internas: só as funções abaixo leem e escrevem.
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.invitations enable row level security;
alter table public.platform_settings enable row level security;
revoke all on public.organizations, public.memberships, public.platform_admins, public.invitations, public.platform_settings from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Regras de acesso
-- -----------------------------------------------------------------------------

create or replace function public.org_has_access(o public.organizations)
returns boolean language sql stable set search_path = '' as $$
  select case o.status
    when 'exempt' then true
    when 'trialing' then o.trial_ends_at is not null and o.trial_ends_at > now()
    when 'active' then o.paid_until is null or o.paid_until >= current_date
    else false
  end
$$;

/** Conta do usuário logado, se ela tem acesso; senão null (e as regras não devolvem nada). */
create or replace function public.current_org()
returns uuid language sql stable security definer set search_path = '' as $$
  select o.id
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = (select auth.uid()) and public.org_has_access(o)
$$;

-- As tabelas de dados já usam current_owner() no valor padrão e nas regras:
-- agora ela devolve a conta do usuário (e nada para visitantes sem login).
create or replace function public.current_owner()
returns uuid language sql stable security definer set search_path = '' as $$
  select public.current_org()
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

do $$
declare t text;
begin
  foreach t in array array['clients', 'pools', 'visits', 'charges', 'settings', 'suppliers', 'catalog_items', 'purchases', 'transactions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_open', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = public.current_owner()) with check (owner_id = public.current_owner())',
      t || '_account', t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

drop policy if exists "visit photos open" on storage.objects;
create policy "visit photos account" on storage.objects for all to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = public.current_owner()::text)
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = public.current_owner()::text);

-- Os dados que já estavam no acesso aberto viram a conta principal.
insert into public.organizations (id, name, status)
values ('00000000-0000-0000-0000-000000000001', 'Conta principal', 'exempt')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Funções do app
-- -----------------------------------------------------------------------------

create or replace function public.org_json(o public.organizations)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'owner_email', o.owner_email, 'status', o.status,
    'trial_ends_at', o.trial_ends_at, 'paid_until', o.paid_until, 'notes', o.notes,
    'created_at', o.created_at, 'has_access', public.org_has_access(o)
  )
$$;

/** Configurações públicas (landing page e cadastro). */
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('trial_days', trial_days, 'allow_self_signup', allow_self_signup, 'support_whatsapp', support_whatsapp)
  from public.platform_settings
$$;

/** Quem sou eu: e-mail, se sou super admin e a minha conta (mesmo sem acesso, para mostrar o motivo). */
create or replace function public.my_account()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
begin
  if v_uid is null then return null; end if;
  select o.* into v_org from public.memberships m join public.organizations o on o.id = m.org_id where m.user_id = v_uid;
  return jsonb_build_object(
    'email', (select email from auth.users where id = v_uid),
    'is_admin', public.is_platform_admin(),
    'org', case when v_org.id is null then null else public.org_json(v_org) end,
    'settings', public.public_settings()
  );
end $$;

/** Cadastro pelo site: cria a conta do usuário em período grátis. */
create or replace function public.create_my_organization(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.platform_settings;
  v_org public.organizations;
begin
  if v_uid is null then raise exception 'Faça login primeiro.'; end if;
  if exists (select 1 from public.memberships where user_id = v_uid) then raise exception 'Você já tem uma conta.'; end if;
  select * into v_settings from public.platform_settings;
  if not v_settings.allow_self_signup and not public.is_platform_admin() then
    raise exception 'Cadastros novos estão fechados. Fale com o suporte.';
  end if;
  insert into public.organizations (name, owner_email, status, trial_ends_at)
  values (left(trim(p_name), 120), (select email from auth.users where id = v_uid), 'trialing', now() + make_interval(days => v_settings.trial_days))
  returning * into v_org;
  insert into public.memberships (user_id, org_id) values (v_uid, v_org.id);
  return public.org_json(v_org);
end $$;

/** Dados de um convite (para a tela de cadastro), sem exigir login. */
create or replace function public.invitation_info(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('org_name', o.name, 'email', i.email, 'valid', i.used_at is null)
  from public.invitations i join public.organizations o on o.id = i.org_id
  where i.token = p_token
$$;

/** Entra na conta do convite. */
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations;
  v_org public.organizations;
begin
  if v_uid is null then raise exception 'Faça login primeiro.'; end if;
  select * into v_inv from public.invitations where token = p_token for update;
  if v_inv.token is null then raise exception 'Convite não encontrado.'; end if;
  if v_inv.used_at is not null then raise exception 'Este convite já foi usado.'; end if;
  if exists (select 1 from public.memberships where user_id = v_uid) then raise exception 'Este login já pertence a outra conta.'; end if;
  insert into public.memberships (user_id, org_id) values (v_uid, v_inv.org_id);
  update public.invitations set used_at = now(), used_by = v_uid where token = p_token;
  update public.organizations set owner_email = coalesce(owner_email, (select email from auth.users where id = v_uid))
  where id = v_inv.org_id returning * into v_org;
  return public.org_json(v_org);
end $$;

-- -----------------------------------------------------------------------------
-- Super admin
-- -----------------------------------------------------------------------------

create or replace function public.require_platform_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito ao super admin.' using errcode = '42501'; end if;
end $$;

create or replace function public.admin_list_organizations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_platform_admin();
  return coalesce((
    select jsonb_agg(public.org_json(o) || jsonb_build_object(
      'members', (select count(*) from public.memberships m where m.org_id = o.id),
      'member_emails', (select coalesce(jsonb_agg(u.email), '[]') from public.memberships m join auth.users u on u.id = m.user_id where m.org_id = o.id),
      'clients', (select count(*) from public.clients c where c.owner_id = o.id),
      'last_visit', (select max(v.date) from public.visits v where v.owner_id = o.id and v.status = 'done'),
      'pending_invite', (select i.token from public.invitations i where i.org_id = o.id and i.used_at is null order by i.created_at desc limit 1)
    ) order by o.created_at desc)
    from public.organizations o
  ), '[]'::jsonb);
end $$;

/** Novo acesso: cria a conta e devolve o link de convite para a pessoa criar a senha. */
create or replace function public.admin_create_organization(p_name text, p_email text, p_status text, p_trial_days integer, p_paid_until date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organizations;
  v_token text;
begin
  perform public.require_platform_admin();
  insert into public.organizations (name, owner_email, status, trial_ends_at, paid_until)
  values (
    left(trim(p_name), 120), nullif(lower(trim(p_email)), ''), coalesce(p_status, 'trialing'),
    case when coalesce(p_status, 'trialing') = 'trialing' then now() + make_interval(days => coalesce(p_trial_days, 14)) end,
    case when p_status = 'active' then p_paid_until end
  )
  returning * into v_org;
  insert into public.invitations (org_id, email) values (v_org.id, v_org.owner_email) returning token into v_token;
  return public.org_json(v_org) || jsonb_build_object('invite_token', v_token);
end $$;

create or replace function public.admin_new_invitation(p_org_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  perform public.require_platform_admin();
  insert into public.invitations (org_id, email) select id, owner_email from public.organizations where id = p_org_id returning token into v_token;
  if v_token is null then raise exception 'Conta não encontrada.'; end if;
  return v_token;
end $$;

/** Soma dias ao teste (a partir de hoje ou do fim atual, o que for mais tarde) e volta para "em teste". */
create or replace function public.admin_extend_trial(p_org_id uuid, p_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org public.organizations;
begin
  perform public.require_platform_admin();
  update public.organizations
  set status = 'trialing', trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
  where id = p_org_id returning * into v_org;
  if v_org.id is null then raise exception 'Conta não encontrada.'; end if;
  return public.org_json(v_org);
end $$;

create or replace function public.admin_update_organization(
  p_org_id uuid, p_name text, p_status text, p_trial_ends_at timestamptz, p_paid_until date, p_notes text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org public.organizations;
begin
  perform public.require_platform_admin();
  update public.organizations
  set name = coalesce(nullif(trim(p_name), ''), name), status = p_status, trial_ends_at = p_trial_ends_at,
      paid_until = p_paid_until, notes = coalesce(p_notes, notes)
  where id = p_org_id returning * into v_org;
  if v_org.id is null then raise exception 'Conta não encontrada.'; end if;
  return public.org_json(v_org);
end $$;

/** Exclui a conta e todos os dados dela. */
create or replace function public.admin_delete_organization(p_org_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  perform public.require_platform_admin();
  if p_org_id = (select org_id from public.memberships where user_id = auth.uid()) then
    raise exception 'Você não pode excluir a sua própria conta.';
  end if;
  foreach t in array array['transactions', 'purchases', 'catalog_items', 'suppliers', 'settings', 'charges', 'visits', 'pools', 'clients'] loop
    execute format('delete from public.%I where owner_id = $1', t) using p_org_id;
  end loop;
  delete from public.organizations where id = p_org_id;
end $$;

create or replace function public.admin_update_settings(p_trial_days integer, p_allow_self_signup boolean, p_support_whatsapp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_platform_admin();
  update public.platform_settings set trial_days = p_trial_days, allow_self_signup = p_allow_self_signup, support_whatsapp = coalesce(p_support_whatsapp, '');
  return public.public_settings();
end $$;

/**
 * Primeiro super admin. Rode no SQL Editor depois de criar a sua conta no app:
 *   select public.bootstrap_super_admin('seu@email.com');
 * Torna o usuário super admin e o coloca na conta principal (onde ficam os dados antigos).
 */
create or replace function public.bootstrap_super_admin(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_old uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'Nenhum usuário com o e-mail %. Crie a conta no app primeiro.', p_email; end if;
  insert into public.platform_admins (user_id) values (v_uid) on conflict do nothing;
  select org_id into v_old from public.memberships where user_id = v_uid;
  if v_old is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
    delete from public.memberships where user_id = v_uid;
    insert into public.memberships (user_id, org_id) values (v_uid, '00000000-0000-0000-0000-000000000001');
    -- Conta criada no cadastro e ainda vazia: some.
    if v_old is not null and not exists (select 1 from public.memberships where org_id = v_old)
       and not exists (select 1 from public.clients where owner_id = v_old) then
      delete from public.organizations where id = v_old;
    end if;
  end if;
  update public.organizations set owner_email = lower(trim(p_email)) where id = '00000000-0000-0000-0000-000000000001';
  return 'Pronto: ' || p_email || ' é super admin e dono da conta principal.';
end $$;

-- Permissões: funções internas não ficam expostas; as do app só para quem tem login.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.public_settings() to anon, authenticated;
grant execute on function public.invitation_info(text) to anon, authenticated;
grant execute on function
  public.current_org(), public.current_owner(), public.is_platform_admin(), public.org_has_access(public.organizations),
  public.org_json(public.organizations), public.my_account(), public.create_my_organization(text), public.accept_invitation(text),
  public.require_platform_admin(), public.admin_list_organizations(),
  public.admin_create_organization(text, text, text, integer, date), public.admin_new_invitation(uuid),
  public.admin_extend_trial(uuid, integer), public.admin_update_organization(uuid, text, text, timestamptz, date, text),
  public.admin_delete_organization(uuid), public.admin_update_settings(integer, boolean, text)
to authenticated;
revoke execute on function public.bootstrap_super_admin(text) from authenticated;

-- ===== 20261128000000_day_plans.sql =====
-- Titan Pool: rota montada por dia (ordem das visitas, saída e volta para casa).
create table public.day_plans (
  owner_id uuid not null default public.current_owner(),
  date date not null,
  stop_order uuid[] not null default '{}',
  start_time text check (start_time ~ '^\d{2}:\d{2}$'),
  start_mode text not null default 'auto' check (start_mode in ('auto', 'base', 'gps')),
  return_to_base boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, date)
);

alter table public.day_plans enable row level security;
create policy day_plans_account on public.day_plans for all to authenticated
  using (owner_id = public.current_owner()) with check (owner_id = public.current_owner());
grant select, insert, update, delete on public.day_plans to authenticated;

-- Excluir uma conta pelo super admin também apaga as rotas dela.
create or replace function public.admin_delete_organization(p_org_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  perform public.require_platform_admin();
  if p_org_id = (select org_id from public.memberships where user_id = auth.uid()) then
    raise exception 'Você não pode excluir a sua própria conta.';
  end if;
  foreach t in array array['day_plans', 'transactions', 'purchases', 'catalog_items', 'suppliers', 'settings', 'charges', 'visits', 'pools', 'clients'] loop
    execute format('delete from public.%I where owner_id = $1', t) using p_org_id;
  end loop;
  delete from public.organizations where id = p_org_id;
end $$;
