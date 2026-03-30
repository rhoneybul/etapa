/**
 * AI plan generation endpoint.
 * Calls the Claude API server-side to generate cycling training plans.
 * Falls back to a structured prompt-based approach.
 */
const express = require('express');
const router = express.Router();

const getAnthropicKey = () => process.env.ANTHROPIC_API_KEY || null;

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
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

function buildPlanPrompt(goal, config) {
  const { sessionCounts = {}, availableDays = [], fitnessLevel = 'beginner' } = config;
  const weeks = config.weeks || 8;
  const hasTargetDate = !!goal.targetDate;

  return `You are an expert cycling coach creating a personalised training plan. Generate a structured JSON training plan.

## Athlete profile
- Fitness level: ${fitnessLevel}
- Cycling type: ${goal.cyclingType || 'road'}
- Goal: ${goal.goalType === 'race' ? 'Race preparation' : goal.goalType === 'distance' ? 'Hit a distance target' : 'General improvement'}
${goal.eventName ? `- Event: ${goal.eventName}` : ''}
${goal.targetDistance ? `- Target distance: ${goal.targetDistance} km` : ''}
${goal.targetElevation ? `- Target elevation: ${goal.targetElevation} m` : ''}
${goal.targetDate ? `- Target date: ${goal.targetDate}` : ''}
- Plan start date: ${config.startDate || 'next Monday'}

## Plan structure
- Total weeks: ${weeks}
- Training days per week: ${config.daysPerWeek || 3}
- Available days: ${availableDays.join(', ')}
- Session types: ${Object.entries(sessionCounts).map(([k, v]) => `${v}x ${k}`).join(', ')}

## CRITICAL periodisation rules
${hasTargetDate ? `
- The plan MUST end on or before ${goal.targetDate}. The athlete's event/race is on this date.
- Periodise the plan: Base phase (40%) → Build phase (30%) → Peak phase (15%) → Taper (15%)
- The FINAL 1-2 weeks must be a proper taper: volume drops 40-50%, intensity stays moderate
- The very last week should have an opener ride (short, sharp efforts) 2 days before the target date
- Do NOT schedule hard training in the final week
` : `
- Periodise the plan: Base phase (45%) → Build phase (35%) → Peak phase (20%)
- No taper needed as there's no target date
`}
- Every 4th week should be a recovery/deload week (reduce volume by 30%, easy efforts only)
- Progressive overload: increase volume ~6-8% per week within each phase
- Long rides should progress in distance throughout the plan
- Include variety: endurance, tempo, intervals, and recovery rides

## Output format
Return ONLY a JSON array. Each activity object must have these exact fields:
{"week":1,"dayOfWeek":0,"type":"ride","subType":"endurance","title":"Endurance Ride","description":"Zone 2 steady state...","notes":"Base phase - building aerobic engine","durationMins":45,"distanceKm":25,"effort":"easy"}

Field rules:
- dayOfWeek: 0=Monday, 1=Tuesday, ..., 6=Sunday
- type: "ride" or "strength"
- subType: "endurance", "tempo", "intervals", "recovery", "indoor", or null for strength
- effort: "easy", "moderate", "hard", "recovery", or "max"
- notes: include phase label and coaching context (e.g. "Base phase - focus on building your aerobic engine")
- For taper weeks, add "(Taper)" to the title
- For deload weeks, add "(Deload)" to the title

Return ONLY the JSON array, no other text.`;
}

module.exports = router;
