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
