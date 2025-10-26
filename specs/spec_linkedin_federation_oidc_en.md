# Specification: LinkedIn Federation — Integration with `node-oidc-provider`

## Purpose
Provide a detailed guide for enabling your Authorization Server (implemented with `node-oidc-provider`) to accept user authentication through **LinkedIn** (external IdP), normalize identity information, and issue OIDC tokens to your clients.

> Key concept: `node-oidc-provider` acts as an **OpenID Provider (OP)**. To federate an external Identity Provider (LinkedIn), you must implement an **upstream OAuth/OIDC client flow** inside `oidc-provider` interactions and map the external identity to a local account.

---

## Prerequisites
- LinkedIn Developer account + configured LinkedIn App (Client ID, Client Secret, Redirect URIs).
- Node.js (LTS version recommended).
- `node-oidc-provider` (latest stable release).
- OAuth/OIDC client library for connecting to LinkedIn, e.g., `openid-client` or `simple-oauth2`.
- Persistent storage for users and clients (Redis, MongoDB, SQL, or custom adapter).

---

## Architecture Overview

1. A client (SPA or backend) initiates an OIDC request to your Authorization Server (`node-oidc-provider`).
2. The AS starts a *login interaction*; if the user selects "Sign in with LinkedIn":
   - The AS redirects the OAuth/OIDC flow to LinkedIn.
3. LinkedIn authenticates the user and redirects back to your AS callback.
4. The AS exchanges the code for a LinkedIn token, fetches the user profile, then:
   - Maps or provisions a **local account**.
   - Issues an `id_token` / `access_token` / `refresh_token` to the **original OIDC client**.

Flow: Client → AS → LinkedIn → AS → Client.

---

## LinkedIn Endpoints
- Authorization endpoint: `https://www.linkedin.com/oauth/v2/authorization`
- Token endpoint: `https://www.linkedin.com/oauth/v2/accessToken`
- Userinfo endpoint: `https://api.linkedin.com/v2/userinfo`
- Typical scopes: `openid`, `r_liteprofile`, `r_emailaddress`

---

## `node-oidc-provider` Configuration

### Basic Setup
```js
import express from 'express';
import { Provider } from 'oidc-provider';

const issuer = 'https://auth.example.com';
const configuration = { clients: [], findAccount: async () => {} };

const app = express();
const provider = new Provider(issuer, configuration);

app.use('/oidc', provider.callback());
app.listen(3000);
```

### Key Components
- `findAccount`: returns a local user account from an `accountId`.
- `interactions`: defines the login flows and custom routes (e.g., “Login with LinkedIn”).
- `features`: enable PKCE, refresh tokens, and other options.
- `adapter`: persistent layer for tokens and sessions (Redis, MongoDB, etc.).

---

## LinkedIn Integration

### 1. Start LinkedIn Authentication
```js
import { Issuer } from 'openid-client';

const linkedinIssuer = await Issuer.discover('https://www.linkedin.com');
const client = new linkedinIssuer.Client({
  client_id: LINKEDIN_CLIENT_ID,
  client_secret: LINKEDIN_CLIENT_SECRET,
  redirect_uris: ['https://auth.example.com/auth/linkedin/callback'],
  response_types: ['code'],
});

function startLinkedInAuth(req, res) {
  const url = client.authorizationUrl({
    scope: 'openid r_liteprofile r_emailaddress',
  });
  res.redirect(url);
}
```

### 2. LinkedIn Callback
```js
async function linkedinCallback(req, res) {
  const params = client.callbackParams(req);
  const tokenSet = await client.callback('https://auth.example.com/auth/linkedin/callback', params);
  const userinfo = await client.userinfo(tokenSet.access_token);
  // Map or create local account here
}
```

### 3. Local Account Mapping
```js
const configuration = {
  findAccount: async (ctx, id) => {
    const user = await Users.findById(id);
    return {
      accountId: user.id,
      async claims() {
        return { sub: user.id, name: user.name, email: user.email };
      }
    };
  },
};
```

### 4. Complete the Interaction
```js
await provider.interactionFinished(ctx.req, ctx.res, {
  login: { accountId: localAccountId },
  consent: {}
}, { mergeWithLastSubmission: false });
```

---

## Security Considerations
- Enable **PKCE** for public clients.
- Validate `state` and `nonce` to prevent CSRF and replay attacks.
- Never expose LinkedIn tokens to your relying parties.
- Keep LinkedIn `client_secret` in a secure secret manager.

---

## Implementation Checklist
1. Create a LinkedIn app and get the Client ID/Secret.
2. Configure `node-oidc-provider` with clients and `findAccount`.
3. Implement `/interaction/:uid`, `/auth/linkedin/start`, `/auth/linkedin/callback` routes.
4. Use `openid-client` to communicate with LinkedIn.
5. Map or provision users locally.
6. Finalize interaction and issue tokens.

---

## References
- [node-oidc-provider](https://github.com/panva/node-oidc-provider)
- [LinkedIn OpenID Connect Docs](https://learn.microsoft.com/linkedin/shared/authentication/)
