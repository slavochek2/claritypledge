/**
 * Short link mappings for claritypledge.com/s/:code
 *
 * Add new links here. Codes should be short and memorable.
 * Target URLs can include hash fragments (e.g., /article#section-name)
 */

export const shortLinks: Record<string, string> = {
  // Three Asymmetries section (all point to same section - subsections are bold, not headings)
  "3gaps": "/article#the-three-asymmetries-that-make-verification-hard",
  "role": "/article#the-three-asymmetries-that-make-verification-hard",
  "info": "/article#the-three-asymmetries-that-make-verification-hard",
  "vuln": "/article#the-three-asymmetries-that-make-verification-hard",

  // Main article
  "article": "/article",

  // Add more as needed...
};

/**
 * Look up a short code and return the target URL
 * Returns null if code not found
 *
 * SECURITY: All target URLs must be internal paths (starting with /).
 * Never allow external URLs to prevent open redirect attacks.
 */
export function resolveShortLink(code: string): string | null {
  // Normalize: lowercase and remove trailing slash
  const normalizedCode = code.toLowerCase().replace(/\/$/, '');
  const target = shortLinks[normalizedCode];

  if (!target) return null;

  // Security: only allow relative paths (prevent open redirects)
  if (!target.startsWith('/') || target.startsWith('//')) {
    console.error(`Invalid short link target (must be relative path): ${target}`);
    return null;
  }

  return target;
}

/**
 * Get all available short codes (for documentation/debugging)
 */
export function listShortLinks(): Array<{ code: string; target: string }> {
  return Object.entries(shortLinks).map(([code, target]) => ({ code, target }));
}
