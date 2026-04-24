/**
 * LLM-based plan generation & editing service.
 * Calls the Etapa server which proxies to Claude API.
 * Falls back to the local planGenerator if the server is unavailable.
 */
import { generatePlan as localGeneratePlan } from './planGenerator';
import { uid } from './storageService';
import { getSession } from './authService';

async function getAuthHeaders() {
  try {
    const session = await getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

const getServerUrl = () => {
  // EXPO_PUBLIC_ env vars are inlined at build time by Expo
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  try {
    const Constants = require('expo-constants').default;
    return Constants.expoConfig?.extra?.serverUrl || null;
  } catch {
    return null;
  }
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Async plan generation (background-safe) ─────────────────────────────────

/**
 * Kick off async plan generation on the server. Returns a jobId immediately.
 */
export async function startAsyncPlanGeneration(goal, config) {
  const serverUrl = getServerUrl();
  if (!serverUrl) throw new Error('Server not configured');

  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${serverUrl}/api/ai/generate-plan-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ goal, config }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Rate-limit: surface the structured payload so callers can show a
    // specific "you've generated N plans today" message rather than a
    // generic "Failed to start" error.
    if (res.status === 429) {
      const e = new Error(err.error || 'Weekly plan limit reached');
      e.status = 429;
      e.code = err.kind || 'rate_limit';
      e.payload = err;
      throw e;
    }
    throw new Error(err.error || 'Failed to start plan generation');
  }

  const { jobId } = await res.json();
  return jobId;
}

/**
 * Poll the status of an async plan generation job.
 */
export async function pollPlanJob(jobId) {
  const serverUrl = getServerUrl();
  if (!serverUrl) throw new Error('Server not configured');

  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${serverUrl}/api/ai/plan-job/${jobId}`, {
    headers: { ...authHeaders },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to check job status');
  }

  return res.json();
}

/**
 * Cancel an async plan generation job.
 */
export async function cancelPlanJob(jobId) {
  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  const authHeaders = await getAuthHeaders();
  await fetch(`${serverUrl}/api/ai/plan-job/${jobId}`, {
    method: 'DELETE',
    headers: { ...authHeaders },
  }).catch(() => {});
}

export async function generatePlanWithLLM(goal, config, onProgress) {
  const serverUrl = getServerUrl();

  // Try server-based LLM generation first
  if (serverUrl) {
    onProgress?.('Building your plan...');
    await delay(800);
    onProgress?.('Consulting your AI coach...');

    try {
      const authHeaders = await getAuthHeaders();

      // Fire off timed progress messages so the bar keeps moving
      // while the AI request is in-flight.
      let cancelled = false;
      const isBeginner = goal?.goalType === 'beginner';
      const progressSteps = isBeginner ? [
        { msg: 'Mapping out your first rides...', delay: 3000 },
        { msg: 'Making it feel achievable...', delay: 5000 },
        { msg: 'Adding encouragement along the way...', delay: 4000 },
        { msg: 'Scheduling your sessions...', delay: 4000 },
      ] : [
        { msg: 'Building your training framework...', delay: 3000 },
        { msg: 'Structuring your weekly load...', delay: 5000 },
        { msg: 'Planning your build and taper...', delay: 4000 },
        { msg: 'Scheduling your sessions...', delay: 4000 },
      ];
      const progressTimers = [];
      let elapsed = 0;
      for (const step of progressSteps) {
        elapsed += step.delay;
        progressTimers.push(setTimeout(() => {
          if (!cancelled) onProgress?.(step.msg);
        }, elapsed));
      }

      const response = await fetch(`${serverUrl}/api/ai/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ goal, config }),
        keepalive: true,
      });

      // Cancel any pending timed messages
      cancelled = true;
      progressTimers.forEach(t => clearTimeout(t));

      if (response.ok) {
        onProgress?.('Building your personalised plan...');
        await delay(400);

        const data = await response.json();

        if (data.activities && data.activities.length > 0) {
          onProgress?.('Finalising your plan...');
          await delay(400);

          const plan = buildPlanFromActivities(data.activities, goal, config);
          onProgress?.('Plan ready!');
          await delay(300);
          return plan;
        }
      }

      // If server returned an error, fall through to local
      console.warn('Server LLM generation returned non-OK, falling back to local');
    } catch (err) {
      console.warn('Server LLM generation failed, falling back to local:', err);
    }
  }

  // Local generation with progress messages
  const isBeginnerFallback = goal?.goalType === 'beginner';
  onProgress?.(isBeginnerFallback ? 'Mapping out your first rides...' : 'Building your training framework...');
  await delay(800);
  onProgress?.(isBeginnerFallback ? 'Making it feel achievable...' : 'Structuring your weekly load...');
  await delay(600);
  onProgress?.(isBeginnerFallback ? 'Adding encouragement along the way...' : 'Planning your build and taper...');
  await delay(500);
  onProgress?.('Scheduling your sessions...');
  await delay(400);
  onProgress?.('Finalising your plan...');
  await delay(300);

  const plan = localGeneratePlan(goal, config);
  plan.activities = plan.activities.map(a => ({ ...a, planId: plan.id }));

  onProgress?.('Plan ready!');
  await delay(300);
  return plan;
}

