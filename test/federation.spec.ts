import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';
import { sequelize } from '../server/oidc/db_adapter.js';
import { UpstreamProvider } from '../server/oidc/upstream_providers.js';
import { FederatedIdentity, accountTable } from '../server/oidc/account.js';
import { MockManager } from './helpers/mocks.js';

let mocks: MockManager;

test.beforeEach(async () => {
  mocks = new MockManager();
  mocks.mockInitializeClient();

  // Reset mock LinkedIn to default scenario (external domain user)
  try {
    await fetch('http://localhost:3080/test/mock-linkedin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'external' }),
    });
  } catch (e) {
    // Server may not be running yet, ignore
  }
});

test.afterEach(() => {
  mocks.restore();
});

test.afterAll(async () => {
  console.log('Stopping test server...');
  try {
    execSync("pkill -f 'node test/run.mjs'");
  } catch (e) {
    // Ignore errors if the process is already dead
  }
});

// Mock data
const mockLinkedInTokenResponse = {
  access_token: 'mock_linkedin_access_token',
  id_token: 'mock_linkedin_id_token',
  token_type: 'Bearer',
  expires_in: 3600,
};

const mockLinkedInUserinfo = {
  sub: 'linkedin_user_12345',
  email: 'john.doe@external.com',
  name: 'John Doe',
  given_name: 'John',
  family_name: 'Doe',
  picture: 'https://media.linkedin.com/photo.jpg',
  email_verified: true,
};

const mockLinkedInOwnedDomainUserinfo = {
  sub: 'linkedin_user_67890',
  email: 'jane.smith@localhost',
  name: 'Jane Smith',
  given_name: 'Jane',
  family_name: 'Smith',
  email_verified: true,
};

test.describe('Federation Flow - External Domain', () => {
  test.beforeEach(async () => {
    mocks.mockAllDomainsExternal();

    await UpstreamProvider.create({
      name: 'linkedin',
      display_name: 'LinkedIn',
      type: 'oidc',
      client_id: 'mock_linkedin_client_id',
      client_secret: 'mock_linkedin_client_secret',
      discovery_url: 'http://localhost:3080/test/mock-linkedin',
      scopes: 'openid profile email',
      button_color: '#0077B5',
      enabled: true,
      sort_order: 10,
    });
  });

  test.afterEach(async () => {
    await FederatedIdentity.destroy({ where: {} });
    await accountTable.destroy({ where: { email: 'john.doe@external.com' } });
    await UpstreamProvider.destroy({ where: { name: 'linkedin' } });
  });

  test('should display LinkedIn provider button on login page', async ({ page }: { page: Page }) => {
    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    const linkedinButton = page.locator('button:has-text("Continuer avec LinkedIn")');
    await expect(linkedinButton).toBeVisible();
  });

  test('should auto-create account for external domain email', async ({ page }: { page: Page }) => {
    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    // Click LinkedIn button - this submits the form and starts OAuth flow
    await page.click('button:has-text("Continuer avec LinkedIn")');

    // Wait for OAuth flow: form POST -> auth endpoint -> callback -> federated handler
    // The flow should eventually land on /interaction/:uid/federated/:provider
    await page.waitForURL(/.*\/interaction\/.*\/federated\/linkedin/, { timeout: 15000 });

    // Wait for the federated flow to complete (should redirect back to interaction)
    await page.waitForURL(/.*\/interaction\/[^\/]+$/, { timeout: 15000 });
    await page.waitForTimeout(1000); // Give time for async DB operations

    const account = await accountTable.findOne({
      where: { email: 'john.doe@external.com' },
    });
    expect(account).not.toBeNull();

    const federatedIdentity = await FederatedIdentity.findOne({
      where: {
        account_uid: account!.uid,
        provider_name: 'linkedin',
        provider_subject: 'linkedin_user_12345',
      },
    });
    expect(federatedIdentity).not.toBeNull();
    expect(federatedIdentity!.verified).toBe(true);
    expect(federatedIdentity!.provider_email).toBe('john.doe@external.com');
  });

  test('should link existing account with same email', async ({ page }: { page: Page }) => {
    const existingAccount = await accountTable.create({
      email: 'john.doe@external.com',
      password: null,
    });

    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    // Click LinkedIn button
    await page.click('button:has-text("Continuer avec LinkedIn")');

    // Wait for OAuth flow to complete
    await page.waitForURL(/.*\/interaction\/.*\/federated\/linkedin/, { timeout: 15000 });
    await page.waitForURL(/.*\/interaction\/[^\/]+$/, { timeout: 15000 });
    await page.waitForTimeout(1000);

    const federatedIdentity = await FederatedIdentity.findOne({
      where: {
        account_uid: existingAccount.uid,
        provider_name: 'linkedin',
      },
    });
    expect(federatedIdentity).not.toBeNull();
    expect(federatedIdentity!.verified).toBe(true);

    const accountCount = await accountTable.count({
      where: { email: 'john.doe@external.com' },
    });
    expect(accountCount).toBe(1);

    await accountTable.destroy({ where: { uid: existingAccount.uid } });
  });
});

