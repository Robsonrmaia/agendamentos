-- Corrige o helper de RLS do app de tarefas pessoais.
-- A primeira versão aplicada em produção ainda consultava public.agendamento_profiles,
-- tabela pertencente a outro domínio. O workspace pessoal deve depender apenas de
-- public.tarefas_pessoais_profiles.
create or replace function public.is_tarefas_pessoais_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tarefas_pessoais_profiles
    where auth_user_id = auth.uid()
      and slug in ('robson', 'gisele')
  );
$$;

revoke all on function public.is_tarefas_pessoais_member() from public;
grant execute on function public.is_tarefas_pessoais_member() to authenticated;
