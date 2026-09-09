import { describe, expect, it } from 'vitest';
import { getPriorityScore } from './priority';
import type { Task } from './task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111', title: 'Tarefa', description: null, owner: 'robson', status: 'planned', difficulty: 'medium',
    estimatedMinutes: null, plannedFor: null, dueAt: null, dependencyNote: null, sourceText: null, actualMinutes: null, tags: [],
    createdAt: '2026-09-09T10:00:00-03:00', updatedAt: '2026-09-09T10:00:00-03:00', completedAt: null, createdBy: 'robson', sortOrder: 0,
    ...overrides,
  };
}

describe('priority', () => {
  const now = new Date('2026-09-09T12:00:00-03:00');
  it('prioriza atrasada acima de hoje', () => {
    expect(getPriorityScore(makeTask({ dueAt: '2026-09-08T18:00:00-03:00' }), now))
      .toBeGreaterThan(getPriorityScore(makeTask({ dueAt: '2026-09-09T18:00:00-03:00' }), now));
  });
  it('não deixa aguardando dominar trabalho ativo', () => {
    expect(getPriorityScore(makeTask({ status: 'waiting' }), now))
      .toBeLessThan(getPriorityScore(makeTask({ status: 'in_progress' }), now));
  });
});
