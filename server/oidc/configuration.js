import { dirname } from 'desm';
import * as path from 'node:path';
import * as jose from 'jose';
import { randomUUID } from 'crypto';

import interactions from "./interactions.js";
import { sequelize, default as SequelizeAdapter } from "./db_adapter.js";
import Sequelize from 'sequelize'; // eslint-disable-line import/no-unresolved
import { findAccount, renderError, postLogoutSuccessSource, logoutSource } from "./helpers.js";

// import dotenv from 'dotenv'
import { userInfo } from 'node:os';
import Account from './account.js';
// dotenv.config();


export async function getConfiguredClients() {
      const Client = sequelize.model('_oidc_Clients');
      const clients = await Client.findAll({ where: { data: { [Sequelize.Op.ne]: null } } });
      const result = clients.map(c => {
        console.log(c)
        return c.data
      });
      console.log(result)
      return result
    }


const __dirname = dirname(import.meta.url);
const jwksPath = path.join(__dirname, '..', '..', 'config', 'jwks.json');
let jwks;

console.log('Generating new JWKS...');
const alg = 'RS256';
const { privateKey } = await jose.generateKeyPair(alg, { extractable: true });
const jwk = await jose.exportJWK(privateKey);

jwk.use = 'sig';
jwk.alg = alg;
jwk.kid = randomUUID();

jwks = { keys: [jwk] };

export default {
    proxy: true,
    adapter: SequelizeAdapter,
    renderError,
    findAccount,
    audiences: async function(ctx, sub, token, use) {
      // @param ctx   - koa request context
      // @param sub   - account identifier (subject)
      // @param token - the token to which these additional audiences will be assed to. It is
      //   undefined when the audiences are pushed to a JWT userinfo response
      // @param use   - can be one of "id_token", "userinfo", "access_token" or "client_credentials"
      //   depending on where the specific audiences are intended to be put in
      return "http://localhost:8000";
    },
    clients: [],
    interactions: interactions,
    cookies: {
      keys: ['some secret key', 'and also the old rotated away some time ago', 'and one more'],
    },
    claims: {
      admin: ['admin'],
      email: [
        'email', 'email_verified',
      ],
      // phone: ['phone_number', 'phone_number_verified'],
      profile: [
        //'birthdate', 'family_name', 'gender', 'given_name', 'locale', 'middle_name', 'name',
        //'nickname', 'picture', 'preferred_username', 'profile', 'updated_at', 'website', 'zoneinfo',
        'pseudo'],
    },
    scopes: [
      'openid',
      'offline_access',
      'email_verified',
      'admin'
    ],
    features: {
      userinfo: {
          enabled: true
        },
      devInteractions: { enabled: false },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: logoutSource,
        postLogoutSuccessSource: postLogoutSuccessSource
      },
      deviceFlow: { enabled: true },
      revocation: { enabled: true },
      resourceIndicators: {
        defaultResource: (ctx, client, oneOf) => {
          console.log('default resource', client);
          return "http://example.com";
        },
        enabled: true,
        getResourceServerInfo: (ctx, resourceIndicator, client) => {
          // console.log('get resource server info client', client);
          // console.log('get resource server info resourceIndicator', resourceIndicator);
          // console.log('get resource server info resourceIndicator', ctx);
          return ({
            audience: 'solid',
            accessTokenTTL: 2 * 60 * 60, // 2 hours
            accessTokenFormat: 'jwt',
            jwt: {
              sign: { alg: 'RS256' },
            },
          });
        },
        useGrantedResource: (ctx, model) => {
          // @param ctx - koa request context
          // @param model - depending on the request's grant_type this can be either an AuthorizationCode, BackchannelAuthenticationRequest,
          //                RefreshToken, or DeviceCode model instance.
          return true;
        }
      },
    },
    extraAccessTokenClaims: async (ctx, token) => {
    // `token` is the AccessToken model instance
    // Include whatever user info `userinfo` will need
      const account = await Account.findByUID(token.accountId);

      return {
        sub: account.accountId,            // required
        email: account.profile.email,       // example claim
        email_verified: account.profile.emailVerified, // if you have it
        name: account.profile.name,
      }
    },
    /**
     * Add informations in the AccessToken once user is authenticated
     * 
     * @param {*} ctx The Koa context
     * @param {*} token The actual token
     * @returns 
     */
    async extraTokenClaims(ctx, token) {
      console.log("======= extraTokenClaims =======");
      // console.log(ctx.res);
      console.log(token);
      // new SequelizeAdapter("AccessToken").upsert({
      //   id: token.,
      //   grantId: token.grantId
      // });

      try {
        let account = await findAccount(ctx, token.accountId , token)
        let result = {};
        console.log(account);
        return { 
          'email_verified': account.profile.email_verified,
          'email': account.profile.email,
        }
      } catch (e) {
        console.log(e);
      }
      return null;// {'foo':'bar'};account.profile;
    },
    jwks: jwks,
    formats: {
      AccessToken: 'jwt',
    },
    clientBasedCORS(ctx, origin, client) {
      console.log("Start clientBasedCORS")
      // console.log(client)
      try {
      // Device code clients don't have redirectUris
      if (!client || !client.redirectUris) {
        console.log(`No redirectUris for ${client?.clientId}, denying CORS`)
        return false;
      }

      if (client.redirectUris.some(uri => uri.startsWith(`${client.clientId}://`))
          && origin.startsWith("http://localhost")
        ) {
        console.log(`Allow ${origin} for ${client.clientId}`)
        return true;
      }
      // Exemple : autoriser uniquement si l'origine est dans les redirect_uris
      if (client.redirectUris.some(uri => uri.startsWith(origin))) {
        console.log(`Allow ${origin} for ${client.clientId}`)
        return true;
      }
      } catch (e) {
        console.log(e);
      }
      console.log(`Deny ${origin} for ${client.clientId}`)
      return false;
    },
    extraClientMetadata: {
      properties: ['redirect_uris'],
      validator: function (ctx, key, value, metadata) {
        console.log("Validator for extraClientMetadata started")
        console.log(metadata)
        if (key === 'redirect_uris') {
          value.forEach((uri) => {
            if (uri.startsWith(`${metadata.client_id}://`)) {
              return;
            }
            // sinon, impose qu’on reste sur du http(s)
            if (!/^https?:\/\//.test(uri)) {
              throw new Error(`redirect_uri non autorisé: ${uri}`);
            }
          });
        }
        return value;
      }
    }
  };