/**
 * Build a full plan object from LLM-generated activities array.
 */
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function buildPlanFromActivities(activities, goal, config) {
  let startDateStr;
  if (config.startDate) {
    // config.startDate may be YYYY-MM-DD or full ISO — extract date part
    startDateStr = config.startDate.split('T')[0];
  } else {
    const now = new Date();
    const dow = now.getDay();
    const daysUntilMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + daysUntilMon);
    const y = startDate.getFullYear();
    const m = String(startDate.getMonth() + 1).padStart(2, '0');
    const d = String(startDate.getDate()).padStart(2, '0');
    startDateStr = `${y}-${m}-${d}`;
  }

  const planId = uid();
  const maxWeeks = config.weeks || 8;

  // Filter out activities that exceed the configured week count
  const validActivities = activities.filter(a => a.week >= 1 && a.week <= maxWeeks);

  const planActivities = validActivities.map(a => ({
    id: uid(),
    planId,
    week: a.week,
    dayOfWeek: a.dayOfWeek,
    type: a.type || 'ride',
    subType: a.subType || (a.type === 'strength' ? null : 'endurance'),
    title: a.title || 'Session',
    description: a.description || '',
    notes: a.notes || null,
    durationMins: a.durationMins || 45,
    distanceKm: a.type === 'strength' ? null : (a.distanceKm || null),
    effort: a.effort || 'moderate',
    completed: false,
    completedAt: null,
    stravaActivityId: null,
    stravaData: null,
  }));

  // ── Helper: parse startDateStr and snap to Monday ──
  const sdParts = startDateStr.split('-').map(Number);
  const planStart = new Date(sdParts[0], sdParts[1] - 1, sdParts[2], 12, 0, 0);
  const jsDay = planStart.getDay();
  const mondayOffset = jsDay === 0 ? -6 : -(jsDay - 1);
  const planMonday = new Date(planStart);
  planMonday.setDate(planMonday.getDate() + mondayOffset);

  // ── Inject recurring/organised rides deterministically ──
  // The LLM is instructed to include them but may place them on wrong days.
  // Remove any LLM-generated recurring rides and re-inject at exact dayOfWeek.
  const recurringRides = config.recurringRides || [];
  if (recurringRides.length > 0) {
    for (const rr of recurringRides) {
      const rrDayIdx = DAY_NAMES.indexOf(rr.day);
      if (rrDayIdx < 0) continue;

      // For each week, ensure there's a recurring ride on the correct day
      for (let week = 1; week <= maxWeeks; week++) {
        // Check if LLM already placed something marked as recurring on this day
        const existingIdx = planActivities.findIndex(
          a => a.week === week && a.dayOfWeek === rrDayIdx && a.subType === 'recurring'
        );
        if (existingIdx >= 0) continue;

        planActivities.push({
          id: uid(),
          planId,
          week,
          dayOfWeek: rrDayIdx,
          type: 'ride',
          subType: 'recurring',
          title: rr.notes ? `Recurring: ${rr.notes}` : 'Recurring Ride',
          description: rr.notes || 'Your regular weekly ride. The plan is built around this.',
          notes: rr.elevationM ? `${rr.elevationM}m elevation` : null,
          durationMins: rr.durationMins || 60,
          distanceKm: rr.distanceKm || null,
          elevationM: rr.elevationM || null,
          effort: 'moderate',
          completed: false,
          completedAt: null,
          isRecurring: true,
          recurringRideId: rr.id,
          stravaActivityId: null,
          stravaData: null,
        });
      }
    }
  }

  // ── Inject one-off planned rides deterministically ──
  // These have a specific date — we calculate the exact week/dayOfWeek from the plan start.
  // Remove any LLM-generated version first, then inject at the exact position.
  const oneOffRides = config.oneOffRides || [];
  if (oneOffRides.length > 0) {
    for (const oo of oneOffRides) {
      if (!oo.date) continue;
      const ooParts = oo.date.split('T')[0].split('-').map(Number);
      const ooDate = new Date(ooParts[0], ooParts[1] - 1, ooParts[2], 12, 0, 0);

      // Calculate exact week and dayOfWeek from plan Monday
      const diffDays = Math.round((ooDate - planMonday) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) continue; // ride is before plan start — skip
      const week = Math.floor(diffDays / 7) + 1;
      const dayOfWeek = diffDays % 7; // 0=Mon, 1=Tue, ..., 6=Sun
      if (week > maxWeeks) continue; // ride is after plan ends — skip

      // Remove any LLM-generated activity on the same week+day that looks like a planned ride
      for (let i = planActivities.length - 1; i >= 0; i--) {
        const a = planActivities[i];
        if (a.week === week && a.dayOfWeek === dayOfWeek && a.subType === 'oneoff') {
          planActivities.splice(i, 1);
        }
      }

      planActivities.push({
        id: uid(),
        planId,
        week,
        dayOfWeek,
        type: 'ride',
        subType: 'oneoff',
        title: oo.notes ? `Planned: ${oo.notes}` : 'Planned Ride',
        description: oo.notes || 'A specific ride you have planned for this date.',
        notes: oo.elevationM ? `${oo.elevationM}m elevation` : null,
        durationMins: oo.durationMins || 60,
        distanceKm: oo.distanceKm || null,
        elevationM: oo.elevationM || null,
        effort: 'moderate',
        completed: false,
        completedAt: null,
        isOneOff: true,
        oneOffDate: oo.date,
        stravaActivityId: null,
        stravaData: null,
      });
    }
  }

  // ── Hard filter: remove any activity whose actual date falls on or after the event date ──
  if (goal.targetDate) {
    const tp = goal.targetDate.split('T')[0].split('-').map(Number);
    const eventDate = new Date(tp[0], tp[1] - 1, tp[2], 12, 0, 0);
    const eventMs = eventDate.getTime();

    for (let i = planActivities.length - 1; i >= 0; i--) {
      const a = planActivities[i];
      const actOffset = (a.week - 1) * 7 + (a.dayOfWeek ?? 0);
      const actDate = new Date(planMonday);
      actDate.setDate(actDate.getDate() + actOffset);
      if (actDate.getTime() >= eventMs) {
        planActivities.splice(i, 1);
      }
    }
  }

  // ── Stamp each activity with its actual calendar date ──
  planActivities.forEach(a => {
    const offset = (a.week - 1) * 7 + (a.dayOfWeek ?? 0);
    const d = new Date(planMonday);
    d.setDate(d.getDate() + offset);
    a.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    a.dayName = DAY_NAMES[a.dayOfWeek] ? DAY_NAMES[a.dayOfWeek].charAt(0).toUpperCase() + DAY_NAMES[a.dayOfWeek].slice(1) : null;
    if (!a.scheduleType) {
      if (a.isOneOff) a.scheduleType = 'organised';
      else if (a.isRecurring) a.scheduleType = 'recurring';
      else a.scheduleType = 'planned';
    }
  });

  // ── Enforce longRideDay: move the Long Ride to the correct day regardless of
  //    what the LLM decided. The AI prompt asks for this but it's unreliable,
  //    so we post-process exactly the same way the local generator does. ───────
  const longRideDay = config.longRideDay;
  const longRideDayIdx = longRideDay
    ? DAY_NAMES.indexOf(longRideDay.toLowerCase())
    : -1;

  if (longRideDayIdx >= 0) {
    for (let week = 1; week <= maxWeeks; week++) {
      // Only look at regular planned rides — leave recurring/one-off alone
      const weekRides = planActivities.filter(
        a => a.week === week && a.type === 'ride' && !a.isRecurring && !a.isOneOff
      );
      if (weekRides.length === 0) continue;

      // Identify the Long Ride: explicit title first, then longest by duration
      let longRideAct = weekRides.find(a =>
        a.title?.toLowerCase().includes('long ride') || a.subType === 'long'
      );
      if (!longRideAct) {
        longRideAct = weekRides.reduce(
          (best, a) => ((a.durationMins || 0) > (best?.durationMins || 0) ? a : best),
          null
        );
      }
      if (!longRideAct) continue;

      // Already on the correct day — nothing to do
      if (longRideAct.dayOfWeek === longRideDayIdx) continue;

      // Move it to the chosen long ride day
      const idx = planActivities.findIndex(a => a.id === longRideAct.id);
      if (idx >= 0) {
        planActivities[idx] = { ...planActivities[idx], dayOfWeek: longRideDayIdx };
      }
    }
  }

  // ── Resolve conflicts: organised > recurring > planned ──
  const priorityOrder = { organised: 0, recurring: 1, planned: 2 };
  const dayMap = {};
  planActivities.forEach(a => {
    const key = `${a.week}-${a.dayOfWeek}`;
    if (!dayMap[key]) dayMap[key] = [];
    dayMap[key].push(a);
  });
  const toRemove = new Set();
  Object.values(dayMap).forEach(dayActs => {
    if (dayActs.length <= 1) return;
    dayActs.sort((a, b) => (priorityOrder[a.scheduleType] ?? 2) - (priorityOrder[b.scheduleType] ?? 2));
    const topPriority = dayActs[0];
    for (let i = 1; i < dayActs.length; i++) {
      if (dayActs[i].type === topPriority.type) {
        toRemove.add(dayActs[i].id);
      }
    }
  });
  const finalActivities = planActivities.filter(a => !toRemove.has(a.id));

  // Sort activities by week then day
  finalActivities.sort((a, b) => a.week !== b.week ? a.week - b.week : a.dayOfWeek - b.dayOfWeek);

  return {
    id: planId,
    goalId: goal.id,
    configId: config.id,
    name: goal.planName || null,
    status: 'active',
    startDate: `${planMonday.getFullYear()}-${String(planMonday.getMonth() + 1).padStart(2, '0')}-${String(planMonday.getDate()).padStart(2, '0')}`,
    weeks: maxWeeks,
    currentWeek: 1,
    activities: finalActivities,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Edit an existing plan with LLM.
 * scope: 'plan' (all future weeks), 'week' (single week)
 */
export async function editPlanWithLLM(plan, goal, instruction, scope, onProgress, coachId) {
  const serverUrl = getServerUrl();

  // Calculate current week (parse date as local to avoid timezone shifts)
  const now = new Date();
  const sp = plan.startDate.split('T')[0].split('-');
  const start = new Date(Number(sp[0]), Number(sp[1]) - 1, Number(sp[2]), 12, 0, 0);
  const daysSince = Math.round((now - start) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, plan.weeks));

  // Try server LLM edit first
  if (serverUrl) {
    onProgress?.('Consulting your AI coach...');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/api/ai/edit-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ plan, goal, instruction, scope, currentWeek, coachId }),
      });

      if (response.ok) {
        onProgress?.('Applying changes...');
        await delay(400);

        const data = await response.json();

        if (data.activities && data.activities.length > 0) {
          // Merge AI-edited activities back into the plan
          const updated = { ...plan };
          const editedIds = new Set(data.activities.map(a => a.id));

          // Replace activities that were edited, keep the rest
          updated.activities = plan.activities.map(a => {
            if (editedIds.has(a.id)) {
              const edited = data.activities.find(e => e.id === a.id);
              return { ...a, ...edited };
            }
            return a;
          });

          // Handle newly added activities (ones without matching IDs)
          const existingIds = new Set(plan.activities.map(a => a.id));
          const newActivities = data.activities
            .filter(a => !existingIds.has(a.id))
            .map(a => ({ ...a, id: a.id || uid(), planId: plan.id, completed: false, completedAt: null }));

          if (newActivities.length > 0) {
            updated.activities = [...updated.activities, ...newActivities];
          }

          onProgress?.('Plan updated!');
          await delay(300);
          return updated;
        }
      }

      console.warn('Server edit returned non-OK, falling back to local');
    } catch (err) {
      console.warn('Server edit failed, falling back to local:', err);
    }
  }

  // Local fallback: simple adjustments
  onProgress?.('Building your plan...');
  await delay(800);
  onProgress?.('Adjusting plan...');
  await delay(600);

  const updated = { ...plan, activities: [...plan.activities] };
  const lowerInst = instruction.toLowerCase();

  if (lowerInst.includes('easier') || lowerInst.includes('less') || lowerInst.includes('reduce')) {
    const weekMatch = lowerInst.match(/week\s*(\d+)/);
    const targetWeek = weekMatch ? parseInt(weekMatch[1]) : null;
    updated.activities = updated.activities.map(a => {
      const inScope = targetWeek ? a.week === targetWeek : a.week >= currentWeek;
      if (!inScope || a.completed) return a;
      return {
        ...a,
        distanceKm: a.distanceKm ? Math.round(a.distanceKm * 0.8) : a.distanceKm,
        durationMins: a.durationMins ? Math.round(a.durationMins * 0.85) : a.durationMins,
      };
    });
  } else if (lowerInst.includes('harder') || lowerInst.includes('more') || lowerInst.includes('increase')) {
    const weekMatch = lowerInst.match(/week\s*(\d+)/);
    const targetWeek = weekMatch ? parseInt(weekMatch[1]) : null;
    updated.activities = updated.activities.map(a => {
      const inScope = targetWeek ? a.week === targetWeek : a.week >= currentWeek;
      if (!inScope || a.completed) return a;
      return {
        ...a,
        distanceKm: a.distanceKm ? Math.round(a.distanceKm * 1.15) : a.distanceKm,
        durationMins: a.durationMins ? Math.round(a.durationMins * 1.1) : a.durationMins,
      };
    });
  }

  onProgress?.('Plan updated!');
  await delay(400);
  return updated;
}

