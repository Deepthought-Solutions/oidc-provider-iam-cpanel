import { test, expect } from '@playwright/test';
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

test('successful uapi authentication', async ({ page }) => {
  // Go to the test client
  await page.goto('http://localhost:3001/login');

  // We expect to be redirected to the OIDC provider's login page
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  // Fill in the login form
  await page.fill('input[name="login"]', 'user@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // After login, we should be on the TOTP enrollment page
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*\/totp/);
});

test('failed uapi authentication', async ({ page }) => {
  // Go to the test client
  await page.goto('http://localhost:3001/login');

  // We expect to be redirected to the OIDC provider's login page
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  // Fill in the login form with wrong password
  await page.fill('input[name="login"]', 'user@example.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');

  // After login, we should still be on the login page, and an error should be displayed
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);
  const error = await page.textContent('p[style="color: red;"]');
  expect(error).toContain('Invalid credentials');
});
