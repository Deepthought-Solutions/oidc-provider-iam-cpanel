import Koa from 'koa';
import Router from '@koa/router';
import * as openid from 'openid-client'



export async function startMyClient(myconfig) {
  const app = new Koa();
  const router = new Router();


  let code_verifier;

  router.get('/login', async (ctx) => {
    const config = await openid.discovery(
      new URL(myconfig.issuer),
      myconfig.client.client_id,
      myconfig.client.client_secret,
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
      redirect_uri: myconfig.client.redirect_uris[0],
    });
    ctx.redirect(url);
  });

  router.get('/cb', async (ctx) => {
    const config = await openid.discovery(
      new URL(myconfig.issuer),
      myconfig.client.client_id,
      myconfig.client.client_secret,
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


  app.use(router.routes());



  app.listen(myconfig.port, () => {
    console.log(`Test client server listening on port ${myconfig.port}`);
  });
}