/**
 * Edit a single activity with AI — ask questions or request changes.
 */
export async function editActivityWithAI(activity, goal, instruction, onProgress, coachId) {
  const serverUrl = getServerUrl();

  if (serverUrl) {
    onProgress?.('Asking your coach...');
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${serverUrl}/api/ai/edit-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ activity, goal, instruction, coachId }),
      });

      if (response.ok) {
        const data = await response.json();
        onProgress?.('');
        return data; // { answer: string, updatedActivity: object|null }
      }
    } catch (err) {
      console.warn('Server activity edit failed:', err);
    }
  }

  // Local fallback: just return a generic answer
  onProgress?.('');
  return {
    answer: 'AI editing requires a server connection. Try again when connected.',
    updatedActivity: null,
  };
}

/**
 * Ask the server for a structured breakdown of a single session.
 * Used by ActivityDetailScreen's "Explain this session" button when the
 * activity doesn't already have a `structure` field (i.e. it was generated
 * before the structure schema shipped, or the user has an old cached
 * version of a plan).
 *
 * Returns:
 *   { structure: {...} } on success — caller should cache this back onto
 *   the activity via updateActivity(). The server also returns `fallback`
 *   or `cached` booleans for telemetry / analytics but those aren't
 *   needed at the UI layer.
 *
 * On network / server failure, returns null — the UI can fall back to
 * showing just the existing title/description/notes.
 */
