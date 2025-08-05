import {accountTable, Account} from './account.js'
// import { renderPage }  from 'vike/server';
import { Op } from 'sequelize';
import * as JWT from 'oidc-provider/lib/helpers/jwt.js';

export async function renderError(ctx, out, error) {
  console.log(ctx.request.query);
  console.log(out);
  console.log(error);
  const { statusCode: error_code, message: error_message, error_description } = error;
  const pageContextInit = { urlOriginal: ctx.originalUrl, };
  if (ctx.originalUrl.startsWith('/session/end') && ctx.request.query.id_token_hint != undefined) {
    // Very ugly hack to remove
    const hint = JWT.decode(ctx.request.query.id_token_hint);
    // console.log(hint);
    
  }
  ctx.urlOriginal = "/error";
  ctx.error = error;
  ctx.error_message = error_message;
  ctx.error_description = error_description;
  ctx.out = out;
  ctx.render('/error', {
    error,
    layout: '_layout_error',
    title: error.error,
  });
  }

export async function findAccount(ctx, id, token) { // eslint-disable-line no-unused-vars
  // token is a reference to the token used for which a given account is being loaded,
  //   it is undefined in scenarios where account claims are returned from authorization endpoint
  // ctx is the koa request context
  console.debug(`FindAccount:${id}`);
  console.debug(`FindAccount:${token}`);
  let account;
  account = await accountTable.findOne({
    where: {
      uid: {
        [Op.eq]: id
      }
    }
  });
  if (account) {
    return new Account(account);
  } else {
    // const pageContextInit = { 
    //   urlOriginal: "/error", 
    //   error_message: "No account found"
    // };
    
    // const pageContext = await renderPage(pageContextInit);
    // const { httpResponse } = pageContext;
    // ctx.type = httpResponse.contentType;
    // ctx.body = httpResponse.body;
    // ctx.status = 403;
  }
  
}
export async function logoutSource(ctx, form) {
  
  // @param ctx - koa request context
  // @param form - form source (id="op.logoutForm") to be embedded in the page and submitted by
  //   the End-User
  let xsrf_re = /value="(.+)"/;
  const pageContextInit = {
    urlOriginal: "/interaction/logout", 
    xsrf: xsrf_re.exec(form)[1]
  };
  // const pageContext = await renderPage(pageContextInit);
  // const { httpResponse } = pageContext;
  // ctx.body = httpResponse.body;
}

export async function postLogoutSuccessSource(ctx) {
  // @param ctx - koa request context
  const {
    clientId, clientName, clientUri, initiateLoginUri, logoUri, policyUri, tosUri,
  } = ctx.oidc.client || {}; // client is defined if the user chose to stay logged in with the OP
  const display = clientName || clientId;
  ctx.body = `<!DOCTYPE html>
    <html>
    <head>
      <title>Sign-out Success</title>
      <style>/* css and html classes omitted for brevity, see lib/helpers/defaults.js */</style>
    </head>
    <body>
      <div>
        <h1>Sign-out Success</h1>
        <p>Your sign-out ${display ? `with ${display}` : ''} was successful.</p>
      </div>
    </body>
    </html>`;
}