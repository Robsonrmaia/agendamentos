export const VOICE_SILENCE_MS = 10_000;
export const VOICE_MAX_MS = 90_000;

export function configureRecognition(recognition: { lang?: string; continuous?: boolean; interimResults?: boolean }) {
  recognition.lang = 'pt-BR';
  recognition.continuous = true;
  recognition.interimResults = true;
}

export function buildLiveTranscript(...parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function shouldRestartRecognition(active: boolean, error: string | null) {
  if (!active) return false;
  return error !== 'not-allowed' && error !== 'service-not-allowed' && error !== 'audio-capture';
}
