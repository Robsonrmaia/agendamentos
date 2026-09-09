# Agendamentos — Shared Visual Work Planner Design

**Date:** 2026-09-09  
**Repository:** `Robsonrmaia/agendamentos`

## 1. Goal

Build a very fast, shared work-planning app for Robson and Gisele. The app must make it easy to capture an objective in natural language or voice, convert it into a structured task, visualize it in a simple pipeline, update it with one click or drag-and-drop, and clearly distinguish work that is merely done from work that is fully finalized with no pending dependency.

The product should feel closer to a lightweight visual control panel than to a traditional project-management suite.

## 2. Product principles

- Very low friction: no deep menus or long forms for normal usage.
- Shared by default: both users can see all tasks.
- Quick personal filtering: `Todos`, `Robson`, `Gisele`.
- Mobile-first interaction, but pleasant on desktop.
- Visual prioritization through color, badges, deadlines and compact summaries.
- Natural-language capture is the main entry path.
- Drag-and-drop is the main status-change path.
- Every important action must also be possible by tap/click for accessibility and mobile reliability.
- Avoid enterprise project-management complexity.

## 3. Recommended stack

- Frontend: React + Vite + TypeScript.
- UI: Tailwind CSS with a small internal component set.
- Drag-and-drop: `@dnd-kit`.
- Backend and authentication: Supabase.
- Database: Supabase Postgres.
- Realtime: Supabase Realtime for task updates.
- Validation: Zod.
- Tests: Vitest + React Testing Library.
- Deployment target: Vercel.

## 4. Main navigation

The app has one primary workspace.

Top bar:

- App name / compact logo.
- Scope tabs: `Hoje`, `Esta semana`, `Tudo`.
- Owner filter: `Todos`, `Robson`, `Gisele`.
- Search.
- Large primary action: `+ Adicionar`.
- Optional microphone action beside the quick-entry field when speech recognition is available.

The application should not start with multiple administration screens. Secondary settings can live behind a small profile/settings menu.

## 5. Dashboard summary

A compact summary strip appears above the board:

- tasks due today;
- tasks due this week;
- tasks currently in progress;
- tasks waiting on dependencies;
- tasks fully finalized.

Counts update live as tasks move.

## 6. Pipeline

Use five primary columns:

1. `Ideias`
2. `Planejado`
3. `Em andamento`
4. `Aguardando / Dependência`
5. `Finalizado`

### Status semantics

- `Ideias`: captured but not yet scheduled.
- `Planejado`: has an intended execution window or deadline.
- `Em andamento`: actively being worked on.
- `Aguardando / Dependência`: Robson/Gisele completed the current action but something external or another implementation is still pending.
- `Finalizado`: no further action or dependency remains.

The distinction between `Aguardando / Dependência` and `Finalizado` is mandatory because the user explicitly wants to know whether something was done but still depends on another implementation.

## 7. Task card

Each task card should show only the information useful at a glance:

- title;
- owner avatar/initial: Robson or Gisele;
- deadline or planned date;
- difficulty badge;
- estimated effort;
- status color/accent;
- dependency badge when applicable;
- overdue indicator when applicable;
- optional progress marker when the task has subtasks/checklist items.

The card should open a lightweight drawer/modal for details and editing, not a full-page form.

## 8. Core task fields

Required data model:

- `id`
- `title`
- `description` optional
- `owner`: `robson | gisele`
- `status`: `idea | planned | in_progress | waiting | done`
- `difficulty`: `easy | medium | hard`
- `estimated_minutes` optional
- `planned_for` optional date/time
- `due_at` optional date/time
- `dependency_note` optional
- `is_fully_finalized` derived from `status = done`
- `priority_score` derived
- `created_at`
- `updated_at`
- `completed_at` optional
- `created_by`
- `sort_order`

Optional-but-useful fields for the first release:

- `tags` as short text array
- `source_text` preserving the original natural-language request
- `actual_minutes` optional

## 9. Quick capture by text

Primary interaction example:

