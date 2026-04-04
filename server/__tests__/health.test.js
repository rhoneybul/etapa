/**
 * Health check & public route tests — no auth required.
 */
const request = require('supertest');
const path = require('path');

// Load test env before importing the app
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const { app } = require('../src/index');

describe('Health & Public Routes', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ts).toBeDefined();
  });

  test('GET /api/app-config returns config object', async () => {
    const res = await request(app).get('/api/app-config');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
    // Should at least have maintenance_mode key (from seed)
    if (res.body.maintenance_mode) {
      expect(res.body.maintenance_mode).toHaveProperty('enabled');
    }
  });

  test('Protected route rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('Protected route rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/plans')
      .set('Authorization', 'Bearer invalid-token-abc123');
    expect(res.status).toBe(401);
  });
});
