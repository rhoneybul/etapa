/**
 * AI plan generation + editing endpoints.
 * Calls Claude API server-side to generate & edit cycling training plans.
 * Acts as a professional cycling coach with deep sports science knowledge.
 */
const express = require('express');
const router = express.Router();

// Ensure fetch is available (Node 18+ has it, but polyfill for older runtimes)
const _fetch = typeof globalThis.fetch === 'function'
  ? globalThis.fetch
  : (() => { const f = require('node-fetch'); return f.default || f; })();

const getAnthropicKey = () => process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || null;

// ── Coach personas (server-side mirror of client coaches.js) ──────────────
const COACHES = {
  clara: {
    name: 'Clara Moreno', pronouns: 'she/her',
    bio: 'Former recreational cyclist turned coaching enthusiast. Clara believes everyone can fall in love with cycling. She focuses on building confidence and making training enjoyable.',
    personality: 'Warm, patient, and genuinely encouraging. Celebrates every small win. Uses simple language, avoids jargon. Asks how the rider is feeling. Never pushes too hard — believes consistency beats intensity. Loves to add motivational notes and reminders to enjoy the ride.',
  },
  marcus: {
    name: 'Marcus Webb', pronouns: 'he/him',
    bio: 'Ex-military fitness instructor and competitive criterium racer. Marcus doesn\'t sugarcoat anything. He\'ll push you harder than you think possible — and you\'ll thank him for it.',
    personality: 'Direct, demanding, and brutally honest. Doesn\'t waste words. Expects discipline and consistency. Will call out excuses. Uses short, punchy sentences. Pushes the rider to their limit. Believes in earned rest, not easy days. Says things like "No excuses" and "Pain is temporary, fitness is forever."',
  },
  aisha: {
    name: 'Aisha Okonkwo', pronouns: 'she/her',
    bio: 'Sports science PhD and data-driven coach. Aisha explains the why behind every session. She\'ll reference training zones, periodisation theory, and recovery science — but keeps it accessible.',
    personality: 'Methodical, precise, and educational. Explains the science behind training decisions. References heart rate zones, TSS, CTL, and periodisation theory. Backs recommendations with evidence. Patient with questions. Loves data and tracking. Will suggest specific metrics to monitor.',
  },
  kai: {
    name: 'Kai Tanaka', pronouns: 'they/them',
    bio: 'Former touring cyclist who\'s ridden across three continents. Kai brings a zen-like calm to coaching — balancing the joy of cycling with structured training.',
    personality: 'Calm, thoughtful, and balanced. Mixes structure with flexibility. Understands life gets in the way and adapts gracefully. Encourages mindfulness on the bike. Uses metaphors and storytelling. Believes training should enhance life, not dominate it. Good at managing stress and overtraining.',
  },
  elena: {
    name: 'Elena Vasquez', pronouns: 'she/her',
    bio: 'Former professional road racer with Grand Fondo podium finishes. Elena knows what it takes to peak for race day and will structure every week around that goal.',
    personality: 'Passionate, intense, and race-focused. Every session has a purpose tied to the goal event. Thinks in terms of race strategy — pacing, nutrition, mental preparation. High energy and motivating but expects commitment. Will push hard in build weeks and enforce recovery. Uses racing terminology naturally.',
  },
  james: {
    name: 'James Obi', pronouns: 'he/him',
    bio: 'Club cyclist and group ride leader who got into coaching to help mates improve. James makes training feel like chatting with a friend who happens to know a lot about cycling.',
    personality: 'Chatty, friendly, and relatable. Uses casual language and humour. Makes cycling culture references. Talks like a mate at the coffee stop. Very approachable for beginners. Will simplify complex concepts into everyday language. Loves talking about routes, bikes, and cycling culture alongside training.',
  },
};

function getCoachPromptBlock(coachId) {
  const coach = coachId ? COACHES[coachId] : null;
  if (!coach) return '';
  return `\n\n## Your coaching persona
You are ${coach.name} (${coach.pronouns}).
Bio: ${coach.bio}
Your coaching style: ${coach.personality}
IMPORTANT: Stay fully in character as ${coach.name.split(' ')[0]}. Your tone, word choice, and approach should consistently reflect the personality described above. Do NOT break character or speak generically.`;
}

