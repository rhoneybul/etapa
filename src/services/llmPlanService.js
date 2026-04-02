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

export async function generatePlanWithLLM(goal, config, onProgress) {
  const serverUrl = getServerUrl();

  // Try server-based LLM generation first
  if (serverUrl) {
    onProgress?.('Consulting your AI coach...');

    try {
      const authHeaders = await getAuthHeaders();

      // Fire off timed progress messages so the bar keeps moving
      // while the AI request is in-flight.
      let cancelled = false;
      const progressSteps = [
        { msg: 'Building your training framework...', delay: 3000 },
        { msg: 'Calculating progressive overload...', delay: 5000 },
        { msg: 'Adding periodisation and taper...', delay: 4000 },
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
  onProgress?.('Building your training framework...');
  await delay(800);
  onProgress?.('Calculating progressive overload...');
  await delay(600);
  onProgress?.('Adding periodisation and taper...');
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
function buildPlanFromActivities(activities, goal, config) {
  let startDate;
  if (config.startDate) {
    startDate = new Date(config.startDate);
  } else {
    const now = new Date();
    const dow = now.getDay();
    const daysUntilMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() + daysUntilMon);
  }
  startDate.setHours(0, 0, 0, 0);

  const planId = uid();

  return {
    id: planId,
    goalId: goal.id,
    configId: config.id,
    name: goal.planName || null,
    status: 'active',
    startDate: startDate.toISOString(),
    weeks: config.weeks || 8,
    currentWeek: 1,
    activities: activities.map(a => ({
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
    })),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Edit an existing plan with LLM.
 * scope: 'plan' (all future weeks), 'week' (single week)
 */
export async function editPlanWithLLM(plan, goal, instruction, scope, onProgress, coachId) {
  const serverUrl = getServerUrl();

  // Calculate current week
  const now = new Date();
  const start = new Date(plan.startDate);
  const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
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
  onProgress?.('Analysing your request...');
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
    try {
      const errData = await response.json();
      // Don't surface raw auth/server errors to the user
      if (response.status === 401 || response.status === 403) {
        errMsg = 'Your session has expired. Please sign in again to chat with your coach.';
      } else if (errData?.error) {
        errMsg = errData.error;
      }
    } catch {}
    console.warn('Coach chat server error:', response.status, errMsg);
    return { reply: errMsg };
  } catch (err) {
    console.warn('Coach chat failed:', err);
    return { reply: 'Could not connect to the server. Check your internet connection and try again.' };
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
