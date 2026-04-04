/**
 * App Config & Maintenance mode tests.
 * Tests the remote config read/write cycle and the admin config endpoint.
 */
const request = require('supertest');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const { app } = require('../src/index');
const { getTestAuth } = require('./setup');

let token;

beforeAll(async () => {
  const auth = await getTestAuth();
  token = auth.token;
});

describe('App Config (public read)', () => {
  test('GET /api/app-config — returns config without auth', async () => {
    const res = await request(app).get('/api/app-config');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  test('GET /api/app-config — maintenance_mode has expected shape', async () => {
    const res = await request(app).get('/api/app-config');
    if (res.body.maintenance_mode) {
      expect(res.body.maintenance_mode).toHaveProperty('enabled');
      expect(typeof res.body.maintenance_mode.enabled).toBe('boolean');
    }
  });

  test('GET /api/app-config — min_version config readable', async () => {
    const res = await request(app).get('/api/app-config');
    // min_version may or may not exist, but if it does it should have version field
    if (res.body.min_version) {
      expect(res.body.min_version).toHaveProperty('version');
    }
  });
});

describe('Admin Config (write)', () => {
  const adminKey = process.env.ADMIN_API_KEY;
  const skipAdmin = !adminKey;

  const conditionalTest = skipAdmin ? test.skip : test;

  conditionalTest('PUT /api/admin/app-config/:key — update trial_config', async () => {
    const res = await request(app)
      .put('/api/admin/app-config/trial_config')
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ value: { days: 14, bannerMessage: 'Test banner' } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the change persisted
    const configRes = await request(app).get('/api/app-config');
    expect(configRes.body.trial_config?.days).toBe(14);

    // Reset to default
    await request(app)
      .put('/api/admin/app-config/trial_config')
      .set('Authorization', `Bearer ${adminKey}`)
      .send({ value: { days: 7, bannerMessage: 'Subscribe to unlock full training access' } });
  });
});
