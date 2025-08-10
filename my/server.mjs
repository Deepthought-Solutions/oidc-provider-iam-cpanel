import Koa from 'koa';
import Router from '@koa/router';
import * as openid from 'openid-client';
import session from 'koa-session';
import { koaBody } from 'koa-body';
import render from '@koa/ejs';
import path from 'path';
import desm from 'desm';
import { exec } from 'child_process';

let discoveryConfig = {};

async function logger(ctx, next) {
  const start = Date.now();

  await next(); // pass control to the next middleware

  const ms = Date.now() - start;
  console.log(`[${start}] ${ctx.method} ${ctx.url} - ${ms}ms`);
}

// module.exports = logger;

if (process.env.NODE_ENV.toLowerCase() !== "production") {
  discoveryConfig['execute'] = [openid.allowInsecureRequests]
}

export async function startMyClient(myconfig) {
  const app = new Koa();
  const router = new Router();

  app.use(logger)
  app.keys = ['some secret hurr'];
  app.use(session(app));
  app.use(koaBody());

  render(app, {
    root: path.join(desm(import.meta.url), 'views'),
    layout: '_layout',
    viewExt: 'ejs',
    cache: false,
    debug: true,
  });

  let code_verifier;

  router.get('/login', async (ctx) => {
    const config = await openid.discovery(
      new URL(myconfig.issuer),
      myconfig.client.client_id,
      myconfig.client.client_secret,
      undefined,
      discoveryConfig
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
      discoveryConfig
    );
    const tokens = await openid.authorizationCodeGrant(config, new URL(ctx.href), {
      pkceCodeVerifier: code_verifier,
    });
    const claims = tokens.claims();
    ctx.session.user = {
        name: claims.name,
        email: claims.email,
        sub: claims.sub
    };
    ctx.session.tokens = tokens;
    ctx.redirect('/');
  });

  router.get('/', async (ctx) => {
    if (!ctx.session.user) {
        return ctx.redirect('/login');
    }
    await ctx.render('home', { user: ctx.session.user });
  });

  router.get('/change-password', async (ctx) => {
    if (!ctx.session.user) {
        return ctx.redirect('/login');
    }
    await ctx.render('change-password');
  });

  router.post('/change-password', async (ctx) => {
    if (!ctx.session.user) {
        ctx.status = 401;
        return;
    }
    const { password } = ctx.request.body;
    const email = ctx.session.user.email;

    // This is where we would call the uapi
    const uapiCommand = `test/uapi Email passwd_pop --output=jsonpretty email='${email}' password='${password}'`;

    await new Promise((resolve, reject) => {
        exec(uapiCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return reject(error);
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            resolve(stdout);
        });
    });

    ctx.redirect('/');
  });

  router.get('/debug', async (ctx) => {
    if (!ctx.session.user) {
        return ctx.redirect('/login');
    }

    const config = await openid.discovery(
      new URL(myconfig.issuer),
      myconfig.client.client_id,
      myconfig.client.client_secret,
      undefined,
      discoveryConfig
    );
    // console.log(ctx.session.tokens)
    let userinfo = {};
    const userInfoResponse = await fetch(`${config.serverMetadata().userinfo_endpoint}`, {
      headers: {
        'Authorization': `Bearer ${ctx.session.tokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (userInfoResponse.ok) {
      userinfo = await userInfoResponse.json()
    } else {
      console.log(userInfoResponse)
      userinfo = {
        url: config.serverMetadata().userinfo_endpoint,
        code: userInfoResponse.status,
        body: userInfoResponse.body,
        headers: {}
      }
      userInfoResponse.headers.forEach((v,k) => {userinfo.headers[k] = v})
    }

    try {
      const userinfo2 = await openid.fetchUserInfo(
        config,
        ctx.session.tokens.access_token,
        ctx.session.user.sub
      )
    } catch (error) {
      console.log(error)
    }
    await ctx.render('debug', {
        tokens: ctx.session.tokens,
        userinfo: userinfo,
    });
  });


  app.use(router.routes());



  app.listen(myconfig.port, () => {
    console.log(`My client server listening on port ${myconfig.port}`);
  });
}
