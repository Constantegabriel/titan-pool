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
