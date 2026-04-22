'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { SCENARIOS } from '@/lib/scenarios';

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function esc(s) { return s || ''; }

function Badge({ pass, warnings }) {
  if (pass === undefined) return <span style={styles.badge('#22222f', '#8888a0')}>—</span>;
  if (!pass) return <span style={styles.badge('rgba(248,113,113,.15)', '#f87171')}>FAIL</span>;
  if (warnings > 0) return <span style={styles.badge('rgba(251,191,36,.15)', '#fbbf24')}>WARN {warnings}</span>;
  return <span style={styles.badge('rgba(52,211,153,.15)', '#34d399')}>PASS</span>;
}

const styles = {
  badge: (bg, color) => ({
    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
    background: bg, color, display: 'inline-block',
  }),
};

export default function Dashboard() {
  const [apiResults, setApiResults] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [fileName, setFileName] = useState('No results loaded — showing test inputs only');
  const fileRef = useRef(null);

  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setApiResults(JSON.parse(ev.target.result));
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }, []);

  const getResult = (idx) => apiResults?.results?.[idx] || null;
  const scenario = SCENARIOS[selectedIdx];
  const result = getResult(selectedIdx);
  const totalWarnings = apiResults ? (apiResults.results || []).reduce((s, r) => s + (r.warnings?.length || 0), 0) : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#1a1a24', borderBottom: '1px solid #2d2d3d', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 100 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', margin: 0 }}>
          <span style={{ color: '#E8458B' }}>Etapa</span> Test Dashboard
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12, alignItems: 'center' }}>
          {apiResults ? (
            <>
              <span style={{ padding: '3px 10px', borderRadius: 5, background: '#22222f', color: '#34d399' }}>{apiResults.passed || 0} passed</span>
              <span style={{ padding: '3px 10px', borderRadius: 5, background: '#22222f', color: '#f87171' }}>{apiResults.failed || 0} failed</span>
              <span style={{ padding: '3px 10px', borderRadius: 5, background: '#22222f', color: '#fbbf24' }}>{totalWarnings} warnings</span>
              {apiResults.runAt && (
                <span style={{ padding: '3px 10px', borderRadius: 5, background: '#22222f', color: '#8888a0' }}>{new Date(apiResults.runAt).toLocaleString()}</span>
              )}
            </>
          ) : (
            <span style={{ padding: '3px 10px', borderRadius: 5, background: '#22222f', color: '#8888a0' }}>No results loaded</span>
          )}
          <Link href="/speed-rules" style={{ padding: '5px 12px', borderRadius: 6, background: '#22222f', color: '#E8458B', fontWeight: 500, textDecoration: 'none', fontSize: 12, border: '1px solid #2d2d3d' }}>
            Speed rules
          </Link>
          <Link href="/results" style={{ padding: '5px 14px', borderRadius: 6, background: '#E8458B', color: 'white', fontWeight: 500, textDecoration: 'none', fontSize: 12 }}>
            Run Tests
          </Link>
        </div>
      </header>

      {/* File loader */}
      <div style={{ padding: '10px 20px', background: '#22222f', borderBottom: '1px solid #2d2d3d', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
        <label style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 5, background: '#E8458B', color: 'white', fontWeight: 500, fontSize: 12 }}>
          Load API Results
          <input type="file" accept=".json" ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
        </label>
        <span style={{ color: '#8888a0' }}>{fileName}</span>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Sidebar scenarios={SCENARIOS} selectedIdx={selectedIdx} onSelect={setSelectedIdx} getResult={getResult} />

        {/* Detail */}
        <DetailPane scenario={scenario} result={result} index={selectedIdx} />
      </div>
    </div>
  );
}

