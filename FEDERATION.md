# Upstream Federation Configuration

This document explains how to configure upstream identity providers (LinkedIn, Google, GitHub, etc.) for federated authentication.

## Overview

The OIDC Provider supports federation with external identity providers, allowing users to authenticate using their existing accounts from:

- **LinkedIn** (OIDC)
- **Google** (OIDC)
- **GitHub** (OAuth 2.0)
- **Facebook** (OIDC)
- **Microsoft** (OIDC)
- **Apple** (OIDC)

## Quick Start

1. **Configure providers via environment variables**
2. **Run migrations** to create tables and seed providers
3. **Providers appear automatically** on the login page

## Environment Variables

Configure each provider by setting these environment variables:

### LinkedIn
```bash
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

Create app at: https://www.linkedin.com/developers/apps
- Redirect URI: `https://your-domain.com/interaction/callback/linkedin`

### GitHub
```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

Create app at: https://github.com/settings/developers
- Authorization callback URL: `https://your-domain.com/interaction/callback/github`

### Google
```bash
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
```

Create app at: https://console.cloud.google.com/apis/credentials
- Authorized redirect URIs: `https://your-domain.com/interaction/callback/google`

### Facebook
```bash
FACEBOOK_CLIENT_ID=your_app_id
FACEBOOK_CLIENT_SECRET=your_app_secret
```

Create app at: https://developers.facebook.com/apps
- Valid OAuth Redirect URIs: `https://your-domain.com/interaction/callback/facebook`

### Microsoft
```bash
MICROSOFT_CLIENT_ID=your_application_id
MICROSOFT_CLIENT_SECRET=your_client_secret
```

Register app at: https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps
- Redirect URIs: `https://your-domain.com/interaction/callback/microsoft`

### Apple
```bash
APPLE_CLIENT_ID=your_service_id
APPLE_CLIENT_SECRET=your_client_secret
```

Configure at: https://developer.apple.com/account/resources/identifiers/list/serviceId
- Return URLs: `https://your-domain.com/interaction/callback/apple`

## Security: Account Linking Rules

The system implements domain-based security rules for account linking:

### External Domains (e.g., @gmail.com, @linkedin.com)
- ✅ **Auto-create account** - Trust external IdP verification
- ✅ **Immediate login** - No additional verification needed
- Users can log in with external provider immediately

### Owned Domains (from cPanel UAPI)
- ⚠️ **Requires password verification** - Prevent account takeover
- User must enter their cPanel email account password
- Only after verification, the federated identity is linked

**Example:**
- User authenticates with LinkedIn as `user@external.com` → Auto-creates account
- User authenticates with LinkedIn as `user@yourdomain.com` (owned domain) → Requires password

## Database Schema

### `upstream_providers` Table
Stores provider configurations:
- `name`: Provider identifier (linkedin, google, github, etc.)
- `display_name`: Human-readable name
- `type`: `oidc` or `oauth2`
- `client_id`, `client_secret`: OAuth credentials
- `discovery_url`: OIDC discovery endpoint (for OIDC providers)
- `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`: Manual endpoints (for OAuth 2.0)
- `scopes`: Space-separated OAuth scopes
- `button_color`: Hex color for login button
- `enabled`: Whether provider is active
- `sort_order`: Display order on login page

### `federated_identities` Table
Links external provider accounts to local accounts:
- `account_uid`: Reference to local account
- `provider_name`: Provider identifier
- `provider_subject`: Subject (sub) from provider
- `provider_email`: Email from provider
- `verified`: Whether owned domain was verified
- `claims_json`: Full claims from provider
- `last_used_at`: Last login timestamp

## Manual Provider Configuration

You can manually add providers via SQL or admin interface:

```sql
INSERT INTO upstream_providers (
  name, display_name, type, client_id, client_secret,
  discovery_url, scopes, button_color, enabled, sort_order
) VALUES (
  'custom_provider',
  'My Custom Provider',
  'oidc',
  'your_client_id',
  'your_client_secret',
  'https://provider.example.com',
  'openid email profile',
  '#FF5733',
  true,
  100
);
```

## Federation Flow

1. User visits login page
2. Enabled providers displayed as buttons
3. User clicks "Continue with [Provider]"
4. Redirected to provider for authentication
5. Provider redirects back with authorization code
6. System exchanges code for tokens and claims
7. **Domain check:**
   - External domain → Auto-create/link account → Login complete
   - Owned domain → Show password verification page
8. After verification (if needed), session established

## Troubleshooting

### Provider not showing on login page
- Check environment variables are set
- Verify migrations have run (`upstream_providers` table exists)
- Check `enabled` column in database

### "PKCE verifier not found in session"
- Ensure cookies/sessions are working
- Check session middleware configuration
- Verify HTTPS in production

### "OWNED_DOMAIN_ACCOUNT_NOT_FOUND"
- User tried to link owned domain email that doesn't exist
- Create the email account in cPanel first

### OAuth callback errors
- Verify redirect URI matches exactly in provider console
- Check for trailing slashes
- Ensure HTTPS in production

## API Reference

### Routes

**POST** `/interaction/:uid/federated`
- Initiates federation with selected provider
- Body: `{ provider: "linkedin" }`

**GET** `/interaction/callback/:provider`
- OAuth callback endpoint (configured in provider console)

**GET** `/interaction/:uid/federated/:provider`
- Handles token exchange and account linking

**GET** `/interaction/:uid/federated/verify`
- Shows password verification for owned domains

**POST** `/interaction/:uid/federated/verify`
- Verifies password and completes linking

## Development

In development/test mode (`NODE_ENV !== production`):
- Domain verification returns empty set (all domains are external)
- UAPI calls are skipped
- All federated accounts auto-created without verification

## Production Considerations

1. **Secrets Management**: Store client secrets in secure vault (not in code)
2. **HTTPS Required**: All OAuth flows require HTTPS
3. **Session Security**: Use secure session cookies
4. **CORS**: Configure `clientBasedCORS` for native app support
5. **Rate Limiting**: Add rate limiting to prevent abuse

## References

- [LinkedIn OAuth](https://learn.microsoft.com/linkedin/shared/authentication/)
- [GitHub OAuth](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Google OIDC](https://developers.google.com/identity/protocols/oauth2/openid-connect)
- [Facebook Login](https://developers.facebook.com/docs/facebook-login)
- [Microsoft Identity Platform](https://learn.microsoft.com/en-us/azure/active-directory/develop/)
- [Sign in with Apple](https://developer.apple.com/sign-in-with-apple/)
