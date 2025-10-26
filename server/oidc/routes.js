/* eslint-disable no-console, camelcase, no-unused-vars */
import { strict as assert } from 'node:assert';
import * as querystring from 'node:querystring';
import * as crypto from 'node:crypto';
import { inspect, promisify } from 'node:util';

import * as oidc from 'openid-client';
import isEmpty from 'lodash/isEmpty.js';
import { koaBody as bodyParser } from 'koa-body';
import Router from '@koa/router';
import * as qrcode from 'qrcode';

import * as helpers from './helpers.js';
import * as totp from './totp.js';
import Account from './account.js';
import { errors } from 'oidc-provider';
import * as upstreamProviders from './upstream_providers.js';

const hkdf = promisify(crypto.hkdf);
const keys = new Set();
const debug = (obj) => querystring.stringify(Object.entries(obj).reduce((acc, [key, value]) => {
  keys.add(key);
  if (isEmpty(value)) return acc;
  acc[key] = inspect(value, { depth: null });
  return acc;
}, {}), '<br/>', ': ', {
  encodeURIComponent(value) { return keys.has(value) ? `<strong>${value}</strong>` : value; },
});

const { SessionNotFound } = errors;

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

let google;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  google = await oidc.discovery(new URL('https://accounts.google.com'), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
}

