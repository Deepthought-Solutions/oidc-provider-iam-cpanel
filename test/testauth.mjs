import Koa from 'koa';
import Router from '@koa/router';
import * as openid from 'openid-client'
import { v4 as uuidv4 } from 'uuid';
import { Sequelize } from 'sequelize';
import { sequelize } from '../server/oidc/db_adapter.js';

const app = new Koa();
const router = new Router();

const port = 3001;
const providerPort = 3080;

const providerIssuer = `http://localhost:${providerPort}/`;
const clientHost = `http://localhost:${port}`;

const client = {
  client_id: uuidv4(),
  client_secret: 'a-secret',
  redirect_uris: [`${clientHost}/cb`],
  response_types: ['code'],
  grant_types: ['authorization_code'],
  token_endpoint_auth_method: 'client_secret_basic',
};

async function provisionClient() {

  const Client = sequelize.define('_oidc_Clients', {
    id: { type: Sequelize.STRING, primaryKey: true },
    data: { type: Sequelize.JSON },
  }, {
    timestamps: false,
  });

  await sequelize.sync();
  await Client.upsert({ 
    id: client.client_id,
    data: client,
    createdAt: Sequelize.NOW,
    updatedAt: Sequelize.NOW
  });

}

let code_verifier;

router.get('/login', async (ctx) => {
  const config = await openid.discovery(
    new URL(providerIssuer),
    client.client_id,
    client.client_secret,
    undefined,
    {
      execute: [openid.allowInsecureRequests],
    }
  );
  code_verifier = openid.randomPKCECodeVerifier();
  const code_challenge = await openid.calculatePKCECodeChallenge(code_verifier);
  const url = openid.buildAuthorizationUrl(config, {
    scope: 'openid email profile',
    code_challenge,
    code_challenge_method: 'S256',
    redirect_uri: client.redirect_uris[0],
  });
  ctx.redirect(url);
});

router.get('/cb', async (ctx) => {
  const config = await openid.discovery(
    new URL(providerIssuer),
    client.client_id,
    client.client_secret,
    undefined,
    {
      execute: [openid.allowInsecureRequests],
    }
  );
  const tokens = await openid.authorizationCodeGrant(config, new URL(ctx.href), {
    pkceCodeVerifier: code_verifier,
  });
  ctx.body = {
    message: 'Authentication successful',
    tokenSet: tokens,
  };
});

router.get('/', async (ctx) => {
  ctx.body = {
    message: 'It works',
  };
});

router.get('/mock-auth', async (ctx) => {
  const Account = (await import('../server/oidc/account.js')).default;
  Account.authenticate = async () => {
    return {
      accountId: 'testuser',
      profile: {
        email: 'testuser@example.com',
        email_verified: true,
      },
    };
  };
  ctx.body = 'Auth mocked';
});

app.use(router.routes());

export async function startTestClient() {
  await provisionClient();
  app.listen(port, () => {
    console.log(`Test client server listening on port ${port}`);
  });
}

