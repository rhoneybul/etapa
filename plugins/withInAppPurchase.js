/**
 * Expo config plugin that adds the In-App Purchase capability to the iOS project.
 * This is required for react-native-purchases (RevenueCat) to work.
 *
 * Replaces the react-native-purchases config plugin which has compatibility
 * issues with some EAS CLI versions.
 */
const { withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');

function withInAppPurchase(config) {
  // Add StoreKit framework reference via entitlements
  // IAP doesn't need a specific entitlement, but we ensure
  // the StoreKit capability is present by adding the standard
  // in-app payments entitlement (used for Apple Pay / IAP)
  config = withEntitlementsPlist(config, (config) => {
    // This entitlement enables In-App Purchase capability
    if (!config.modResults['com.apple.developer.in-app-payments']) {
      config.modResults['com.apple.developer.in-app-payments'] = [];
    }
    return config;
  });

  return config;
}

module.exports = withInAppPurchase;
