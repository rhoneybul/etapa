/**
 * Manual mock for src/services/subscriptionService.js. Defaults to
 * "free tier, no offerings, fixed prices in GBP for stable copy".
 */
const defaultPrices = {
  monthly: { amount: 7.99, currency: 'GBP', display: '£7.99' },
  annual:  { amount: 49.99, currency: 'GBP', display: '£49.99' },
  starter: { amount: 14.99, currency: 'GBP', display: '£14.99' },
  lifetime:{ amount: 99.99, currency: 'GBP', display: '£99.99' },
};

module.exports = {
  __esModule: true,
  getPrices: jest.fn().mockResolvedValue(defaultPrices),
  getSubscriptionStatus: jest.fn().mockResolvedValue({ active: false, plan: null, expiresAt: null }),
  isSubscribed: jest.fn().mockResolvedValue(false),
  getSubscriptionOfferings: jest.fn().mockResolvedValue(null),
  openCheckout: jest.fn().mockResolvedValue({ ok: false }),
  restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  startFreeTrial: jest.fn().mockResolvedValue({ ok: true }),
  validateCoupon: jest.fn().mockResolvedValue({ valid: false }),
  redeemCoupon: jest.fn().mockResolvedValue({ ok: false }),
  openBillingPortal: jest.fn().mockResolvedValue({ ok: false }),
};
