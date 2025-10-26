import { test, expect } from '@playwright/test';
import * as OTPAuth from "otpauth";
import { randomBytes } from 'crypto';
import crypto from 'crypto';

// Store TOTP secret for reuse across tests
let testUserTotpSecret = null;

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

  // Save the secret for use in other tests
  testUserTotpSecret = totp;

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

test('device flow authentication without redirect_uri', async ({ request }) => {
  // 1. Request device authorization
  const deviceAuthUrl = 'http://localhost:3080/device/auth';
  const deviceResponse = await request.post(deviceAuthUrl, {
    form: {
      client_id: 'llm-mail-sorter',
      scope: 'openid email profile',
    },
  });

  expect(deviceResponse.ok(), `Device authorization failed: ${await deviceResponse.text()}`).toBe(true);
  const deviceData = await deviceResponse.json();

  expect(deviceData).toHaveProperty('device_code');
  expect(deviceData).toHaveProperty('user_code');
  expect(deviceData).toHaveProperty('verification_uri');
  expect(deviceData).toHaveProperty('expires_in');

  console.log('Device code response:', deviceData);
});

test('device flow complete authentication flow', async ({ page, request }) => {
  // 1. Request device authorization
  const deviceAuthUrl = 'http://localhost:3080/device/auth';
  const deviceResponse = await request.post(deviceAuthUrl, {
    form: {
      client_id: 'llm-mail-sorter',
      scope: 'openid email profile',
    },
  });

  expect(deviceResponse.ok(), `Device authorization failed: ${await deviceResponse.text()}`).toBe(true);
  const deviceData = await deviceResponse.json();

  const { device_code, user_code, verification_uri } = deviceData;

  // 2. User navigates to verification URI and enters user code
  const verificationUrl = `${verification_uri}?user_code=${user_code}`;
  await page.goto(verificationUrl);

  // 3. Expect to be on device confirmation page, then confirm
  await expect(page).toHaveURL(/.*localhost:3080\/device.*/);

  // Look for and click the confirm/continue button on the device page
  const confirmButton = page.locator('button[type="submit"], form[method="post"] button');
  if (await confirmButton.count() > 0) {
    await confirmButton.first().click();
  }

  // 4. User logs in (after confirming device)
  await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

  // Use test credentials (test/test works in test mode)
  await page.fill('input[name="login"]', 'test');
  await page.fill('input[name="password"]', 'test');
  await page.click('button[type="submit"]');

  // 5. Handle TOTP (enrollment if first time, verification if already enrolled)
  await page.waitForURL(/.*localhost:3080\/interaction\/.*/, { timeout: 10000 });

  const currentUrl = page.url();
  if (currentUrl.includes('/totp')) {
    // Check if there's a QR code (enrollment) or just a token input (verification)
    const qrCode = page.locator('img[data-uri]');
    const qrCodeCount = await qrCode.count();

    if (qrCodeCount > 0) {
      // Enrollment case: scan QR and save secret
      const otpauthUri = await qrCode.getAttribute('data-uri');
      const totp = OTPAuth.URI.parse(otpauthUri);
      testUserTotpSecret = totp; // Save for future tests
      await page.fill('input[name="token"]', totp.generate());
      await page.click('button[type="submit"]');
    } else if (testUserTotpSecret) {
      // Verification case: use saved secret
      await page.fill('input[name="token"]', testUserTotpSecret.generate());
      await page.click('button[type="submit"]');
    } else {
      throw new Error('TOTP verification required but no secret available');
    }
  }

  // 6. Handle consent
  await page.waitForURL(/.*localhost:3080\/interaction\/.*/, { timeout: 5000 });

  // Submit consent form
  const consentButton = page.locator('button[type="submit"]').first();
  await consentButton.click();

  // 7. Wait for completion - should redirect to success page or close
  await page.waitForTimeout(3000); // Give time for the authorization to complete

  // 8. Poll the token endpoint
  const tokenUrl = 'http://localhost:3080/token';
  let tokenData;
  let attempts = 0;
  const maxAttempts = 15;

  while (attempts < maxAttempts) {
    const tokenResponse = await request.post(tokenUrl, {
      form: {
        client_id: 'llm-mail-sorter',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device_code,
      },
    });

    tokenData = await tokenResponse.json();

    if (tokenResponse.ok()) {
      console.log('Token retrieved successfully on attempt', attempts + 1);
      break;
    }

    if (tokenData.error === 'authorization_pending') {
      console.log(`Attempt ${attempts + 1}: Authorization still pending...`);
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      continue;
    }

    // If we get any other error, fail the test
    console.error('Token exchange error:', tokenData);
    expect(tokenResponse.ok(), `Token exchange failed: ${JSON.stringify(tokenData)}`).toBe(true);
    break;
  }

  // 8. Assert token response
  expect(tokenData).toHaveProperty('access_token');
  expect(tokenData).toHaveProperty('id_token');
  expect(tokenData).toHaveProperty('token_type', 'Bearer');
});
