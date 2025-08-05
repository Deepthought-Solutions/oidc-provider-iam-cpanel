import { dirname } from 'desm';
import * as path from 'node:path';
import * as jose from 'jose';
import { randomUUID } from 'crypto';

import interactions from "./interactions.js";
import { sequelize, default as SequelizeAdapter } from "./db_adapter.js";
import Sequelize from 'sequelize'; // eslint-disable-line import/no-unresolved
import { findAccount, renderError, postLogoutSuccessSource, logoutSource } from "./helpers.js";

import dotenv from 'dotenv'
dotenv.config();

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
    clients: await async function() {
      const Client = sequelize.model('_oidc_Clients');
      const clients = await Client.findAll({ where: { data: { [Sequelize.Op.ne]: null } } });
      const result = clients.map(c => {
        console.log(c)
        return c.data
      });
      console.log(result)
      return result
    }(),
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
  };