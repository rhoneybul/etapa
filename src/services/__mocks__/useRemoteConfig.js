/**
 * Mock hook returning a stable config snapshot for tests.
 */
module.exports = {
  __esModule: true,
  useRemoteConfig: () => ({
    maintenanceMode: false,
    forceUpgrade: false,
    paywallEnabled: true,
    beginnerProgramEnabled: true,
    loading: false,
  }),
  default: () => ({
    maintenanceMode: false,
    forceUpgrade: false,
    paywallEnabled: true,
    beginnerProgramEnabled: true,
    loading: false,
  }),
};
