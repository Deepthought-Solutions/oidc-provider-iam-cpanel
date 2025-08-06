import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'http://localhost:3001',
  },
  webServer: [
    {
      command: 'npm install && node test/run.mjs',
      url: 'http://localhost:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        // DEBUG: 'pw:webserver',
        NODE_ENV: 'test',
        ISSUER_URL: 'http://localhost:3080'
      }
    }]
});