// ── Rider level benchmarks ─────────────────────────────────────────────────
const RIDER_BENCHMARKS = {
  beginner: {
    label: 'Beginner',
    avgSpeedKmh: 18,
    maxComfortableDistKm: 40,
    weeklyVolumeHrs: '3–5',
    description: 'New to cycling or rides <2x per week. Comfortable up to ~40 km at 16–20 km/h.',
  },
  intermediate: {
    label: 'Intermediate',
    avgSpeedKmh: 24,
    maxComfortableDistKm: 80,
    weeklyVolumeHrs: '5–8',
    description: 'Rides 2–4x per week. Comfortable up to ~80 km at 22–26 km/h.',
  },
  advanced: {
    label: 'Advanced',
    avgSpeedKmh: 28,
    maxComfortableDistKm: 130,
    weeklyVolumeHrs: '8–12',
    description: 'Trains 4–6x per week. Comfortable up to ~130 km at 26–30 km/h.',
  },
  expert: {
    label: 'Expert',
    avgSpeedKmh: 32,
    maxComfortableDistKm: 200,
    weeklyVolumeHrs: '12–18',
    description: 'Competitive racer or high-volume enthusiast. Comfortable 150+ km at 30+ km/h.',
  },
};

// ── Generate plan endpoint ─────────────────────────────────────────────────
router.post('/generate-plan', async (req, res) => {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'AI plan generation not configured. Set ANTHROPIC_API_KEY.' });
  }

  const { goal, config } = req.body;
  if (!goal || !config) {
    return res.status(400).json({ error: 'Missing goal or config in request body.' });
  }

  try {
    const prompt = buildPlanPrompt(goal, config);
    const systemWithCoach = COACH_SYSTEM_PROMPT + getCoachPromptBlock(config.coachId);

    const response = await _fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemWithCoach,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error:', response.status, errBody);
      return res.status(502).json({ error: 'AI service error', detail: response.status });
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return res.status(502).json({ error: 'Could not parse AI response' });
    }

    const activities = JSON.parse(jsonMatch[0]);
    res.json({ activities });
  } catch (err) {
    console.error('AI plan generation error:', err);
    res.status(500).json({ error: 'Failed to generate plan', detail: err.message });
  }
});

// ── Edit plan endpoint ─────────────────────────────────────────────────────
router.post('/edit-plan', async (req, res) => {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'AI editing not configured. Set ANTHROPIC_API_KEY.' });
  }

  const { plan, goal, instruction, scope, currentWeek, coachId } = req.body;
  if (!plan || !instruction) {
    return res.status(400).json({ error: 'Missing plan or instruction.' });
  }

  try {
    const prompt = buildEditPrompt(plan, goal, instruction, scope, currentWeek);
    const systemWithCoach = COACH_SYSTEM_PROMPT + getCoachPromptBlock(coachId);

    const response = await _fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemWithCoach,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error:', response.status, errBody);
      return res.status(502).json({ error: 'AI service error', detail: response.status });
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return res.status(502).json({ error: 'Could not parse AI edit response' });
    }

    const activities = JSON.parse(jsonMatch[0]);
    res.json({ activities });
  } catch (err) {
    console.error('AI edit error:', err);
    res.status(500).json({ error: 'Failed to edit plan', detail: err.message });
  }
});

// ── Edit activity endpoint (single session AI chat) ────────────────────────
router.post('/edit-activity', async (req, res) => {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'AI not configured.' });
  }

  const { activity, goal, instruction, coachId } = req.body;
  if (!activity || !instruction) {
    return res.status(400).json({ error: 'Missing activity or instruction.' });
  }

  try {
    const prompt = buildActivityEditPrompt(activity, goal, instruction);
    const systemWithCoach = COACH_SYSTEM_PROMPT + getCoachPromptBlock(coachId);

    const response = await _fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemWithCoach,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error:', response.status, errBody);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      // Return as plain text answer
      return res.json({ answer: text, updatedActivity: null });
    }

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    console.error('AI activity edit error:', err);
    res.status(500).json({ error: 'Failed to edit activity', detail: err.message });
  }
});

