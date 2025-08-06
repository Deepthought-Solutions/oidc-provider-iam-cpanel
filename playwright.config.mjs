import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'http://localhost:3080',
  },
  globalSetup: './test/global-setup.mjs',
});