test.describe('Federation Flow - Owned Domain', () => {
  test.beforeEach(async () => {
    mocks.mockDomainVerification(async (email: string) => {
      return email.endsWith('@localhost');
    });

    await UpstreamProvider.create({
      name: 'linkedin',
      display_name: 'LinkedIn',
      type: 'oidc',
      client_id: 'mock_linkedin_client_id',
      client_secret: 'mock_linkedin_client_secret',
      discovery_url: 'http://localhost:3080/test/mock-linkedin',
      scopes: 'openid profile email',
      enabled: true,
      sort_order: 10,
    });
  });

  test.afterEach(async () => {
    await FederatedIdentity.destroy({ where: {} });
    await accountTable.destroy({ where: { email: 'jane.smith@localhost' } });
    await UpstreamProvider.destroy({ where: { name: 'linkedin' } });
  });

  test('should require password verification for owned domain', async ({ page }: { page: Page }) => {
    // Configure mock to return owned domain user
    await fetch('http://localhost:3080/test/mock-linkedin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'owned' }),
    });

    const crypto = await import('crypto');
    const password = 'secure_password';
    const hashedPassword = crypto.createHash('sha512').update(password).digest('hex');

    const existingAccount = await accountTable.create({
      email: 'jane.smith@localhost',
      password: hashedPassword,
    });

    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    // Click LinkedIn button
    await page.click('button:has-text("Continuer avec LinkedIn")');

    // Wait for redirect to verification page
    await page.waitForURL(/.*\/interaction\/.*\/federated\/verify/, { timeout: 15000 });

    const warningText = await page.textContent('.warning');
    expect(warningText).toContain('Security Verification Required');
    expect(warningText).toContain('jane.smith@localhost');

    const federatedIdentity = await FederatedIdentity.findOne({
      where: {
        account_uid: existingAccount.uid,
        provider_name: 'linkedin',
      },
    });
    expect(federatedIdentity).not.toBeNull();
    expect(federatedIdentity!.verified).toBe(false);

    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL(/.*localhost:3080\/interaction\/.*/);

    await federatedIdentity!.reload();
    expect(federatedIdentity!.verified).toBe(true);

    await accountTable.destroy({ where: { uid: existingAccount.uid } });
  });

  test('should reject wrong password for owned domain', async ({ page }: { page: Page }) => {
    // Configure mock to return owned domain user
    await fetch('http://localhost:3080/test/mock-linkedin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'owned' }),
    });

    const crypto = await import('crypto');
    const password = 'secure_password';
    const hashedPassword = crypto.createHash('sha512').update(password).digest('hex');

    const existingAccount = await accountTable.create({
      email: 'jane.smith@localhost',
      password: hashedPassword,
    });

    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    await page.click('button:has-text("Continuer avec LinkedIn")');
    await page.waitForURL(/.*\/interaction\/.*\/federated\/verify/, { timeout: 15000 });

    await page.fill('input[name="password"]', 'wrong_password');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*\/federated\/verify/);
    const errorText = await page.textContent('.error');
    expect(errorText).toContain('Invalid password');

    const federatedIdentity = await FederatedIdentity.findOne({
      where: {
        account_uid: existingAccount.uid,
        provider_name: 'linkedin',
      },
    });
    expect(federatedIdentity!.verified).toBe(false);

    await accountTable.destroy({ where: { uid: existingAccount.uid } });
  });

  test('should reject owned domain email without existing account', async ({ page }: { page: Page }) => {
    // Configure mock to return owned domain user
    await fetch('http://localhost:3080/test/mock-linkedin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'owned' }),
    });

    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    await page.click('button:has-text("Continuer avec LinkedIn")');

    // Should show error/verification page for owned domain without existing account
    await page.waitForURL(/.*\/interaction\/.*\/federated\/verify/, { timeout: 15000 });
    const pageText = await page.textContent('body');
    expect(pageText).toContain('jane.smith@localhost');
  });
});