export default (provider) => {
  const router = new Router();

  router.use(async (ctx, next) => {
    ctx.set('cache-control', 'no-store');
    try {
      await next();
    } catch (err) {
      if (err instanceof SessionNotFound) {
        ctx.status = err.status;
        const { message: error, error_description } = err;
        await helpers.renderError(ctx, { error, error_description }, err);
      } else {
        throw err;
      }
    }
  });

  router.get('/interaction/:uid', async (ctx, next) => {
    const {
      uid, prompt, params, session,
    } = await provider.interactionDetails(ctx.req, ctx.res);
    const client = await provider.Client.find(params.client_id);

    switch (prompt.name) {
      case 'login': {
        // Fetch enabled upstream providers
        const enabledProviders = await upstreamProviders.getEnabledProviders();

        return ctx.render('login', {
          client,
          uid,
          details: prompt.details,
          params,
          title: 'Sign-in',
          google,
          upstreamProviders: enabledProviders,
          session: session ? debug(session) : undefined,
          dbg: {
            params: debug(params),
            prompt: debug(prompt),
          },
        });
      }
      case 'consent': {
        return ctx.render('interaction', {
          client,
          uid,
          details: prompt.details,
          params,
          title: 'Authorize',
          session: session ? debug(session) : undefined,
          dbg: {
            params: debug(params),
            prompt: debug(prompt),
          },
        });
      }
      default:
        return next();
    }
  });

  router.get('/interaction/:uid/totp', async (ctx, next) => {
    const { uid, prompt, params, session } = await provider.interactionDetails(ctx.req, ctx.res);
    const client = await provider.Client.find(params.client_id);

    if (prompt.name !== 'totp') {
      return next();
    }

    const { accountId } = session;
    const account = await Account.findByUID(accountId);

    if (prompt.details.totp === 'enroll') {
      const uri = await totp.getOrCreateSecretUri(accountId, account.profile.email);
      const qrCodeDataUri = await qrcode.toDataURL(uri);

      return ctx.render('totp_enroll', {
        client,
        uid,
        details: prompt.details,
        params,
        title: 'Setup Two-Factor Authentication',
        qrCodeDataUri,
        uri,
        error: null,
        session: session ? debug(session) : undefined,
        dbg: {
          params: debug(params),
          prompt: debug(prompt),
        },
      });
    }

    return ctx.render('totp_verify', {
      client,
      uid,
      details: prompt.details,
      params,
      title: 'Two-Factor Authentication',
      error: null,
      session: session ? debug(session) : undefined,
      dbg: {
        params: debug(params),
        prompt: debug(prompt),
      },
    });
  });

  const body = bodyParser({
    text: false, json: false, patchNode: true, patchKoa: true,
  });

  router.post('/interaction/:uid/totp/enroll', body, async (ctx) => {
    const { uid, prompt, params, session } = await provider.interactionDetails(ctx.req, ctx.res);
    const client = await provider.Client.find(params.client_id);

    const { accountId } = session;
    const { token } = ctx.request.body;

    const isValid = await totp.verifyToken(accountId, token);

    if (isValid) {
      console.log(ctx.oidc)
      const result = { login: { accountId }, totp: { verified: true, enrolled: true } };
      return provider.interactionFinished(ctx.req, ctx.res, result, {
        mergeWithLastSubmission: true,
      });
    }

    const account = await Account.findByUID(accountId);
    const uri = await totp.getOrCreateSecretUri(accountId, account.profile.email);
    const qrCodeDataUri = await qrcode.toDataURL(uri);

    return ctx.render('totp_enroll', {
      client,
      uid,
      details: prompt.details,
      params,
      title: 'Setup Two-Factor Authentication',
      qrCodeDataUri,
      error: 'Invalid code, please try again.',
      session: session ? debug(session) : undefined,
      dbg: {
        params: debug(params),
        prompt: debug(prompt),
      },
    });
  });

  router.post('/interaction/:uid/totp/verify', body, async (ctx) => {
    const { uid, prompt, params, session } = await provider.interactionDetails(ctx.req, ctx.res);
    const client = await provider.Client.find(params.client_id);
      // console.log(ctx)
      // console.log(session)

    const { accountId } = session;
    const { token } = ctx.request.body;

    const isValid = await totp.verifyToken(accountId, token);

    if (isValid) {
      // console.log(ctx)
      const result = { login: { accountId }, totp: { verified: true } };
      return provider.interactionFinished(ctx.req, ctx.res, result, {
        mergeWithLastSubmission: true,
      });
    }

    return ctx.render('totp_verify', {
      client,
      uid,
      details: prompt.details,
      params,
      title: 'Two-Factor Authentication',
      error: 'Invalid code, please try again.',
      session: session ? debug(session) : undefined,
      dbg: {
        params: debug(params),
        prompt: debug(prompt),
      },
    });
  });

  router.post('/interaction/:uid/login', body, async (ctx) => {
    const { prompt: { name } } = await provider.interactionDetails(ctx.req, ctx.res);
    assert.equal(name, 'login');
    try {
      const account = await Account.authenticate(ctx.request.body.login, ctx.request.body.password);
      const result = {
        login: {
          accountId: account.accountId,
        },
      };

      return provider.interactionFinished(ctx.req, ctx.res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      const {
        uid, prompt, params, session,
      } = await provider.interactionDetails(ctx.req, ctx.res);
      const client = await provider.Client.find(params.client_id);
      return ctx.render('login', {
        client,
        uid,
        details: prompt.details,
        params,
        title: 'Sign-in',
        error: { message: 'Invalid credentials' },
        google,
        session: session ? debug(session) : undefined,
        dbg: {
          params: debug(params),
          prompt: debug(prompt),
        },
      });
    }
  });

  // Dynamic federated provider routes
  // POST /interaction/:uid/federated - Initiate federation with selected provider
  router.post('/interaction/:uid/federated', body, async (ctx) => {
    const { prompt: { name } } = await provider.interactionDetails(ctx.req, ctx.res);
    assert.equal(name, 'login');

    const providerName = ctx.request.body.provider;
    if (!providerName) {
      ctx.status = 400;
      ctx.body = { error: 'Provider not specified' };
      return;
    }

    const providerConfig = await upstreamProviders.getProvider(providerName);
    if (!providerConfig) {
      ctx.status = 404;
      ctx.body = { error: 'Provider not found or disabled' };
      return;
    }

    // Generate PKCE code verifier using HKDF
    const code_verifier = Buffer.from(
      await hkdf(
        'sha256',
        providerConfig.client_secret || 'default-secret',
        ctx.params.uid,
        providerConfig.client_id,
        32,
      ),
    ).toString('base64url');

    // Store code_verifier in session for later retrieval
    // Using interaction UID as the key
    if (!ctx.session) {
      ctx.session = {};
    }
    ctx.session[`pkce_${ctx.params.uid}`] = code_verifier;
    ctx.session[`provider_${ctx.params.uid}`] = providerName;

    const callbackUrl = new URL(`/interaction/callback/${providerName}`, ctx.request.URL.origin);
    const client = await upstreamProviders.initializeClient(providerConfig, callbackUrl.toString());

    const authUrl = await upstreamProviders.buildAuthorizationUrl(
      client,
      callbackUrl.toString(),
      ctx.params.uid, // state
      code_verifier
    );

    ctx.status = 303;
    ctx.redirect(authUrl);
  });

  // GET /interaction/callback/:provider - Callback from upstream provider
  router.get('/interaction/callback/:provider', async (ctx) => {
    const providerName = ctx.params.provider;

    // Redirect to federated handler with state (interaction UID)
    const target = new URL(ctx.request.URL);
    target.pathname = `/interaction/${ctx.query.state}/federated/${providerName}`;
    ctx.redirect(target);
  });

  // GET /interaction/:uid/federated/:provider - Handle callback and complete auth
  router.get('/interaction/:uid/federated/:provider', async (ctx) => {
    const { prompt: { name } } = await provider.interactionDetails(ctx.req, ctx.res);
    assert.equal(name, 'login');

    const providerName = ctx.params.provider;
    const providerConfig = await upstreamProviders.getProvider(providerName);

    if (!providerConfig) {
      ctx.status = 404;
      ctx.body = { error: 'Provider not found' };
      return;
    }

    // Retrieve code_verifier from session
    const code_verifier = ctx.session?.[`pkce_${ctx.params.uid}`];
    if (!code_verifier) {
      ctx.status = 400;
      ctx.body = { error: 'PKCE verifier not found in session' };
      return;
    }

    const callbackUrl = new URL(`/interaction/callback/${providerName}`, ctx.request.URL.origin);
    const client = await upstreamProviders.initializeClient(providerConfig, callbackUrl.toString());

    // Exchange code for tokens
    const tokenResult = await upstreamProviders.exchangeCode(
      client,
      callbackUrl.toString(),
      ctx.query,
      code_verifier,
      ctx.params.uid
    );

    // Clean up session
    delete ctx.session[`pkce_${ctx.params.uid}`];
    delete ctx.session[`provider_${ctx.params.uid}`];

    // Find or create account from federated identity
    const { account, requiresVerification } = await Account.findByFederated(
      providerName,
      tokenResult.claims
    );

    if (requiresVerification) {
      // Store federated claims in session for verification
      ctx.session[`federated_claims_${ctx.params.uid}`] = {
        provider: providerName,
        claims: tokenResult.claims,
        accountId: account.accountId,
      };

      // Redirect to verification page
      return ctx.redirect(`/interaction/${ctx.params.uid}/federated/verify`);
    }

    // No verification needed - complete interaction
    const result = {
      login: {
        accountId: account.accountId,
      },
    };

    return provider.interactionFinished(ctx.req, ctx.res, result, {
      mergeWithLastSubmission: false,
    });
  });

  // GET /interaction/:uid/federated/verify - Show verification form for owned domains
  router.get('/interaction/:uid/federated/verify', async (ctx) => {
    const { uid, prompt, params, session } = await provider.interactionDetails(ctx.req, ctx.res);
    const client = await provider.Client.find(params.client_id);

    const federatedData = ctx.session?.[`federated_claims_${uid}`];
    if (!federatedData) {
      ctx.status = 400;
      ctx.body = { error: 'No pending federated verification' };
      return;
    }

    return ctx.render('federated_verify', {
      client,
      uid,
      details: prompt.details,
      params,
      title: 'Verify Account Ownership',
      provider: federatedData.provider,
      email: federatedData.claims.email,
      error: null,
      session: session ? debug(session) : undefined,
    });
  });

  // POST /interaction/:uid/federated/verify - Verify ownership with password
  router.post('/interaction/:uid/federated/verify', body, async (ctx) => {
    const { password } = ctx.request.body;
    const { uid, prompt, params, session } = await provider.interactionDetails(ctx.req, ctx.res);
    const client = await provider.Client.find(params.client_id);

    const federatedData = ctx.session?.[`federated_claims_${uid}`];
    if (!federatedData) {
      ctx.status = 400;
      ctx.body = { error: 'No pending federated verification' };
      return;
    }

    try {
      // Verify password for the account
      const account = await Account.authenticate(
        federatedData.claims.email,
        password
      );

      // Verify federated identity
      await Account.verifyFederatedIdentity(
        account.accountId,
        federatedData.provider,
        federatedData.claims.sub
      );

      // Clean up session
      delete ctx.session[`federated_claims_${uid}`];

      // Complete interaction
      const result = {
        login: {
          accountId: account.accountId,
        },
      };

      return provider.interactionFinished(ctx.req, ctx.res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      return ctx.render('federated_verify', {
        client,
        uid,
        details: prompt.details,
        params,
        title: 'Verify Account Ownership',
        provider: federatedData.provider,
        email: federatedData.claims.email,
        error: { message: 'Invalid password. Please try again.' },
        session: session ? debug(session) : undefined,
      });
    }
  });

  router.post('/interaction/:uid/confirm', body, async (ctx) => {
    const interactionDetails = await provider.interactionDetails(ctx.req, ctx.res);
    const { prompt: { name, details }, params, session: { accountId } } = interactionDetails;
    assert.equal(name, 'consent');

    let { grantId } = interactionDetails;
    let grant;

    if (grantId) {
      // we'll be modifying existing grant in existing session
      grant = await provider.Grant.find(grantId);
    } else {
      // we're establishing a new grant
      grant = new provider.Grant({
        accountId,
        clientId: params.client_id,
      });
    }

    if (details.missingOIDCScope) {
      grant.addOIDCScope(details.missingOIDCScope.join(' '));
    }
    if (details.missingOIDCClaims) {
      grant.addOIDCClaims(details.missingOIDCClaims);
    }
    if (details.missingResourceScopes) {
      for (const [indicator, scope] of Object.entries(details.missingResourceScopes)) {
        grant.addResourceScope(indicator, scope.join(' '));
      }
    }
    if (details.rar) {
      for (const rar of details.rar) {
        grant.addRar(rar);
      }
    }

    grantId = await grant.save();

    const consent = {};
    if (!interactionDetails.grantId) {
      // we don't have to pass grantId to consent, we're just modifying existing one
      consent.grantId = grantId;
    }

    const result = { consent };
    return provider.interactionFinished(ctx.req, ctx.res, result, {
      mergeWithLastSubmission: true,
    });
  });

  router.get('/interaction/:uid/abort', async (ctx) => {
    const result = {
      error: 'access_denied',
      error_description: 'End-User aborted interaction',
    };

    return provider.interactionFinished(ctx.req, ctx.res, result, {
      mergeWithLastSubmission: false,
    });
  });

  return router;
};