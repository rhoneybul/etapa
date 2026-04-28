/**
 * Manual mock for src/services/stravaService.js. Mirrors the real
 * module's named exports: isStravaConfigured, isStravaConnected,
 * connectStrava, disconnectStrava, fetchRecentActivities,
 * getStravaTokens.
 */
module.exports = {
  __esModule: true,
  isStravaConfigured: false,
  isStravaConnected: jest.fn().mockResolvedValue(false),
  connectStrava: jest.fn().mockResolvedValue(false),
  disconnectStrava: jest.fn().mockResolvedValue(true),
  fetchRecentActivities: jest.fn().mockResolvedValue([]),
  getStravaTokens: jest.fn().mockResolvedValue(null),
};
