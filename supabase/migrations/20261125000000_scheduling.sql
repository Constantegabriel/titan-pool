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
