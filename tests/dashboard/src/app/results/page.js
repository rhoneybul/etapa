'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { SCENARIOS, EDIT_SCENARIOS } from '@/lib/scenarios';
import { SPEED_SCENARIOS } from '@/lib/speedScenarios';

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
  const logRef = useRef(null);
  // AbortController for cancelling the fetch — stored in a ref so the
  // cancel handler can reach it without re-creating startTests.
  const abortRef = useRef(null);
  const cancelledRef = useRef(false);

  const addLog = useCallback((entry) => {
    setLog(prev => [...prev, entry]);
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  }, []);

  const cancelRun = useCallback(() => {
    if (!running) return;
    cancelledRef.current = true;
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
    }
    addLog({ type: 'warn', text: '⚠ Cancellation requested — the server will complete any scenarios already in flight.' });
  }, [running, addLog]);

  const startTests = useCallback(async () => {
    if (running) return;
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    setRunning(true);
    setLog([]);
    setFinalOutput(null);
    setProgress({
      done: 0, total: SCENARIOS.length,
      editsDone: 0, editsTotal: EDIT_SCENARIOS.length,
      speedDone: 0, speedTotal: SPEED_SCENARIOS.length,
    });
    addLog({ type: 'info', text: `Starting test run against ${serverUrl}...` });

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
        if (cancelledRef.current) {
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            handleEvent(data, addLog, setProgress, setFinalOutput);
          } catch {}
        }
      }

      // Process any remaining buffer
      if (buffer.startsWith('data: ') && !cancelledRef.current) {
        try {
          const data = JSON.parse(buffer.slice(6));
          handleEvent(data, addLog, setProgress, setFinalOutput);
        } catch {}
      }

    } catch (err) {
      if (err?.name === 'AbortError' || cancelledRef.current) {
        addLog({ type: 'warn', text: '✖ Run cancelled.' });
      } else {
        addLog({ type: 'error', text: `Connection error: ${err.message}` });
      }
    }

    setRunning(false);
    abortRef.current = null;
  }, [serverUrl, apiKey, running, addLog]);

  const downloadResults = useCallback(() => {
    if (!finalOutput) return;
    const blob = new Blob([JSON.stringify(finalOutput, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-results-${finalOutput.runAt?.replace(/[:.]/g, '-').slice(0, 19) || 'latest'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [finalOutput]);

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

        {/* Actions after complete */}
        {finalOutput && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button onClick={downloadResults}
              style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #2d2d3d', background: '#22222f', color: '#e4e4ef', fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>
              Download Results JSON
            </button>
            <Link href={{
              pathname: '/',
            }} onClick={() => {
              // Store results in sessionStorage-like approach: we'll use a global
              if (typeof window !== 'undefined') window.__etapaResults = finalOutput;
            }}
              style={{ padding: '8px 20px', borderRadius: 6, background: '#E8458B', color: 'white', fontWeight: 500, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              View in Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function handleEvent(data, addLog, setProgress, setFinalOutput) {
  switch (data.type) {
    case 'start':
      addLog({ type: 'info', text: `Starting ${data.total} generation + ${data.totalEdits} edit + ${data.totalSpeed || 0} speed scenarios...` });
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
