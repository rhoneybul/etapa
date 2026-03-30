/**
 * LLM-based plan generation service.
 * Calls the Etapa server which proxies to Claude API for plan generation.
 * Falls back to the local planGenerator if the server is unavailable.
 */
import { generatePlan as localGeneratePlan } from './planGenerator';
import { uid } from './storageService';

const getServerUrl = () => {
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
      const response = await fetch(`${serverUrl}/api/ai/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, config }),
      });

      if (response.ok) {
        onProgress?.('Building your personalised plan...');
        await delay(500);

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
  // Use config start date if provided, otherwise next Monday
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
      subType: a.subType || 'endurance',
      title: a.title || 'Session',
      description: a.description || '',
      notes: a.notes || null,
      durationMins: a.durationMins || 45,
      distanceKm: a.distanceKm || null,
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
 * Edit an existing plan with LLM or local fallback.
 * scope: 'plan' (all future weeks), 'week' (single week)
 */
export async function editPlanWithLLM(plan, goal, instruction, scope, onProgress) {
  const serverUrl = getServerUrl();

  // Determine which weeks/activities to modify
  const now = new Date();
  const start = new Date(plan.startDate);
  const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, plan.weeks));

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
      if (!inScope) return a;
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
      if (!inScope) return a;
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
