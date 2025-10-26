import Koa from 'koa';
import Router from '@koa/router';
import * as openid from 'openid-client';
import session from 'koa-session';
import { koaBody } from 'koa-body';
import render from '@koa/ejs';
import path from 'path';
import desm from 'desm';
import { exec } from 'child_process';
import * as jose from 'jose';

let discoveryConfig = {};

async function logger(ctx, next) {
  const start = Date.now();
  try {
    console.log(`[${start}] ${ctx.method} ${ctx.url}`);
    await next(); // pass control to the next middleware

  } catch (e) {
    console.log("exception during  logging")
    console.log(e)
    await ctx.render('error', {
    });
  } finally {
    const ms = Date.now() - start;
    console.log(`[${start}] ${ctx.method} ${ctx.url} - ${ms}ms`);
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
  let render_params = myconfig.render_params || {
    root: path.join(desm(import.meta.url), 'views'),
    layout: '_layout',
    viewExt: 'ejs',
    cache: false,
    debug: true,
  }
  render(app, render_params);

  let code_verifier;

  router.get(`${prefix}login`, async (ctx) => {
    // const config = await openid.discovery(
    //   new URL(myconfig.issuer),
    //   myconfig.client.client_id,
    //   myconfig.client.client_secret,
    //   openid.ClientSecretBasic(myconfig.client.client_secret),
    //   discoveryConfig
    // );
    // code_verifier = openid.randomPKCECodeVerifier();
    // const code_challenge = await openid.calculatePKCECodeChallenge(code_verifier);
    // // redirect_uri = ctx.request.url.replace('login','cb')
    // const url = openid.buildAuthorizationUrl(config, {
    //   scope: 'openid email profile',
    //   code_challenge,
    //   code_challenge_method: 'S256',
    //   redirect_uri: myconfig.client.redirect_uris[0],
    // });

    const authorizationUrl = new URL('auth', myconfig.issuer);
    authorizationUrl.searchParams.set('client_id', myconfig.client.client_id);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('redirect_uri', myconfig.client.redirect_uris[0]);

    // if (pageContext.koaContext) {
    //   pageContext.koaContext.header['Location'] = authorizationUrl.toString();
    // }
        // throw redirect(authorizationUrl.toString());
    ctx.redirect(authorizationUrl.toString());
  });

  router.get(`${prefix}cb`, async (ctx) => {
    console.log("Retrieving OIDC config with discovery")
    // const config = await openid.discovery(
    //   new URL(myconfig.issuer),
    //   myconfig.client.client_id,
    //   myconfig.client.client_secret,
    //   openid.ClientSecretBasic(myconfig.client.client_secret),
    //   discoveryConfig
    // );

    // const tokens = await openid.authorizationCodeGrant(config, new URL(ctx.href), {
    //   pkceCodeVerifier: code_verifier,
    // });
    
  console.log(`OIDC callback auth code route`)
    const code = ctx.query.code;
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', myconfig.client.redirect_uris[0]);
    params.append('client_id', myconfig.client.client_id);
    params.append('client_secret', myconfig.client.client_secret);

    const tokenUrl = new URL('token', myconfig.issuer);
    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      // headers: {
      //   'Authorization': 'Basic ' + Buffer.from(`${myconfig.client.client_id}:${myconfig.client.client_secret}`).toString('base64')
      // }
    });
    if (!response.ok) {
      console.error("OIDC token exchange failed:", await response.text());
      ctx.session.user = null; // Clear any partial session
      await ctx.render('error', {
        'message': 'Authentication failure'
      });
      return;
    }
    
    const tokens = await response.json();
    // console.log(tokens)

    if (!tokens.access_token) {
      console.error("OIDC token response does not contain access_token:", tokens);
      ctx.session.user = null;
      await ctx.render('error', {
        'message': 'Authentication failure'
      });
      return;
    }

    const jwksUrl = new URL('jwks', myconfig.issuer);
    const JWKS = jose.createRemoteJWKSet(jwksUrl);

    const { payload, protectedHeader } = await jose.jwtVerify(tokens.access_token, JWKS)
    console.log(payload)
    // const claims = tokens.claims();
    ctx.session.user = {
    //     name: claims.name,
        email: payload.email,
        sub: payload.sub
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
    const { current_password, password, confirm_password } = ctx.request.body;
    if ( !password !== confirm_password) {
      ctx.status = 400;
      return await ctx.render(error, {
        message: `Password doesn't match confirmation`
      })
    }
    const email = ctx.session.user.email;
    // Simple shell escaping
    const sanitizedLogin = email.replace(/'/g, "'\\''");
    const sanitizedPassword = password.replace(/'/g, "'\\''");
    const sanitizedCurrentPassword = current_password.replace(/'/g, "'\\''");
    const uapiCommand = process.env.NODE_ENV === 'test' ? 'uapi' : '/usr/bin/uapi';

    const verifyPwCommand = `${uapiCommand} --output=jsonpretty Email verify_password email='${sanitizedLogin}' password='${sanitizedCurrentPassword}'`;


    // This is where we would call the uapi
    const ChangePwCommand = `${uapiCommand} Email passwd_pop --output=jsonpretty email='${sanitizedLogin}' password='${sanitizedPassword}'`;
    await new Promise((resolve, reject) => {
      exec(verifyPwCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return reject(error);
        }
        const uapiResult = JSON.parse(stdout);
        if (uapiResult.result.errors) {
          console.error('UAPI returned an error:', uapiResult.result.errors);
          return reject('AuthenticationException');
        }
      })
    });
    await new Promise((resolve, reject) => {
        exec(ChangePwCommand, (error, stdout, stderr) => {
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


  router.get('/health', (ctx) => {
    ctx.status = 200;
  });

  app.use(router.routes());
  app.use(notfound);



  return new Promise((resolve) => {
    app.listen(myconfig.port, () => {
      console.log(`My client server listening on port ${myconfig.port}`);
      resolve();
    });
  });
}
