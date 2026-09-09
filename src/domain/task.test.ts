import { describe, expect, it } from 'vitest';
import { transitionTaskStatus, validateTask } from './task';

describe('task domain', () => {
  it('marca completedAt ao finalizar', () => {
    expect(transitionTaskStatus({ status: 'in_progress', completedAt: null }, 'done', '2026-09-09T18:00:00-03:00'))
      .toEqual({ status: 'done', completedAt: '2026-09-09T18:00:00-03:00' });
  });

  it('limpa completedAt ao reabrir', () => {
    expect(transitionTaskStatus({ status: 'done', completedAt: '2026-09-09T18:00:00-03:00' }, 'waiting', '2026-09-09T19:00:00-03:00'))
      .toEqual({ status: 'waiting', completedAt: null });
  });

  it('rejeita responsável fora do workspace', () => {
    const result = validateTask({ title: 'Teste', owner: 'outro' });
    expect(result.success).toBe(false);
  });
});
