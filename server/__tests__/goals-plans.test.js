/**
 * Goals & Plans CRUD — full lifecycle test.
 * Creates a goal, creates a plan referencing it, reads both back,
 * updates the plan, and cleans up.
 */
const request = require('supertest');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const { app } = require('../src/index');
const { getTestAuth, cleanupTestData } = require('./setup');

let token;
const goalId = `test_goal_${Date.now()}`;
const planId = `test_plan_${Date.now()}`;
const configId = `test_cfg_${Date.now()}`;

beforeAll(async () => {
  const auth = await getTestAuth();
  token = auth.token;
});

afterAll(async () => {
  await cleanupTestData();
});

describe('Goals CRUD', () => {
  test('POST /api/goals — create a goal', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: goalId,
        cyclingType: 'road',
        goalType: 'event',
        targetDistance: 100,
        targetDate: '2026-07-01',
        eventName: 'Test Event',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(goalId);
    expect(res.body.eventName).toBe('Test Event');
  });

  test('GET /api/goals — list goals includes the new goal', async () => {
    const res = await request(app)
      .get('/api/goals')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find(g => g.id === goalId);
    expect(found).toBeDefined();
    expect(found.cyclingType).toBe('road');
  });

  test('POST /api/goals — upsert existing goal succeeds', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: goalId,
        cyclingType: 'road',
        goalType: 'event',
        targetDistance: 150,
        targetDate: '2026-07-01',
        eventName: 'Updated Event',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(goalId);
  });
});

describe('Plans CRUD', () => {
  test('POST /api/plans — create a plan with activities', async () => {
    const res = await request(app)
      .post('/api/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: planId,
        goalId: goalId,
        configId: configId,
        name: 'Test Plan',
        status: 'active',
        startDate: '2026-04-07T00:00:00.000Z',
        weeks: 4,
        currentWeek: 1,
        activities: [
          {
            id: `act_${Date.now()}_1`,
            week: 1,
            dayOfWeek: 1,
            type: 'ride',
            subType: 'endurance',
            title: 'Easy Spin',
            description: 'Recovery ride',
            durationMins: 45,
            distanceKm: 20,
            effort: 'easy',
            completed: false,
          },
          {
            id: `act_${Date.now()}_2`,
            week: 1,
            dayOfWeek: 3,
            type: 'ride',
            subType: 'tempo',
            title: 'Tempo Intervals',
            description: '4x8min tempo',
            durationMins: 60,
            distanceKm: 30,
            effort: 'hard',
            completed: false,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(planId);
  });

  test('GET /api/plans — list plans includes the new plan with activities', async () => {
    const res = await request(app)
      .get('/api/plans')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const found = res.body.find(p => p.id === planId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Test Plan');
    expect(found.goalId).toBe(goalId);
    expect(found.activities).toHaveLength(2);
    expect(found.activities[0].title).toBe('Easy Spin');
  });

  test('PUT /api/plans/:id — update plan status', async () => {
    const res = await request(app)
      .put(`/api/plans/${planId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Plan Updated',
        status: 'active',
        currentWeek: 2,
        activities: [],
      });

    expect(res.status).toBe(200);
  });

  test('PATCH /api/plans/:id/activities/:actId — mark activity complete', async () => {
    // First get the plan to find an activity ID
    const listRes = await request(app)
      .get('/api/plans')
      .set('Authorization', `Bearer ${token}`);

    const plan = listRes.body.find(p => p.id === planId);
    if (plan?.activities?.length > 0) {
      const actId = plan.activities[0].id;
      const res = await request(app)
        .patch(`/api/plans/${planId}/activities/${actId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ completed: true });

      expect(res.status).toBe(200);
    }
  });

  test('POST /api/plans — plan with non-existent goal_id handles FK gracefully', async () => {
    const res = await request(app)
      .post('/api/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: `test_fk_plan_${Date.now()}`,
        goalId: 'nonexistent_goal_id_12345',
        name: 'FK Test Plan',
        status: 'active',
        startDate: '2026-04-07T00:00:00.000Z',
        weeks: 2,
        currentWeek: 1,
        activities: [],
      });

    // Should succeed (retries with goal_id: null) rather than 500
    expect(res.status).toBe(201);
  });

  test('DELETE /api/goals/:id — delete the test goal', async () => {
    const res = await request(app)
      .delete(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});