export async function explainActivity(activity, goal) {
  const serverUrl = getServerUrl();
  if (!serverUrl) return null;

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${serverUrl}/api/ai/explain-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ activity, goal }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.structure || null;
  } catch (err) {
    console.warn('explainActivity failed:', err);
    return null;
  }
}

/**
 * Adjust a week's existing activities when an organised ride is added.
 * Calls the server AI to decide what to reduce/shift; falls back to
 * a simple local heuristic (reduce the easiest ride's volume by ~20%).
 */
export async function adjustWeekForOrganisedRide(plan, weekNum, organisedRide, goal) {
  const serverUrl = getServerUrl();

  if (serverUrl) {
    try {
      const authHeaders = await getAuthHeaders();
      const weekActivities = (plan.activities || []).filter(a => a.week === weekNum);
      const response = await fetch(`${serverUrl}/api/ai/adjust-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ weekActivities, organisedRide, goal, weekNum }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.adjustedActivities) {
          // Merge the adjusted week activities back into the full plan
          const otherActivities = plan.activities.filter(a => a.week !== weekNum);
          return { activities: [...otherActivities, ...data.adjustedActivities] };
        }
      }
    } catch (err) {
      console.warn('Server week adjust failed, using local fallback:', err);
    }
  }

  // Local fallback: reduce the easiest non-organised ride in the week by ~20%
  const weekActivities = (plan.activities || []).filter(a => a.week === weekNum && a.type === 'ride' && !a.isOrganised && !a.isRecurring);
  const effortOrder = ['recovery', 'easy', 'moderate', 'hard', 'max'];
  const sorted = [...weekActivities].sort((a, b) => effortOrder.indexOf(a.effort || 'moderate') - effortOrder.indexOf(b.effort || 'moderate'));

  if (sorted.length > 0) {
    const target = sorted[0];
    const updated = plan.activities.map(a => {
      if (a.id === target.id) {
        return {
          ...a,
          durationMins: a.durationMins ? Math.round(a.durationMins * 0.8) : a.durationMins,
          distanceKm: a.distanceKm ? Math.round(a.distanceKm * 0.8 * 10) / 10 : a.distanceKm,
          notes: (a.notes || '') + '\nReduced to accommodate your organised ride this week.',
        };
      }
      return a;
    });
    return { activities: updated };
  }

  return null; // No adjustment needed
}

/**
 * Coach chat — multi-turn conversation with the AI coach.
 * Returns the coach's reply string.
 */
export async function coachChat(messages, context) {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    return { reply: 'Coach chat requires a server connection. Make sure your local server is running.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${serverUrl}/api/ai/coach-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ messages, context }),
      keepalive: true,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return await response.json();
    }

    // Try to extract a useful error message from the server
    let errMsg = 'Could not reach your AI coach right now. Please try again.';
    let rateLimited = false;
    let rateLimitKind = null; // 'coach_msgs_per_week' | 'cost_cap' | null
    let rateLimitUsed = null, rateLimitMax = null;
    let capUsd = null, spentUsd = null;
    try {
      const errData = await response.json();
      // Don't surface raw auth/server errors to the user
      if (response.status === 401 || response.status === 403) {
        errMsg = 'Your session has expired. Please sign in again to chat with your coach.';
      } else if (response.status === 429) {
        // Two possible 429 causes:
        //   1. Weekly coach-message limit (kind='coach_msgs_per_week')
        //   2. Daily Claude cost cap (no kind field, has cap_usd/spent_usd)
        rateLimited = true;
        if (errData?.kind === 'coach_msgs_per_week') {
          rateLimitKind = 'coach_msgs_per_week';
          rateLimitUsed = errData?.used ?? null;
          rateLimitMax = errData?.limit ?? null;
          errMsg = errData?.detail
            || `You've sent ${rateLimitUsed} of ${rateLimitMax} coach messages this week. The count resets as individual messages age out.`;
        } else {
          rateLimitKind = 'cost_cap';
          errMsg = errData?.detail || "You've reached today's AI limit. It resets in 24 hours.";
          capUsd = errData?.cap_usd ?? null;
          spentUsd = errData?.spent_usd ?? null;
        }
      } else if (errData?.error) {
        errMsg = errData.error;
      }
    } catch {}
    console.warn('Coach chat server error:', response.status, errMsg);
    return { reply: errMsg, rateLimited, rateLimitKind, rateLimitUsed, rateLimitMax, capUsd, spentUsd };
  } catch (err) {
    console.warn('Coach chat failed:', err);
    return { reply: 'Could not connect to the server. Check your internet connection and try again.' };
  }
}

