# Agendamentos V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable shared visual work planner for Robson and Gisele with fast natural-language capture, five-stage pipeline, owner/scope filters, drag-and-drop and Supabase-ready persistence.

**Architecture:** A React/Vite/TypeScript single-page app owns presentation and optimistic board interactions. Domain behavior lives in small pure TypeScript modules, while a repository abstraction isolates local demo storage from the Supabase implementation so the UI can be exercised before credentials are configured. Supabase SQL, Auth, RLS and Realtime are provided in-repo, and the deterministic parser stays behind a service boundary that can later be replaced by a server/AI parser without changing UI components.

**Tech Stack:** React, Vite, TypeScript, Tailwind CSS, @dnd-kit, Zod, Supabase JS, Vitest, React Testing Library, date-fns.

**Spec:** `docs/superpowers/specs/2026-09-09-agendamentos-design.md`

## Global Constraints

- Shared workspace: both authenticated users can view and edit all tasks.
- Owner values are exactly `robson | gisele`.
- Status values are exactly `idea | planned | in_progress | waiting | done`.
- `waiting` must remain visually and semantically distinct from `done`.
- Primary timezone is exactly `America/Bahia`.
- Normal usage must not require deep menus or long forms.
- Every drag action must have an equivalent tap/click action.
- Parser failures must preserve the original input and fall back to a minimal draft.
- Do not implement Hermes integration in V1; only preserve API/data-model readiness.
- Do not add Gantt, comments/chat, recurring-task engine, attachments, calendar sync or multi-workspace permissions.

---

### Task 1: Scaffold the tested application shell and domain contracts

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `src/domain/task.ts`
- Create: `src/domain/task.test.ts`
- Create: `src/test/setup.ts`

**Interfaces:**
- Produces `TaskOwner`, `TaskStatus`, `TaskDifficulty`, `Task`, `TaskDraft`, `taskSchema`, `transitionTaskStatus`.
- Later components consume those domain types only; they do not duplicate status/owner string unions.

- [ ] **Step 1: Write the failing status-transition/schema tests**

```ts
import { describe, expect, it } from 'vitest';
import { taskSchema, transitionTaskStatus } from './task';

describe('task domain', () => {
  it('sets completedAt when finalized', () => {
    const next = transitionTaskStatus({ status: 'in_progress', completedAt: null }, 'done', '2026-09-09T18:00:00-03:00');
    expect(next).toEqual({ status: 'done', completedAt: '2026-09-09T18:00:00-03:00' });
  });

  it('clears completedAt when reopened', () => {
    const next = transitionTaskStatus({ status: 'done', completedAt: '2026-09-09T18:00:00-03:00' }, 'waiting', '2026-09-09T19:00:00-03:00');
    expect(next).toEqual({ status: 'waiting', completedAt: null });
  });

  it('rejects owners outside Robson and Gisele', () => {
    const parsed = taskSchema.safeParse({
      id: crypto.randomUUID(), title: 'Teste', owner: 'outro', status: 'idea', difficulty: 'medium',
      estimatedMinutes: null, plannedFor: null, dueAt: null, dependencyNote: null, sourceText: null,
      actualMinutes: null, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      completedAt: null, createdBy: 'robson', sortOrder: 0,
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/domain/task.test.ts`
Expected: FAIL because `src/domain/task.ts` does not exist.

- [ ] **Step 3: Implement the minimal domain contracts**

```ts
import { z } from 'zod';

export const owners = ['robson', 'gisele'] as const;
export const statuses = ['idea', 'planned', 'in_progress', 'waiting', 'done'] as const;
export const difficulties = ['easy', 'medium', 'hard'] as const;
export type TaskOwner = typeof owners[number];
export type TaskStatus = typeof statuses[number];
export type TaskDifficulty = typeof difficulties[number];

export const taskSchema = z.object({
  id: z.string().uuid(), title: z.string().min(1), description: z.string().nullable().optional(),
  owner: z.enum(owners), status: z.enum(statuses), difficulty: z.enum(difficulties),
  estimatedMinutes: z.number().int().positive().nullable(), plannedFor: z.string().datetime({ offset: true }).nullable(),
  dueAt: z.string().datetime({ offset: true }).nullable(), dependencyNote: z.string().nullable(), sourceText: z.string().nullable(),
  actualMinutes: z.number().int().positive().nullable(), tags: z.array(z.string()), createdAt: z.string(), updatedAt: z.string(),
  completedAt: z.string().nullable(), createdBy: z.enum(owners), sortOrder: z.number(),
});
export type Task = z.infer<typeof taskSchema>;
export type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'sortOrder'>;

export function transitionTaskStatus(task: Pick<Task, 'status' | 'completedAt'>, status: TaskStatus, nowIso: string) {
  return { status, completedAt: status === 'done' ? nowIso : null };
}
```

