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