/**
 * ── Async coach chat (Phase 1/2/3) ──────────────────────────────────────────
 *
 * Replaces the blocking `coachChat` above for screens that can tolerate a
 * pending state. Flow:
 *
 *   1. startCoachChatJob(msgs, ctx)          → { jobId }          (202)
 *   2. openCoachChatStream(jobId, handlers)  → live token deltas  (SSE)
 *   3. pollCoachChatJob(jobId) as a fallback loop every 2s if SSE dies.
 *   4. Terminal state produces a push notification server-side, so even if
 *      the user leaves the chat mid-request the reply still lands on their
 *      device.
 *
 * The server still enforces rate limits, cost caps, and the topic guard at
 * the moment the job starts — those come back in the response to step 1
 * (blocked/rateLimited/...). Once a jobId exists, the Claude call is
 * committed and the client just has to wait for the result.
 */

/**
 * Kick off an async coach chat job. Returns immediately with either:
 *   - { jobId }                                       — job accepted, poll/stream it
 *   - { blocked: true, reply, blockedMessage }         — topic guard fired (synchronous)
 *   - { rateLimited, rateLimitKind, reply, ... }       — quota / cost cap hit (synchronous)
 *   - { error }                                        — network / auth / server error
 *
 * Callers should check for `jobId` first; the other shapes are terminal.
 */
