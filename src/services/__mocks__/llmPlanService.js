/**
 * Manual mock for src/services/llmPlanService.js.
 *
 * All exports are jest.fn() so tests can override per-test:
 *   const llm = require('../../src/services/llmPlanService');
 *   llm.explainTips.mockResolvedValueOnce([{ category: 'warmup', ... }]);
 *
 * Defaults are the "happy null" path — Claude said nothing, the screen
 * should fall back to its deterministic placeholder.
 */
module.exports = {
  __esModule: true,
  startAsyncPlanGeneration: jest.fn().mockResolvedValue({ jobId: 'mock-job' }),
  pollPlanJob: jest.fn().mockResolvedValue({ status: 'completed', plan: null }),
  cancelPlanJob: jest.fn().mockResolvedValue({ ok: true }),
  generatePlanWithLLM: jest.fn().mockResolvedValue(null),
  editPlanWithLLM: jest.fn().mockResolvedValue(null),
  editActivityWithAI: jest.fn().mockResolvedValue(null),
  explainActivity: jest.fn().mockResolvedValue(null),
  explainTips: jest.fn().mockResolvedValue(null),
  adjustWeekForOrganisedRide: jest.fn().mockResolvedValue(null),
  coachChat: jest.fn().mockResolvedValue({ reply: 'Hello from mock coach.' }),
  startCoachChatJob: jest.fn().mockResolvedValue({ jobId: 'mock-coach-job' }),
  pollCoachChatJob: jest.fn().mockResolvedValue({ status: 'completed', reply: 'Mock reply' }),
  cancelCoachChatJob: jest.fn().mockResolvedValue({ ok: true }),
  openCoachChatStream: jest.fn().mockResolvedValue({ close: jest.fn() }),
  assessPlan: jest.fn().mockResolvedValue(null),
  lookupRace: jest.fn().mockResolvedValue(null),
};
