import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testAuthServer;

test.beforeAll(async () => {
  console.log('Starting test client server...');
  testAuthServer = spawn('node', ['test/testauth.mjs'], {
    detached: true,
  });
  testAuthServer.stdout.on('data', (data) => {
    console.log(`Test Client: ${data}`);
  });
  testAuthServer.stderr.on('data', (data) => {
    console.error(`Test Client ERROR: ${data}`);
  });
  // Give the server time to start
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  console.log('Stopping test client server...');
  try {
    process.kill(-testAuthServer.pid);
  } catch (e) {
    // Ignore errors if the process is already dead
  }
});

test('enrollment flow', async ({ page }) => {
  // Mock the authentication
  await page.goto('http://localhost:3001/mock-auth');
  await expect(page.locator('body')).toHaveText('Auth mocked');

  // Now, start the login flow
  await page.goto('http://localhost:3001/login');

  // We expect to be redirected to the OIDC provider
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  // Now, let's fill in the login form
  await page.fill('input[name="login"]', 'testuser');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // After login, we should be on the consent page
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  // Now, let's submit the consent form
  await page.click('button[type="submit"]');

  // After consent, we should be redirected back to the client
  await expect(page).toHaveURL(/.*localhost:3001\/cb\?.*/);

  // The client should show a success message
  const content = await page.textContent('body');
  expect(content).toContain('Authentication successful');
});
