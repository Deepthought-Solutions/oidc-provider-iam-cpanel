# OIDC ID Provider Cpanel

An OIDC provider that fits in cPanel hosting that offers nodejs apps with postgres DB.

The user accounts are mapping the email accounts of your cPanel hosting.

Authenticate user based on login and password against cPanel's UAPI command.
Fallback to SMTP authentication when uapi is not available, so it can work when not hosted on your cPanel (while development or any other architecture hypothesis).

This implementation is based on the https://github.com/panva/node-oidc-provider and brings :

 - Postgres persistence for sessions, interactions, clients
 - TOTP additional verification for a second auth factor

Some additional features to come.


## Run the testsuite

```bash
DEBUG=pw:webserver npx playwright test
```