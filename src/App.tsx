import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PythonRunner, { extractPythonCode } from './PythonRunner';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, CircleHelp, Code2, Compass, FileText, FlaskConical, GraduationCap, Lightbulb, LoaderCircle, Menu, MessageSquarePlus, MoreHorizontal, Paperclip, PanelLeftClose, Plus, Search, Settings2, Sparkles, SquarePen, Sun, Trash2, X } from 'lucide-react';

type Message = { id: string; role: 'user' | 'assistant'; content: string; responseMs?: number; finishReason?: string };
type Conversation = { id: string; title: string; updatedAt: number; messages: Message[] };
type FileContext = { name: string; kind: 'document' | 'image'; text: string; characters: number; dataUrl?: string };
type PromptStyle = 'Tutor' | 'Zero-shot' | 'Few-shot' | 'Step-by-step';
type CodeTask = 'Generate code' | 'Explain code' | 'Debug & fix' | 'Security review';
type BenchmarkStatus = 'passed' | 'needs-review' | 'failed';
type BenchmarkResult = { status: BenchmarkStatus; responseMs: number; updatedAt: number; output?: string; finishReason?: string };
type PromptResult = { text: string; responseMs: number; finishReason?: string };
const STORAGE_KEY = 'aura-conversations-v1';
const BENCHMARK_KEY = 'aura-code-benchmark-v1';
const newConversation = (): Conversation => ({ id: crypto.randomUUID(), title: 'New conversation', updatedAt: Date.now(), messages: [] });
const benchmarkCases = [
  { id: 'sum', title: 'Sum two numbers', prompt: 'Write a Python function add(a, b) that returns the sum. Include a few tests.', checks: 'Positive, negative, and zero inputs' },
  { id: 'even-odd', title: 'Even or odd', prompt: 'Write a Python function that classifies an integer as even or odd. Include tests.', checks: 'Even, odd, zero, and negative integers' },
  { id: 'factorial', title: 'Factorial', prompt: 'Write an iterative Python factorial function with clear behavior for zero and invalid negative input.', checks: '0!, 1!, a larger value, and negative input' },
  { id: 'prime', title: 'Prime check', prompt: 'Write an efficient beginner-friendly Python function that checks whether an integer is prime.', checks: '2, 1, a composite, a larger prime, and negative input' },
  { id: 'fibonacci', title: 'Fibonacci sequence', prompt: 'Write a Python function that returns the first n Fibonacci numbers and handles n = 0.', checks: 'n = 0, 1, 2, and a larger n' },
  { id: 'palindrome', title: 'Palindrome', prompt: 'Write a Python function to check whether a phrase is a palindrome, ignoring spaces, punctuation, and letter case.', checks: 'A phrase palindrome, ordinary word, and empty input' },
  { id: 'vowels', title: 'Count vowels', prompt: 'Write a Python function that counts vowels in a string, case-insensitively.', checks: 'Mixed case, no vowels, repeated vowels, and empty text' },
  { id: 'max-list', title: 'Largest list value', prompt: 'Write a Python function that returns the largest number in a list and handles an empty list explicitly.', checks: 'Mixed positive/negative, one item, ties, and empty list' },
  { id: 'fizzbuzz', title: 'FizzBuzz', prompt: 'Write a Python function for FizzBuzz from 1 through n, using Fizz for multiples of 3, Buzz for 5, and FizzBuzz for both.', checks: 'n below 1, and values covering 3, 5, and 15' },
  { id: 'word-count', title: 'Word frequency', prompt: 'Write a Python function that returns case-insensitive word counts for a sentence, ignoring basic punctuation.', checks: 'Repeated words with different case and punctuation' }
];
const starterPrompts = [
  { icon: <BookOpen size={17} />, label: 'Explain a concept', mode: 'Learn', question: 'What concept would you like to understand? Name any topic, and I’ll meet you at your level.', instruction: 'Teach the learner the topic they name from first principles, with a clear example and a check for understanding.' },
  { icon: <Lightbulb size={17} />, label: 'Help me study', mode: 'Study', question: 'What subject, topic, or study goal are you working on? You can add a deadline or time limit too.', instruction: 'Help the learner make a focused, practical study plan for the topic or goal they name, using any constraints they provide.' },
  { icon: <CircleHelp size={17} />, label: 'Quiz me', mode: 'Quiz', question: 'What topic should I quiz you on? Name any subject or concept, and I’ll ask one question at a time.', instruction: 'Run an interactive quiz on the topic the learner names. Ask one question at a time, wait for their answer, then give supportive feedback and a hint if needed.' },
  { icon: <Compass size={17} />, label: 'Explore a subject', mode: 'Explore', question: 'What subject, academic question, or learning idea would you like to explore?', instruction: 'Explore the education-related subject or question the learner names, explain useful connections and context, and keep the discussion focused on learning.' },
  { icon: <Code2 size={17} />, label: 'Write or debug code', mode: 'Code', question: 'What programming concept, course project, or code problem are you learning about? You can paste code or attach a source file.', instruction: 'Help with programming education, coursework, or the learning task the learner provides. Generate clear Python by default, explain code, find bugs, and point out security risks. Ask a clarifying question if the task is ambiguous.' },
  { icon: <FlaskConical size={17} />, label: 'Test 10 Python problems', mode: 'Lab', question: 'Open the Code Evaluation Lab to run the ten guided Python benchmark prompts, record response times, and review each result.', instruction: '' },
];

