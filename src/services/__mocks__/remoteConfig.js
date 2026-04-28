/**
 * Manual mock for src/services/remoteConfig.js. The real module
 * exposes a default-export object with getString / getBool /
 * getNumber / getJson / t / subscribe. We mirror the surface so any
 * screen that calls remoteConfig.X works in tests.
 */
const fallbackOrSelf = (_key, fallback) => fallback;

const remoteConfig = {
  getString: jest.fn(fallbackOrSelf),
  getBool:   jest.fn((_k, fallback = false) => fallback),
  getNumber: jest.fn((_k, fallback = 0) => fallback),
  getJson:   jest.fn((_k, fallback = null) => fallback),
  t:         jest.fn((_k, fallback = '') => fallback),
  subscribe: jest.fn(() => () => {}),
  refresh:   jest.fn().mockResolvedValue(true),
};

module.exports = {
  __esModule: true,
  default: remoteConfig,
  ...remoteConfig,
};
