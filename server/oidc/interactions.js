import Prompt from "oidc-provider/lib/helpers/interaction_policy/prompt.js";
import Check from "oidc-provider/lib/helpers/interaction_policy/check.js";
import { hasTotpSecret } from "./totp.js";
import { findAccount } from "./helpers.js";


const missingOIDCScope = Symbol();
const missingOIDCClaims = Symbol();
const missingResourceScopes = Symbol();

const interactions = {
    policy: [
/* LOGIN PROMPT */
new Prompt(
    { name: 'login', requestable: true },
  
    (ctx) => {
      console.log("interactions: enter login prompt");
      const { oidc } = ctx;
      const result = {
        ...(oidc.params.max_age === undefined ? undefined : { max_age: oidc.params.max_age }),
        ...(oidc.params.login_hint === undefined
          ? undefined
          : { login_hint: oidc.params.login_hint }),
        ...(oidc.params.id_token_hint === undefined
          ? undefined
          : { id_token_hint: oidc.params.id_token_hint }),
      };
      return result;
    },
  
    new Check('no_session', 'End-User authentication is required', (ctx) => {
      console.log("interactions: running no_session check");
      const { oidc } = ctx;
      if (oidc.session.accountId) {
        console.log(`interactions: no_session check: already connected with UID ${oidc.session.accountId}`);
        try {
          const account = findAccount(ctx,oidc.session.accountId, undefined)
        } catch (e) {
          console.log(e)
          console.log("Invalid user id");
          return Check.REQUEST_PROMPT;
        }
        return Check.NO_NEED_TO_PROMPT;
      }
      console.log("interactions: no_session check: not connected, prompting login");
      return Check.REQUEST_PROMPT;
    }),
  
    new Check('max_age', 'End-User authentication could not be obtained', (ctx) => {
      console.log("interactions: running max_age check");
      const { oidc } = ctx;
      if (oidc.params.max_age === undefined) {
        return Check.NO_NEED_TO_PROMPT;
      }
  
      if (!oidc.session.accountId) {
        return Check.REQUEST_PROMPT;
      }
  
      if (oidc.session.past(oidc.params.max_age) && (!ctx.oidc.result || !ctx.oidc.result.login)) {
        return Check.REQUEST_PROMPT;
      }
  
      return Check.NO_NEED_TO_PROMPT;
    }),
  
    new Check(
      'id_token_hint',
      'id_token_hint and authenticated subject do not match',
      async (ctx) => {
        console.log("interactions: running id_token_hint check");
        const { oidc } = ctx;
        if (oidc.entities.IdTokenHint === undefined) {
          return Check.NO_NEED_TO_PROMPT;
        }
  
        const { payload } = oidc.entities.IdTokenHint;
  
        let sub = oidc.session.accountId;
        if (sub === undefined) {
          return Check.REQUEST_PROMPT;
        }
  
        if (oidc.client.subjectType === 'pairwise') {
          sub = await instance(oidc.provider).configuration('pairwiseIdentifier')(
            ctx,
            sub,
            oidc.client,
          );
        }
  
        if (payload.sub !== sub) {
          return Check.REQUEST_PROMPT;
        }
  
        return Check.NO_NEED_TO_PROMPT;
      },
    ),
  
    new Check(
      'claims_id_token_sub_value',
      'requested subject could not be obtained',
      async (ctx) => {
        console.log("interactions: running claims_id_token_sub_value check");
        const { oidc } = ctx;
        if (
          !oidc.claims.id_token
            || !oidc.claims.id_token.sub
            || !('value' in oidc.claims.id_token.sub)
        ) {
          return Check.NO_NEED_TO_PROMPT;
        }
  
        let sub = oidc.session.accountId;
        if (sub === undefined) {
          return Check.REQUEST_PROMPT;
        }
  
        if (oidc.client.subjectType === 'pairwise') {
          sub = await instance(oidc.provider).configuration('pairwiseIdentifier')(
            ctx,
            sub,
            oidc.client,
          );
        }
  
        if (oidc.claims.id_token.sub.value !== sub) {
          return Check.REQUEST_PROMPT;
        }
  
        return Check.NO_NEED_TO_PROMPT;
      },
      ({ oidc }) => ({ sub: oidc.claims.id_token.sub }),
    ),
  
    new Check(
      'essential_acrs',
      'none of the requested ACRs could not be obtained',
      (ctx) => {
        console.log("interactions: running essential_acrs check");
        const { oidc } = ctx;
        const request = oidc.claims?.id_token?.acr ?? {};

        if (!request?.essential || !request?.values) {
          return Check.NO_NEED_TO_PROMPT;
        }

        if (!Array.isArray(oidc.claims.id_token.acr.values)) {
          throw new errors.InvalidRequest('invalid claims.id_token.acr.values type');
        }

        if (request.values.includes(oidc.acr)) {
          return Check.NO_NEED_TO_PROMPT;
        }

        return Check.REQUEST_PROMPT;
      },
      ({ oidc }) => ({ acr: oidc.claims.id_token.acr }),
    ),

    new Check(
      'essential_acr',
      'requested ACR could not be obtained',
      (ctx) => {
        console.log("interactions: running essential_acr check");
        const { oidc } = ctx;
        const request = oidc.claims?.id_token?.acr ?? {};

        if (!request?.essential || !request?.value) {
          return Check.NO_NEED_TO_PROMPT;
        }

        if (request.value === oidc.acr) {
          return Check.NO_NEED_TO_PROMPT;
        }

        return Check.REQUEST_PROMPT;
      },
      ({ oidc }) => ({ acr: oidc.claims.id_token.acr }),
    ),
  ),

  /* TOTP PROMPT */
  new Prompt(
    { name: 'totp', requestable: true }, // Set to true so we can render a view

    new Check('totp_required', 'TOTP authentication is required', async (ctx) => {
      console.log("interactions: running totp_required check");
      const { oidc } = ctx;

      // This check should only run if the user has just logged in with a password
      // and we don't have a totp verification in the current result yet.
      console.log(`accountId: ${oidc.session.accountId}`);
      if (!oidc.session.accountId || (oidc.result && oidc.result.totp)) {
        console.log(`oidc.result.totp : ${oidc.result.totp}`)
        return Check.NO_NEED_TO_PROMPT;
      }

      // We also need to make sure the login was successful in the first place
      if (!oidc.result || !oidc.result.login) {
        console.log(`oidc.result : ${oidc.result}`)
        // console.log(`oidc.result.login : ${oidc.result.login}`)
        return Check.NO_NEED_TO_PROMPT;
      }

      const accountHasTotp = await hasTotpSecret(oidc.session.accountId);

      // We'll store the state (enroll or verify) in the prompt details
      // so the frontend knows what to render.
      if (accountHasTotp) {
        ctx.oidc.prompt_totp_details = 'verify';
      } else {
        ctx.oidc.prompt_totp_details = 'enroll';
      }

      return Check.REQUEST_PROMPT;
    }, ({ oidc }) => ({ totp: oidc.prompt_totp_details }))
  ),
  
  /* CONSENT PROMPT */
  new Prompt(
    { name: 'consent', requestable: true },
  
    new Check('native_client_prompt', 'native clients require End-User interaction', 'interaction_required', (ctx) => {
      console.log("interactions: running native_client_prompt check");
      const { oidc } = ctx;
      if (
        oidc.client.applicationType === 'native'
        && oidc.params.response_type !== 'none'
        && (!oidc.result || !('consent' in oidc.result))
      ) {
        return Check.REQUEST_PROMPT;
      }
  
      return Check.NO_NEED_TO_PROMPT;
    }),
  
    new Check('op_scopes_missing', 'requested scopes not granted', async (ctx) => {
      console.log("interactions: running op_scopes_missing check");
      const { oidc } = ctx;
      let encounteredScopes
      if (oidc.grant != undefined) {
        encounteredScopes = new Set(oidc.grant.getOIDCScopeEncountered().split(' '));
      }
  
      let missing;
      for (const scope of oidc.requestParamOIDCScopes) {
        if (encounteredScopes != undefined && !encounteredScopes.has(scope)) {
          console.log(`interactions: op_scopes_missing check: missing scope ${scope}`)
          
          missing ||= [];
          missing.push(scope);
        }
      }
  
      if (missing?.length) {
        console.log(`interactions: op_scopes_missing check: missing scopes, prompting consent: ${missing.join(' ')}`);
        ctx.oidc[missingOIDCScope] = missing;
        return Check.REQUEST_PROMPT;
      }
  
      return Check.NO_NEED_TO_PROMPT;
    }, ({ oidc }) => ({ missingOIDCScope: oidc[missingOIDCScope] })),
  
    new Check('op_claims_missing', 'requested claims not granted', (ctx) => {
      console.log("interactions: running op_claims_missing check");
      const { oidc } = ctx;
      let encounteredClaims
      if (oidc.grant != undefined) {
        encounteredClaims = new Set(oidc.grant.getOIDCClaimsEncountered());
      }
  
      let missing;
      for (const claim of oidc.requestParamClaims) {
        if (encounteredClaims != undefined && !encounteredClaims.has(claim) && !['sub', 'sid', 'auth_time', 'acr', 'amr', 'iss'].includes(claim)) {
          
            missing ||= [];
            missing.push(claim);
        }
      }
  
      if (missing?.length) {
        console.log(`interactions: op_claims_missing check: missing claims, prompting consent: ${missing.join(' ')}`);
        ctx.oidc[missingOIDCClaims] = missing;
        return Check.REQUEST_PROMPT;
      }
  
      return Check.NO_NEED_TO_PROMPT;
    }, ({ oidc }) => ({ missingOIDCClaims: oidc[missingOIDCClaims] })),
  
    // checks resource server scopes
    new Check('rs_scopes_missing', 'requested scopes not granted', (ctx) => {
      console.log("interactions: running rs_scopes_missing check");
      const { oidc } = ctx;
  
      let missing;
  
      for (const [indicator, resourceServer] of Object.entries(ctx.oidc.resourceServers)) {
        let encounteredScopes
        if (oidc.grant != undefined) {
          encounteredScopes = new Set(oidc.grant.getResourceScopeEncountered(indicator).split(' '));
        }
        const requestedScopes = ctx.oidc.requestParamScopes;
        const availableScopes = resourceServer.scopes;
  
        for (const scope of requestedScopes) {
          if (encounteredScopes != undefined && availableScopes.has(scope) && !encounteredScopes.has(scope)) {
            missing || (missing = {});
            missing[indicator] || (missing[indicator] = []);
            missing[indicator].push(scope);
          }
        }
      }
  
      if (missing && Object.keys(missing).length) {
        console.log(`interactions: rs_scopes_missing check: missing scopes, prompting consent: ${JSON.stringify(missing)}`);
        ctx.oidc[missingResourceScopes] = missing;
        return Check.REQUEST_PROMPT;
      }
  
      return Check.NO_NEED_TO_PROMPT;
    }, ({ oidc }) => ({ missingResourceScopes: oidc[missingResourceScopes] })),

    // checks authorization_details
    new Check('rar_prompt', 'authorization_details were requested', (ctx) => {
      console.log("interactions: running rar_prompt check");
      const { oidc } = ctx;

      if (oidc.params.authorization_details && !oidc.result?.consent) {
        return Check.REQUEST_PROMPT;
      }

      return Check.NO_NEED_TO_PROMPT;
    }, ({ oidc }) => ({ rar: JSON.parse(oidc.params.authorization_details) })),
  )
  ],
  url(ctx, interaction) {
    const base = `/interaction/${interaction.uid}`;
    const extra = new URLSearchParams(interaction.params);
    console.log(`interactions: generating interaction url for prompt ${interaction.prompt.name}`);
    if (interaction.prompt.name === 'totp') {
      return `${base}/totp?${extra}`;
    }
    return `${base}?${extra}`;
  }
}

export default interactions;