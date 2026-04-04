/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterSetup: ['./__tests__/setup.js'],
  testTimeout: 15000,
  // Run tests sequentially — they share a DB
  maxWorkers: 1,
};