export async function startCoachChatJob(messages, context) {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    return { error: 'Coach chat requires a server connection.' };
  }
  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${serverUrl}/api/ai/coach-chat-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ messages, context }),
    });

    // 202 = job accepted. 200 = synchronous terminal (blocked by topic guard).
    if (response.status === 202 || response.ok) {
      const data = await response.json();
      return data;
    }

    // Same 429 parsing as the sync path so the UI can render the exact
    // "N of M messages this week" / "daily limit" copy.
    if (response.status === 429) {
      try {
        const errData = await response.json();
        if (errData?.kind === 'coach_msgs_per_week') {
          return {
            rateLimited: true,
            rateLimitKind: 'coach_msgs_per_week',
            rateLimitUsed: errData?.used ?? null,
            rateLimitMax: errData?.limit ?? null,
            reply: errData?.detail
              || `You've sent ${errData?.used} of ${errData?.limit} coach messages this week.`,
          };
        }
        return {
          rateLimited: true,
          rateLimitKind: 'cost_cap',
          capUsd: errData?.cap_usd ?? null,
          spentUsd: errData?.spent_usd ?? null,
          reply: errData?.detail || "You've reached today's AI limit. It resets in 24 hours.",
        };
      } catch { /* fall through */ }
    }
    if (response.status === 401 || response.status === 403) {
      return { error: 'Your session has expired. Please sign in again to chat with your coach.' };
    }
    let errMsg = 'Could not reach your AI coach right now.';
    try { const body = await response.json(); if (body?.error) errMsg = body.error; } catch {}
    return { error: errMsg };
  } catch (err) {
    console.warn('startCoachChatJob failed:', err);
    return { error: 'Could not connect to the server.' };
  }
}

