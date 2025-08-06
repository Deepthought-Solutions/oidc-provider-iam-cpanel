import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import { execSync } from 'child_process';
import * as OTPAuth from "otpauth";

test.afterAll(async () => {
  console.log('Stopping test server...');
  try {
    execSync("pkill -f 'node -r dotenv/config test/run.mjs'");
  } catch (e) {
    // Ignore errors if the process is already dead
  }
});

test('enrollment flow', async ({ page }) => {
  // Go to the test client
  await page.goto('http://localhost:3001/login');

  // We expect to be redirected to the OIDC provider's login page
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  // Fill in the login form
  await page.fill('input[name="login"]', 'test');
  await page.fill('input[name="password"]', 'test');
  await page.click('button[type="submit"]');

  // After login, we should be on the TOTP enrollment page
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*\/totp/);

  // Extract the TOTP secret from the QR code
  const otpauthUri = await page.locator('img').getAttribute('data-uri');
  const totp = OTPAuth.URI.parse(otpauthUri);

  // Fill in the TOTP form with a valid token
  await page.fill('input[name="token"]', totp.generate());
  await page.click('button[type="submit"]');

  // After TOTP enrollment, we should be on the consent page
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  // Submit the consent form
  await page.click('button[type="submit"]');

  // After consent, we should be redirected back to the client
  await expect(page).toHaveURL(/.*localhost:3001\/cb\?.*/);

  // The client should show a success message
  const content = await page.textContent('body');
  expect(content).toContain('Authentication successful');
});
