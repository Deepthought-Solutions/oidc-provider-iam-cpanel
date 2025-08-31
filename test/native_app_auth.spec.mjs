import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as OTPAuth from "otpauth";
import { clients } from './run.mjs';
import * as jose from 'jose';
import { randomBytes } from 'crypto';
import crypto from 'crypto';

const nativeClient = clients.find(c => c.application_type === 'native');

test.afterAll(async () => {
  console.log('Stopping test server...');
  try {
    execSync("pkill -f 'node -r dotenv/config test/run.mjs'");
  } catch (e) {
    // Ignore errors if the process is already dead
  }
});

test('successful native app authentication', async ({ page }) => {
  // 1. Generate PKCE code verifier and challenge
  const code_verifier = randomBytes(32).toString('hex');
  const digest = await new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    hash.update(code_verifier);
    resolve(hash.digest());
  });
  const code_challenge = Buffer.from(digest).toString('base64url');

  // 2. Construct authorization URL
  const authUrl = new URL('http://localhost:3080/auth');
  authUrl.searchParams.set('client_id', nativeClient.client_id);
  authUrl.searchParams.set('redirect_uri', nativeClient.redirect_uris[0]);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid');
  authUrl.searchParams.set('code_challenge', code_challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // 3. Navigate and login
  let redirectedUrl;
  page.on('request', request => {
    if (request.url().startsWith(nativeClient.redirect_uris[0])) {
      redirectedUrl = request.url();
      request.abort();
    }
  });

  await page.goto(authUrl.toString());
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  await page.fill('input[name="login"]', 'user@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // 4. Wait for redirect and extract code
  await page.waitForTimeout(1000); // Give time for the redirect to be caught
  expect(redirectedUrl).toBeDefined();

  const code = new URL(redirectedUrl).searchParams.get('code');
  expect(code).toBeDefined();

  // 5. Exchange code for token
  const tokenUrl = 'http://localhost:3080/token';
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: nativeClient.client_id,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: nativeClient.redirect_uris[0],
      code_verifier: code_verifier,
    }),
  });

  // 6. Assert token response
  expect(tokenResponse.ok).toBe(true);
  const tokenData = await tokenResponse.json();
  expect(tokenData).toHaveProperty('access_token');
  expect(tokenData).toHaveProperty('id_token');
});
