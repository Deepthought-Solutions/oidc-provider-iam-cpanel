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
  await sequelize.close();
}

router.get('/login', async (ctx) => {
  const issuer = await openid.Issuer.discover(providerIssuer);
  const oidcClient = new issuer.Client(client);
  const url = oidcClient.authorizationUrl({
    scope: 'openid email profile',
    code_challenge: openid.generators.codeChallenge(openid.generators.codeVerifier()),
    code_challenge_method: 'S256',
  });
  ctx.redirect(url);
});

router.get('/cb', async (ctx) => {
  const issuer = await openid.Issuer.discover(providerIssuer);
  const oidcClient = new issuer.Client(client);
  const params = oidcClient.callbackParams(ctx.req);
  const tokenSet = await oidcClient.callback(`${clientHost}/cb`, params, {
    code_verifier: openid.generators.codeVerifier(),
  });
  ctx.body = {
    message: 'Authentication successful',
    tokenSet,
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