type CodeEvaluationLabProps = {
  benchmarkResults: Record<string, BenchmarkResult>;
  selectedBenchmarkId: string;
  selectBenchmark: (id: string) => void;
  benchmarkOutput: string;
  benchmarkBusy: boolean;
  benchmarkError: string;
  runBenchmark: (id?: string) => void;
  markBenchmark: (status: BenchmarkStatus) => void;
  labTab: 'benchmark' | 'compare';
  setLabTab: (tab: 'benchmark' | 'compare') => void;
  comparisonPrompt: string;
  setComparisonPrompt: (prompt: string) => void;
  comparisonResults: Partial<Record<PromptStyle, PromptResult>>;
  comparisonBusy: boolean;
  comparePromptStyles: () => void;
};

function CodeEvaluationLab(props: CodeEvaluationLabProps) {
  const selected = benchmarkCases.find(item => item.id === props.selectedBenchmarkId) || benchmarkCases[0];
  const reviewed = Object.values(props.benchmarkResults).filter(result => result.status === 'passed' || result.status === 'failed').length;
  const passed = Object.values(props.benchmarkResults).filter(result => result.status === 'passed').length;
  const times = Object.values(props.benchmarkResults).map(result => result.responseMs).filter(time => time > 0);
  const averageMs = times.length ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length) : 0;
  const selectedResult = props.benchmarkResults[selected.id];
  const statusLabel = (status?: BenchmarkStatus) => status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : status === 'needs-review' ? 'Needs review' : 'Not run';

  return <div className="lab-view">
    <div className="lab-heading"><div><div className="welcome-eyebrow"><FlaskConical size={14} /> CODE EVALUATION</div><h1>Prompt &amp; reliability lab</h1><p>Run ten standard Python tasks, review the generated solution, then record your result.</p></div><div className="lab-stats"><div><strong>{reviewed}<small>/10</small></strong><span>reviewed</span></div><div><strong>{passed}</strong><span>passed</span></div><div><strong>{averageMs ? `${(averageMs / 1000).toFixed(1)}s` : '—'}</strong><span>avg response</span></div></div></div>
    <div className="lab-tabs"><button className={props.labTab === 'benchmark' ? 'active' : ''} onClick={() => props.setLabTab('benchmark')}>10-problem benchmark</button><button className={props.labTab === 'compare' ? 'active' : ''} onClick={() => props.setLabTab('compare')}>Prompt comparison</button></div>
    {props.labTab === 'benchmark' ? <div className="benchmark-layout">
      <nav className="benchmark-list" aria-label="Ten Python benchmark problems">{benchmarkCases.map((item, index) => { const result = props.benchmarkResults[item.id]; return <button key={item.id} disabled={props.benchmarkBusy} className={selected.id === item.id ? 'selected' : ''} onClick={() => props.selectBenchmark(item.id)}><span className="benchmark-index">{String(index + 1).padStart(2, '0')}</span><span className="benchmark-copy"><strong>{item.title}</strong><small>{statusLabel(result?.status)}{result?.responseMs ? ` · ${(result.responseMs / 1000).toFixed(1)}s` : ''}</small></span>{result?.status === 'passed' && <Check size={14} className="benchmark-pass" />}</button>; })}</nav>
      <article className="benchmark-detail"><div className="benchmark-detail-head"><div><span className="lab-eyebrow">PROBLEM {String(benchmarkCases.findIndex(item => item.id === selected.id) + 1).padStart(2, '0')} / 10</span><h2>{selected.title}</h2></div><button className="lab-run-button" onClick={() => props.runBenchmark(selected.id)} disabled={props.benchmarkBusy}><Sparkles size={14} />{props.benchmarkBusy ? 'Generating…' : 'Generate solution'}</button></div>
        <div className="benchmark-brief"><strong>Prompt</strong><p>{selected.prompt}</p><strong>Check these cases</strong><p>{selected.checks}</p></div>
        {props.benchmarkError && <div className="lab-error">{props.benchmarkError}</div>}
        {props.benchmarkBusy && <div className="lab-loading"><LoaderCircle size={15} /> Gemini is generating and streaming a solution…</div>}
        {props.benchmarkOutput ? <><div className="benchmark-output"><div className="output-label">GENERATED RESPONSE{selectedResult?.responseMs ? ` · ${(selectedResult.responseMs / 1000).toFixed(1)}s` : ''}</div>{['length', 'incomplete'].includes(selectedResult?.finishReason || '') && <div className="lab-error">{selectedResult?.finishReason === 'length' ? 'The model reached its output limit.' : 'The provider stream ended without a completion signal.'} Ask for a continuation before reviewing this answer.</div>}<div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{props.benchmarkOutput}</ReactMarkdown></div></div>{extractPythonCode(props.benchmarkOutput) && <PythonRunner initialCode={extractPythonCode(props.benchmarkOutput)} title="Run benchmark solution" />}<div className="benchmark-review"><strong>Run against the listed cases, then record your review</strong><div><button className={selectedResult?.status === 'passed' ? 'marked pass' : 'mark-button'} onClick={() => props.markBenchmark('passed')}>Pass</button><button className={selectedResult?.status === 'needs-review' ? 'marked review' : 'mark-button'} onClick={() => props.markBenchmark('needs-review')}>Needs review</button><button className={selectedResult?.status === 'failed' ? 'marked fail' : 'mark-button'} onClick={() => props.markBenchmark('failed')}>Fail</button></div></div></> : !props.benchmarkBusy && <div className="benchmark-empty"><Code2 size={21} /><p>Generate a solution, run its Python code against the listed checks, then record your result.</p></div>}
        <p className="lab-safety-note">Python runs in your browser worker. Review code first; this learning runner is not a hardened security sandbox.</p>
      </article>
    </div> : <div className="compare-view"><div className="compare-input"><label htmlFor="compare-prompt">One programming task, three prompt strategies</label><textarea id="compare-prompt" value={props.comparisonPrompt} onChange={event => props.setComparisonPrompt(event.target.value)} /><button className="lab-run-button" disabled={props.comparisonBusy || !props.comparisonPrompt.trim()} onClick={props.comparePromptStyles}><Sparkles size={14} />{props.comparisonBusy ? 'Comparing…' : 'Compare zero-shot, few-shot & step-by-step'}</button><small>Same task and model; compare how each instruction changes the answer.</small></div><div className="compare-results">{(['Zero-shot', 'Few-shot', 'Step-by-step'] as PromptStyle[]).map(style => <article key={style} className="compare-result"><div className="compare-result-head"><strong>{style}</strong><span>{props.comparisonResults[style]?.responseMs ? `${(props.comparisonResults[style]!.responseMs / 1000).toFixed(1)}s` : props.comparisonBusy ? 'Generating…' : '—'}</span></div>{['length', 'incomplete'].includes(props.comparisonResults[style]?.finishReason || '') && <div className="lab-error">The model response may be incomplete.</div>}{props.comparisonResults[style] ? <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{props.comparisonResults[style]!.text}</ReactMarkdown></div> : <p className="compare-placeholder">Run the experiment to see the model response.</p>}</article>)}</div></div>}
  </div>;
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => { try { const data = localStorage.getItem(STORAGE_KEY); return data ? JSON.parse(data) : [newConversation()]; } catch { return [newConversation()]; } });
  const [activeId, setActiveId] = useState(() => conversations[0]?.id);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('Learn');
  const [pendingStarter, setPendingStarter] = useState<string | null>(null);
  const [codeTask, setCodeTask] = useState<CodeTask>('Generate code');
  const [promptStyle, setPromptStyle] = useState<PromptStyle>('Tutor');
  const [labOpen, setLabOpen] = useState(false);
  const [labTab, setLabTab] = useState<'benchmark' | 'compare'>('benchmark');
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(benchmarkCases[0].id);
  const [benchmarkOutput, setBenchmarkOutput] = useState('');
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState('');
  const [benchmarkResults, setBenchmarkResults] = useState<Record<string, BenchmarkResult>>(() => { try { return JSON.parse(localStorage.getItem(BENCHMARK_KEY) || '{}'); } catch { return {}; } });
  const [comparisonPrompt, setComparisonPrompt] = useState('Write a Python function that returns the second-largest distinct number in a list.');
  const [comparisonResults, setComparisonResults] = useState<Partial<Record<PromptStyle, PromptResult>>>({});
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [modeMenu, setModeMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [fileContext, setFileContext] = useState<FileContext[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelInfo, setModelInfo] = useState({ model: 'gemini-3.5-flash-lite', provider: 'Gemini' });
  const [showSettings, setShowSettings] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = conversations.find(c => c.id === activeId) || conversations[0];
  const messages = active?.messages || [];

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { localStorage.setItem(BENCHMARK_KEY, JSON.stringify(benchmarkResults)); }, [benchmarkResults]);
  useEffect(() => { fetch('/api/health').then(r => r.json()).then(d => { setConfigured(d.configured); setModelInfo({ model: d.model || 'gemini-3.5-flash-lite', provider: d.provider || 'Gemini' }); }).catch(() => setConfigured(false)); }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => { if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`; } }, [input]);

  function updateMessages(id: string, transform: (current: Message[]) => Message[]) { setConversations(previous => previous.map(c => c.id === id ? { ...c, updatedAt: Date.now(), messages: transform(c.messages) } : c)); }
  function startNew() { const item = newConversation(); setConversations(old => [item, ...old]); setActiveId(item.id); setFileContext([]); setPendingStarter(null); setInput(''); setMobileSidebar(false); setLabOpen(false); setMode('Learn'); }
  function startStarter(item: typeof starterPrompts[number]) {
    if (!active || busy) return;
    if (item.mode === 'Lab') { setMode('Lab'); setLabOpen(true); setLabTab('benchmark'); setMobileSidebar(false); setBenchmarkError(''); setBenchmarkOutput(''); return; }
    setLabOpen(false); setMode(item.mode); setPendingStarter(item.instruction); setInput(''); setFileContext([]); setMobileSidebar(false); setCodeTask('Generate code');
    updateMessages(active.id, current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: item.question }]);
    setConversations(old => old.map(conversation => conversation.id === active.id ? { ...conversation, title: item.label, updatedAt: Date.now() } : conversation));
    setTimeout(() => textareaRef.current?.focus(), 0);
  }
  async function send(text = input) {
    const content = text.trim(); if (!content || busy || !active) return;
    const conversationId = active.id;
    const starterInstruction = pendingStarter;
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content };
    const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: '' };
    const prior = [...messages, userMessage];
    updateMessages(conversationId, current => [...current, userMessage, assistantMessage]);
    if (!messages.some(message => message.role === 'user')) setConversations(old => old.map(c => c.id === conversationId ? { ...c, title: content.length > 36 ? `${content.slice(0, 36).trim()}…` : content } : c));
    setInput(''); setBusy(true); const startedAt = performance.now();
    try {
      const context = fileContext.filter(file => file.kind === 'document').map(file => `[Source: ${file.name}]\n${file.text}`).join('\n\n');
      const images = fileContext.filter(file => file.kind === 'image' && file.dataUrl).map(file => ({ name: file.name, dataUrl: file.dataUrl }));
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: prior.map(({ role, content }) => ({ role, content })), context, images, mode, task: starterInstruction, codeTask, promptStyle }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Something went wrong.'); }
      const reader = response.body?.getReader(); if (!reader) throw new Error('Streaming is not supported by this browser.');
      const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop() || '';
        for (const event of events) { const line = event.split('\n').find(row => row.startsWith('data: ')); if (!line) continue; const data = line.slice(6); if (data === '[DONE]') continue; try { const frame = JSON.parse(data); if (frame.token) updateMessages(conversationId, current => current.map(m => m.id === assistantMessage.id ? { ...m, content: m.content + frame.token } : m)); if (frame.finishReason) updateMessages(conversationId, current => current.map(m => m.id === assistantMessage.id ? { ...m, finishReason: frame.finishReason } : m)); } catch { /* malformed frame */ } }
      }
      const responseMs = Math.round(performance.now() - startedAt);
      updateMessages(conversationId, current => current.map(m => m.id === assistantMessage.id ? { ...m, responseMs } : m));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reach Aura.';
      updateMessages(conversationId, current => current.map(m => m.id === assistantMessage.id ? { ...m, content: `**Connection issue**\n\n${message}` } : m));
    } finally { setBusy(false); setPendingStarter(null); textareaRef.current?.focus(); }
  }
  async function requestCodeAnswer(content: string, style: PromptStyle, task = 'Generate code'): Promise<PromptResult> {
    const startedAt = performance.now();
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }], mode: 'Code', codeTask: task, promptStyle: style }) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'The model request failed.'); }
    const reader = response.body?.getReader(); if (!reader) throw new Error('Streaming is not supported by this browser.');
    const decoder = new TextDecoder(); let buffer = ''; let text = ''; let finishReason: string | undefined;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop() || '';
      for (const event of events) { const line = event.split('\n').find(row => row.startsWith('data: ')); if (!line || line.includes('[DONE]')) continue; try { const frame = JSON.parse(line.slice(6)); if (typeof frame.token === 'string') text += frame.token; if (typeof frame.finishReason === 'string') finishReason = frame.finishReason; } catch { /* ignore malformed provider frames */ } }
    }
    return { text, responseMs: Math.round(performance.now() - startedAt), finishReason };
  }
  async function runBenchmark(caseId = selectedBenchmarkId) {
    const item = benchmarkCases.find(test => test.id === caseId); if (!item || benchmarkBusy) return;
    setSelectedBenchmarkId(caseId); setBenchmarkBusy(true); setBenchmarkError(''); setBenchmarkOutput('');
    try {
      const result = await requestCodeAnswer(`${item.prompt}\n\nThis is benchmark problem ${benchmarkCases.findIndex(test => test.id === item.id) + 1} of 10. Return a complete learner-friendly solution with code, assumptions, and example cases.`, 'Zero-shot', 'Generate code');
      setBenchmarkOutput(result.text);
      setBenchmarkResults(previous => ({ ...previous, [item.id]: { status: 'needs-review', responseMs: result.responseMs, updatedAt: Date.now(), output: result.text, finishReason: result.finishReason } }));
    } catch (error) { setBenchmarkError(error instanceof Error ? error.message : 'Could not generate this benchmark response.'); }
    finally { setBenchmarkBusy(false); }
  }
  function markBenchmark(status: BenchmarkStatus) {
    const item = benchmarkCases.find(test => test.id === selectedBenchmarkId); if (!item) return;
    setBenchmarkResults(previous => ({ ...previous, [item.id]: { status, responseMs: previous[item.id]?.responseMs || 0, updatedAt: Date.now(), output: previous[item.id]?.output, finishReason: previous[item.id]?.finishReason } }));
  }
  function selectBenchmark(id: string) {
    setSelectedBenchmarkId(id); setBenchmarkOutput(benchmarkResults[id]?.output || ''); setBenchmarkError('');
  }
  async function comparePromptStyles() {
    if (!comparisonPrompt.trim() || comparisonBusy) return;
    setComparisonBusy(true); setComparisonResults({});
    const styles: PromptStyle[] = ['Zero-shot', 'Few-shot', 'Step-by-step'];
    await Promise.all(styles.map(async style => {
      try { const result = await requestCodeAnswer(comparisonPrompt.trim(), style, 'Generate code'); setComparisonResults(previous => ({ ...previous, [style]: result })); }
      catch (error) { setComparisonResults(previous => ({ ...previous, [style]: { text: error instanceof Error ? error.message : 'Request failed.', responseMs: 0 } })); }
    }));
    setComparisonBusy(false);
  }
  const labProps: CodeEvaluationLabProps = { benchmarkResults, selectedBenchmarkId, selectBenchmark, benchmarkOutput, benchmarkBusy, benchmarkError, runBenchmark, markBenchmark, labTab, setLabTab, comparisonPrompt, setComparisonPrompt, comparisonResults, comparisonBusy, comparePromptStyles };
  async function uploadFiles(fileList?: FileList | null) {
    const selected = Array.from(fileList || []); if (!selected.length) return;
    if (selected.length + fileContext.length > 6) { setToast('Add up to 6 files per conversation.'); setTimeout(() => setToast(''), 3500); return; }
    setFileBusy(true); setToast('');
    const form = new FormData(); selected.forEach(file => form.append('files', file));
    try { const r = await fetch('/api/upload', { method: 'POST', body: form }); const data = await r.json(); if (!r.ok) throw new Error(data.error); setFileContext(previous => [...previous, ...data.files]); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Could not read that file.'); setTimeout(() => setToast(''), 4500); }
    finally { setFileBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  function deleteConversation(id: string) { const remaining = conversations.filter(c => c.id !== id); const next = remaining.length ? remaining : [newConversation()]; setConversations(next); if (activeId === id) setActiveId(next[0].id); }
  function copyMessage(content: string) { navigator.clipboard?.writeText(content); setToast('Copied to clipboard'); setTimeout(() => setToast(''), 1800); }

  return <div className={`app-shell ${dark ? 'dark' : 'light'}`}>
    {mobileSidebar && <button className="mobile-scrim" onClick={() => setMobileSidebar(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${!sidebarOpen ? 'collapsed' : ''} ${mobileSidebar ? 'mobile-open' : ''}`}>
      <div className="brand-row"><a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Aura study companion"><span className="brand-mark"><Sparkles size={15} strokeWidth={1.9} /></span><span className="brand-name">Aura<span>.</span></span></a><button className="icon-button collapse-button" aria-label="Collapse sidebar" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={17} /></button></div>
      <button className="new-chat" onClick={startNew}><SquarePen size={16} /><span>New conversation</span><span className="shortcut">⌘ K</span></button>
      <button className="nav-link" onClick={() => { setSearchOpen(v => !v); setSearch(''); }}><Search size={16} /><span>Search chats</span><span className="shortcut">⌘ /</span></button>
      <button className={`nav-link ${labOpen ? 'active' : ''}`} onClick={() => { setLabOpen(true); setMode('Lab'); setLabTab('benchmark'); setMobileSidebar(false); }}><FlaskConical size={16} /><span>Code evaluation lab</span></button>
      {searchOpen && <input className="search-input" autoFocus placeholder="Find a conversation…" value={search} onChange={e => setSearch(e.target.value)} />}
      <div className="history"><div className="section-title">YOUR LEARNING SPACE</div>{conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt).map(c => <div className={`history-row ${c.id === activeId ? 'selected' : ''}`} key={c.id}><button className="history-item" onClick={() => { setActiveId(c.id); setFileContext([]); setPendingStarter(null); setLabOpen(false); if (mode === 'Lab') setMode('Learn'); setMobileSidebar(false); }}><MessageSquarePlus size={15} /><span>{c.title}</span></button><button className="delete-chat" title="Delete conversation" onClick={() => deleteConversation(c.id)}><Trash2 size={14} /></button></div>)}</div>
      <div className="sidebar-bottom"><div className="plan-card"><div className="plan-icon"><GraduationCap size={18} /></div><div><strong>Learn at your pace</strong><span>Your personal AI study partner</span></div><ChevronDown size={14} className="plan-chevron" /></div><button className="profile" onClick={() => setShowSettings(true)}><div className="avatar">S</div><span className="profile-copy"><strong>Study space</strong><small>Personal workspace</small></span><MoreHorizontal size={18} className="profile-more" /></button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"> <div className="topbar-left">{!sidebarOpen && <button className="icon-button reveal-sidebar" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><PanelLeftClose size={17} /></button>}<button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileSidebar(true)}><Menu size={19} /></button><div className="mode-wrap"><button className="mode-select" onClick={() => setModeMenu(v => !v)}><span className="mode-dot" />{mode}<ChevronDown size={14} /></button>{modeMenu && <div className="mode-menu">{['Learn', 'Study', 'Quiz', 'Explore', 'Code', 'Lab'].map(m => <button key={m} onClick={() => { setMode(m); setLabOpen(m === 'Lab'); if (m === 'Lab') setLabTab('benchmark'); setModeMenu(false); }}><span>{m === 'Lab' ? 'Evaluation Lab' : m}</span>{mode === m && <Check size={15} />}</button>)}</div>}</div></div><div className="topbar-right"><span className={`model-state ${configured ? 'online' : ''}`}><span className="state-dot" />{configured ? 'Model connected' : 'Model not connected'}</span><button className="icon-button" title="Settings" onClick={() => setShowSettings(true)}><Settings2 size={17} /></button><button className="icon-button" title="Toggle theme" onClick={() => setDark(v => !v)}><Sun size={17} /></button></div></header>
      <section className="conversation" ref={listRef}>
        {labOpen ? <CodeEvaluationLab {...labProps} /> : !messages.length ? <div className="welcome"><div className="welcome-eyebrow"><Sparkles size={13} /> YOUR AI LEARNING COMPANION</div><h1>Make room for<br /><span>the lightbulb moment.</span></h1><p>A study-focused tutor for coursework, concepts, exam prep, and programming. Bring a question or your notes, and we’ll learn it together.</p><div className="prompt-grid">{starterPrompts.map((item, i) => <button className="prompt-card" key={item.label} onClick={() => startStarter(item)}><span className={`prompt-icon icon-${i}`}>{item.icon}</span><span className="prompt-card-copy"><strong>{item.label}</strong><small>{['Break down a subject or academic concept', 'Build a practical study plan', 'Practice a subject with gentle hints', 'Explore an academic topic in depth', 'Learn programming, generate, or debug code', 'Run and review ten benchmark problems'][i]}</small></span><ArrowUp size={15} className="prompt-arrow" /></button>)}</div><div className="welcome-note"><span className="note-star">✳</span> Study questions only · coursework, concepts, exams, and code.</div></div> : <div className="message-list">{messages.map((m, i) => <article className={`message ${m.role}`} key={m.id}><div className={`message-avatar ${m.role}`}>{m.role === 'assistant' ? <Sparkles size={15} /> : 'S'}</div><div className="message-body"><div className="message-label">{m.role === 'assistant' ? 'Aura' : 'You'}{m.responseMs !== undefined && <span className="response-time"> · {(m.responseMs / 1000).toFixed(1)}s response</span>}</div><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || (busy && i === messages.length - 1 ? ' ' : '')}</ReactMarkdown>{busy && i === messages.length - 1 && <span className="typing-caret" />}</div>{m.role === 'assistant' && extractPythonCode(m.content) && <PythonRunner key={m.id} initialCode={extractPythonCode(m.content)} />}{['length', 'incomplete'].includes(m.finishReason || '') && <div className="finish-warning">{m.finishReason === 'length' ? 'The model reached its output limit.' : 'The provider stream ended without a completion signal.'} Ask Aura to continue before relying on this answer.</div>}{m.role === 'assistant' && m.content && <button className="copy-button" onClick={() => copyMessage(m.content)}><FileText size={13} /> Copy response</button>}</div></article>)}{busy && messages.at(-1)?.content === '' && <div className="thinking"><span className="thinking-mark"><Sparkles size={14} /></span><span>Aura is thinking</span><span className="thinking-dots"><i /><i /><i /></span></div>}</div>}
      </section>
      {!labOpen && <div className="composer-area"><div className="composer-shell">{fileContext.length > 0 && <div className="attachment-list">{fileContext.map((file, index) => <div className="attachment-chip" key={`${file.name}-${index}`}>{file.kind === 'image' ? <Sparkles size={14} /> : <FileText size={14} />}<span>{file.name}</span><small>{file.kind === 'image' ? 'image' : `${file.characters.toLocaleString()} chars`}</small><button aria-label={`Remove ${file.name}`} onClick={() => setFileContext(current => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}</div>}<textarea ref={textareaRef} rows={1} placeholder={pendingStarter ? 'Name any topic or concept…' : fileContext.length ? 'Ask anything about your material…' : mode === 'Code' ? 'Describe the Python task or paste code to review…' : 'Ask a study question…'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /><div className="composer-toolbar"><div className="composer-tools"><button className="tool-button attach-button" onClick={() => fileRef.current?.click()} title="Attach study material or image" disabled={fileBusy}><Paperclip size={16} /> <span>{fileBusy ? 'Reading…' : 'Add material'}</span></button><input ref={fileRef} type="file" hidden multiple accept=".pdf,.docx,.txt,.md,.csv,.py,.js,.jsx,.ts,.tsx,.java,.c,.cpp,.h,.cs,.go,.rs,.json,.html,.css,.sql,.png,.jpg,.jpeg,.webp,.gif" onChange={e => uploadFiles(e.target.files)} /><span className="tool-divider" /><span className="mode-caption"><span className="small-mode-dot" />{mode} mode</span>{mode === 'Code' && <><span className="tool-divider" /><label className="prompt-style-label">Task <select className="prompt-style-select" aria-label="Code tutor task" value={codeTask} onChange={e => setCodeTask(e.target.value as CodeTask)}><option>Generate code</option><option>Explain code</option><option>Debug &amp; fix</option><option>Security review</option></select></label><span className="tool-divider" /><label className="prompt-style-label">Prompt <select className="prompt-style-select" aria-label="Code prompt technique" value={promptStyle} onChange={e => setPromptStyle(e.target.value as PromptStyle)}><option>Tutor</option><option>Zero-shot</option><option>Few-shot</option><option>Step-by-step</option></select></label></>}</div><div className="send-area"><span className="enter-hint">↵ to send</span><button className={`send-button ${input.trim() ? 'ready' : ''}`} aria-label="Send message" onClick={() => send()} disabled={!input.trim() || busy}><ArrowUp size={17} /></button></div></div></div><div className="composer-disclaimer">Python code runs in a browser worker. Review generated code before running it.</div><footer className="footer"><span>Designed for curious minds <span className="footer-spark">✳</span></span><span>Powered by {modelInfo.provider} · {modelInfo.model}</span></footer></div>}
    </main>
    {showSettings && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowSettings(false); }}><div className="settings-modal"><div className="modal-head"><div><span className="modal-kicker">YOUR WORKSPACE</span><h2>Aura settings</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={19} /></button></div><div className="settings-status"><span className={`status-orb ${configured ? 'connected' : ''}`}><Sparkles size={16} /></span><div><strong>{configured ? 'Gemini is connected' : 'Connect Gemini'}</strong><p>{configured ? `Aura is using ${modelInfo.model}.` : 'Create a Gemini API key in Google AI Studio, then add GEMINI_API_KEY to your local .env file or hosting environment variables.'}</p></div></div><div className="setup-steps"><div><span>1</span><p>Get a key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.</p></div><div><span>2</span><p>Add <code>GEMINI_API_KEY</code> to <code>.env</code> locally or your host’s environment settings.</p></div><div><span>3</span><p>Restart locally or redeploy. The Gemini key stays on the server and is never sent to the browser.</p></div></div><div className="settings-model"><span>ACTIVE MODEL</span><strong>{modelInfo.model}</strong><small>Change with the GEMINI_MODEL environment variable</small></div><button className="modal-done" onClick={() => setShowSettings(false)}>Got it</button></div></div>}
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
  </div>;
}
