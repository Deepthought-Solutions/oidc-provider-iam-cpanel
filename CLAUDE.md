# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OIDC ID Provider for cPanel hosting that authenticates users via cPanel email accounts using UAPI commands or SMTP fallback. Built on `oidc-provider` with PostgreSQL/SQLite persistence, TOTP 2FA support, and OAuth 2.0 Authorization Code Flow with PKCE.

## Development Commands

### Running the server
```bash
npm run dev              # Start development server (port 3080)
npm run server           # Start server via node with ts-node loader
```

### Testing
```bash
npm run test:integration # Run Playwright integration tests (sets NODE_ENV=test, uses SQLite)
DEBUG=pw:webserver npx playwright test  # Run tests with debug output
```

## Architecture

### Core Components

**server/server.mjs** - Main entry point
- Initializes OIDC Provider with configuration
- Runs database migrations automatically on startup (except in test mode)
- Configures Helmet CSR, EJS rendering, and Koa middleware
- Supports Phusion Passenger deployment
- Listens on port 3080 (or PORT env var)

**server/oidc/configuration.js** - OIDC provider configuration
- Generates JWKS on startup (RS256 keys)
- Loads client configurations from database (`_oidc_Clients` table)
- Defines custom interactions, scopes, claims
- Configures resource indicators, CORS rules for native apps
- Implements `extraTokenClaims` and `extraAccessTokenClaims` to inject user data

**server/oidc/account.js** - Account authentication
- `Account.authenticate(login, password)` - Primary authentication method
  - Production: Uses cPanel UAPI `Email verify_password` command
  - Fallback: SMTP authentication via nodemailer
  - Test mode: Auto-accepts test/test credentials
- `Account.findByUID(uid)` - Retrieves account by UUID
- `Account.findByLogin(login)` - Queries UAPI for user data, creates/updates DB records
- `Account.verifyPassword(account, password)` - Migrates MD5 passwords to SHA512 - TODO: refactor
- Database: `accounts` table with UUID primary key, email (unique), password - TODO: Challenge password field usage or offer feature to manage users without mailboxes

**server/oidc/db_adapter.js** - Sequelize adapter
- Uses SQLite for dev/test, PostgreSQL for production
- Database config in `config/config.json`
- Environment-specific connection strings
- Implements OIDC adapter interface (upsert, find, destroy, consume, revokeByGrantId)
- Models: Session, AccessToken, AuthorizationCode, RefreshToken, DeviceCode, Client, Grant, etc.

**server/oidc/interactions.js** - Custom OIDC interaction flows
- Login prompt with `no_session`, `max_age`, `id_token_hint` checks
- TOTP prompt for two-factor authentication
- Consent prompt with scope/claims/resource validation
- Uses symbols for tracking missing scopes/claims

**server/oidc/totp.js** - Two-factor authentication
- `TotpSecret` model stores secrets per account
- `generateTotpSecret(accountId)` - Creates new TOTP secret with QR code
- `verifyTotp(accountId, token)` - Validates 6-digit TOTP code

**migrations/** - Database schema migrations
- Executed automatically on server startup (tracked in `SequelizeMeta` table)
- Migration files are run in alphabetical order
- Key migrations: OIDC tables, accounts table, TOTP secrets, client configurations

### Client Application (my/)

**my/server.mjs** - Sample OIDC client implementation
- OAuth 2.0 Authorization Code Flow
- Routes: `/login`, `/cb` (callback), `/`, `/change-password`, `/debug`
- Uses `openid-client` for discovery and token validation
- JWT verification via jose with remote JWKS
- Password change via cPanel UAPI `Email passwd_pop`

## Environment Variables

**Production**:
- `OIDC_DB_USER`, `OIDC_DB_PASS`, `OIDC_DB_NAME` - PostgreSQL credentials
- `DB_HOST`, `DB_PORT` - Database connection
- `ISSUER_URL` - OIDC provider base URL
- `NODE_ENV=production` - Enables PostgreSQL, HTTPS redirect, proxy mode

**Development**:
- `PORT` - Server port (default 3080)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` - SMTP fallback config

**Test**:
- `NODE_ENV=test` - Uses SQLite (test.db), skips migrations, allows test/test login

## Key Implementation Details

### Authentication Flow
1. User submits credentials via interaction form
2. `Account.authenticate(login, password)` attempts UAPI verification
3. On UAPI failure, falls back to SMTP auth
4. Account created/retrieved from `accounts` table
5. If TOTP enabled, prompts for 6-digit code
6. Session established with accountId

### Database Schema
- All OIDC models use `_oidc_` prefix with JSON `data` field
- Grantable models have `grantId` index
- DeviceCode has `userCode` index
- Session has `uid` index
- Clients stored with full configuration in `data` JSON field

### Password Migration
- Legacy MD5 passwords automatically upgraded to SHA512 on successful login
- Implemented in `Account.verifyPassword(account, password)`

### Native App Support
- CORS configured via `clientBasedCORS` to allow custom URI schemes (e.g., `myapp://callback`)
- `extraClientMetadata.validator` permits redirect URIs matching `{client_id}://` pattern
- Also allows localhost origins for development

### PKCE Support
Recent commit (c711549) implements PKCE following RFC 8252 recommendations for native applications.
