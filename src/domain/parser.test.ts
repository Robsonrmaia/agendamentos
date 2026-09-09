import { describe, expect, it } from 'vitest';
import { parseTaskText } from './parser';

const input = (text: string, currentUser: 'robson' | 'gisele' = 'robson') => ({
  text,
  currentUser,
  nowIso: '2026-09-09T15:30:00-03:00',
  timezone: 'America/Bahia' as const,
});

describe('parseTaskText', () => {
  it('interpreta prazo, dificuldade e duração em português', () => {
    const result = parseTaskText(input('Terminar a ligação do Hermes com a OLX até quinta, difícil, devo levar umas 4 horas'));
    expect(result.owner).toBe('robson');
    expect(result.status).toBe('planned');
    expect(result.difficulty).toBe('hard');
    expect(result.estimatedMinutes).toBe(240);
    expect(result.dueAt?.startsWith('2026-09-10')).toBe(true);
    expect(result.title.toLowerCase()).toContain('hermes');
  });

  it('usa defaults seguros quando faltam metadados', () => {
    const result = parseTaskText(input('Continuar app de postagem no Marketplace', 'gisele'));
    expect(result.owner).toBe('gisele');
    expect(result.status).toBe('idea');
    expect(result.difficulty).toBe('medium');
    expect(result.dueAt).toBeUndefined();
  });

  it('entende responsável explícito', () => {
    expect(parseTaskText(input('Gisele revisar anúncios amanhã')).owner).toBe('gisele');
  });
});