- [ ] **Step 4: Run unit tests and verify GREEN**

Run: `npm test -- src/domain/task.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig*.json index.html src
 git commit -m "feat: scaffold agendamentos domain"
```

---

### Task 2: Deterministic natural-language parser and priority engine

**Files:**
- Create: `src/domain/parser.ts`
- Create: `src/domain/parser.test.ts`
- Create: `src/domain/priority.ts`
- Create: `src/domain/priority.test.ts`
- Create: `src/services/taskParser.ts`

**Interfaces:**
- Produces `parseTaskText(input: ParseTaskInput): ParsedTaskDraft`.
- Produces `getPriorityScore(task, now): number`.
- `taskParser.parse()` is the UI-facing boundary and can later call a server/AI endpoint.

- [ ] **Step 1: Write parser tests for the real acceptance sentence and defaults**

```ts
it('parses Thursday, difficulty and four hours', () => {
  const result = parseTaskText({
    text: 'Terminar a ligação do Hermes com a OLX até quinta, difícil, devo levar umas 4 horas',
    currentUser: 'robson', nowIso: '2026-09-09T15:30:00-03:00', timezone: 'America/Bahia',
  });
  expect(result.owner).toBe('robson');
  expect(result.status).toBe('planned');
  expect(result.difficulty).toBe('hard');
  expect(result.estimatedMinutes).toBe(240);
  expect(result.dueAt?.startsWith('2026-09-10')).toBe(true);
});

it('creates an idea with medium difficulty when no date or difficulty exists', () => {
  const result = parseTaskText({ text: 'Ver integração Marketplace', currentUser: 'gisele', nowIso: '2026-09-09T15:30:00-03:00', timezone: 'America/Bahia' });
  expect(result.status).toBe('idea');
  expect(result.owner).toBe('gisele');
  expect(result.difficulty).toBe('medium');
  expect(result.dueAt).toBeUndefined();
});
```

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npm test -- src/domain/parser.test.ts`
Expected: FAIL because parser is not implemented.

- [ ] **Step 3: Implement deterministic parsing**

Implement helpers for Portuguese keywords (`fácil`, `médio`, `difícil`), durations (`minuto(s)`, `hora(s)`), explicit owners (`Robson`, `Gisele`) and relative weekdays (`segunda` through `domingo`). Strip recognized metadata fragments from the displayed title but always preserve the full `sourceText`.

- [ ] **Step 4: Write priority tests**

```ts
it('ranks overdue above due-today and waiting work', () => {
  const now = new Date('2026-09-09T12:00:00-03:00');
  expect(getPriorityScore(makeTask({ dueAt: '2026-09-08T18:00:00-03:00' }), now))
    .toBeGreaterThan(getPriorityScore(makeTask({ dueAt: '2026-09-09T18:00:00-03:00' }), now));
  expect(getPriorityScore(makeTask({ status: 'waiting' }), now))
    .toBeLessThan(getPriorityScore(makeTask({ status: 'in_progress' }), now));
});
```

- [ ] **Step 5: Run priority tests and verify RED, then implement minimal scoring**

Use additive weights: overdue `+100`, today `+70`, within three days `+40`, in-progress `+25`, hard `+10`, waiting `-10`, done `-1000`.

- [ ] **Step 6: Run domain test suite and verify GREEN**

Run: `npm test -- src/domain`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain src/services/taskParser.ts
 git commit -m "feat: add task parsing and priority rules"
```

---

### Task 3: Repository abstraction, local demo persistence and seeded acceptance data

**Files:**
- Create: `src/data/taskRepository.ts`
- Create: `src/data/localTaskRepository.ts`
- Create: `src/data/localTaskRepository.test.ts`
- Create: `src/data/seed.ts`

**Interfaces:**
- Produces `TaskRepository` with `list`, `create`, `update`, `remove`, `subscribe`.
- UI depends on `TaskRepository`, not directly on `localStorage` or Supabase.

- [ ] **Step 1: Write repository contract tests**

```ts
it('persists create and status update', async () => {
  const storage = new MemoryStorage();
  const repo = createLocalTaskRepository(storage);
  const created = await repo.create(makeDraft({ title: 'OLX' }));
  await repo.update(created.id, { status: 'in_progress' });
  expect((await repo.list()).find(t => t.id === created.id)?.status).toBe('in_progress');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/data/localTaskRepository.test.ts`