// ── System prompt: professional cycling coach ──────────────────────────────
const COACH_SYSTEM_PROMPT = `You are an elite cycling coach with 20+ years of experience training athletes from beginners to professionals. You draw on principles from:

- Joe Friel's "The Cyclist's Training Bible" — periodisation, threshold training
- Chris Carmichael's "Time-Crunched Cyclist" — efficient training for busy athletes
- Dr. Stephen Seiler's 80/20 polarised training research
- TrainerRoad & Wahoo SYSTM structured workout methodology
- British Cycling coaching pathways
- Sports science research on progressive overload, recovery, and injury prevention

Your plans are PRACTICAL and ACHIEVABLE. Every session must be something the rider can actually complete given their current fitness. You never set a ride that's more than 15–20% longer/harder than what the rider has done before in the plan. You build up gradually.

Key coaching principles you follow:
1. PROGRESSIVE OVERLOAD: Never increase weekly volume by more than 10%. Build fitness gradually.
2. RECOVERY IS TRAINING: Hard days must be followed by easy/rest days. 2 hard days in a row maximum.
3. SPECIFICITY: Train for the demands of the goal event (distance, terrain, duration).
4. POLARISED TRAINING: 80% of rides at easy/zone 2 pace, 20% at threshold or above.
5. INJURY PREVENTION: Factor in the athlete's total training load including non-cycling activities.
6. TAPER: For events, reduce volume 40–50% in final 1–2 weeks while maintaining some intensity.
7. DELOAD: Every 3–4 weeks, reduce volume by 30% to allow adaptation.
8. REALISTIC SPEEDS: All distances and durations must be achievable at the rider's actual speed.

Rider level benchmarks:
- Beginner: avg 16–20 km/h, max comfortable ride ~40 km, 3–5 hrs/week
- Intermediate: avg 22–26 km/h, max comfortable ride ~80 km, 5–8 hrs/week
- Advanced: avg 26–30 km/h, max comfortable ride ~130 km, 8–12 hrs/week
- Expert: avg 30+ km/h, max comfortable ride 150+ km, 12–18 hrs/week

When setting distances and durations, calculate them from the rider's average speed. A 60-minute ride for a beginner is ~18 km, not 30 km.`;

