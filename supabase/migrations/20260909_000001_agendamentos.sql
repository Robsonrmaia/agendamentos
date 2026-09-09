create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  slug text not null unique check (slug in ('robson', 'gisele')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  owner_id uuid not null references public.profiles(id),
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
  created_by uuid not null references public.profiles(id),
  sort_order double precision not null default extract(epoch from clock_timestamp()),
  is_fully_finalized boolean generated always as (status = 'done') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_owner_idx on public.tasks(owner_id);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_due_at_idx on public.tasks(due_at);
create index if not exists tasks_sort_order_idx on public.tasks(status, sort_order);

create table if not exists public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action_type text not null,
  previous_status text,
  new_status text,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at before update on public.tasks
for each row execute function public.touch_updated_at();

create or replace function public.record_task_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_history(task_id, actor_id, action_type, previous_status, new_status, changed_fields)
    values (new.id, auth.uid(), 'created', null, new.status, jsonb_build_object('title', new.title, 'owner_id', new.owner_id));
    return new;
  end if;

  if row(old.*) is distinct from row(new.*) then
    insert into public.task_history(task_id, actor_id, action_type, previous_status, new_status, changed_fields)
    values (
      new.id,
      auth.uid(),
      case when old.status is distinct from new.status then 'status_changed' else 'updated' end,
      old.status,
      new.status,
      jsonb_strip_nulls(jsonb_build_object(
        'title', case when old.title is distinct from new.title then jsonb_build_object('from', old.title, 'to', new.title) end,
        'owner_id', case when old.owner_id is distinct from new.owner_id then jsonb_build_object('from', old.owner_id, 'to', new.owner_id) end,
        'difficulty', case when old.difficulty is distinct from new.difficulty then jsonb_build_object('from', old.difficulty, 'to', new.difficulty) end,
        'due_at', case when old.due_at is distinct from new.due_at then jsonb_build_object('from', old.due_at, 'to', new.due_at) end,
        'dependency_note', case when old.dependency_note is distinct from new.dependency_note then jsonb_build_object('from', old.dependency_note, 'to', new.dependency_note) end
      ))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_history_trigger on public.tasks;
create trigger tasks_history_trigger after insert or update on public.tasks
for each row execute function public.record_task_history();

create or replace function public.is_agendamentos_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and slug in ('robson', 'gisele')
  );
$$;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

drop policy if exists profiles_read_members on public.profiles;
create policy profiles_read_members on public.profiles
for select to authenticated
using (public.is_agendamentos_member() or id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and slug in ('robson', 'gisele'));

drop policy if exists tasks_shared_workspace on public.tasks;
create policy tasks_shared_workspace on public.tasks
for all to authenticated
using (public.is_agendamentos_member())
with check (public.is_agendamentos_member());

drop policy if exists task_history_read_members on public.task_history;
create policy task_history_read_members on public.task_history
for select to authenticated
using (public.is_agendamentos_member());

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
end;
$$;