Expected: FAIL because repository does not exist.

- [ ] **Step 3: Implement local repository and seed**

Seed only when storage is empty with:

```ts
[
  { owner: 'robson', title: 'Terminar ligação do Hermes com a OLX', difficulty: 'hard', status: 'planned' },
  { owner: 'robson', title: 'Continuar app de postagem no Marketplace', difficulty: 'medium', status: 'planned' },
  { owner: 'gisele', title: 'Revisar prioridades de atendimento e imóveis', difficulty: 'easy', status: 'planned' },
]
```

- [ ] **Step 4: Run repository tests and verify GREEN**

Run: `npm test -- src/data/localTaskRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data
 git commit -m "feat: add task repository and demo persistence"
```

---

### Task 4: Quick capture, owner filters, scopes and summary strip

**Files:**
- Create: `src/components/QuickCapture.tsx`
- Create: `src/components/QuickCapture.test.tsx`
- Create: `src/components/Filters.tsx`
- Create: `src/components/Filters.test.tsx`
- Create: `src/components/SummaryStrip.tsx`
- Create: `src/domain/filters.ts`
- Create: `src/domain/filters.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- `QuickCapture` emits an approved `TaskDraft` and never loses the source text on parser failure.
- `filterTasks(tasks, { owner, scope, search }, now)` handles `today | week | all`.

- [ ] **Step 1: Write filter tests for Today/Week/owner**

```ts
expect(filterTasks(tasks, { owner: 'robson', scope: 'today', search: '' }, now).every(t => t.owner === 'robson')).toBe(true);
expect(filterTasks(tasks, { owner: 'all', scope: 'today', search: '' }, now).some(t => t.dueAt && t.dueAt < now.toISOString())).toBe(true);
```

- [ ] **Step 2: Run filter tests RED, implement filters, rerun GREEN**

Run: `npm test -- src/domain/filters.test.ts`

- [ ] **Step 3: Write QuickCapture component test**

```tsx
it('shows parsed preview before saving', async () => {
  render(<QuickCapture currentUser="robson" onCreate={onCreate} />);
  await user.type(screen.getByPlaceholderText(/o que você quer fazer/i), 'Terminar OLX até quinta, difícil, 4 horas');
  await user.click(screen.getByRole('button', { name: /interpretar/i }));
  expect(await screen.findByText(/4h/)).toBeInTheDocument();
  expect(screen.getByText(/difícil/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run component test RED, implement compact preview and rerun GREEN**

The preview exposes only owner, date, difficulty, effort and `Criar tarefa`; raw text remains in the input until create succeeds.

- [ ] **Step 5: Implement top filters and live summary counts with component tests**

Labels must be exactly `Hoje`, `Esta semana`, `Tudo`, `Todos`, `Robson`, `Gisele`.

- [ ] **Step 6: Commit**

```bash
git add src/components src/domain/filters* src/App.tsx
 git commit -m "feat: add quick capture and dashboard filters"
```

---

### Task 5: Visual five-column board, task cards, click actions and drag-and-drop

**Files:**
- Create: `src/components/TaskBoard.tsx`
- Create: `src/components/TaskBoard.test.tsx`
- Create: `src/components/TaskColumn.tsx`
- Create: `src/components/TaskCard.tsx`
- Create: `src/components/TaskCard.test.tsx`
- Create: `src/components/TaskDrawer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Board emits `onMove(taskId, status, sortOrder)`.
- Card emits one-click `start`, `wait`, `finish`, owner reassignment and edit.

- [ ] **Step 1: Write board rendering/status semantics test**

```tsx
expect(screen.getByRole('heading', { name: 'Ideias' })).toBeInTheDocument();
expect(screen.getByRole('heading', { name: 'Aguardando / Dependência' })).toBeInTheDocument();
expect(screen.getByRole('heading', { name: 'Finalizado' })).toBeInTheDocument();
```

- [ ] **Step 2: Run RED, implement five columns, rerun GREEN**

- [ ] **Step 3: Write click-action transition tests**

```tsx
await user.click(screen.getByRole('button', { name: /iniciar agora/i }));
expect(onMove).toHaveBeenCalledWith(task.id, 'in_progress', expect.any(Number));
```

- [ ] **Step 4: Implement card actions and lightweight edit drawer**

When selecting `waiting`, show one optional dependency input. When selecting `done`, do not ask for a dependency.

- [ ] **Step 5: Add @dnd-kit drag behavior and optimistic rollback test**

On persistence rejection, restore prior status/order and show `Não foi possível salvar a alteração.`.

- [ ] **Step 6: Commit**

```bash
git add src/components src/App.tsx src/index.css
 git commit -m "feat: add visual task pipeline"
```

---

### Task 6: Voice capture and responsive/accessibility refinement

**Files:**
- Create: `src/hooks/useSpeechRecognition.ts`
- Create: `src/hooks/useSpeechRecognition.test.ts`
- Modify: `src/components/QuickCapture.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `useSpeechRecognition()` returns `{ supported, listening, start, stop }` and inserts transcript through a callback.

- [ ] **Step 1: Write unsupported-browser fallback test**

```ts
it('reports unsupported without throwing', () => {
  const { result } = renderHook(() => useSpeechRecognition(() => {}));
  expect(result.current.supported).toBe(false);
});
```

- [ ] **Step 2: Run RED, implement wrapper around browser SpeechRecognition, rerun GREEN**

- [ ] **Step 3: Add microphone button only when supported**

The transcript must populate the same text input used by typed capture.

- [ ] **Step 4: Add responsive CSS and accessibility checks**

Desktop board may scroll horizontally; mobile columns use horizontal snap/scroll. All status-changing buttons use labels and at least 44px practical touch height.

- [ ] **Step 5: Commit**

```bash
git add src/hooks src/components/QuickCapture.tsx src/index.css
 git commit -m "feat: add voice capture and responsive polish"
```

---

### Task 7: Supabase schema, Auth/RLS/Realtime and production repository

**Files:**
- Create: `supabase/migrations/20260909_000001_agendamentos.sql`
- Create: `src/lib/supabase.ts`
- Create: `src/data/supabaseTaskRepository.ts`
- Create: `src/data/supabaseTaskRepository.test.ts`
- Create: `.env.example`
- Modify: `src/App.tsx`

**Interfaces:**
- `createSupabaseTaskRepository(client)` implements the same `TaskRepository` contract from Task 3.
- Repository selection uses Supabase only when both Vite environment variables exist; otherwise local demo mode remains usable.

- [ ] **Step 1: Write SQL migration**

Create `profiles`, `tasks`, `task_history`, enums/checks, indexes, updated-at trigger, and RLS policies requiring authenticated users whose profile slug is `robson` or `gisele`. Add `tasks` to `supabase_realtime` publication idempotently.

- [ ] **Step 2: Write Supabase repository mapping test**

Test snake_case database rows map to camelCase domain tasks and that updating status to `done` writes `completed_at`.

- [ ] **Step 3: Run repository test RED, implement mapper/repository, rerun GREEN**

- [ ] **Step 4: Wire connection-state indicator and Realtime subscription**

Display `Sincronizado`, `Reconectando…`, or `Modo local` unobtrusively in the top bar.

- [ ] **Step 5: Commit**

```bash
git add supabase src/lib src/data .env.example src/App.tsx
 git commit -m "feat: add supabase persistence and realtime"
```

---

### Task 8: Production verification, documentation and Vercel readiness

**Files:**
- Create: `README.md`
- Create: `vercel.json`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**
- CI exposes one release gate: install, typecheck, tests and production build.

- [ ] **Step 1: Add CI workflow**

```yaml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test -- --run
      - run: npm run build
```

- [ ] **Step 2: Document local start, Supabase migration, profile bootstrap and Vercel environment variables**

Document `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and explain that the UI deliberately falls back to local demo mode when those are absent.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm ci
npm run typecheck
npm test -- --run
npm run build
```

Expected: every command exits 0 with no failing tests.

- [ ] **Step 4: Acceptance smoke test**

Verify these flows manually in local mode:

1. Create `Terminar a ligação do Hermes com a OLX até quinta, difícil, devo levar umas 4 horas`.
2. Confirm preview shows Robson, Thursday, hard and 4h.
3. Move Planned → In progress → Waiting and add a dependency note.
4. Move Waiting → Finalized and confirm waiting badge disappears.
5. Filter `Gisele`, then return to `Todos`.
6. Refresh and confirm tasks persist.

- [ ] **Step 5: Commit**

```bash
git add README.md vercel.json .github package.json package-lock.json
 git commit -m "chore: add production verification and docs"
```

---

## Self-review result

- Spec coverage: capture, parser, voice, five statuses, waiting-vs-done semantics, owner/scope filters, summaries, drag/click actions, persistence, Realtime readiness, error fallback, responsiveness and testing are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO` or unspecified implementation steps remain.
- Type consistency: all tasks use the same owner/status/difficulty string unions and one `TaskRepository` boundary.
- Scope: Hermes command integration remains intentionally excluded from V1; only the data/repository boundary prepares for it.
