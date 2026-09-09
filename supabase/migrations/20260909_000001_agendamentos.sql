create extension if not exists pgcrypto;

-- O Agendamentos compartilha o mesmo projeto Supabase com outros sistemas.
-- Por isso todos os objetos desta aplicação usam prefixo agendamento_.
create table if not exists public.agendamento_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  slug text not null unique check (slug in ('robson', 'gisele')),
  accent_class text not null default 'blue',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vincula os dois logins já existentes sem alterar auth.users nem a tabela public.profiles de outros sistemas.
insert into public.agendamento_profiles (auth_user_id, display_name, slug, accent_class)
values (
  (select id from auth.users where lower(email) = lower('robsonrmaia@hotmail.com') limit 1),
  'Robson',
  'robson',
  'blue'
)
on conflict (slug) do update set
  auth_user_id = excluded.auth_user_id,
  display_name = excluded.display_name,
  accent_class = excluded.accent_class,
  updated_at = now();

insert into public.agendamento_profiles (auth_user_id, display_name, slug, accent_class)
values (
  (select id from auth.users where lower(email) = lower('giselecarneirocorretora@gmail.com') limit 1),
  'Gisele',
  'gisele',
  'lilac'
)
on conflict (slug) do update set
  auth_user_id = excluded.auth_user_id,
  display_name = excluded.display_name,
  accent_class = excluded.accent_class,
  updated_at = now();

create table if not exists public.agendamento_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  owner_id uuid not null references public.agendamento_profiles(id),
  status text not null default 'idea' check (status in ('idea', 'planned', 'in_progress', 'waiting', 'done')),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  planned_for timestamptz,
  due_at timestamptz,
  dependency_note text,
  source_text text,
  actual_minutes integer check (actual_minutes is null or actual_minutes > 0),
  tags text[] not null default '{}',
  completed_at timestamptz,
  created_by uuid not null references public.agendamento_profiles(id),
  sort_order double precision not null default extract(epoch from clock_timestamp()),
  is_fully_finalized boolean generated always as (status = 'done') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agendamento_tasks_owner_idx on public.agendamento_tasks(owner_id);
create index if not exists agendamento_tasks_status_idx on public.agendamento_tasks(status);
create index if not exists agendamento_tasks_due_at_idx on public.agendamento_tasks(due_at);
create index if not exists agendamento_tasks_sort_order_idx on public.agendamento_tasks(status, sort_order);

create or replace function public.agendamento_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agendamento_profiles_touch_updated_at on public.agendamento_profiles;
create trigger agendamento_profiles_touch_updated_at
before update on public.agendamento_profiles
for each row execute function public.agendamento_touch_updated_at();

drop trigger if exists agendamento_tasks_touch_updated_at on public.agendamento_tasks;
create trigger agendamento_tasks_touch_updated_at
before update on public.agendamento_tasks
for each row execute function public.agendamento_touch_updated_at();

create or replace function public.is_agendamento_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agendamento_profiles
    where auth_user_id = auth.uid()
      and slug in ('robson', 'gisele')
  );
$$;

revoke all on function public.is_agendamento_workspace_member() from public;
grant execute on function public.is_agendamento_workspace_member() to authenticated;

alter table public.agendamento_profiles enable row level security;
alter table public.agendamento_tasks enable row level security;

drop policy if exists agendamento_profiles_read_members on public.agendamento_profiles;
create policy agendamento_profiles_read_members on public.agendamento_profiles
for select to authenticated
using (public.is_agendamento_workspace_member());

drop policy if exists agendamento_profiles_update_self on public.agendamento_profiles;
create policy agendamento_profiles_update_self on public.agendamento_profiles
for update to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid() and slug in ('robson', 'gisele'));

drop policy if exists agendamento_tasks_shared_workspace on public.agendamento_tasks;
create policy agendamento_tasks_shared_workspace on public.agendamento_tasks
for all to authenticated
using (public.is_agendamento_workspace_member())
with check (public.is_agendamento_workspace_member());

grant select on public.agendamento_profiles to authenticated;
grant select, insert, update, delete on public.agendamento_tasks to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.agendamento_tasks;
exception
  when duplicate_object then null;
end;
$$;
