import type { Task } from './task';

function dayKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function getPriorityScore(task: Task, now = new Date()) {
  if (task.status === 'done') return -1000;
  let score = 0;

  if (task.dueAt) {
    const due = new Date(task.dueAt);
    if (due.getTime() < now.getTime() && dayKey(due) !== dayKey(now)) score += 100;
    else if (dayKey(due) === dayKey(now)) score += 70;
    else {
      const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
      if (days <= 3) score += 40;
    }
  }

  if (task.status === 'in_progress') score += 25;
  if (task.difficulty === 'hard') score += 10;
  if (task.status === 'waiting') score -= 10;
  return score;
}
