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
