import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Cache for owned domains to minimize UAPI calls
let ownedDomainsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get list of domains and subdomains owned by this cPanel account
 * Results are cached for 5 minutes to minimize UAPI calls
 *
 * @returns {Promise<Set<string>>} Set of owned domains (lowercase)
 */
export async function getOwnedDomains() {
  const now = Date.now();

  // Return cached result if still valid
  if (ownedDomainsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    console.debug(`Using cached owned domains (${ownedDomainsCache.size} domains)`);
    return ownedDomainsCache;
  }

  console.debug('Fetching owned domains from cPanel UAPI');

  // In non-production, return empty set (no owned domains)
  if (process.env.NODE_ENV !== 'production') {
    console.debug('Dev/test mode: no owned domains');
    ownedDomainsCache = new Set();
    cacheTimestamp = now;
    return ownedDomainsCache;
  }

  const domains = new Set();

  try {
    // Get main domains
    const { stdout: domainsOutput } = await execAsync('/usr/bin/uapi --output=jsonpretty DomainInfo list_domains');
    const domainsResult = JSON.parse(domainsOutput);

    if (domainsResult.result && domainsResult.result.data) {
      const domainList = domainsResult.result.data.main_domain
        ? [domainsResult.result.data.main_domain, ...(domainsResult.result.data.addon_domains || [])]
        : (domainsResult.result.data.domains || []);

      domainList.forEach(domain => {
        if (domain && typeof domain === 'string') {
          domains.add(domain.toLowerCase());
        } else if (domain && domain.domain) {
          domains.add(domain.domain.toLowerCase());
        }
      });
    }

    // Get subdomains
    const { stdout: subdomainsOutput } = await execAsync('/usr/bin/uapi --output=jsonpretty SubDomain listsubdomains');
    const subdomainsResult = JSON.parse(subdomainsOutput);

    if (subdomainsResult.result && subdomainsResult.result.data) {
      const subdomainList = Array.isArray(subdomainsResult.result.data)
        ? subdomainsResult.result.data
        : [];

      subdomainList.forEach(subdomain => {
        if (subdomain && subdomain.domain) {
          domains.add(subdomain.domain.toLowerCase());
        }
      });
    }

    console.debug(`Fetched ${domains.size} owned domains from UAPI`);
  } catch (error) {
    console.error('Failed to fetch owned domains from UAPI:', error);
    // Return empty set on error - fail open for external domains
    ownedDomainsCache = new Set();
    cacheTimestamp = now;
    return ownedDomainsCache;
  }

  ownedDomainsCache = domains;
  cacheTimestamp = now;
  return domains;
}

/**
 * Check if an email address belongs to a domain owned by this cPanel account
 *
 * @param {string} email - Email address to check
 * @returns {Promise<boolean>} True if email domain is owned by this server
 */
export async function isOwnedDomain(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return false;
  }

  const domain = email.split('@')[1].toLowerCase();
  const ownedDomains = await getOwnedDomains();

  const isOwned = ownedDomains.has(domain);
  console.debug(`Domain check for ${domain}: ${isOwned ? 'OWNED' : 'EXTERNAL'}`);

  return isOwned;
}

/**
 * Clear the owned domains cache (useful for testing or manual refresh)
 */
export function clearDomainsCache() {
  console.debug('Clearing owned domains cache');
  ownedDomainsCache = null;
  cacheTimestamp = null;
}

export default {
  getOwnedDomains,
  isOwnedDomain,
  clearDomainsCache,
};
