import * as impl from './upstream_providers.js';

/**
 * Service wrapper for upstream providers
 * Allows test mocking through service replacement
 */
export const upstreamProvidersService = {
  UpstreamProvider: impl.UpstreamProvider,
  getEnabledProviders: impl.getEnabledProviders,
  getProvider: impl.getProvider,
  initializeClient: impl.initializeClient,
  buildAuthorizationUrl: impl.buildAuthorizationUrl,
  exchangeCode: impl.exchangeCode,
  clearClientCache: impl.clearClientCache,
};

export default upstreamProvidersService;