> “Terminar a ligação do Hermes com a OLX até quinta, difícil, devo levar umas 4 horas.”

The capture layer should extract or infer:

- title: `Terminar ligação do Hermes com a OLX`
- owner: current user unless explicitly stated otherwise
- deadline: next Thursday in the user's local timezone
- difficulty: hard
- estimated effort: 240 minutes
- initial status: planned

If the sentence does not specify a field, the system should not block task creation. It should use safe defaults and let the user edit later.

Default rules:

- owner = signed-in user
- status = `planned` when a date/deadline is recognized, otherwise `idea`
- difficulty = `medium` if not specified
- no deadline invented when none is expressed

Before saving an interpreted task, show a compact preview with one-tap correction for the few extracted fields. The preview must not become a long form.

## 10. Voice capture

Voice capture should feed the same quick-capture pipeline used by typed text.

First-release behavior:

- use browser speech recognition where supported;
- transcribe locally/browser-side where possible;
- place transcription into the same quick-entry field;
- let the same parser structure the task;
- gracefully fall back to typing when speech recognition is unavailable.

No separate voice workflow should be created.

## 11. Natural-language parsing architecture

Use a server-side parsing endpoint/function so parsing logic is not embedded in UI components.

Input:

```ts
type ParseTaskInput = {
  text: string;
  currentUser: "robson" | "gisele";
  nowIso: string;
  timezone: "America/Bahia";
};
```

Output:

```ts
type ParsedTaskDraft = {
  title: string;
  description?: string;
  owner: "robson" | "gisele";
  status: "idea" | "planned" | "in_progress" | "waiting" | "done";
  difficulty: "easy" | "medium" | "hard";
  estimatedMinutes?: number;
  plannedFor?: string;
  dueAt?: string;
  dependencyNote?: string;
  confidence: {
    title: number;
    owner: number;
    difficulty: number;
    estimatedMinutes: number;
    date: number;
  };
};
```

The parser should support deterministic date/keyword extraction first and allow an AI parser behind the server boundary later without forcing a frontend redesign.

## 12. Priority rules

Priority is primarily visual; users are not required to maintain a separate complex priority field.

Recommended derived score considers:

- overdue deadline: strongest weight;
- due today;
- due within 3 days;
- in progress;
- hard difficulty;
- waiting dependency should be visible but not dominate active work;
- recently completed work does not compete with open work.

This score can order cards inside a column while allowing manual ordering. Manual drag order wins inside the same priority band.

## 13. Color system

Colors must help recognition but not be the only signal.

Suggested semantic palette:

- easy: green accent
- medium: amber/yellow accent
- hard: red accent
- in progress: blue status marker
- waiting/dependency: purple status marker
- finalized: neutral gray/soft green completed state
- overdue: strong red deadline marker

Use light backgrounds and clear text. Avoid a visually dark or overloaded dashboard.

## 14. Shared Robson / Gisele behavior

- Both users can view all tasks.
- Both users can create and edit shared tasks.
- Each task has one primary owner.
- Filtering is instant and client-visible via `Todos`, `Robson`, `Gisele`.
- Owner can be reassigned with one tap from a task card/detail drawer.
- Realtime updates should reflect changes made by the other user without manual refresh.

## 15. Authentication and authorization

Use Supabase Auth.

The first version only needs two recognized application profiles: Robson and Gisele. Do not create a complex organization/team-role system yet.

Database policies must prevent anonymous access and allow authenticated members of this shared workspace to read and update tasks.

## 16. Data model

### `profiles`

- `id uuid` references auth user
- `display_name text`
- `slug text` unique (`robson`, `gisele`)
- `avatar_url text` nullable
- timestamps

### `tasks`

- fields from the core task model
- `owner_id uuid` references `profiles.id`
- `created_by uuid` references `profiles.id`

### `task_history`

Store meaningful changes only:

- task id
- actor id
- action type
- previous status
- new status
- changed fields JSON
- timestamp

This history is useful for trust and later Hermes integration but should not clutter the primary UI.

