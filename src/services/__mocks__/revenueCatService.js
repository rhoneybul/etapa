/**
 * Manual mock for src/services/revenueCatService.js. Mirrors the real
 * named exports.
 */
module.exports = {
  __esModule: true,
  configureRevenueCat: jest.fn().mockResolvedValue(true),
  loginRevenueCat: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  logoutRevenueCat: jest.fn().mockResolvedValue(true),
  checkEntitlement: jest.fn().mockResolvedValue(false),
  getOfferings: jest.fn().mockResolvedValue(null),
  purchasePackage: jest.fn().mockResolvedValue({ ok: false }),
  restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  isRevenueCatAvailable: jest.fn(() => false),
  isRevenueCatConfigured: jest.fn(() => false),
  showManageSubscriptions: jest.fn().mockResolvedValue(true),
};
