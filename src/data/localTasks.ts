import { parseTaskText } from '../domain/parser';
import { taskSchema, type Task, type TaskDraft, type TaskOwner } from '../domain/task';

const STORAGE_KEY = 'agendamentos:v1:tasks';

function id() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function createTask(draft: TaskDraft): Task {
  const now = new Date().toISOString();
  return taskSchema.parse({
    ...draft,
    id: id(),
    createdAt: now,
    updatedAt: now,
    completedAt: draft.status === 'done' ? now : null,
    sortOrder: Date.now(),
  });
}

function seedDraft(text: string, owner: TaskOwner, overrides: Partial<TaskDraft> = {}) {
  const parsed = parseTaskText({ text, currentUser: owner, nowIso: new Date().toISOString(), timezone: 'America/Bahia' });
  return createTask({
    title: parsed.title,
    description: null,
    owner: parsed.owner,
    status: parsed.status,
    difficulty: parsed.difficulty,
    estimatedMinutes: parsed.estimatedMinutes ?? null,
    plannedFor: parsed.dueAt ?? null,
    dueAt: parsed.dueAt ?? null,
    dependencyNote: null,
    sourceText: text,
    actualMinutes: null,
    tags: [],
    createdBy: owner,
    ...overrides,
  });
}

export function seedTasks(): Task[] {
  return [
    seedDraft('Terminar ligação do Hermes com a OLX até quinta, difícil', 'robson'),
    seedDraft('Continuar app de postagem no Marketplace', 'robson', { status: 'planned' }),
    seedDraft('Revisar prioridades de atendimento e imóveis, fácil', 'gisele', { status: 'planned' }),
  ];
}

export function loadLocalTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedTasks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedTasks();
    return parsed.map((task) => taskSchema.parse(task));
  } catch {
    return seedTasks();
  }
}

export function saveLocalTasks(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