// ── Build plan prompt ──────────────────────────────────────────────────────
function buildPlanPrompt(goal, config) {
  const {
    sessionCounts = {},
    availableDays = [],
    fitnessLevel = 'beginner',
    crossTrainingDays = {},
    crossTrainingDaysFull = null,
  } = config;
  const weeks = config.weeks || 8;
  const hasTargetDate = !!goal.targetDate;
  const benchmark = RIDER_BENCHMARKS[fitnessLevel] || RIDER_BENCHMARKS.beginner;

  // Cross-training load description — supports both legacy (single per day) and full (array per day)
  let crossTrainingNote = '';
  const ctSource = crossTrainingDaysFull || crossTrainingDays;
  if (ctSource && Object.keys(ctSource).length > 0) {
    const entries = Object.entries(ctSource)
      .filter(([, v]) => v)
      .map(([day, activity]) => {
        if (Array.isArray(activity)) return activity.length > 0 ? `${day}: ${activity.join(', ')}` : null;
        return `${day}: ${activity}`;
      })
      .filter(Boolean);
    if (entries.length > 0) {
      crossTrainingNote = `
## Cross-training (non-cycling activities the athlete already does)
${entries.join('\n')}
IMPORTANT: These activities add training stress. Factor them into recovery planning:
- Days after hard cross-training should have easier cycling sessions
- Total weekly training load (cycling + cross-training) must not exceed safe limits
- Do NOT schedule hard cycling sessions on cross-training days or the day after intense cross-training
- Multiple activities on the same day means higher cumulative fatigue — plan accordingly`;
    }
  }

  return `Create a ${weeks}-week personalised cycling training plan.

## Athlete profile
- Fitness level: ${fitnessLevel} (${benchmark.description})
- Average speed: ~${benchmark.avgSpeedKmh} km/h
- Max comfortable distance currently: ~${benchmark.maxComfortableDistKm} km
- Cycling type: ${goal.cyclingType || 'road'}
- Goal: ${goal.goalType === 'race' ? 'Race preparation' : goal.goalType === 'distance' ? 'Hit a distance target' : 'General fitness improvement'}
${goal.eventName ? `- Event: ${goal.eventName}` : ''}
${goal.targetDistance ? `- Target distance: ${goal.targetDistance} km` : ''}
${goal.targetElevation ? `- Target elevation: ${goal.targetElevation} m` : ''}
${goal.targetTime ? `- Target finish time: ${goal.targetTime} hours` : ''}
${goal.targetDate ? `- Event/target date: ${goal.targetDate}` : ''}
- Plan start date: ${config.startDate || 'next Monday'}

## Plan structure
- Total weeks: ${weeks}
- Training days per week: ${config.daysPerWeek || 3}
- Available days: ${availableDays.join(', ')}
- Session distribution: ${Object.entries(sessionCounts).map(([k, v]) => `${v}x ${k}`).join(', ')}
${crossTrainingNote}

## CRITICAL rules

### Periodisation
${hasTargetDate ? `
- The plan MUST end on or before the event date (${goal.targetDate}).
- Phase breakdown: Base (40%) → Build (30%) → Peak (15%) → Taper (15%)
- Taper: volume drops 40–50%, maintain some intensity. Last week: just an opener ride + recovery.
- The athlete must arrive at the event date FRESH and PREPARED, not exhausted.` : `
- Phase breakdown: Base (45%) → Build (35%) → Peak (20%)
- No taper needed — steady improvement.`}

### Progressive overload & safety
- Start week 1 at distances/durations the rider can COMFORTABLY do right now.
- Increase weekly volume by no more than 6–8% per phase.
- Every 3rd or 4th week: deload (reduce volume 30%, easy efforts only).
- Long ride should start at ~${Math.round(benchmark.maxComfortableDistKm * 0.5)} km and build to ${goal.targetDistance ? '~' + Math.round(goal.targetDistance * 0.85) + '–' + goal.targetDistance + ' km' : '~' + benchmark.maxComfortableDistKm + ' km'} by the peak phase.
- NEVER set a ride more than 20% longer than the previous week's longest.
- All distances must be achievable at ~${benchmark.avgSpeedKmh} km/h average speed.
${goal.targetDistance ? `
### TARGET DISTANCE REQUIREMENT (CRITICAL)
The athlete's goal event is ${goal.targetDistance} km. The plan MUST progressively build them up to ride AT LEAST ${Math.round(goal.targetDistance * 0.8)}–${Math.round(goal.targetDistance * 0.85)} km in a single long ride during the peak phase (2–3 weeks before the event). This is the MOST IMPORTANT training requirement.
- Weekly total volume should reach ~${Math.round(goal.targetDistance * 1.3)}–${Math.round(goal.targetDistance * 1.6)} km per week at peak.
- The longest ride each week should progressively increase: start at ~${Math.round(benchmark.maxComfortableDistKm * 0.5)} km and reach ~${Math.round(goal.targetDistance * 0.85)} km.
- During taper, the longest ride drops back but the athlete should feel confident they can cover ${goal.targetDistance} km on event day.
- If the plan has enough weeks, include at least 2 rides of 80%+ of target distance in the peak phase.` : ''}
${goal.targetElevation ? `
### ELEVATION REQUIREMENT
The event has ${goal.targetElevation} m of elevation gain. The plan must prepare the athlete for sustained climbing:
- Include hill repeat sessions from the Build phase onwards (e.g. "Hill Repeats: 4x5 min at tempo on a climb, recover descending")
- Long rides should progressively include more climbing — mention "hilly route" or "include climbs" in descriptions
- Build climbing endurance: start with shorter climbs and progress to longer sustained efforts
- By peak phase, the athlete should be comfortable with rides that include significant climbing
- Strength sessions should focus on leg strength and core stability to support climbing` : ''}
${goal.targetTime ? `
### TARGET TIME REQUIREMENT
The athlete wants to complete the event in ${goal.targetTime} hours. This implies an average speed of ~${goal.targetDistance ? Math.round(goal.targetDistance / goal.targetTime) : '?'} km/h.
- Include tempo and threshold sessions to build sustained power at race pace
- Add race-pace simulation rides in the Build and Peak phases: "Ride ${goal.targetDistance ? Math.round(goal.targetDistance * 0.5) : 30}+ km at target pace (~${goal.targetDistance ? Math.round(goal.targetDistance / goal.targetTime) : '?'} km/h average)"
- The plan should include pacing practice so the athlete learns to sustain their target speed
- If the target time requires a higher speed than their current level, build progressively towards it` : ''}

### Ride variety
- Mix: endurance (zone 2), tempo (zone 3–4), intervals (zone 4–5), recovery (zone 1)
- Follow 80/20 rule: ~80% easy/moderate, ~20% hard
- No consecutive hard days without recovery between them

${goal.goalType === 'improve' ? `
### Improvement outcome
Since this is a general improvement plan, the athlete should see these outcomes by the end:
- Increased endurance: comfortable riding ${Math.round(benchmark.maxComfortableDistKm * 1.4)}+ km
- Higher average speed: ~${benchmark.avgSpeedKmh + 2}–${benchmark.avgSpeedKmh + 4} km/h
- Better recovery between efforts
- Stronger climbing ability and overall power
Include a motivating note in the final week's activities about what they've achieved.` : ''}

## Output format
Return ONLY a JSON array. Each activity object:
{"week":1,"dayOfWeek":0,"type":"ride","subType":"endurance","title":"Endurance Ride","description":"Zone 2 steady state...","notes":"Base phase — building aerobic engine","durationMins":45,"distanceKm":18,"effort":"easy"}

Field rules:
- dayOfWeek: 0=Monday, 1=Tuesday, ..., 6=Sunday
- type: "ride" or "strength" — use the EXACT type. Strength sessions must have type "strength".
- subType: "endurance", "tempo", "intervals", "recovery", "indoor", or null for strength
- effort: "easy", "moderate", "hard", "recovery", or "max"
- distanceKm: calculated from duration × rider's average speed. Must be realistic.
- durationMins: appropriate for the rider's level. Beginners: 30–75 min. Intermediate: 45–120 min.
- notes: include phase label, coaching context, and any cross-training considerations
- Strength sessions should NOT have distanceKm set (use null)
- For taper weeks, add "(Taper)" to the title
- For deload weeks, add "(Deload)" to the title

Return ONLY the JSON array, no other text.`;
}

