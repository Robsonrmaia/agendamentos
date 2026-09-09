import { z } from 'zod';

export const taskOwners = ['robson', 'gisele'] as const;
export const taskStatuses = ['idea', 'planned', 'in_progress', 'waiting', 'done'] as const;
export const taskDifficulties = ['easy', 'medium', 'hard'] as const;

export type TaskOwner = (typeof taskOwners)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskDifficulty = (typeof taskDifficulties)[number];

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string().nullable(),
  owner: z.enum(taskOwners),
  status: z.enum(taskStatuses),
  difficulty: z.enum(taskDifficulties),
  estimatedMinutes: z.number().int().positive().nullable(),
  plannedFor: z.string().nullable(),
  dueAt: z.string().nullable(),
  dependencyNote: z.string().nullable(),
  sourceText: z.string().nullable(),
  actualMinutes: z.number().int().positive().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  createdBy: z.enum(taskOwners),
  sortOrder: z.number(),
});

export type Task = z.infer<typeof taskSchema>;
export type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'sortOrder'>;

export const quickTaskSchema = z.object({
  title: z.string().trim().min(1),
  owner: z.enum(taskOwners),
});

export function validateTask(value: unknown) {
  return quickTaskSchema.safeParse(value);
}

export function transitionTaskStatus(
  task: Pick<Task, 'status' | 'completedAt'>,
  status: TaskStatus,
  nowIso: string,
) {
  return {
    status,
    completedAt: status === 'done' ? nowIso : null,
  };
}

export const statusLabels: Record<TaskStatus, string> = {
  idea: 'Ideias',
  planned: 'Planejado',
  in_progress: 'Em andamento',
  waiting: 'Aguardando / Dependência',
  done: 'Finalizado',
};

export const difficultyLabels: Record<TaskDifficulty, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
};
