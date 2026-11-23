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
