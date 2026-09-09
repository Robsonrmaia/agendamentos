import type { TaskDifficulty, TaskOwner, TaskStatus } from './task';

export type ParseTaskInput = {
  text: string;
  currentUser: TaskOwner;
  nowIso: string;
  timezone: 'America/Bahia';
};

export type ParsedTaskDraft = {
  title: string;
  description?: string;
  owner: TaskOwner;
  status: TaskStatus;
  difficulty: TaskDifficulty;
  estimatedMinutes?: number;
  plannedFor?: string;
  dueAt?: string;
  dependencyNote?: string;
  sourceText: string;
  confidence: {
    title: number;
    owner: number;
    difficulty: number;
    estimatedMinutes: number;
    date: number;
  };
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  'terca-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function localParts(nowIso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(nowIso));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function addCalendarDays(parts: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function localWeekday(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
}

function dueIso(parts: { year: number; month: number; day: number }) {
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}T18:00:00-03:00`;
}

function extractDate(text: string, nowIso: string, timezone: string) {
  const normalized = normalize(text);
  const today = localParts(nowIso, timezone);

  if (/\bhoje\b/.test(normalized)) return { dueAt: dueIso(today), confidence: 0.98 };
  if (/\bamanha\b/.test(normalized)) return { dueAt: dueIso(addCalendarDays(today, 1)), confidence: 0.98 };

  const weekdayMatch = normalized.match(/\b(?:ate|para|na|no)?\s*(domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)\b/);
  if (weekdayMatch) {
    const target = WEEKDAYS[weekdayMatch[1]];
    const current = localWeekday(today);
    const delta = (target - current + 7) % 7;
    return { dueAt: dueIso(addCalendarDays(today, delta)), confidence: 0.94 };
  }

  const numericMatch = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (numericMatch) {
    const yearRaw = numericMatch[3];
    const year = yearRaw ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)) : today.year;
    return { dueAt: dueIso({ year, month: Number(numericMatch[2]), day: Number(numericMatch[1]) }), confidence: 0.99 };
  }

  return { dueAt: undefined, confidence: 0 };
}

function extractDuration(text: string) {
  const normalized = normalize(text).replace(',', '.');
  const match = normalized.match(/\b(\d+(?:\.\d+)?)\s*(h|hora|horas|min|minuto|minutos)\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return match[2].startsWith('h') ? Math.round(value * 60) : Math.round(value);
}

function extractDifficulty(text: string): { value: TaskDifficulty; confidence: number } {
  const normalized = normalize(text);
  if (/\b(dificil|complex[oa]|pesad[oa])\b/.test(normalized)) return { value: 'hard', confidence: 0.96 };
  if (/\b(facil|simples|rapido|rapida)\b/.test(normalized)) return { value: 'easy', confidence: 0.93 };
  if (/\b(medio|media|moderad[oa])\b/.test(normalized)) return { value: 'medium', confidence: 0.92 };
  return { value: 'medium', confidence: 0.4 };
}

function extractOwner(text: string, currentUser: TaskOwner) {
  const normalized = normalize(text);
  if (/\bgisele\b/.test(normalized)) return { owner: 'gisele' as const, confidence: 0.99 };
  if (/\brobson\b/.test(normalized)) return { owner: 'robson' as const, confidence: 0.99 };
  return { owner: currentUser, confidence: 0.7 };
}

function cleanTitle(text: string) {
  let title = text.trim();
  title = title.replace(/\b(?:até|ate|para)\s+(?:hoje|amanh[ãa]|domingo|segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado)\b/gi, '');
  title = title.replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g, '');
  title = title.replace(/\b(?:fácil|facil|médio|medio|média|media|difícil|dificil|complex[oa]|pesad[oa])\b/gi, '');
  title = title.replace(/\b(?:devo\s+levar|vai\s+levar|leva|em)?\s*(?:umas?|cerca\s+de)?\s*\d+(?:[.,]\d+)?\s*(?:h|hora|horas|min|minuto|minutos)\b/gi, '');
  title = title.replace(/^\s*(?:robson|gisele)\s*[:,\-]?\s*/i, '');
  title = title.replace(/\s*,\s*,+/g, ', ').replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, '').replace(/\s{2,}/g, ' ');
  return title || text.trim();
}

export function parseTaskText(input: ParseTaskInput): ParsedTaskDraft {
  const sourceText = input.text.trim();
  const owner = extractOwner(sourceText, input.currentUser);
  const difficulty = extractDifficulty(sourceText);
  const estimatedMinutes = extractDuration(sourceText);
  const date = extractDate(sourceText, input.nowIso, input.timezone);

  return {
    title: cleanTitle(sourceText),
    owner: owner.owner,
    status: date.dueAt ? 'planned' : 'idea',
    difficulty: difficulty.value,
    estimatedMinutes,
    dueAt: date.dueAt,
    sourceText,
    confidence: {
      title: 0.9,
      owner: owner.confidence,
      difficulty: difficulty.confidence,
      estimatedMinutes: estimatedMinutes ? 0.95 : 0,
      date: date.confidence,
    },
  };
}
