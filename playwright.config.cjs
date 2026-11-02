const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.spec.cjs', timeout: 60_000, expect: { timeout: 10_000 },
  retries: 0, reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results', workers: 1
});