test.describe('Federation Flow - Returning User', () => {
  test.beforeEach(async () => {
    mocks.mockAllDomainsExternal();

    await UpstreamProvider.create({
      name: 'linkedin',
      display_name: 'LinkedIn',
      type: 'oidc',
      client_id: 'mock_linkedin_client_id',
      client_secret: 'mock_linkedin_client_secret',
      discovery_url: 'http://localhost:3080/test/mock-linkedin',
      scopes: 'openid profile email',
      enabled: true,
      sort_order: 10,
    });
  });

  test.afterEach(async () => {
    await FederatedIdentity.destroy({ where: {} });
    await accountTable.destroy({ where: { email: 'john.doe@external.com' } });
    await UpstreamProvider.destroy({ where: { name: 'linkedin' } });
  });

  test('should login returning user without re-verification', async ({ page }: { page: Page }) => {
    const existingAccount = await accountTable.create({
      email: 'john.doe@external.com',
      password: null,
    });

    await FederatedIdentity.create({
      account_uid: existingAccount.uid,
      provider_name: 'linkedin',
      provider_subject: 'linkedin_user_12345',
      provider_email: 'john.doe@external.com',
      claims_json: mockLinkedInUserinfo,
      verified: true,
      last_used_at: new Date(),
    });

    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    await page.click('button:has-text("Continuer avec LinkedIn")');

    // Should complete OAuth flow without verification prompt
    await page.waitForURL(/.*\/interaction\/.*\/federated\/linkedin/, { timeout: 15000 });
    await page.waitForURL(/.*\/interaction\/[^\/]+$/, { timeout: 15000 });
    expect(page.url()).not.toContain('/federated/verify');

    const federatedIdentity = await FederatedIdentity.findOne({
      where: {
        account_uid: existingAccount.uid,
        provider_name: 'linkedin',
      },
    });
    expect(federatedIdentity!.last_used_at).not.toBeNull();

    await accountTable.destroy({ where: { uid: existingAccount.uid } });
  });
});

test.describe('Multiple Providers', () => {
  test.beforeEach(async () => {
    mocks.mockAllDomainsExternal();

    await UpstreamProvider.bulkCreate([
      {
        name: 'linkedin',
        display_name: 'LinkedIn',
        type: 'oidc',
        client_id: 'mock_linkedin_client_id',
        client_secret: 'mock_linkedin_client_secret',
        discovery_url: 'http://localhost:3080/test/mock-linkedin',
        scopes: 'openid profile email',
        enabled: true,
        sort_order: 10,
      },
      {
        name: 'github',
        display_name: 'GitHub',
        type: 'oauth2',
        client_id: 'mock_github_client_id',
        client_secret: 'mock_github_client_secret',
        authorization_endpoint: 'https://github.com/login/oauth/authorize',
        token_endpoint: 'https://github.com/login/oauth/access_token',
        userinfo_endpoint: 'https://api.github.com/user',
        scopes: 'user:email',
        enabled: true,
        sort_order: 20,
      },
      {
        name: 'google',
        display_name: 'Google',
        type: 'oidc',
        client_id: 'mock_google_client_id',
        client_secret: 'mock_google_client_secret',
        discovery_url: 'https://accounts.google.com',
        scopes: 'openid email profile',
        enabled: false,
        sort_order: 30,
      },
    ]);
  });

  test.afterEach(async () => {
    await UpstreamProvider.destroy({ where: {} });
  });

  test('should display only enabled providers', async ({ page }: { page: Page }) => {
    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    await expect(page.locator('button:has-text("Continuer avec LinkedIn")')).toBeVisible();
    await expect(page.locator('button:has-text("Continuer avec GitHub")')).toBeVisible();
    await expect(page.locator('button:has-text("Continuer avec Google")')).not.toBeVisible();
  });

  test('should display providers in sort order', async ({ page }: { page: Page }) => {
    await page.goto('http://localhost:3001/login');
    await expect(page).toHaveURL(/.*localhost:3080\/interaction\/.*/);

    const buttons = await page.locator('.provider-button').allTextContents();

    const linkedinIndex = buttons.findIndex(text => text.includes('LinkedIn'));
    const githubIndex = buttons.findIndex(text => text.includes('GitHub'));

    expect(linkedinIndex).toBeLessThan(githubIndex);
  });
});
