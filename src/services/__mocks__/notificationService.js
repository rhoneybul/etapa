/**
 * Manual mock for src/services/notificationService.js.
 * Mirrors the real named exports — push reg, focused-screen
 * tracking, badge, listeners.
 */
let focused = null;

module.exports = {
  __esModule: true,
  setFocusedScreen: jest.fn((name) => { focused = name; }),
  getFocusedScreen: jest.fn(() => focused),
  registerForPushNotifications: jest.fn().mockResolvedValue(null),
  getPushStatus: jest.fn().mockResolvedValue({ status: 'granted', token: null }),
  addNotificationReceivedListener: jest.fn(() => () => {}),
  addNotificationResponseListener: jest.fn(() => () => {}),
  getBadgeCount: jest.fn().mockResolvedValue(0),
  setBadgeCount: jest.fn().mockResolvedValue(true),
  schedulePush: jest.fn().mockResolvedValue(true),
  cancelAllPush: jest.fn().mockResolvedValue(true),
};
