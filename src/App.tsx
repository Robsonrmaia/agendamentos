import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { parseTaskText, type ParsedTaskDraft } from './domain/parser';
import { getPriorityScore } from './domain/priority';
import { statusLabels, taskStatuses, transitionTaskStatus, type Task, type TaskDifficulty, type TaskOwner, type TaskStatus } from './domain/task';
import { createTask, loadLocalTasks, saveLocalTasks } from './data/localTasks';
import { getSignedInProfile, loadSupabaseTasks, saveSupabaseTask, subscribeSupabaseTasks, type WorkspaceProfile } from './data/supabaseTasks';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import QuickCaptureResilient from './components/QuickCapture';

const statusOrder: TaskStatus[] = ['idea', 'planned', 'in_progress', 'waiting', 'done'];
const cardDifficulty: Record<TaskDifficulty, string> = { easy: 'Leve', medium: 'Média', hard: 'Alta' };
const statusIcon: Record<TaskStatus, string> = { idea: '✦', planned: '◷', in_progress: '▶', waiting: '⌛', done: '✓' };
type Scope = 'today' | 'week' | 'all';
type OwnerFilter = 'all' | TaskOwner;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(now: Date) {
  const result = new Date(now);
  const day = result.getDay() || 7;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - day + 1);
  return result;
}

