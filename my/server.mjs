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
  try {
    const start = Date.now();
    console.log(`[${start}] ${ctx.method} ${ctx.url}`);

    await next(); // pass control to the next middleware

    const ms = Date.now() - start;
    console.log(`[${start}] ${ctx.method} ${ctx.url} - ${ms}ms`);
  } catch (e) {
    console.log("exception in logging")
    console.log(e)
    await next()
  }

}

async function notfound(ctx, next) {
  await ctx.render('notfound', { url: ctx.url });  

}

// module.exports = logger;
const NODE_ENV = process.env.NODE_ENV || 'developpement';
if (NODE_ENV.toLowerCase() !== "production") {
  discoveryConfig['execute'] = [openid.allowInsecureRequests]
}

export async function startMyClient(myconfig) {
  const app = new Koa();
  const router = new Router();
  let prefix = myconfig.prefix || '/'
  "".endsWith
  if (!prefix.endsWith('/')) prefix = `${prefix}/`
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

  router.get(`${prefix}login`, async (ctx) => {
    const config = await openid.discovery(
      new URL(myconfig.issuer),
      myconfig.client.client_id,
      myconfig.client.client_secret,
      openid.ClientSecretBasic(myconfig.client.client_secret),
      discoveryConfig
    );
    code_verifier = openid.randomPKCECodeVerifier();
    const code_challenge = await openid.calculatePKCECodeChallenge(code_verifier);
    // redirect_uri = ctx.request.url.replace('login','cb')
    const url = openid.buildAuthorizationUrl(config, {
      scope: 'openid email profile',
      code_challenge,
      code_challenge_method: 'S256',
      redirect_uri: myconfig.client.redirect_uris[0],
    });
    ctx.redirect(url);
  });

  router.get(`${prefix}cb`, async (ctx) => {
    console.log("Retrieving OIDC config with discovery")
    const config = await openid.discovery(
      new URL(myconfig.issuer),
      myconfig.client.client_id,
      myconfig.client.client_secret,
      openid.ClientSecretBasic(myconfig.client.client_secret),
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
    ctx.redirect(`${prefix}`);
  });

  router.get(`${prefix}`, async (ctx) => {
    if (!ctx.session.user) {
        return ctx.redirect(`${prefix}login`);
    }
    await ctx.render('home', { user: ctx.session.user });
  });

  router.get(`${prefix}change-password`, async (ctx) => {
    if (!ctx.session.user) {
        return ctx.redirect(`${prefix}login`);
    }
    await ctx.render('change-password');
  });

  router.post(`${prefix}change-password`, async (ctx) => {
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

    ctx.redirect(`${prefix}`);
  });

  router.get(`${prefix}debug`, async (ctx) => {
    if (!ctx.session.user) {
        return ctx.redirect(`${prefix}login`);
    }

    const config = await openid.discovery(
      new URL(myconfig.issuer),
      myconfig.client.client_id,
      myconfig.client.client_secret,
      openid.ClientSecretBasic(myconfig.client.client_secret),
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
  app.use(notfound);



  app.listen(myconfig.port, () => {
    console.log(`My client server listening on port ${myconfig.port}`);
  });
}
