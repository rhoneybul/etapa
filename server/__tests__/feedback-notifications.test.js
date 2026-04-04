/**
 * Feedback & Notifications tests.
 */
const request = require('supertest');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const { app } = require('../src/index');
const { getTestAuth, cleanupTestData } = require('./setup');

let token;
let feedbackId;

beforeAll(async () => {
  const auth = await getTestAuth();
  token = auth.token;
});

afterAll(async () => {
  await cleanupTestData();
});

describe('Feedback', () => {
  test('POST /api/feedback — submit feedback', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'suggestion',
        message: 'Test feedback from CI',
        appVersion: '0.50.0',
        deviceInfo: 'test-runner',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    feedbackId = res.body.id;
  });

  test('GET /api/feedback — list own feedback', async () => {
    const res = await request(app)
      .get('/api/feedback')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (feedbackId) {
      const found = res.body.find(f => f.id === feedbackId);
      expect(found).toBeDefined();
    }
  });
});

describe('Notifications', () => {
  test('GET /api/notifications — list notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/notifications/unread-count — returns count', async () => {
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
  });

  test('PATCH /api/notifications/read-all — mark all read', async () => {
    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('Preferences', () => {
  test('PUT /api/preferences — set preferences', async () => {
    const res = await request(app)
      .put('/api/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        coachCheckin: 'after_session',
        pushEnabled: true,
      });

    expect(res.status).toBe(200);
  });

  test('GET /api/preferences — read preferences', async () => {
    const res = await request(app)
      .get('/api/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.coachCheckin).toBe('after_session');
  });
});
