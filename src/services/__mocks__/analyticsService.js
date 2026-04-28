/**
 * Manual mock for src/services/analyticsService.js.
 * No-op everything; tests that need to assert an event was tracked
 * inspect the recorded calls via:
 *   const a = require('../../src/services/analyticsService').default;
 *   expect(a.events.activityViewed).toHaveBeenCalledWith(...)
 */
const noop = jest.fn();
const events = new Proxy({}, {
  get: (target, key) => {
    if (!target[key]) target[key] = jest.fn();
    return target[key];
  },
});

const analytics = {
  init: noop,
  identify: noop,
  capture: noop,
  screen: noop,
  reset: noop,
  events,
};

module.exports = {
  __esModule: true,
  default: analytics,
  events,
};
