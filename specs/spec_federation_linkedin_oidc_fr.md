# Spécification : Fédération LinkedIn — intégration avec `node-oidc-provider`

## But
Fournir un guide détaillé pour permettre à votre Authorization Server (implémenté avec `node-oidc-provider`) d’accepter des authentifications réalisées via **LinkedIn** (external IdP), de normaliser les informations d’identité et d’émettre des tokens OIDC vers vos clients.

> Contrainte principale : `node-oidc-provider` est un **OpenID Provider** (OP). Pour fédérer un fournisseur d’identité externe (LinkedIn), il faut implémenter un **upstream OAuth/OIDC client flow** à l’intérieur des interactions d’`oidc-provider` et mapper l’identité externe vers un compte local.

---

## Prérequis
- Compte développeur LinkedIn + application LinkedIn configurée (Client ID + Client Secret, redirect URIs).
- Node.js (version LTS recommandée).
- `node-oidc-provider` (version la plus récente stable).
- Bibliothèques clientes OAuth/OIDC pour agir en tant que client auprès de LinkedIn, par ex. `openid-client` ou `simple-oauth2`.
- Stockage pour accounts/clients (Adapter compatible `oidc-provider` : Redis, Mongo, SQL, ou adapter custom).

---

## Architecture

1. Client (SPA ou backend) → demande OIDC à votre Authorization Server (`node-oidc-provider`).
2. AS démarre un *interaction* (login) ; si l’utilisateur choisit « Se connecter avec LinkedIn » :
   - AS redirige le flow OAuth/OIDC vers LinkedIn.
3. LinkedIn authentifie l’utilisateur → redirige vers un callback que vous gérez côté AS.
4. AS échange le code contre un token LinkedIn, récupère le profile (userinfo), puis :
   - mappe ou provisionne un **compte local**
   - émet un `id_token` / `access_token` / `refresh_token` vers le **client** initial.

Schéma : Client → AS → LinkedIn → AS → Client.

---

## Endpoints LinkedIn
- Authorization endpoint: `https://www.linkedin.com/oauth/v2/authorization`
- Token endpoint: `https://www.linkedin.com/oauth/v2/accessToken`
- Userinfo: `https://api.linkedin.com/v2/userinfo`
- Scopes : `openid`, `r_liteprofile`, `r_emailaddress`

---

## Configuration du `node-oidc-provider`

### Exemple d’initialisation
```js
import express from 'express';
import { Provider } from 'oidc-provider';

const issuer = 'https://auth.example.com';
const configuration = { clients: [], findAccount: async () => {} };

const app = express();
const provider = new Provider(issuer, configuration);

app.use('/oidc', provider.callback());
app.listen(3000);
```

### Points clés
- `findAccount`: retourne un compte local à partir d’un `accountId`.
- `interactions`: routes où vous proposez la connexion via LinkedIn.
- `features`: activer PKCE, refresh tokens, etc.
- `adapter`: persistance (Redis, Mongo, etc.).

---

## Intégration LinkedIn

### 1. Lancer l’authentification LinkedIn
```js
import { Issuer } from 'openid-client';

const linkedinIssuer = await Issuer.discover('https://www.linkedin.com');
const client = new linkedinIssuer.Client({
  client_id: LINKEDIN_CLIENT_ID,
  client_secret: LINKEDIN_CLIENT_SECRET,
  redirect_uris: ['https://auth.example.com/auth/linkedin/callback'],
  response_types: ['code'],
});

function startLinkedInAuth(req, res) {
  const url = client.authorizationUrl({
    scope: 'openid r_liteprofile r_emailaddress',
  });
  res.redirect(url);
}
```

### 2. Callback LinkedIn
```js
async function linkedinCallback(req, res) {
  const params = client.callbackParams(req);
  const tokenSet = await client.callback('https://auth.example.com/auth/linkedin/callback', params);
  const userinfo = await client.userinfo(tokenSet.access_token);
  // Mapper ou créer le compte local ici
}
```

### 3. Mapping d’un compte local
```js
const configuration = {
  findAccount: async (ctx, id) => {
    const user = await Users.findById(id);
    return {
      accountId: user.id,
      async claims() {
        return { sub: user.id, name: user.name, email: user.email };
      }
    };
  },
};
```

### 4. Finaliser l’interaction
```js
await provider.interactionFinished(ctx.req, ctx.res, {
  login: { accountId: localAccountId },
  consent: {}
}, { mergeWithLastSubmission: false });
```

---

## Sécurité
- Activer PKCE pour les clients publics.
- Vérifier `state` et `nonce` pour éviter les attaques CSRF et replay.
- Ne pas exposer les tokens LinkedIn à vos clients.
- Stocker le `client_secret` de LinkedIn dans un gestionnaire de secrets sécurisé.

---

## Checklist
1. Créer une app LinkedIn et obtenir le Client ID/Secret.
2. Configurer `node-oidc-provider` avec vos clients et `findAccount`.
3. Implémenter `/interaction/:uid`, `/auth/linkedin/start`, `/auth/linkedin/callback`.
4. Utiliser `openid-client` pour parler à LinkedIn.
5. Mapper et stocker les comptes utilisateurs.
6. Finaliser l’interaction et émettre le token au client.

---

## Références
- [node-oidc-provider](https://github.com/panva/node-oidc-provider)
- [LinkedIn OIDC Docs](https://learn.microsoft.com/linkedin/shared/authentication/)
