import { describe, expect, it } from 'vitest';
import { VOICE_MAX_MS, VOICE_SILENCE_MS, buildLiveTranscript, configureRecognition, shouldRestartRecognition } from './voiceCapture';

describe('voiceCapture', () => {
  it('mantém o reconhecimento contínuo e com resultados intermediários', () => {
    const recognition: { lang?: string; continuous?: boolean; interimResults?: boolean } = {};
    configureRecognition(recognition);
    expect(recognition.lang).toBe('pt-BR');
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
  });

  it('dá tempo confortável para pausas e fala longa', () => {
    expect(VOICE_SILENCE_MS).toBeGreaterThanOrEqual(10_000);
    expect(VOICE_MAX_MS).toBeGreaterThanOrEqual(90_000);
  });

  it('acumula todos os trechos sem perder conteúdo', () => {
    expect(buildLiveTranscript('primeira parte', 'segunda parte', 'terceira parte')).toBe('primeira parte segunda parte terceira parte');
  });

  it('reinicia encerramentos automáticos mas respeita bloqueio de permissão', () => {
    expect(shouldRestartRecognition(true, null)).toBe(true);
    expect(shouldRestartRecognition(true, 'no-speech')).toBe(true);
    expect(shouldRestartRecognition(true, 'not-allowed')).toBe(false);
    expect(shouldRestartRecognition(false, null)).toBe(false);
  });
});