function relevantDate(task: Task) { return task.dueAt ?? task.plannedFor; }
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value)).replace('.', '') : null;
}
function effortLabel(minutes?: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace('.', ',')}h`;
}
function dateInput(value?: string | null) { return value ? value.slice(0, 10) : ''; }
function dateFromInput(value: string) { return value ? `${value}T18:00:00-03:00` : undefined; }
function overdue(task: Task, now = new Date()) {
  return Boolean(task.dueAt && task.status !== 'done' && new Date(task.dueAt) < now && !sameDay(new Date(task.dueAt), now));
}
function scopeMatches(task: Task, scope: Scope, now: Date) {
  if (scope === 'all') return true;
  const value = relevantDate(task);
  if (!value) return false;
  const date = new Date(value);
  if (scope === 'today') return (task.status !== 'done' && date < now) || sameDay(date, now);
  const start = startOfWeek(now);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return (task.status !== 'done' && date < start) || (date >= start && date < end);
}

function TaskCard({ task, onStatus, onOwner, onEdit }: {
  task: Task;
  onStatus: (task: Task, status: TaskStatus) => void;
  onOwner: (task: Task) => void;
  onEdit: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20 } : undefined;
  const due = formatDate(task.dueAt ?? task.plannedFor);
  return (
    <article ref={setNodeRef} style={style} className={`task-card difficulty-${task.difficulty} ${isDragging ? 'dragging' : ''} ${task.status === 'done' ? 'is-done' : ''}`} onClick={() => onEdit(task)}>
      <div className="card-topline">
        <button className={`owner-dot owner-${task.owner}`} aria-label={`Trocar responsável de ${task.title}`} title={`Responsável: ${task.owner === 'robson' ? 'Robson' : 'Gisele'}`} onClick={(event) => { event.stopPropagation(); onOwner(task); }}>{task.owner === 'robson' ? 'R' : 'G'}</button>
        <span className={`difficulty-pill ${task.difficulty}`}>{cardDifficulty[task.difficulty]}</span>
        <button className="drag-handle" aria-label={`Arrastar ${task.title}`} onClick={(event) => event.stopPropagation()} {...listeners} {...attributes}>⠿</button>
      </div>
      <h3>{task.title}</h3>
      <div className="card-meta">
        {due && <span className={overdue(task) ? 'overdue' : ''}>{overdue(task) ? '⚠ ' : '◷ '}{due}</span>}
        {effortLabel(task.estimatedMinutes) && <span>⌁ {effortLabel(task.estimatedMinutes)}</span>}
      </div>
      {task.status === 'waiting' && <div className="dependency-note">↳ {task.dependencyNote || 'Aguardando uma dependência'}</div>}
      <div className="card-actions" onClick={(event) => event.stopPropagation()}>
        {task.status !== 'in_progress' && task.status !== 'done' && <button aria-label="Iniciar agora" title="Iniciar agora" onClick={() => onStatus(task, 'in_progress')}>▶</button>}
        {task.status !== 'waiting' && task.status !== 'done' && <button aria-label="Aguardar" title="Aguardar / Dependência" onClick={() => onStatus(task, 'waiting')}>⌛</button>}
        {task.status !== 'done' && <button aria-label="Finalizar" title="Finalizar" onClick={() => onStatus(task, 'done')}>✓</button>}
        {task.status === 'done' && <button aria-label="Reabrir" title="Reabrir" onClick={() => onStatus(task, 'planned')}>↶</button>}
        <button aria-label="Editar tarefa" title="Editar" onClick={() => onEdit(task)}>✎</button>
      </div>
    </article>
  );
}

function TaskColumn({ status, tasks, onStatus, onOwner, onEdit }: {
  status: TaskStatus;
  tasks: Task[];
  onStatus: (task: Task, status: TaskStatus) => void;
  onOwner: (task: Task) => void;
  onEdit: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`board-column status-${status} ${isOver ? 'column-over' : ''}`}>
      <div className="column-header"><div className="column-title"><span>{statusIcon[status]}</span><h2>{statusLabels[status]}</h2></div><span className="count-badge">{tasks.length}</span></div>
      <div className="column-body">
        {tasks.length === 0 && <div className="empty-column">Arraste uma tarefa pra cá</div>}
        {tasks.map((task) => <TaskCard key={task.id} task={task} onStatus={onStatus} onOwner={onOwner} onEdit={onEdit} />)}
      </div>
    </section>
  );
}

function QuickCapture({ currentUser, onCreate, inputRef }: {
  currentUser: TaskOwner;
  onCreate: (draft: ParsedTaskDraft) => Promise<void> | void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedTaskDraft | null>(null);
  const [listening, setListening] = useState(false);
  const speechSupported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  function interpret() {
    if (!text.trim()) return;
    try {
      setPreview(parseTaskText({ text, currentUser, nowIso: new Date().toISOString(), timezone: 'America/Bahia' }));
    } catch {
      setPreview({ title: text.trim(), owner: currentUser, status: 'idea', difficulty: 'medium', sourceText: text, confidence: { title: .4, owner: .5, difficulty: 0, estimatedMinutes: 0, date: 0 } });
    }
  }

  function startVoice() {
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) return;
    const recognition = new Speech();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setText((current) => current ? `${current} ${transcript}` : transcript);
    };
    recognition.start();
  }

  async function create() {
    if (!preview) return;
    await onCreate(preview);
    setText('');
    setPreview(null);
  }

  return (
    <div className="capture-shell">
      <div className="capture-input-row">
        <span className="capture-spark">✦</span>
        <input ref={inputRef} value={text} onChange={(event) => { setText(event.target.value); setPreview(null); }} onKeyDown={(event) => { if (event.key === 'Enter') interpret(); }} placeholder="O que você quer fazer? Ex.: terminar OLX até quinta, difícil, 4 horas" />
        {speechSupported && <button className={`mic-button ${listening ? 'listening' : ''}`} aria-label="Falar tarefa" onClick={startVoice}>{listening ? '●' : '◉'}</button>}
        <button className="interpret-button" onClick={interpret}>Interpretar</button>
      </div>
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

function TaskDrawer({ task, onClose, onSave }: { task: Task; onClose: () => void; onSave: (task: Task) => void }) {
  const [draft, setDraft] = useState(task);
  useEffect(() => setDraft(task), [task]);
  function save() {
    const transition = transitionTaskStatus(draft, draft.status, new Date().toISOString());
    onSave({ ...draft, ...transition, updatedAt: new Date().toISOString() });
  }
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="task-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Editar tarefa">
        <div className="drawer-header"><div><span>Detalhes da tarefa</span><h2>Editar</h2></div><button aria-label="Fechar" onClick={onClose}>×</button></div>
        <label><span>O que é</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <div className="drawer-grid">
          <label><span>Responsável</span><select value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value as TaskOwner })}><option value="robson">Robson</option><option value="gisele">Gisele</option></select></label>
          <label><span>Dificuldade</span><select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as TaskDifficulty })}><option value="easy">Fácil</option><option value="medium">Médio</option><option value="hard">Difícil</option></select></label>
        </div>
        <label><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{taskStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        <div className="drawer-grid">
          <label><span>Prazo</span><input type="date" value={dateInput(draft.dueAt)} onChange={(event) => setDraft({ ...draft, dueAt: dateFromInput(event.target.value) ?? null })} /></label>
          <label><span>Tempo estimado (min)</span><input type="number" min="0" step="15" value={draft.estimatedMinutes ?? ''} onChange={(event) => setDraft({ ...draft, estimatedMinutes: event.target.value ? Number(event.target.value) : null })} /></label>
        </div>
        <label><span>Dependência / próximo passo</span><textarea rows={3} value={draft.dependencyNote ?? ''} onChange={(event) => setDraft({ ...draft, dependencyNote: event.target.value || null })} placeholder="Ex.: aguardando retorno da OLX" /></label>
        <div className="drawer-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={save}>Salvar alterações</button></div>
      </aside>
    </div>
  );
}

function LoginPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setMessage('Entrando…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? 'Não foi possível entrar. Confira e-mail e senha.' : 'Conectado.');
  }
  return (
    <main className="login-page"><form className="login-card" onSubmit={login}><div className="brand-mark">A</div><span className="eyebrow">PAINEL COMPARTILHADO</span><h1>Agendamentos</h1><p>Entre para acessar o mesmo painel de Robson e Gisele.</p><label><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label><span>Senha</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary" type="submit">Entrar</button>{message && <small>{message}</small>}</form></main>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => loadLocalTasks());
  const [currentUser, setCurrentUser] = useState<TaskOwner>('robson');
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(!hasSupabaseConfig);
  const [syncState, setSyncState] = useState(hasSupabaseConfig ? 'Conectando…' : 'Modo local');
  const [scope, setScope] = useState<Scope>('all');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!hasSupabaseConfig) saveLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let realtime: ReturnType<typeof subscribeSupabaseTasks> = null;
    let mounted = true;
    const refresh = async () => {
      setSyncState('Conectando…');
      const activeProfile = await getSignedInProfile();
      if (!mounted) return;
      setProfile(activeProfile);
      if (!activeProfile) { setAuthChecked(true); setSyncState('Login necessário'); return; }
      setCurrentUser(activeProfile.slug);
      try {
        const remote = await loadSupabaseTasks();
        if (mounted) setTasks(remote);
        setSyncState('Sincronizado');
        if (!realtime) realtime = subscribeSupabaseTasks(() => void refresh());
      } catch { setSyncState('Reconectando…'); }
      finally { setAuthChecked(true); }
    };
    void refresh();
    const { data: listener } = client.auth.onAuthStateChange(() => void refresh());
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      if (realtime) void client.removeChannel(realtime);
    };
  }, []);

  const now = new Date();
  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => ownerFilter === 'all' || task.owner === ownerFilter)
      .filter((task) => scopeMatches(task, scope, now))
      .filter((task) => !query || `${task.title} ${task.description ?? ''} ${task.dependencyNote ?? ''}`.toLowerCase().includes(query))
      .sort((a, b) => getPriorityScore(b, now) - getPriorityScore(a, now) || a.sortOrder - b.sortOrder);
  }, [tasks, ownerFilter, scope, search]);

  const summary = useMemo(() => {
    const open = tasks.filter((task) => task.status !== 'done');
    const weekEnd = startOfWeek(now); weekEnd.setDate(weekEnd.getDate() + 7);
    return {
      today: open.filter((task) => relevantDate(task) && (sameDay(new Date(relevantDate(task)!), now) || new Date(relevantDate(task)!) < now)).length,
      week: open.filter((task) => relevantDate(task) && new Date(relevantDate(task)!) < weekEnd).length,
      doing: tasks.filter((task) => task.status === 'in_progress').length,
      waiting: tasks.filter((task) => task.status === 'waiting').length,
      done: tasks.filter((task) => task.status === 'done').length,
    };
  }, [tasks]);

  async function persistOne(nextTask: Task, previous: Task[]) {
    setTasks((current) => current.map((task) => task.id === nextTask.id ? nextTask : task));
    if (!hasSupabaseConfig) return true;
    try { setSyncState('Salvando…'); await saveSupabaseTask(nextTask); setSyncState('Sincronizado'); return true; }
    catch { setTasks(previous); setSyncState('Reconectando…'); setNotice('Não foi possível salvar a alteração. Ela foi desfeita.'); return false; }
  }

  async function createFromPreview(preview: ParsedTaskDraft) {
    const task = createTask({ title: preview.title, description: preview.description ?? null, owner: preview.owner, status: preview.status, difficulty: preview.difficulty, estimatedMinutes: preview.estimatedMinutes ?? null, plannedFor: preview.plannedFor ?? preview.dueAt ?? null, dueAt: preview.dueAt ?? null, dependencyNote: preview.dependencyNote ?? null, sourceText: preview.sourceText, actualMinutes: null, tags: [], createdBy: currentUser });
    const previous = tasks;
    setTasks((current) => [task, ...current]);
    setScope('all');
    if (hasSupabaseConfig) {
      try { setSyncState('Salvando…'); await saveSupabaseTask(task); setSyncState('Sincronizado'); }
      catch { setTasks(previous); setSyncState('Reconectando…'); setNotice('Não foi possível criar a tarefa. Seu texto foi preservado para tentar novamente.'); throw new Error('save failed'); }
    }
    setNotice(hasSupabaseConfig ? 'Tarefa criada e salva.' : 'Tarefa criada.');
  }

  async function moveTask(task: Task, status: TaskStatus) {
    let dependencyNote = task.dependencyNote;
    if (status === 'waiting') dependencyNote = window.prompt('O que ainda está pendente? (opcional)', task.dependencyNote ?? '') || null;
    if (status === 'done') dependencyNote = null;
    const transition = transitionTaskStatus(task, status, new Date().toISOString());
    await persistOne({ ...task, ...transition, dependencyNote, sortOrder: Date.now(), updatedAt: new Date().toISOString() }, tasks);
  }

  async function toggleOwner(task: Task) {
    await persistOne({ ...task, owner: task.owner === 'robson' ? 'gisele' : 'robson', updatedAt: new Date().toISOString() }, tasks);
  }
  async function saveEdited(task: Task) { await persistOne(task, tasks); setEditingId(null); setNotice('Alterações salvas.'); }
  function handleDragEnd(event: DragEndEvent) {
    const status = event.over?.id as TaskStatus | undefined;
    if (!status || !taskStatuses.includes(status)) return;
    const task = tasks.find((item) => item.id === event.active.id);
    if (task && task.status !== status) void moveTask(task, status);
  }

  if (hasSupabaseConfig && authChecked && !profile) return <LoginPanel />;
  const editingTask = tasks.find((task) => task.id === editingId) ?? null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">A</div><div><span className="eyebrow">CONTROLE RÁPIDO</span><h1>Agendamentos</h1></div></div>
        <div className="top-actions">
          <span className={`sync-pill ${syncState === 'Sincronizado' ? 'online' : ''}`}><i />{syncState}</span>
          {!hasSupabaseConfig && <button className="persona-button" onClick={() => setCurrentUser((user) => user === 'robson' ? 'gisele' : 'robson')}>Usando como <b>{currentUser === 'robson' ? 'Robson' : 'Gisele'}</b></button>}
          {supabase && profile && <button className="persona-button" onClick={() => void supabase?.auth.signOut()}>Sair</button>}
          <button className="add-button" onClick={() => quickInputRef.current?.focus()}>＋ Adicionar</button>
        </div>
      </header>

      <main className="workspace">
        <section className="hero-row"><div><span className="eyebrow">VISÃO DO TRABALHO</span><h2>O que precisa andar agora?</h2><p>Fale, digite, arraste. O painel organiza o resto sem virar mais um sistema complicado.</p></div><div className="scope-tabs" aria-label="Período">{([['today', 'Hoje'], ['week', 'Esta semana'], ['all', 'Tudo']] as const).map(([value, label]) => <button key={value} className={scope === value ? 'active' : ''} onClick={() => setScope(value)}>{label}</button>)}</div></section>
        <QuickCaptureResilient currentUser={currentUser} onCreate={createFromPreview} inputRef={quickInputRef} />
        <section className="summary-strip">
          <button onClick={() => setScope('today')}><span className="summary-icon red">!</span><div><strong>{summary.today}</strong><small>pra hoje</small></div></button>
          <button onClick={() => setScope('week')}><span className="summary-icon amber">◷</span><div><strong>{summary.week}</strong><small>esta semana</small></div></button>
          <div><span className="summary-icon blue">▶</span><div><strong>{summary.doing}</strong><small>em andamento</small></div></div>
          <div><span className="summary-icon purple">⌛</span><div><strong>{summary.waiting}</strong><small>aguardando</small></div></div>
          <div><span className="summary-icon green">✓</span><div><strong>{summary.done}</strong><small>finalizadas</small></div></div>
        </section>
        <section className="filters-row">
          <div className="owner-filter" aria-label="Responsável">{([['all', 'Todos'], ['robson', 'Robson'], ['gisele', 'Gisele']] as const).map(([value, label]) => <button key={value} className={ownerFilter === value ? 'active' : ''} onClick={() => setOwnerFilter(value)}>{label}</button>)}</div>
          <div className="search-box"><span>⌕</span><input aria-label="Buscar tarefas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa…" /></div>
        </section>
        {notice && <button className="notice" onClick={() => setNotice('')}>{notice}<span>×</span></button>}
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}><section className="board" aria-label="Pipeline de tarefas">{statusOrder.map((status) => <TaskColumn key={status} status={status} tasks={visibleTasks.filter((task) => task.status === status)} onStatus={(task, next) => void moveTask(task, next)} onOwner={(task) => void toggleOwner(task)} onEdit={(task) => setEditingId(task.id)} />)}</section></DndContext>
      </main>
      {editingTask && <TaskDrawer task={editingTask} onClose={() => setEditingId(null)} onSave={(task) => void saveEdited(task)} />}
    </div>
  );
}