/**
 * Poll a coach chat job for its current status. Safe to call repeatedly.
 * Returns { status, reply, updatedActivities, blocked, error }.
 */
export async function pollCoachChatJob(jobId) {
  const serverUrl = getServerUrl();
  if (!serverUrl || !jobId) return { status: 'failed', error: 'No server or jobId' };
  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${serverUrl}/api/ai/coach-chat-job/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { ...authHeaders },
    });
    if (response.status === 404) return { status: 'failed', error: 'Job not found' };
    if (!response.ok) return { status: 'failed', error: `HTTP ${response.status}` };
    return await response.json();
  } catch (err) {
    return { status: 'failed', error: err?.message || 'Network error' };
  }
}

/**
 * Cancel an in-flight coach chat job. Best-effort — if the job already
 * finished this is a no-op server-side.
 */
export async function cancelCoachChatJob(jobId) {
  const serverUrl = getServerUrl();
  if (!serverUrl || !jobId) return;
  try {
    const authHeaders = await getAuthHeaders();
    await fetch(`${serverUrl}/api/ai/coach-chat-job/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      headers: { ...authHeaders },
    });
  } catch { /* best effort */ }
}

/**
 * Open an SSE stream for a coach chat job. Calls handlers as events arrive:
 *   onDelta({ text })     — full visible reply so far (cumulative)
 *   onDone({ reply, updatedActivities })
 *   onError({ error, timeout? })
 *
 * Returns a cleanup function. Caller MUST invoke it to close the connection
 * (e.g. on unmount or when a terminal event has fired).
 *
 * If react-native-sse isn't installed or construction throws for any
 * reason (e.g. older RN runtime), returns a no-op cleanup and the caller
 * should fall back to polling. The polling path is always set up in
 * parallel so a failed SSE subscription doesn't strand the message.
 */
export async function openCoachChatStream(jobId, { onDelta, onDone, onError, onPlanUpdateStart } = {}) {
  const serverUrl = getServerUrl();
  if (!serverUrl || !jobId) return () => {};
  let RNEventSource;
  try {
    // Dynamic import — the package is optional. If Metro can't find it, we
    // silently skip streaming and the caller's poll loop takes over.
    // eslint-disable-next-line
    RNEventSource = require('react-native-sse').default || require('react-native-sse');
  } catch {
    return () => {};
  }
  try {
    const authHeaders = await getAuthHeaders();
    const url = `${serverUrl}/api/ai/coach-chat-stream/${encodeURIComponent(jobId)}`;
    const es = new RNEventSource(url, { headers: authHeaders });

    es.addEventListener('delta', (ev) => {
      try { onDelta?.(JSON.parse(ev.data)); } catch {}
    });
    // Fires once as soon as the server detects the opening plan_update
    // fence mid-stream. Lets the UI show a "Preparing changes…" placeholder
    // the moment the coach starts generating the JSON block, rather than
    // waiting for the whole stream to finish and then rendering the
    // Apply/Dismiss panel.
    es.addEventListener('plan_update_started', (ev) => {
      try { onPlanUpdateStart?.(ev?.data ? JSON.parse(ev.data) : {}); } catch { onPlanUpdateStart?.({}); }
    });
    es.addEventListener('done', (ev) => {
      try { onDone?.(JSON.parse(ev.data)); } catch { onDone?.({ reply: '' }); }
      try { es.close(); } catch {}
    });
    es.addEventListener('error', (ev) => {
      // react-native-sse fires `error` both for transport failures AND our
      // server-side "event: error" frames. We hand both up to the caller —
      // it already has a polling fallback in either case.
      try { onError?.(ev?.data ? JSON.parse(ev.data) : { error: 'stream error' }); }
      catch { onError?.({ error: 'stream error' }); }
      try { es.close(); } catch {}
    });

    return () => { try { es.close(); } catch {} };
  } catch (e) {
    console.warn('openCoachChatStream failed:', e?.message);
    return () => {};
  }
}

/**
 * Fetch a coach's success assessment of a plan.
 */
export async function assessPlan(plan, goal, config) {
  const serverUrl = getServerUrl();
  if (!serverUrl) return null;

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${serverUrl}/api/ai/assess-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ plan, goal, config }),
      keepalive: true,
    });

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Look up a race/event by name to get distance and elevation.
 */
export async function lookupRace(raceName) {
  const serverUrl = getServerUrl();
  if (!serverUrl) return null;

  try {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${serverUrl}/api/ai/race-lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ raceName }),
    });

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}
