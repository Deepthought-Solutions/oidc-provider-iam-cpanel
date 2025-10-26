import domainVerificationService from '../../server/oidc/domain_verification_service.js';
import upstreamProvidersService from '../../server/oidc/upstream_providers_service.js';

/**
 * Mock manager for test isolation
 * Uses service wrapper replacement for clean ES module mocking
 */
export class MockManager {
  private originalFunctions: Map<string, any> = new Map();

  /**
   * Mock domain verification to always return false (external domains)
   */
  mockAllDomainsExternal(): void {
    this.mockDomainVerification(async () => false);
  }

  /**
   * Mock domain verification with custom logic
   */
  mockDomainVerification(fn: (email: string) => Promise<boolean>): void {
    if (!this.originalFunctions.has('isOwnedDomain')) {
      this.originalFunctions.set('isOwnedDomain', domainVerificationService.isOwnedDomain);
    }
    domainVerificationService.isOwnedDomain = fn;
  }

  /**
   * Mock upstream provider token exchange
   */
  mockExchangeCode(response: any): void {
    if (!this.originalFunctions.has('exchangeCode')) {
      this.originalFunctions.set('exchangeCode', upstreamProvidersService.exchangeCode);
    }
    upstreamProvidersService.exchangeCode = async () => response;
  }

  /**
   * Expose exchangeCode mock for advanced usage (e.g., .rejects())
   */
  get exchangeCode() {
    const mockObj = {
      rejects: (error: Error) => {
        if (!this.originalFunctions.has('exchangeCode')) {
          this.originalFunctions.set('exchangeCode', upstreamProvidersService.exchangeCode);
        }
        upstreamProvidersService.exchangeCode = async () => {
          throw error;
        };
      }
    };
    return mockObj;
  }

  /**
   * Mock upstream provider authorization URL builder
   */
  mockBuildAuthorizationUrl(urlOrFn: string | ((client: any, callbackUrl: string, state: string) => string)): void {
    if (!this.originalFunctions.has('buildAuthorizationUrl')) {
      this.originalFunctions.set('buildAuthorizationUrl', upstreamProvidersService.buildAuthorizationUrl);
    }
    upstreamProvidersService.buildAuthorizationUrl =
      typeof urlOrFn === 'string'
        ? async () => urlOrFn
        : urlOrFn as any;
  }

  /**
   * Restore all mocks
   */
  restore(): void {
    this.originalFunctions.forEach((originalFn, key) => {
      if (key === 'isOwnedDomain') {
        domainVerificationService.isOwnedDomain = originalFn;
      } else if (key === 'exchangeCode') {
        upstreamProvidersService.exchangeCode = originalFn;
      } else if (key === 'buildAuthorizationUrl') {
        upstreamProvidersService.buildAuthorizationUrl = originalFn;
      }
    });
    this.originalFunctions.clear();
  }
}
