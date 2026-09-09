# Agendamentos

Painel visual compartilhado para Robson e Gisele organizarem tarefas com o mínimo de atrito: digitar ou falar um objetivo, conferir a interpretação, criar e movimentar o cartão pelo pipeline.

## O que a V1 entrega

- Entrada rápida por texto e, quando o navegador oferece suporte, voz.
- Interpretação determinística de responsável, dificuldade, duração e prazos comuns em português.
- Pipeline: **Ideias → Planejado → Em andamento → Aguardando / Dependência → Finalizado**.
- Filtros **Todos / Robson / Gisele** e **Hoje / Esta semana / Tudo**.
- Ações rápidas por clique e movimentação por arrastar.
- Distinção explícita entre trabalho aguardando algo e trabalho realmente finalizado.
- Modo local imediato, com persistência no navegador.
- Supabase Auth, Postgres, RLS e Realtime prontos para o painel compartilhado real.
- Interface responsiva para desktop e celular.

## Rodar localmente

Requer Node.js 22.

```bash
npm install
npm run dev
```

Sem variáveis de ambiente, o app abre em **Modo local**. Nesse modo ele já pode ser testado integralmente e permite alternar o usuário ativo entre Robson e Gisele.

## Conectar ao Supabase

1. Crie ou escolha um projeto Supabase.
2. Execute a migration `supabase/migrations/20260909_000001_agendamentos.sql` no projeto.
3. Crie dois usuários no Supabase Auth, um para Robson e outro para Gisele.
4. Consulte os UUIDs criados em `auth.users` e cadastre os perfis correspondentes:

```sql
insert into public.profiles (id, display_name, slug)
values
  ('UUID_DO_ROBSON', 'Robson', 'robson'),
  ('UUID_DA_GISELE', 'Gisele', 'gisele');
```

5. Copie `.env.example` para `.env.local` e informe:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

Com essas variáveis presentes, o app deixa o modo local e passa a exigir login. Os dois perfis autenticados enxergam e editam o mesmo workspace, com atualização via Supabase Realtime.

## Vercel

Importe `Robsonrmaia/agendamentos` na Vercel e configure as mesmas duas variáveis:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Build command: `npm run build`  
Output directory: `dist`

`vercel.json` mantém o fallback SPA para `index.html`.

## Verificação

```bash
npm run typecheck
npm test -- --run
npm run build
```

O workflow `.github/workflows/ci.yml` executa a verificação automática a cada push e pull request.

## Estrutura importante

- `src/domain/` — regras puras de tarefa, parser e prioridade.
- `src/data/` — persistência local e integração Supabase.
- `src/App.tsx` — workspace visual e interações.
- `supabase/migrations/` — banco, RLS, histórico e Realtime.
- `docs/superpowers/specs/` — especificação aprovada.
- `docs/superpowers/plans/` — plano técnico de implementação.

## Próximos passos fora da V1

A base foi preparada para, depois que o app estiver validado no uso real, o Hermes consultar, criar e atualizar tarefas por uma API autenticada sem alterar o modelo central do banco. A integração com Hermes não faz parte desta primeira versão.