// ── Build edit prompt ──────────────────────────────────────────────────────
function buildEditPrompt(plan, goal, instruction, scope, currentWeek) {
  // Gather activities for the relevant scope
  const scopeActivities = scope === 'week'
    ? plan.activities.filter(a => a.week === currentWeek)
    : plan.activities.filter(a => a.week >= currentWeek);

  const activitiesJson = JSON.stringify(scopeActivities.map(a => ({
    id: a.id,
    week: a.week,
    dayOfWeek: a.dayOfWeek,
    type: a.type,
    subType: a.subType,
    title: a.title,
    description: a.description,
    notes: a.notes,
    durationMins: a.durationMins,
    distanceKm: a.distanceKm,
    effort: a.effort,
    completed: a.completed,
  })), null, 2);

  return `The athlete wants to modify their training plan. Here is the instruction:

"${instruction}"

## Current plan context
- Goal: ${goal?.goalType || 'improve'} (${goal?.eventName || 'general'})
- Target distance: ${goal?.targetDistance || 'none'} km
- Target date: ${goal?.targetDate || 'none'}
- Plan weeks: ${plan.weeks}
- Current week: ${currentWeek}

## Activities to modify (${scope === 'week' ? `week ${currentWeek} only` : `weeks ${currentWeek}–${plan.weeks}`})
${activitiesJson}

## Instructions
Apply the athlete's request to the activities above. Return the COMPLETE modified activities array as JSON.
- Keep the same id, week, dayOfWeek structure
- Modify distances, durations, efforts, titles, descriptions, notes as needed
- Ensure all changes maintain training principles (progressive overload, recovery, etc.)
- If they ask to make it easier, reduce volume/intensity. If harder, increase it.
- If they ask to add/remove sessions, adjust the array accordingly.
- Strength sessions must keep type "strength" (never change to "ride").
- Ensure distances remain realistic for the rider's level.

Return ONLY the JSON array, no other text.`;
}

