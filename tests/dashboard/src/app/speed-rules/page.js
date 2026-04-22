'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const COLORS = {
  bg: '#0f0f13',
  surface: '#1a1a24',
  surfaceMid: '#22222f',
  border: '#2d2d3d',
  textMuted: '#8888a0',
  textFaint: '#555560',
  primary: '#E8458B',
  good: '#34d399',
  bad: '#f87171',
  warn: '#fbbf24',
};

const SUBTYPE_LABEL = {
  recovery: 'Recovery',
  endurance: 'Endurance',
  tempo: 'Tempo',
  intervals: 'Intervals',
  long_ride: 'Long ride',
};

export default function SpeedRulesPage() {
  const [rules, setRules] = useState(null);
  const [rulesError, setRulesError] = useState(null);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  useEffect(() => {
    fetch('/api/speed-rules')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
        return body;
      })
      .then(setRules)
      .catch((e) => setRulesError(e.message));
  }, []);

  const runTests = useCallback(async () => {
    setRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const r = await fetch('/api/speed-rules/run', { method: 'POST' });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Run failed (${r.status})`);
      setRunResult(body);
    } catch (e) {
      setRunError(e.message);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 100 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          <span style={{ color: COLORS.primary }}>Etapa</span> Speed Rules
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
          <Link href="/" style={{ color: COLORS.textMuted, textDecoration: 'none', padding: '5px 10px' }}>← Scenarios</Link>
          <Link href="/results" style={{ color: COLORS.textMuted, textDecoration: 'none', padding: '5px 10px' }}>Run plans</Link>
          <button
            onClick={runTests}
            disabled={running}
            style={{
              padding: '5px 14px', borderRadius: 6, background: COLORS.primary, color: 'white',
              fontWeight: 500, fontSize: 12, border: 'none', cursor: running ? 'default' : 'pointer',
              opacity: running ? 0.5 : 1,
            }}
          >
            {running ? 'Running...' : 'Run 52 assertions'}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
        <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
          These are the server-side speed rules applied to every generated plan. The normaliser in{' '}
          <code style={{ background: COLORS.surfaceMid, padding: '1px 5px', borderRadius: 3 }}>server/src/lib/rideSpeedRules.js</code>{' '}
          clamps any distance Claude returns that implies an unrealistic average speed for the rider's level + session type.
          Backed by 52 unit assertions — click <strong>Run 52 assertions</strong> above to exercise them.
        </p>

        {/* Run results */}
        {(runResult || runError) && (
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>Test run</span>
              {runResult?.summary && (
                <>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: COLORS.surfaceMid, color: COLORS.good, fontSize: 11 }}>
                    {runResult.summary.passed} passed
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: COLORS.surfaceMid, color: runResult.summary.failed > 0 ? COLORS.bad : COLORS.textFaint, fontSize: 11 }}>
                    {runResult.summary.failed} failed
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: runResult.ok ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.15)', color: runResult.ok ? COLORS.good : COLORS.bad, fontSize: 11 }}>
                    {runResult.ok ? 'PASS' : 'FAIL'}
                  </span>
                </>
              )}
            </div>
            {runError && (
              <div style={{ color: COLORS.bad, fontSize: 12 }}>Error: {runError}</div>
            )}
            {runResult?.sections?.map((section, idx) => (
              <details key={idx} style={{ marginBottom: 4 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: COLORS.textMuted, padding: '4px 0' }}>
                  {section.name}{' '}
                  <span style={{ color: section.assertions.every((a) => a.ok) ? COLORS.good : COLORS.bad }}>
                    ({section.assertions.filter((a) => a.ok).length}/{section.assertions.length})
                  </span>
                </summary>
                <ul style={{ listStyle: 'none', padding: '4px 0 8px 14px', margin: 0, fontSize: 11 }}>
                  {section.assertions.map((a, i) => (
                    <li key={i} style={{ color: a.ok ? COLORS.good : COLORS.bad, padding: '1px 0' }}>
                      {a.ok ? '✅' : '❌'} {a.label}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}

        {/* Rule summary cards */}
        {rulesError && (
          <div style={{ background: 'rgba(248,113,113,.1)', border: `1px solid ${COLORS.bad}`, borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 13, color: COLORS.bad }}>
            Failed to load rules: {rulesError}
          </div>
        )}

        {rules && (
          <>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Base speeds per level (km/h)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 32 }}>
              {rules.levels.map((level) => (
                <div key={level} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{level}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{rules.baseSpeeds[level]}<span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 6 }}>km/h</span></div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                    min {rules.minSpeeds[level]} · max {rules.maxSpeeds[level]}
                  </div>
                </div>
              ))}
            </div>

            {/* Multiplier tables side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
              <MultiplierTable title="Sub-type multiplier" data={rules.subTypeMultipliers} />
              <MultiplierTable title="Effort multiplier" data={rules.effortMultipliers} />
            </div>

            {/* Per-level matrix */}
            <h2 style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Realistic distances (the actual numbers your app will produce)
            </h2>
            {rules.levels.map((level) => (
              <section key={level} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}{' '}
                  <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 400 }}>
                    base {rules.baseSpeeds[level]} km/h · cap {rules.maxSpeeds[level]} km/h
                  </span>
                </div>
                <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: COLORS.surfaceMid, color: COLORS.textMuted }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>Subtype</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>Target speed</th>
                        {rules.durationsByLevel[level].map((d) => (
                          <th key={d} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>{d} min</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rules.subTypes.map((subType) => {
                        const rows = rules.matrix[level][subType] || [];
                        const targetSpeed = rows[0]?.targetSpeedKmh;
                        return (
                          <tr key={subType} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                            <td style={{ padding: '8px 12px', color: COLORS.textMuted }}>{SUBTYPE_LABEL[subType] || subType}</td>
                            <td style={{ padding: '8px 12px', color: COLORS.textMuted }}>
                              {targetSpeed != null ? `${targetSpeed} km/h` : '—'}
                            </td>
                            {rules.durationsByLevel[level].map((d) => {
                              const row = rows.find((r) => r.durationMins === d);
                              return (
                                <td key={d} style={{ padding: '8px 12px' }}>
                                  {row ? (
                                    <span>{row.distanceKm}<span style={{ color: COLORS.textFaint, marginLeft: 3 }}>km</span></span>
                                  ) : (
                                    <span style={{ color: COLORS.textFaint }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function MultiplierTable({ title, data }) {
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</h3>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            {Object.entries(data).map(([k, v]) => (
              <tr key={k} style={{ borderTop: k === Object.keys(data)[0] ? 'none' : `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '6px 12px', color: COLORS.textMuted }}>{k}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>×{Number(v).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
