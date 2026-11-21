import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Terminal } from 'lucide-react';

type Props = { initialCode: string; title?: string };

export function extractPythonCode(markdown: string) {
  const match = markdown.match(/```(?:python|py)\s*\n([\s\S]*?)```/i);
  return match?.[1]?.trim() || '';
}

export default function PythonRunner({ initialCode, title = 'Run this Python code' }: Props) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<number | undefined>();
  const requestRef = useRef(0);

  useEffect(() => setCode(initialCode), [initialCode]);
  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    workerRef.current?.terminate();
  }, []);

  function stopWorker(message: string) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setStatus('');
    setError(message);
  }

  function runCode() {
    if (!code.trim() || busy) return;
    if (code.length > 20_000) { setError('Keep each run under 20,000 characters.'); return; }
    setBusy(true);
    setError('');
    setOutput('');
    setStatus('Loading Python WebAssembly runtime… first run may take a little while.');

    const id = ++requestRef.current;
    try {
      const worker = workerRef.current || new Worker('/python-worker.js', { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ id: number; type: string; output?: string; value?: string; error?: string }>) => {
        const result = event.data;
        if (result.id !== id) return;
        if (result.type === 'running') {
          setStatus('Running in your browser…');
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => stopWorker('Stopped after 8 seconds. Check for an infinite loop or expensive operation, then try again.'), 8_000);
          return;
        }
        if (timerRef.current) window.clearTimeout(timerRef.current);
        setBusy(false);
        setStatus('');
        if (result.type === 'error') setError(result.error || 'Python could not run this code.');
        else {
          const pieces = [result.output?.trim(), result.value ? `Result: ${result.value}` : ''].filter(Boolean);
          setOutput(pieces.join('\n') || 'Finished with no output. Add print(...) to display a value.');
        }
      };
      worker.onerror = event => stopWorker(event.message || 'The Python runtime failed to load. Check your connection and try again.');
      timerRef.current = window.setTimeout(() => stopWorker('Python took too long to load. Check your internet connection and try again.'), 90_000);
      worker.postMessage({ id, code: code.trim() });
    } catch (runError) {
      stopWorker(runError instanceof Error ? runError.message : 'Could not start the Python runner.');
    }
  }

  return <section className="python-runner" aria-label="Python code runner">
    <div className="python-runner-head"><div><span className="runner-title"><Terminal size={14} />{title}</span><small>Runs in a browser worker, not on the Aura server. It is not a hardened sandbox; avoid unknown code.</small></div><button className="runner-reset" onClick={() => { setCode(initialCode); setOutput(''); setError(''); }} disabled={busy}><RotateCcw size={13} /> Reset</button></div>
    <textarea aria-label="Python code editor" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} />
    <div className="runner-actions"><span>Review code before running. First use downloads the Python runtime.</span><button className="lab-run-button" onClick={runCode} disabled={busy || !code.trim()}><Play size={13} />{busy ? 'Running…' : 'Run Python'}</button></div>
    {status && <p className="runner-status" role="status">{status}</p>}
    {error && <pre className="runner-output runner-error" role="alert">{error}</pre>}
    {output && <pre className="runner-output" aria-live="polite">{output}</pre>}
  </section>;
}
