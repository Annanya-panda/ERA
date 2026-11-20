process.env.MONGOMS_DOWNLOAD_PROGRESS = 'false';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  testTimeout: 120000
};
