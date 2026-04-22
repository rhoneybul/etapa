'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { SCENARIOS, EDIT_SCENARIOS } from '@/lib/scenarios';
import { SPEED_SCENARIOS } from '@/lib/speedScenarios';

// localStorage key for mid-run persistence. Each run gets its own accumulator
// here; if the user navigates away + comes back, we rehydrate the partial
// snapshot so the Download button still works.
const LS_KEY = 'etapa:testRun:partial';

/**
 * Rebuild a "currently-known" output object from the streamed state so the
 * user can download partial results mid-run. Mirrors the shape of
 * finalOutput (what the server sends on `type: 'complete'`) but with
 * nulls/zeros filled in for the still-running bits.
 */
function buildPartialOutput({ runId, serverUrl, results, editResults, speedResults, runAt }) {
  const pass = results.filter((r) => r && r.pass).length;
  const fail = results.filter((r) => r && !r.pass).length;
  const editPass = editResults.filter((r) => r && r.pass).length;
  const editFail = editResults.filter((r) => r && !r.pass).length;
  const speedPass = speedResults.filter((r) => r && r.pass).length;
  const speedFail = speedResults.filter((r) => r && !r.pass).length;
  return {
    partial: true,                      // caller can tell this wasn't a clean run
    runId,
    runAt,
    server: serverUrl,
    totalScenarios: SCENARIOS.length,
    passed: pass,
    failed: fail,
    results,
    editResults,
    editPassed: editPass,
    editFailed: editFail,
    speedResults,
    speedPassed: speedPass,
    speedFailed: speedFail,
  };
}

