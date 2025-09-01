import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'http://localhost:3001',
  },
  webServer: [
    {
      command: 'node test/run.mjs',
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        // DEBUG: 'pw:webserver',
        NODE_ENV: 'test',
        ISSUER_URL: 'http://localhost:3080'
      }
    }]
});