// ── Build activity edit prompt ─────────────────────────────────────────────
function buildActivityEditPrompt(activity, goal, instruction) {
  const actJson = JSON.stringify({
    type: activity.type,
    subType: activity.subType,
    title: activity.title,
    description: activity.description,
    notes: activity.notes,
    durationMins: activity.durationMins,
    distanceKm: activity.distanceKm,
    effort: activity.effort,
    week: activity.week,
  }, null, 2);

  return `The athlete has a question or edit request about this specific session:

## Current session
${actJson}

## Goal context
- Goal type: ${goal?.goalType || 'improve'}
- Target: ${goal?.targetDistance ? goal.targetDistance + ' km' : 'general improvement'}
- Event: ${goal?.eventName || 'none'}

## Athlete's message
"${instruction}"

## Instructions
If the athlete is asking a QUESTION (e.g. "why is this session here?", "what should I eat?", "is this too hard?"):
Return: {"answer": "Your coaching response here", "updatedActivity": null}

If the athlete wants to EDIT the session (e.g. "make it shorter", "change to intervals", "add more distance"):
Return: {"answer": "Brief explanation of what you changed", "updatedActivity": {the full updated activity object with same fields as above}}

Keep the type field accurate: if it's a strength session, type must stay "strength" unless they specifically ask to change it.
Return ONLY the JSON object, no other text.`;
}