function Sidebar({ scenarios, selectedIdx, onSelect, getResult }) {
  return (
    <div style={{ width: 320, minWidth: 320, borderRight: '1px solid #2d2d3d', overflowY: 'auto', background: '#0f0f13' }}>
      <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#8888a0', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #2d2d3d', position: 'sticky', top: 0, background: '#0f0f13', zIndex: 10 }}>
        Scenarios ({scenarios.length})
      </div>
      {scenarios.map((s, i) => {
        const r = getResult(i);
        const warnCount = r?.warnings?.length || 0;
        const acts = r?.stats?.totalActivities ? `${r.stats.totalActivities} acts` : '';
        const dur = r?.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '';
        const metaParts = [acts, dur].filter(Boolean).join(' · ');
        return (
          <div key={i} onClick={() => onSelect(i)}
            style={{
              padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #2d2d3d',
              display: 'flex', alignItems: 'flex-start', gap: 10, transition: '.1s',
              background: i === selectedIdx ? '#1a1a24' : 'transparent',
              borderLeft: i === selectedIdx ? '3px solid #E8458B' : '3px solid transparent',
            }}>
            <span style={{ fontSize: 11, color: '#8888a0', minWidth: 22, paddingTop: 2 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
              <div style={{ fontSize: 11, color: '#8888a0', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge pass={r?.pass} warnings={warnCount} />
                {metaParts && <span>{metaParts}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailPane({ scenario, result, index }) {
  const { goal: g, config: c } = scenario;
  const hasPlan = result?.plan?.activities?.length > 0;
  const warnCount = result?.warnings?.length || 0;
  const errCount = result?.errors?.length || 0;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>#{index + 1} {esc(scenario.name)}</h2>
          {result && <Badge pass={result.pass} warnings={warnCount} />}
        </div>

        {/* Input summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          <InputCard title="Goal" rows={[
            ['Type', g.goalType],
            ['Cycling', g.cyclingType],
            g.eventName && ['Event', g.eventName],
            g.targetDistance && ['Distance', `${g.targetDistance} km`],
            g.targetElevation && ['Elevation', `${g.targetElevation} m`],
            g.targetTime && ['Target Time', `${g.targetTime} hrs`],
            g.targetDate && ['Event Date', g.targetDate],
            ['Plan Name', g.planName],
          ].filter(Boolean)} />

          <InputCard title="Config" rows={[
            ['Days/week', c.daysPerWeek],
            ['Weeks', c.weeks],
            ['Fitness', c.fitnessLevel],
            ['Start', c.startDate],
            ['Training', (c.trainingTypes || []).join(', ')],
            ['Available Days', (c.availableDays || []).join(', ')],
            c.longRideDay && ['Long Ride Day', c.longRideDay],
          ].filter(Boolean)} />

          {(c.recurringRides?.length > 0 || c.oneOffRides?.length > 0 || (c.crossTrainingDays && Object.keys(c.crossTrainingDays).length > 0)) && (
            <InputCard title="Extras" rows={[
              c.recurringRides?.length > 0 && ['Recurring', c.recurringRides.map(r => `${r.day}: ${r.notes || r.distanceKm + 'km'}`).join(', ')],
              c.oneOffRides?.length > 0 && ['Organised', c.oneOffRides.map(r => `${r.date}: ${r.notes || r.distanceKm + 'km'}`).join(', ')],
              ...(c.crossTrainingDays ? Object.entries(c.crossTrainingDays).map(([d, a]) => [`XT ${d}`, a]) : []),
            ].filter(Boolean)} />
          )}
        </div>

        {/* Errors & warnings */}
        {errCount > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#f87171' }}>Errors ({errCount})</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, marginBottom: 3, background: 'rgba(248,113,113,.1)', color: '#f87171' }}>✗ {e}</li>
              ))}
            </ul>
          </div>
        )}
        {warnCount > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#fbbf24' }}>Warnings ({warnCount})</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {result.warnings.map((w, i) => (
                <li key={i} style={{ padding: '5px 10px', fontSize: 12, borderRadius: 5, marginBottom: 3, background: 'rgba(251,191,36,.1)', color: '#fbbf24' }}>⚠ {w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats */}
        {result?.stats && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['Activities', result.stats.totalActivities],
              ['Rides', result.stats.rides],
              ['Strength', result.stats.strength],
              ['Organised', result.stats.organised],
              ['Recurring', result.stats.recurring],
              ['Planned', result.stats.planned],
              ['Recovery', result.stats.recovery],
              ['Weeks', result.stats.weeks],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#1a1a24', border: '1px solid #2d2d3d', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#E8458B' }}>{val || 0}</div>
                <div style={{ fontSize: 10, color: '#8888a0', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        {hasPlan && (
          <>
            <Legend />
            <SectionHeader label="Plan Calendar" />
            <PlanCalendar plan={result.plan} />
            <SectionHeader label="Weekly Volume" />
            <VolumeChart plan={result.plan} />
          </>
        )}

        {!hasPlan && !result && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8888a0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <p>Load a results JSON file or run tests to see the plan output here.</p>
          </div>
        )}

        {/* Raw JSON */}
        {result && (
          <>
            <SectionHeader label="Raw JSON" />
            <pre style={{ background: '#22222f', borderRadius: 8, padding: '12px 16px', fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 11, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#8888a0', lineHeight: 1.5 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

function InputCard({ title, rows }) {
  return (
    <div style={{ background: '#1a1a24', border: '1px solid #2d2d3d', borderRadius: 10, padding: '14px 16px' }}>
      <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8888a0', marginBottom: 8, fontWeight: 600 }}>{title}</h4>
      {rows.map(([label, value], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, borderBottom: i < rows.length - 1 ? '1px solid rgba(45,45,61,.4)' : 'none' }}>
          <span style={{ color: '#8888a0' }}>{label}</span>
          <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: '#8888a0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
      {label}
      <span style={{ flex: 1, height: 1, background: '#2d2d3d' }} />
    </div>
  );
}

function Legend() {
  const items = [
    ['Ride', '#3B82F6'], ['Recovery', '#34d399'], ['Strength', '#f87171'],
    ['Organised', '#fbbf24'], ['Recurring', '#a78bfa'], ['Cross-training', '#a78bfa'],
  ];
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8888a0' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: label === 'Cross-training' ? 0.55 : 1 }} />
          {label}
        </div>
      ))}
    </div>
  );
}

function PlanCalendar({ plan }) {
  if (!plan?.activities?.length) return null;
  const acts = plan.activities;
  const weeks = plan.weeks || Math.max(...acts.map(a => a.week));

  const getTypeStyle = (a) => {
    if (a.scheduleType === 'organised') return { borderLeft: '3px solid #fbbf24', background: 'rgba(251,191,36,.05)' };
    if (a.scheduleType === 'recurring') return { borderLeft: '3px solid #a78bfa', background: 'rgba(167,139,250,.05)' };
    if (a.type === 'strength') return { borderLeft: '3px solid #f87171' };
    if (a.effort === 'recovery' || a.subType === 'recovery') return { borderLeft: '3px solid #34d399' };
    if (a.type === 'ride') return { borderLeft: '3px solid #3B82F6' };
    return { borderLeft: '3px solid #a78bfa', opacity: 0.55 };
  };

  const effortColor = (e) => {
    const m = { easy: '#34d399', moderate: '#3B82F6', hard: '#fbbf24', max: '#f87171', recovery: '#34d399' };
    return m[e] || '#8888a0';
  };

  return (
    <div style={{ overflowX: 'auto', marginBottom: 20 }}>
      {/* Header row */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
        <div style={{ width: 44, minWidth: 44 }} />
        {DAY_LABELS.map(d => (
          <div key={d} style={{ flex: 1, minWidth: 110, textAlign: 'center', fontSize: 10, color: '#8888a0', fontWeight: 600, textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Week rows */}
      {Array.from({ length: weeks }, (_, w) => w + 1).map(week => {
        const weekActs = acts.filter(a => a.week === week);
        return (
          <div key={week} style={{ display: 'flex', gap: 3, marginBottom: 3, alignItems: 'stretch', minHeight: 54 }}>
            <div style={{ width: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#8888a0', fontWeight: 600, background: '#1a1a24', borderRadius: 6 }}>W{week}</div>
            {Array.from({ length: 7 }, (_, d) => d).map(dayIdx => {
              const dayActs = weekActs.filter(a => a.dayOfWeek === dayIdx);
              if (dayActs.length === 0) {
                return <div key={dayIdx} style={{ flex: 1, minWidth: 110, background: '#1a1a24', borderRadius: 6, padding: '5px 7px', fontSize: 10, opacity: 0.25 }} />;
              }
              const a = dayActs[0];
              const typeStyle = getTypeStyle(a);
              return (
                <div key={dayIdx} style={{ flex: 1, minWidth: 110, background: '#1a1a24', borderRadius: 6, padding: '5px 7px', fontSize: 10, ...typeStyle }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 1, fontSize: 11 }}>{a.title}</div>
                  <div style={{ color: '#8888a0', fontSize: 10 }}>
                    {[a.durationMins && `${a.durationMins}m`, a.distanceKm && `${a.distanceKm}km`].filter(Boolean).join(' · ')}
                  </div>
                  {a.effort && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                      <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, fontWeight: 600, color: effortColor(a.effort), background: `${effortColor(a.effort)}22` }}>{a.effort}</span>
                      {a.subType && a.subType !== a.effort && (
                        <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, fontWeight: 600, color: '#8888a0', background: 'rgba(136,136,160,.1)' }}>{a.subType}</span>
                      )}
                    </div>
                  )}
                  {dayActs.length > 1 && (
                    <div style={{ fontSize: 9, color: '#8888a0', marginTop: 2 }}>+{dayActs.length - 1} more</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function VolumeChart({ plan }) {
  if (!plan?.activities?.length) return null;
  const acts = plan.activities;
  const weeks = plan.weeks || Math.max(...acts.map(a => a.week));

  const weeklyKm = Array.from({ length: weeks }, (_, w) => {
    const weekRides = acts.filter(a => a.week === w + 1 && a.type === 'ride');
    return Math.round(weekRides.reduce((s, a) => s + (a.distanceKm || 0), 0));
  });

  const maxKm = Math.max(...weeklyKm, 1);

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'end', height: 80, marginBottom: 20 }}>
      {weeklyKm.map((km, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ fontSize: 9, color: '#8888a0' }}>{km > 0 ? km : ''}</div>
          <div style={{ width: '100%', borderRadius: '3px 3px 0 0', minWidth: 8, height: `${(km / maxKm) * 60}px`, background: '#E8458B', transition: '.2s' }} />
          <div style={{ fontSize: 9, color: '#8888a0' }}>W{i + 1}</div>
        </div>
      ))}
    </div>
  );
}
