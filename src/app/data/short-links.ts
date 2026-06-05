/**
 * Short link mappings for claritypledge.com/s/:code
 *
 * Add new links here. Codes should be short and memorable.
 * Target URLs can include hash fragments (e.g., /manifesto#section-name)
 */

export const shortLinks: Record<string, string> = {
  // Three Asymmetries section (all point to same section - subsections are bold, not headings)
  "3gaps": "/manifesto#the-three-asymmetries-that-make-verification-hard",
  "role": "/manifesto#the-three-asymmetries-that-make-verification-hard",
  "info": "/manifesto#the-three-asymmetries-that-make-verification-hard",
  "vuln": "/manifesto#the-three-asymmetries-that-make-verification-hard",

  // Manifesto
  "article": "/manifesto",
  "manifesto": "/manifesto",

  // Events
  "lab": "/events/clarity-lab-koh-phangan-2026-03-12-ad3385",

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
 * Doc short codes: short memorable aliases for /d/:docId UUIDs.
 * The doc detail page resolves these before fetching.
 */
export const docShortCodes: Record<string, string> = {
  "ck": "c990ca97-be62-47e7-81ae-3177a4abfbf9",
};

/**
 * Resolve a doc short code to its UUID, or return the input unchanged.
 */
export function resolveDocShortCode(docIdOrCode: string): string {
  return docShortCodes[docIdOrCode.toLowerCase()] ?? docIdOrCode;
}

/**
 * Letter short codes: aliases for /letter/:id resolved BEFORE the
 * resolve_letter_shortcode RPC (which matches full doc titles only —
 * "ck" ≠ doc title "CK - 9", so the RPC alone can't serve /letter/ck).
 * Target: the sealed one-to-many letter for that doc (prod).
 */
export const letterShortCodes: Record<string, string> = {
  "ck": "83ac8fe0-1b84-4c2c-b991-9b488a13d32f",
};

/**
 * Get all available short codes (for documentation/debugging)
 */
export function listShortLinks(): Array<{ code: string; target: string }> {
  return Object.entries(shortLinks).map(([code, target]) => ({ code, target }));
}
