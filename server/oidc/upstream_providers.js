import * as oidc from 'openid-client';
import { sequelize } from './db_adapter.js';
import { DataTypes } from 'sequelize';

// Define UpstreamProvider model
export const UpstreamProvider = sequelize.define('upstream_providers', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  display_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('oidc', 'oauth2'),
    allowNull: false,
    defaultValue: 'oidc',
  },
  client_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  client_secret: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  discovery_url: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  authorization_endpoint: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  token_endpoint: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  userinfo_endpoint: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  scopes: {
    type: DataTypes.STRING(512),
    allowNull: false,
    defaultValue: 'openid email profile',
  },
  icon_url: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  button_color: {
    type: DataTypes.STRING(7),
    allowNull: true,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  config_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'upstream_providers',
  underscored: true,
  timestamps: true,
});

// Cache for initialized OIDC clients
const clientCache = new Map();
const cacheTimestamp = new Map();
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get all enabled upstream providers from database
 *
 * @returns {Promise<Array>} Array of enabled provider configurations
 */
export async function getEnabledProviders() {
  try {
    const providers = await UpstreamProvider.findAll({
      where: { enabled: true },
      order: [['sort_order', 'ASC'], ['display_name', 'ASC']],
    });

    return providers.map(p => p.toJSON());
  } catch (error) {
    console.error('Failed to fetch enabled providers:', error);
    return [];
  }
}

/**
 * Get a specific provider configuration by name
 *
 * @param {string} providerName - Provider identifier
 * @returns {Promise<Object|null>} Provider configuration or null
 */
export async function getProvider(providerName) {
  try {
    const provider = await UpstreamProvider.findOne({
      where: { name: providerName, enabled: true },
    });

    return provider ? provider.toJSON() : null;
  } catch (error) {
    console.error(`Failed to fetch provider ${providerName}:`, error);
    return null;
  }
}

/**
 * Initialize an OIDC/OAuth client for a provider
 * Results are cached to avoid repeated discovery calls
 *
 * @param {Object} provider - Provider configuration
 * @param {string} callbackUrl - Full callback URL for this provider
 * @returns {Promise<Object>} Initialized OIDC/OAuth client
 */
export async function initializeClient(provider, callbackUrl) {
  const cacheKey = `${provider.name}:${callbackUrl}`;
  const now = Date.now();

  // Check cache
  if (clientCache.has(cacheKey) && cacheTimestamp.has(cacheKey)) {
    const age = now - cacheTimestamp.get(cacheKey);
    if (age < CACHE_DURATION_MS) {
      console.debug(`Using cached client for ${provider.name}`);
      return clientCache.get(cacheKey);
    }
  }

  console.debug(`Initializing client for ${provider.name} (${provider.type})`);

  try {
    if (provider.type === 'oidc' && provider.discovery_url) {
      // OIDC with discovery
      const issuer = await oidc.discovery(
        new URL(provider.discovery_url),
        provider.client_id,
        provider.client_secret
      );

      const client = {
        issuer,
        provider,
        type: 'oidc',
        scopes: provider.scopes,
      };

      clientCache.set(cacheKey, client);
      cacheTimestamp.set(cacheKey, now);

      return client;
    } else {
      // OAuth 2.0 without discovery (e.g., GitHub)
      const client = {
        provider,
        type: 'oauth2',
        scopes: provider.scopes,
        authorization_endpoint: provider.authorization_endpoint,
        token_endpoint: provider.token_endpoint,
        userinfo_endpoint: provider.userinfo_endpoint,
      };

      clientCache.set(cacheKey, client);
      cacheTimestamp.set(cacheKey, now);

      return client;
    }
  } catch (error) {
    console.error(`Failed to initialize client for ${provider.name}:`, error);
    throw error;
  }
}

/**
 * Build authorization URL for a provider
 *
 * @param {Object} client - Initialized client from initializeClient()
 * @param {string} callbackUrl - Full callback URL
 * @param {string} state - State parameter for CSRF protection
 * @param {string} codeVerifier - PKCE code verifier
 * @returns {Promise<string>} Authorization URL
 */
export async function buildAuthorizationUrl(client, callbackUrl, state, codeVerifier) {
  if (client.type === 'oidc') {
    // Use openid-client for OIDC
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    return oidc.buildAuthorizationUrl(client.issuer, {
      redirect_uri: callbackUrl,
      scope: client.scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
  } else {
    // Manual OAuth 2.0 URL construction
    const params = new URLSearchParams({
      client_id: client.provider.client_id,
      redirect_uri: callbackUrl,
      scope: client.scopes,
      state,
      response_type: 'code',
    });

    return `${client.authorization_endpoint}?${params.toString()}`;
  }
}

/**
 * Exchange authorization code for tokens
 *
 * @param {Object} client - Initialized client from initializeClient()
 * @param {string} callbackUrl - Full callback URL (must match authorization)
 * @param {Object} params - URL parameters from callback
 * @param {string} codeVerifier - PKCE code verifier
 * @param {string} expectedState - Expected state value
 * @returns {Promise<Object>} Token response with claims
 */
export async function exchangeCode(client, callbackUrl, params, codeVerifier, expectedState) {
  if (client.type === 'oidc') {
    // Use openid-client for OIDC
    const url = new URL(callbackUrl);
    url.search = new URLSearchParams(params).toString();

    const tokens = await oidc.authorizationCodeGrant(client.issuer, url, {
      pkceCodeVerifier: codeVerifier,
      idTokenExpected: true,
      expectedState,
    });

    return {
      access_token: tokens.access_token,
      id_token: tokens.id_token,
      claims: tokens.claims(),
    };
  } else {
    // Manual OAuth 2.0 token exchange
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: callbackUrl,
      client_id: client.provider.client_id,
      client_secret: client.provider.client_secret,
    });

    const tokenResponse = await fetch(client.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokens = await tokenResponse.json();

    // Fetch userinfo for claims
    const userinfoResponse = await fetch(client.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userinfoResponse.ok) {
      throw new Error(`Userinfo fetch failed: ${userinfoResponse.statusText}`);
    }

    const userinfo = await userinfoResponse.json();

    return {
      access_token: tokens.access_token,
      claims: userinfo,
    };
  }
}

/**
 * Clear the client cache (useful for testing or configuration updates)
 */
export function clearClientCache() {
  console.debug('Clearing provider client cache');
  clientCache.clear();
  cacheTimestamp.clear();
}

export default {
  UpstreamProvider,
  getEnabledProviders,
  getProvider,
  initializeClient,
  buildAuthorizationUrl,
  exchangeCode,
  clearClientCache,
};
