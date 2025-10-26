import * as impl from './domain_verification.js';

/**
 * Service wrapper for domain verification
 * Allows test mocking through service replacement
 */
export const domainVerificationService = {
  getOwnedDomains: impl.getOwnedDomains,
  isOwnedDomain: impl.isOwnedDomain,
  clearDomainsCache: impl.clearDomainsCache,
};

export default domainVerificationService;
