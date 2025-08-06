# OIDC ID Provider Cpanel

An OIDC provider that fits in cPanel hosting that offers nodejs apps with postgres DB.

The user accounts are mapping the email accounts of your cPanel hosting.

This implementation is based on the https://github.com/panva/node-oidc-provider and brings :

 - Postgres persistence for sessions, interactions, clients
 - TOTP additional verification for a second auth factor

Some additional features to come.


## Run the testsuite

```bash
DEBUG=pw:webserver npx playwright test
```