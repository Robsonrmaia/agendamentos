import { useEffect, useRef, useState, type RefObject } from 'react';
import { parseTaskText, type ParsedTaskDraft } from '../domain/parser';
import { buildLiveTranscript, configureRecognition, shouldRestartRecognition, VOICE_MAX_MS, VOICE_SILENCE_MS } from '../domain/voiceCapture';
import type { TaskDifficulty, TaskOwner } from '../domain/task';

function effortLabel(minutes?: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace('.', ',')}h`;
}

function dateInput(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function dateFromInput(value: string) {
  return value ? `${value}T18:00:00-03:00` : undefined;
}

export default function QuickCapture({ currentUser, onCreate, inputRef }: {
  currentUser: TaskOwner;
  onCreate: (draft: ParsedTaskDraft) => Promise<void> | void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedTaskDraft | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const keepListeningRef = useRef(false);
  const baseTextRef = useRef('');
  const committedTextRef = useRef('');
  const latestTextRef = useRef('');
  const lastErrorRef = useRef<string | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechSupported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  function clearTimer(ref: typeof silenceTimerRef) {
    if (ref.current) clearTimeout(ref.current);
    ref.current = null;
  }

  function clearVoiceTimers() {
    clearTimer(silenceTimerRef);
    clearTimer(maxTimerRef);
    clearTimer(restartTimerRef);
  }

  function interpretText(rawText: string) {
    const normalized = rawText.trim();
    if (!normalized) return;
    try {
      setPreview(parseTaskText({ text: normalized, currentUser, nowIso: new Date().toISOString(), timezone: 'America/Bahia' }));
    } catch {
      setPreview({ title: normalized, owner: currentUser, status: 'idea', difficulty: 'medium', sourceText: normalized, confidence: { title: .4, owner: .5, difficulty: 0, estimatedMinutes: 0, date: 0 } });
    }
  }

  function interpret() {
    interpretText(text);
  }

  function finishVoice(interpretAfter = true) {
    keepListeningRef.current = false;
    clearVoiceTimers();
    try { recognitionRef.current?.stop(); } catch { /* sessão já encerrada */ }
    setListening(false);
    const captured = latestTextRef.current.trim();
    if (interpretAfter && captured) setTimeout(() => interpretText(captured), 0);
  }

  function armSilenceTimer() {
    clearTimer(silenceTimerRef);
    silenceTimerRef.current = setTimeout(() => finishVoice(true), VOICE_SILENCE_MS);
  }

  function safeStart(recognition: any) {
    if (!keepListeningRef.current) return;
    try {
      recognition.start();
    } catch {
      clearTimer(restartTimerRef);
      restartTimerRef.current = setTimeout(() => safeStart(recognition), 300);
    }
  }

  function startVoice() {
    if (keepListeningRef.current) {
      finishVoice(true);
      return;
    }

    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) return;

    baseTextRef.current = text.trim();
    committedTextRef.current = '';
    latestTextRef.current = text.trim();
    lastErrorRef.current = null;
    keepListeningRef.current = true;
    setPreview(null);

    const recognition = new Speech();
    recognitionRef.current = recognition;
    configureRecognition(recognition);

    recognition.onstart = () => {
      lastErrorRef.current = null;
      setListening(true);
      armSilenceTimer();
    };

    recognition.onresult = (event: any) => {
      let newFinal = '';
      let interim = '';
      const first = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
      for (let index = first; index < (event.results?.length ?? 0); index += 1) {
        const segment = event.results?.[index]?.[0]?.transcript?.trim();
        if (!segment) continue;
        if (event.results[index].isFinal) newFinal = buildLiveTranscript(newFinal, segment);
        else interim = buildLiveTranscript(interim, segment);
      }
      if (newFinal) committedTextRef.current = buildLiveTranscript(committedTextRef.current, newFinal);
      const liveText = buildLiveTranscript(baseTextRef.current, committedTextRef.current, interim);
      latestTextRef.current = liveText;
      setText(liveText);
      setPreview(null);
      armSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      lastErrorRef.current = event?.error ?? null;
      if (!shouldRestartRecognition(keepListeningRef.current, lastErrorRef.current)) {
        keepListeningRef.current = false;
        clearVoiceTimers();
        setListening(false);
      }
    };

    recognition.onend = () => {
      if (shouldRestartRecognition(keepListeningRef.current, lastErrorRef.current)) {
        lastErrorRef.current = null;
        clearTimer(restartTimerRef);
        restartTimerRef.current = setTimeout(() => safeStart(recognition), 300);
        return;
      }
      setListening(false);
    };

    maxTimerRef.current = setTimeout(() => finishVoice(true), VOICE_MAX_MS);
    safeStart(recognition);
  }

  useEffect(() => () => {
    keepListeningRef.current = false;
    clearVoiceTimers();
    try { recognitionRef.current?.abort(); } catch { /* sem ação */ }
  }, []);

  async function create() {
    if (!preview) return;
    await onCreate(preview);
    setText('');
    setPreview(null);
    baseTextRef.current = '';
    committedTextRef.current = '';
    latestTextRef.current = '';
  }

  return (
    <div className="capture-shell">
      <div className="capture-input-row">
        <span className="capture-spark">✦</span>
        <input ref={inputRef} value={text} onChange={(event) => { setText(event.target.value); latestTextRef.current = event.target.value; setPreview(null); }} onKeyDown={(event) => { if (event.key === 'Enter') interpret(); }} placeholder="O que você quer fazer? Ex.: terminar OLX até quinta, difícil, 4 horas" />
        {speechSupported && <button className={`mic-button ${listening ? 'listening' : ''}`} aria-label={listening ? 'Parar e interpretar fala' : 'Falar tarefa'} title={listening ? 'Parar e interpretar' : 'Falar tarefa'} onClick={startVoice}>{listening ? '■' : '◉'}</button>}
        <button className="interpret-button" onClick={interpret}>Interpretar</button>
      </div>
      {listening && <small className="voice-hint">Ouvindo… fale com calma. Você pode pausar por até 12 segundos; toque no quadrado quando terminar.</small>}
      {preview && (
        <div className="capture-preview">
          <div className="preview-main"><span className="preview-label">Entendi assim</span><strong>{preview.title}</strong></div>
          <label><span>Responsável</span><select value={preview.owner} onChange={(event) => setPreview({ ...preview, owner: event.target.value as TaskOwner })}><option value="robson">Robson</option><option value="gisele">Gisele</option></select></label>
          <label><span>Dificuldade</span><select value={preview.difficulty} onChange={(event) => setPreview({ ...preview, difficulty: event.target.value as TaskDifficulty })}><option value="easy">Fácil</option><option value="medium">Médio</option><option value="hard">Difícil</option></select></label>
          <label><span>Prazo</span><input type="date" value={dateInput(preview.dueAt)} onChange={(event) => { const dueAt = dateFromInput(event.target.value); setPreview({ ...preview, dueAt, status: dueAt ? 'planned' : 'idea' }); }} /></label>
          <label><span>Tempo</span><div className="effort-control"><input type="number" min="0" step="15" value={preview.estimatedMinutes ?? ''} onChange={(event) => setPreview({ ...preview, estimatedMinutes: event.target.value ? Number(event.target.value) : undefined })} /><b>{effortLabel(preview.estimatedMinutes) || '—'}</b></div></label>
          <button className="create-button" onClick={create}>Criar tarefa</button>
        </div>
      )}
    </div>
  );
}