## 17. Drag-and-drop behavior

- Dragging between columns changes status.
- Dropping in `Finalizado` sets `completed_at`.
- Moving a finalized task back to another status clears `completed_at`.
- Dropping in `Aguardando / Dependência` prompts only for an optional short dependency note.
- Reordering inside a column updates `sort_order`.
- Optimistic UI is allowed, but failed persistence must visibly restore the previous state and show a concise error.

## 18. One-click actions

Without opening details, card actions should support:

- start now;
- mark waiting;
- mark finalized;
- change owner;
- change deadline through a compact date picker;
- edit task.

These should be available via concise icon/buttons and mobile-friendly tap targets.

## 19. Views

### Today

Shows open tasks due or planned for today plus overdue items.

### This week

Shows open tasks relevant to the current week.

### Everything

Shows the full pipeline, with optional search/filter.

Completed tasks may collapse into a compact section by default after a configurable recent period, so the board remains useful.

## 20. Error handling

- Creating a task must preserve the user's typed/transcribed text if parsing or saving fails.
- Parser failure falls back to a minimal task with the raw text as title and current user as owner.
- Network failure must not silently lose drag-and-drop updates.
- Realtime disconnect should show a subtle connection state and retry automatically.
- Invalid dates or impossible parsed values should be rejected by schema validation before database writes.

## 21. Responsiveness and accessibility

Desktop:

- five-column board can scroll horizontally if needed;
- dashboard summary remains compact.

Mobile:

- status columns become horizontally swipeable sections or a single-column board grouped by status;
- quick capture remains fixed/easy to reach;
- drag-and-drop has tap-based alternatives.

Accessibility:

- keyboard-capable status changes;
- visible labels in addition to colors;
- sufficient contrast;
- touch targets at least 44px where practical.

## 22. Hermes/API readiness

The first release should be designed so Hermes can later create, query and update tasks through a small authenticated API without changing the database model.

Future examples:

- “Hermes, coloca terminar integração OLX para quinta.”
- “O que tenho pra hoje?”
- “Marca Marketplace como em andamento.”

Do not implement Hermes integration in the first scope unless explicitly requested after the app core is working.

## 23. Out of scope for v1

To keep the app fast and simple, do not include in v1:

- Gantt charts;
- complex team permissions;
- comments/chat threads;
- billing;
- multi-workspace organizations;
- advanced recurring-task engine;
- file attachments;
- external calendar sync;
- large analytics dashboards.

These may be added later if actual usage justifies them.

## 24. Testing strategy

Unit tests:

- task parser deterministic rules;
- priority score;
- date interpretation;
- status transitions;
- task schema validation.

Component tests:

- quick capture preview;
- owner filters;
- board column rendering;
- card one-click actions;
- fallback when parsing fails.

Integration tests:

- create task → appears on board;
- drag planned → in progress;
- move in progress → waiting with dependency;
- move waiting → finalized;
- filter Robson/Gisele;
- realtime update from second session.

## 25. Success criteria for first production release

The app is ready for first real use when:

1. Robson and Gisele can sign in and see the same workspace.
2. A task can be created from one natural-language sentence in a few seconds.
3. The parsed preview recognizes common deadline, difficulty and duration expressions.
4. Tasks can be moved through the five states by drag or click.
5. The board clearly distinguishes waiting/dependency from fully finalized.
6. Filters `Todos`, `Robson`, `Gisele` work instantly.
7. Today and This week views are correct in `America/Bahia`.
8. Changes persist after reload and synchronize between two sessions.
9. Failed network/parser operations do not silently lose user input.
10. The interface remains simple enough that normal task updates do not require navigating through multiple menus.

## 26. Initial example tasks for acceptance testing

- Robson — `Terminar ligação do Hermes com a OLX` — hard — due Thursday — planned.
- Robson — `Continuar app de postagem no Marketplace` — medium — planned.
- Gisele — sample real-estate/business task — easy or medium — planned.

These provide realistic test data without hard-coding personal workflows into the product.
