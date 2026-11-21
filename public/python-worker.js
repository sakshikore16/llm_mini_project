import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/pyodide.mjs';

let pyodidePromise;

self.onmessage = async (event) => {
  const { id, code } = event.data || {};
  if (typeof code !== 'string') return;

  try {
    pyodidePromise ||= loadPyodide();
    const pyodide = await pyodidePromise;
    self.postMessage({ id, type: 'running' });

    let output = '';
    const appendOutput = (chunk) => {
      if (output.length < 20_000) output += String(chunk).slice(0, 20_000 - output.length);
    };
    pyodide.setStdout({ batched: appendOutput });
    pyodide.setStderr({ batched: appendOutput });

    const globals = pyodide.toPy({ __name__: '__main__' });
    let value = '';
    try {
      const result = await pyodide.runPythonAsync(code, { globals, locals: globals });
      if (result !== undefined && result !== null) {
        value = String(result);
        if (typeof result.destroy === 'function') result.destroy();
      }
    } finally {
      globals.destroy();
    }
    self.postMessage({ id, type: 'done', output: output.slice(0, 20_000), value: value.slice(0, 4_000) });
  } catch (error) {
    self.postMessage({ id, type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
