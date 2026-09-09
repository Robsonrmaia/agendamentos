import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { taskSchema, type Task, type TaskOwner } from '../domain/task';

const PROFILE_TABLE = 'agendamento_profiles';
const TASK_TABLE = 'agendamento_tasks';

export type WorkspaceProfile = { id: string; slug: TaskOwner; displayName: string };

function fromRow(row: any): Task {
  return taskSchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    owner: row.owner_profile?.slug ?? row.owner_slug,
    status: row.status,
    difficulty: row.difficulty,
    estimatedMinutes: row.estimated_minutes,
    plannedFor: row.planned_for,
    dueAt: row.due_at,
    dependencyNote: row.dependency_note,
    sourceText: row.source_text,
    actualMinutes: row.actual_minutes,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    createdBy: row.creator_profile?.slug ?? row.created_by_slug ?? row.owner_profile?.slug,
    sortOrder: Number(row.sort_order ?? 0),
  });
}

export async function getSignedInProfile(): Promise<WorkspaceProfile | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from(PROFILE_TABLE).select('id, slug, display_name').eq('auth_user_id', user.id).single();
  if (error || !data) return null;
  return { id: data.id, slug: data.slug as TaskOwner, displayName: data.display_name };
}

export async function loadSupabaseTasks(): Promise<Task[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .select('*, owner_profile:agendamento_profiles!agendamento_tasks_owner_id_fkey(slug), creator_profile:agendamento_profiles!agendamento_tasks_created_by_fkey(slug)')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

async function profileId(slug: TaskOwner) {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase.from(PROFILE_TABLE).select('id').eq('slug', slug).single();
  if (error || !data) throw error ?? new Error(`Perfil ${slug} não encontrado`);
  return data.id as string;
}

export async function saveSupabaseTask(task: Task) {
  if (!supabase) return;
  const [ownerId, creatorId] = await Promise.all([profileId(task.owner), profileId(task.createdBy)]);
  const payload = {
    id: task.id,
    title: task.title,
    description: task.description,
    owner_id: ownerId,
    status: task.status,
    difficulty: task.difficulty,
    estimated_minutes: task.estimatedMinutes,
    planned_for: task.plannedFor,
    due_at: task.dueAt,
    dependency_note: task.dependencyNote,
    source_text: task.sourceText,
    actual_minutes: task.actualMinutes,
    tags: task.tags,
    completed_at: task.completedAt,
    created_by: creatorId,
    sort_order: task.sortOrder,
  };
  const { error } = await supabase.from(TASK_TABLE).upsert(payload);
  if (error) throw error;
}

export function subscribeSupabaseTasks(onChange: () => void): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel('agendamentos-tasks')
    .on('postgres_changes', { event: '*', schema: 'public', table: TASK_TABLE }, onChange)
    .subscribe();
}
