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
