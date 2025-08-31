import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as OTPAuth from "otpauth";
import SequelizeAdapter, { sequelize } from '../server/oidc/db_adapter.js';
import { URLSearchParams } from 'url';

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

test('should exchange a token successfully', async () => {
  const adapter = new SequelizeAdapter('Client');
  await adapter.upsert('test-client-creds', {
    client_id: 'test-client-creds',
    client_secret: 'secret',
    grant_types: ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'],
    redirect_uris: [],
    response_types: [],
    token_endpoint_auth_method: 'client_secret_post',
  });

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', 'test-client-creds');
  params.append('client_secret', 'secret');

  const tokenResponse = await fetch('http://localhost:3080/token', {
    method: 'POST',
    body: params,
  });
  const tokenSet = await tokenResponse.json();
  expect(tokenSet.access_token).toBeDefined();

  const exchangeParams = new URLSearchParams();
  exchangeParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
  exchangeParams.append('subject_token', tokenSet.access_token);
  exchangeParams.append('subject_token_type', 'urn:ietf:params:oauth:token-type:access_token');
  exchangeParams.append('requested_token_type', 'urn:ietf:params:oauth:token-type:access_token');
  exchangeParams.append('client_id', 'test-client-creds');
  exchangeParams.append('client_secret', 'secret');

  const exchangeResponse = await fetch('http://localhost:3080/token', {
    method: 'POST',
    body: exchangeParams,
  });
  const exchangeTokenSet = await exchangeResponse.json();

  expect(exchangeTokenSet.access_token).toBeDefined();
  expect(exchangeTokenSet.access_token).not.toEqual(tokenSet.access_token);

  await adapter.destroy('test-client-creds');
  await sequelize.close().catch(() => {});
});