export default function ResultsPage() {
  const [serverUrl, setServerUrl] = useState('https://etapa.up.railway.app');
  const [apiKey, setApiKey] = useState('');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({
    done: 0, total: 0,
    editsDone: 0, editsTotal: 0,
    speedDone: 0, speedTotal: 0,
  });
  const [finalOutput, setFinalOutput] = useState(null);

  // Live accumulators — updated on every scenario-done / edit-done / speed-done
  // event. Used to build a "partial" output the user can download before the
  // run is complete, AND persisted to localStorage so navigating away doesn't
  // lose the in-flight results.
  const [liveResults, setLiveResults] = useState([]);
  const [liveEditResults, setLiveEditResults] = useState([]);
  const [liveSpeedResults, setLiveSpeedResults] = useState([]);
  const [currentRunId, setCurrentRunId] = useState(null);
  const [runAt, setRunAt] = useState(null);

  const logRef = useRef(null);
  const abortRef = useRef(null);

  const addLog = useCallback((entry) => {
    setLog(prev => [...prev, entry]);
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  }, []);

  // ── Rehydrate from localStorage on mount ──────────────────────────────────
  // If a previous run was in progress when the user navigated away, the
  // snapshot is waiting. Show a notice + keep the Download button available.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw);
      if (!snap || !snap.runId) return;
      setCurrentRunId(snap.runId);
      setRunAt(snap.runAt || null);
      setLiveResults(snap.results || []);
      setLiveEditResults(snap.editResults || []);
      setLiveSpeedResults(snap.speedResults || []);
      setProgress(snap.progress || { done: 0, total: SCENARIOS.length, editsDone: 0, editsTotal: EDIT_SCENARIOS.length, speedDone: 0, speedTotal: SPEED_SCENARIOS.length });
      addLog({ type: 'info', text: `Loaded partial results from a previous run (${snap.runId}). Download them before starting a new run if you want to keep them.` });
    } catch { /* ignore corrupt snapshot */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist every meaningful update so a tab crash doesn't lose results.
  useEffect(() => {
    if (!currentRunId) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        runId: currentRunId,
        runAt,
        serverUrl,
        results: liveResults,
        editResults: liveEditResults,
        speedResults: liveSpeedResults,
        progress,
      }));
    } catch { /* quota exceeded — ignore */ }
  }, [currentRunId, runAt, serverUrl, liveResults, liveEditResults, liveSpeedResults, progress]);

  const cancelRun = useCallback(async () => {
    if (!running) {
      addLog({ type: 'warn', text: 'No run in progress.' });
      return;
    }
    // Explicit server-side cancel via the new /cancel endpoint. This is how
    // we stop the work WITHOUT depending on closing the browser tab (which
    // used to cascade via req.signal — intentionally removed so navigating
    // away doesn't kill runs).
    if (currentRunId) {
      try {
        await fetch('/api/run-tests/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: currentRunId }),
        });
        addLog({ type: 'warn', text: `✖ Cancel signal sent to server for run ${currentRunId}.` });
      } catch (err) {
        addLog({ type: 'error', text: `Cancel failed: ${err.message}` });
      }
    }
    // Also abort the client fetch so our UI stops waiting.
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
    }
  }, [running, currentRunId, addLog]);

  const startTests = useCallback(async () => {
    if (running) return;
    abortRef.current = new AbortController();
    setRunning(true);
    setLog([]);
    setFinalOutput(null);
    setCurrentRunId(null);
    setRunAt(new Date().toISOString());
    setLiveResults([]);
    setLiveEditResults([]);
    setLiveSpeedResults([]);
    setProgress({
      done: 0, total: SCENARIOS.length,
      editsDone: 0, editsTotal: EDIT_SCENARIOS.length,
      speedDone: 0, speedTotal: SPEED_SCENARIOS.length,
    });
    addLog({ type: 'info', text: `Starting test run against ${serverUrl}...` });

    const handlers = {
      addLog,
      setProgress,
      setFinalOutput,
      setCurrentRunId,
      setLiveResults,
      setLiveEditResults,
      setLiveSpeedResults,
    };

    try {
      const res = await fetch('/api/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl, apiKey }),
        signal: abortRef.current.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            handleEvent(data, handlers);
          } catch {}
        }
      }

      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          handleEvent(data, handlers);
        } catch {}
      }

    } catch (err) {
      if (err?.name === 'AbortError') {
        addLog({ type: 'warn', text: '✖ Stream closed (server may still be running — hit cancel if you want to stop it too).' });
      } else {
        addLog({ type: 'error', text: `Connection error: ${err.message}` });
      }
    }

    setRunning(false);
    abortRef.current = null;
  }, [serverUrl, apiKey, running, addLog]);

  // Download either the completed finalOutput or — if we're mid-run or the
  // run was cancelled — whatever partial results have come in so far.
  const downloadResults = useCallback(() => {
    const out = finalOutput || buildPartialOutput({
      runId: currentRunId,
      serverUrl,
      results: liveResults,
      editResults: liveEditResults,
      speedResults: liveSpeedResults,
      runAt,
    });
    if (!out) return;
    const isPartial = !finalOutput;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = (out.runAt || new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19);
    a.download = `api-results-${isPartial ? 'partial-' : ''}${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [finalOutput, currentRunId, serverUrl, liveResults, liveEditResults, liveSpeedResults, runAt]);

  // Anything partial available to download?
  const hasAnything = !!(
    finalOutput
    || liveResults.some(Boolean)
    || liveEditResults.some(Boolean)
    || liveSpeedResults.some(Boolean)
  );

  const clearPartial = useCallback(() => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    setCurrentRunId(null);
    setLiveResults([]);
    setLiveEditResults([]);
    setLiveSpeedResults([]);
    setFinalOutput(null);
    setProgress({
      done: 0, total: SCENARIOS.length,
      editsDone: 0, editsTotal: EDIT_SCENARIOS.length,
      speedDone: 0, speedTotal: SPEED_SCENARIOS.length,
    });
    addLog({ type: 'muted', text: 'Partial results cleared.' });
  }, [addLog]);

  const totalScenarios = SCENARIOS.length + EDIT_SCENARIOS.length + SPEED_SCENARIOS.length;
  const totalDone = progress.done + progress.editsDone + progress.speedDone;
  const pct = totalScenarios > 0 ? Math.round((totalDone / totalScenarios) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#1a1a24', borderBottom: '1px solid #2d2d3d', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 100 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', margin: 0 }}>
          <span style={{ color: '#E8458B' }}>Etapa</span> Test Runner
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12 }}>
          <Link href="/speed-rules" style={{ padding: '5px 14px', borderRadius: 6, background: '#22222f', color: '#E8458B', textDecoration: 'none', fontWeight: 500, fontSize: 12, border: '1px solid #2d2d3d' }}>
            Speed rules
          </Link>
          <Link href="/" style={{ padding: '5px 14px', borderRadius: 6, background: '#22222f', color: '#e4e4ef', textDecoration: 'none', fontWeight: 500, fontSize: 12, border: '1px solid #2d2d3d' }}>
            Dashboard
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', width: '100%' }}>
        {/* Config */}
        <div style={{ background: '#1a1a24', border: '1px solid #2d2d3d', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, margin: 0, marginBottom: 16 }}>Test Configuration</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 250 }}>
              <label style={{ fontSize: 11, color: '#8888a0', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Server URL</label>
              <input type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #2d2d3d', background: '#22222f', color: '#e4e4ef', fontSize: 13, outline: 'none' }}
                disabled={running} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: '#8888a0', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>API Key (TEST_API_KEY)</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #2d2d3d', background: '#22222f', color: '#e4e4ef', fontSize: 13, outline: 'none' }}
                disabled={running} />
            </div>
            <button onClick={startTests} disabled={running}
              style={{
                padding: '8px 24px', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: 13, cursor: running ? 'not-allowed' : 'pointer',
                background: running ? '#2d2d3d' : '#E8458B', color: running ? '#8888a0' : 'white', transition: '.15s',
              }}>
              {running ? 'Running...' : 'Run All Tests'}
            </button>
            {running && (
              <button onClick={cancelRun}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid #7f1d1d', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  background: 'rgba(127,29,29,0.2)', color: '#f87171', transition: '.15s',
                }}>
                Cancel
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#8888a0', marginTop: 10 }}>
            {SCENARIOS.length} generation + {EDIT_SCENARIOS.length} edit + {SPEED_SCENARIOS.length} speed scenarios
          </div>
        </div>

        {/* Progress bar */}
        {(running || totalDone > 0) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8888a0', marginBottom: 4 }}>
              <span>{totalDone} / {totalScenarios} scenarios</span>
              <span>{pct}%</span>
            </div>
            <div style={{ height: 6, background: '#22222f', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#E8458B', borderRadius: 3, transition: 'width .3s ease' }} />
            </div>
          </div>
        )}

        {/* Log output */}
        <div ref={logRef} style={{
          background: '#0a0a0f', border: '1px solid #2d2d3d', borderRadius: 10, padding: '12px 16px',
          fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 12, lineHeight: 1.8,
          maxHeight: 500, overflowY: 'auto', minHeight: 200,
        }}>
          {log.length === 0 && (
            <div style={{ color: '#8888a0', textAlign: 'center', paddingTop: 60 }}>
              Configure the server and click "Run All Tests" to start.
            </div>
          )}
          {log.map((entry, i) => (
            <div key={i} style={{ color: logColor(entry.type) }}>{entry.text}</div>
          ))}
        </div>

        {/* Actions — Download is always available once any result is in.
            Partial downloads are marked 'partial-' in the filename so you
            can tell them apart later when auditing. */}
        {hasAnything && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={downloadResults}
              style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #2d2d3d', background: '#22222f', color: '#e4e4ef', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>
              {finalOutput ? 'Download Results JSON' : 'Download Partial Results JSON'}
            </button>
            {finalOutput && (
              <Link href={{ pathname: '/' }}
                onClick={() => { if (typeof window !== 'undefined') window.__etapaResults = finalOutput; }}
                style={{ padding: '8px 20px', borderRadius: 6, background: '#E8458B', color: 'white', fontWeight: 500, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                View in Dashboard
              </Link>
            )}
            {!running && (
              <button onClick={clearPartial}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #2d2d3d', background: 'transparent', color: '#8888a0', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function handleEvent(data, handlers) {
  const {
    addLog, setProgress, setFinalOutput,
    setCurrentRunId, setLiveResults, setLiveEditResults, setLiveSpeedResults,
  } = handlers;

  switch (data.type) {
    case 'start':
      if (data.runId && setCurrentRunId) setCurrentRunId(data.runId);
      addLog({ type: 'info', text: `Starting ${data.total} generation + ${data.totalEdits} edit + ${data.totalSpeed || 0} speed scenarios (runId ${data.runId || 'unknown'})…` });
      break;
    case 'scenario-start':
      addLog({ type: 'muted', text: `▶ [${data.index + 1}/${SCENARIOS.length}] ${data.name}...` });
      break;
    case 'scenario-done': {
      const durStr = data.durationMs ? ` (${(data.durationMs / 1000).toFixed(1)}s)` : '';
      const warnStr = data.warnings?.length ? ` ⚠ ${data.warnings.length} warning${data.warnings.length > 1 ? 's' : ''}` : '';
      const judgeScore = data.judge?.verdict?.score;
      const judgeStr = judgeScore != null ? ` · judge ${judgeScore}/10` : '';
      if (data.pass) {
        addLog({ type: 'pass', text: `  ✅ PASS${durStr} — ${data.stats?.totalActivities || 0} activities${warnStr}${judgeStr}` });
      } else {
        addLog({ type: 'fail', text: `  ❌ FAIL${durStr}${judgeStr}` });
        data.errors?.forEach(e => addLog({ type: 'fail', text: `     ✗ ${e}` }));
      }
      data.warnings?.forEach(w => addLog({ type: 'warn', text: `     ⚠ ${w}` }));
      if (data.judge?.verdict?.summary) {
        addLog({ type: 'muted', text: `     ⚖︎ ${data.judge.verdict.summary}` });
      }
      setProgress(p => ({ ...p, done: data.index + 1 }));
      // Capture into the live accumulator so the partial download has this row.
      if (setLiveResults) {
        setLiveResults(prev => {
          const next = prev.slice();
          next[data.index] = {
            name: data.name,
            pass: data.pass,
            errors: data.errors || [],
            warnings: data.warnings || [],
            stats: data.stats || null,
            durationMs: data.durationMs || null,
            judge: data.judge || null,
          };
          return next;
        });
      }
      break;
    }
    case 'edit-start':
      addLog({ type: 'muted', text: `▶ [EDIT ${data.index + 1}/${EDIT_SCENARIOS.length}] ${data.name}...` });
      break;
    case 'edit-done': {
      const durStr = data.durationMs ? ` (${(data.durationMs / 1000).toFixed(1)}s)` : '';
      if (data.pass) {
        addLog({ type: 'pass', text: `  ✅ PASS${durStr}` });
      } else {
        addLog({ type: 'fail', text: `  ❌ FAIL${durStr}` });
        data.errors?.forEach(e => addLog({ type: 'fail', text: `     ✗ ${e}` }));
      }
      setProgress(p => ({ ...p, editsDone: data.index + 1 }));
      if (setLiveEditResults) {
        setLiveEditResults(prev => {
          const next = prev.slice();
          next[data.index] = { name: data.name, pass: data.pass, errors: data.errors || [], durationMs: data.durationMs || null };
          return next;
        });
      }
      break;
    }
    case 'speed-start':
      addLog({ type: 'muted', text: `▶ [SPEED ${data.index + 1}] ${data.name}...` });
      break;
    case 'speed-done': {
      const durStr = data.durationMs != null ? ` (${data.durationMs}ms)` : '';
      if (data.pass) {
        addLog({ type: 'pass', text: `  ✅ PASS${durStr}` });
      } else {
        addLog({ type: 'fail', text: `  ❌ FAIL${durStr}` });
        data.errors?.forEach(e => addLog({ type: 'fail', text: `     ✗ ${e}` }));
      }
      setProgress(p => ({ ...p, speedDone: data.index + 1 }));
      if (setLiveSpeedResults) {
        setLiveSpeedResults(prev => {
          const next = prev.slice();
          next[data.index] = { name: data.name, pass: data.pass, errors: data.errors || [], durationMs: data.durationMs || null, actual: data.actual || null };
          return next;
        });
      }
      break;
    }
    case 'complete': {
      const o = data.output;
      addLog({ type: 'info', text: '' });
      addLog({ type: 'info', text: `═══ COMPLETE ═══` });
      addLog({ type: 'pass', text: `Generation: ${o.passed}/${o.totalScenarios} passed, ${o.failed} failed` });
      addLog({ type: 'pass', text: `Edits: ${o.editPassed}/${o.editResults?.length || 0} passed, ${o.editFailed} failed` });
      if (o.speedResults) {
        addLog({ type: 'pass', text: `Speed rules: ${o.speedPassed}/${o.speedResults.length} passed, ${o.speedFailed} failed` });
      }
      setFinalOutput(o);
      break;
    }
  }
}

function logColor(type) {
  switch (type) {
    case 'pass': return '#34d399';
    case 'fail': return '#f87171';
    case 'warn': return '#fbbf24';
    case 'info': return '#E8458B';
    case 'muted': return '#8888a0';
    default: return '#e4e4ef';
  }
}