// ── Coach chat endpoint (multi-turn conversation) ────────────────────────
router.post('/coach-chat', async (req, res) => {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
  }

  const { messages, context } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing messages array.' });
  }

  try {
    // Build system prompt with full plan context + coach persona
    const coachId = context?.coachId || null;
    let systemPrompt = COACH_SYSTEM_PROMPT;
    systemPrompt += getCoachPromptBlock(coachId);
    systemPrompt += '\n\n';
    systemPrompt += 'You are having a conversation with your athlete. Be specific in your advice. ';
    systemPrompt += 'Keep responses concise (2-4 paragraphs max). Use plain language. ';
    systemPrompt += 'You can use **bold** for emphasis but avoid other markdown.\n';
    systemPrompt += 'IMPORTANT: Base your answers ONLY on the plan data provided below. Do not guess or invent session details.\n\n';

    systemPrompt += `## Plan modification capability
When the athlete asks you to change, restructure, fix, or improve their plan (or a specific week), you can MODIFY the plan directly.

If the conversation leads to a plan change, include a JSON block at the END of your response (after your conversational text) in this exact format:

\`\`\`plan_update
[array of updated/new activity objects]
\`\`\`

Each activity object must have these fields:
{"id":"existing-id-or-null","week":1,"dayOfWeek":0,"type":"ride","subType":"endurance","title":"Endurance Ride","description":"Zone 2 steady...","notes":"Base phase","durationMins":45,"distanceKm":18,"effort":"easy"}

Rules for plan updates:
- dayOfWeek: 0=Monday ... 6=Sunday
- type: "ride" or "strength"
- subType: "endurance", "tempo", "intervals", "recovery", "indoor", or null for strength
- effort: "easy", "moderate", "hard", "recovery", or "max"
- For existing sessions, preserve the original "id" field
- For new sessions, set "id" to null
- Include ALL activities for the affected weeks (not just changed ones) so the full week can be replaced
- If restructuring the whole plan, include ALL activities for ALL weeks
- Strength sessions must NOT have distanceKm (use null)
- All distances must be realistic for the rider's speed/level
- Follow progressive overload: never increase long ride by more than 10-15% week to week

Only include the plan_update block when you are actually making changes. For questions, advice, or general chat, just respond normally without any JSON block.\n\n`;

    if (context) {
      if (context.plan) {
        systemPrompt += `## Current plan context\n`;
        systemPrompt += `- Plan: ${context.plan.name || 'Training plan'}\n`;
        systemPrompt += `- Total weeks: ${context.plan.weeks}\n`;
        systemPrompt += `- Start date: ${context.plan.startDate}\n`;
        if (context.plan.currentWeek) systemPrompt += `- Current week: ${context.plan.currentWeek} of ${context.plan.weeks}\n`;
      }
      if (context.goal) {
        systemPrompt += `\n## Athlete's goal\n`;
        systemPrompt += `- Goal type: ${context.goal.goalType || 'improve'}\n`;
        if (context.goal.eventName) systemPrompt += `- Event: ${context.goal.eventName}\n`;
        if (context.goal.targetDistance) systemPrompt += `- Target event distance: ${context.goal.targetDistance} km — this is the distance the athlete needs to be ready for\n`;
        if (context.goal.targetElevation) systemPrompt += `- Target elevation: ${context.goal.targetElevation} m\n`;
        if (context.goal.targetTime) systemPrompt += `- Target finish time: ${context.goal.targetTime} hours\n`;
        if (context.goal.targetDate) systemPrompt += `- Event date: ${context.goal.targetDate}\n`;
        if (context.goal.cyclingType) systemPrompt += `- Cycling type: ${context.goal.cyclingType}\n`;
      }

      if (context.fitnessLevel) {
        const bm = RIDER_BENCHMARKS[context.fitnessLevel];
        systemPrompt += `- Fitness level: ${context.fitnessLevel}${bm ? ` (${bm.description})` : ''}\n`;
      }

      // Week-by-week summary of the full plan
      if (context.weekSummaries && context.weekSummaries.length > 0) {
        systemPrompt += `\n## Full plan breakdown (week-by-week)\n`;
        for (const ws of context.weekSummaries) {
          systemPrompt += `Week ${ws.week}: ${ws.rideCount} rides (${ws.totalKm} km total, longest ${ws.longestRideKm} km), ${ws.strengthCount} strength, ${ws.totalMins} min total`;
          if (ws.sessions) systemPrompt += ` — ${ws.sessions.join(', ')}`;
          systemPrompt += '\n';
        }
      }

      if (context.weekNum) {
        systemPrompt += `\nThe athlete is asking about Week ${context.weekNum} specifically.\n`;
      }

      // Full activities with IDs for modification capability
      if (context.allActivities && context.allActivities.length > 0) {
        systemPrompt += `\n## All plan activities (with IDs — use these when modifying)\n`;
        systemPrompt += JSON.stringify(context.allActivities, null, 2) + '\n';
      }
    }

    // Format messages for Claude API
    const apiMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    const response = await _fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Coach chat error:', response.status, errBody);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const rawReply = data?.content?.[0]?.text || 'Sorry, I could not generate a response.';

    // Check for plan_update block in the response
    const planUpdateMatch = rawReply.match(/```plan_update\s*\n([\s\S]*?)\n```/);
    let updatedActivities = null;

    if (planUpdateMatch) {
      try {
        updatedActivities = JSON.parse(planUpdateMatch[1]);
        if (!Array.isArray(updatedActivities)) updatedActivities = null;
      } catch (e) {
        console.warn('Failed to parse plan_update JSON:', e.message);
        updatedActivities = null;
      }
    }

    // Strip the plan_update block from the visible reply
    const reply = rawReply.replace(/```plan_update\s*\n[\s\S]*?\n```/, '').trim();

    const result = { reply };
    if (updatedActivities && updatedActivities.length > 0) {
      result.updatedActivities = updatedActivities;
    }
    res.json(result);
  } catch (err) {
    console.error('Coach chat error:', err);
    res.status(500).json({ error: 'Failed to get coach response', detail: err.message });
  }
});

module.exports = router;
