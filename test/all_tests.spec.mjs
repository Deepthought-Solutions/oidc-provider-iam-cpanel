import { test, expect } from '@playwright/test';
import * as OTPAuth from "otpauth";
import { randomBytes } from 'crypto';
import crypto from 'crypto';

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

  // After consent, we should be redirected back to the client, which in turn redirects to the home page.
  await expect(page).toHaveURL('http://localhost:3001/');

  // The client should show a success message
  const content = await page.textContent('body');
  expect(content).toContain('Your email is test');
});

const nativeClient = {
    client_id: 'org.test.app',
    application_type: 'native',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    redirect_uris: ['org.test.app://auth'],
    token_endpoint_auth_method: 'none',
};

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
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('code_challenge', code_challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // 3. Set up a route handler to intercept the final redirect.
  let resolveRedirectPromise;
  const redirectPromise = new Promise(resolve => {
    resolveRedirectPromise = resolve;
  });
  let redirectedUrl;
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith(nativeClient.redirect_uris[0])) {
      redirectedUrl = url;
      resolveRedirectPromise(url);
    }
  });

  // 4. Navigate and login
  await page.goto(authUrl.toString());
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);
  await page.fill('input[name="login"]', 'user@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // 5. Handle TOTP enrollment
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*\/totp/);
  const otpauthUri = await page.locator('img').getAttribute('data-uri');
  const totp = OTPAuth.URI.parse(otpauthUri);
  await page.fill('input[name="token"]', totp.generate());
  await page.click('button[type="submit"]');

  // 6. Handle consent
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);
  await page.click('button[type="submit"]');

  // 7. Wait for the redirect to be captured by the route handler
  await redirectPromise;

  expect(redirectedUrl).toBeDefined();
  const code = new URL(redirectedUrl).searchParams.get('code');
  expect(code).toBeDefined();

  // 8. Exchange code for token
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

  // 9. Assert token response
  const tokenData = await tokenResponse.json();
  expect(tokenResponse.ok, `Token exchange failed: ${JSON.stringify(tokenData)}`).toBe(true);
  expect(tokenData).toHaveProperty('access_token');
  expect(tokenData).toHaveProperty('id_token');
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
