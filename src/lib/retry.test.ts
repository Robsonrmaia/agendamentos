import { describe, expect, it } from 'vitest';
import { retryAsync } from './retry';

describe('retryAsync', () => {
  it('repete uma gravação transitória e devolve sucesso sem perder a tarefa', async () => {
    let attempts = 0;
    const result = await retryAsync(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('transient');
      return 'saved';
    }, { attempts: 3, delaysMs: [0, 0] });

    expect(result).toBe('saved');
    expect(attempts).toBe(3);
  });
});
