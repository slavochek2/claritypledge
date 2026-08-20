// Mixpanel wrapper for type-safe analytics tracking
// The Mixpanel snippet is loaded via index.html
// Only tracks in production to avoid polluting data with dev events
//
// P28.2: Also supports ML event collection - when a SessionEventsCollector is registered,
// ALL tracked events are automatically captured for ML training (future-proof).

import type { SessionEventsCollector } from './session-events-collector';

declare global {
  interface Window {
    mixpanel: {
      track: (event: string, properties?: Record<string, unknown>) => void;
      identify: (userId: string) => void;
      people: {
        set: (properties: Record<string, unknown>) => void;
      };
      reset: () => void;
    };
  }
}

const isProduction = import.meta.env.PROD;

// P28.2: ML event collection - registered collector receives ALL events automatically
let mlCollector: SessionEventsCollector | null = null;

// P1133: any @claritypledge.com login is an internal/service account by construction —
// covers ops@claritypledge.com and any future internal account with zero code changes.
const INTERNAL_EMAIL_DOMAIN = '@claritypledge.com';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * P1133: gmail.com/googlemail.com treat dots in the local part and a trailing +tag
 * as the same mailbox, and gmail.com/googlemail.com are the same provider under two
 * domain names — an exact-string/exact-hash comparison would see these as different
 * accounts when they're one person's single mailbox. Canonicalize before hashing
 * (and hash the canonical form when generating VITE_INTERNAL_ACCOUNT_EMAIL_HASHES
 * entries) so aliasing doesn't silently defeat the allowlist. Only touches
 * gmail-family domains — no other provider's aliasing rules are assumed.
 */
function canonicalizeGmailFamily(lowerEmail: string): string {
  const at = lowerEmail.lastIndexOf('@');
  if (at === -1) return lowerEmail;
  let local = lowerEmail.slice(0, at);
  let domain = lowerEmail.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '');
  return `${local}@${domain}`;
}

/**
 * P1133: non-domain internal accounts (e.g. the founder's own personal login) that
 * should still be excluded from customer funnel numbers.
 *
 * Deliberately HASHES, never stores plaintext: VITE_* vars are inlined verbatim into
 * the public production JS bundle at build time (Vite convention — confirmed by
 * grepping a real built bundle for another VITE_* var's value). A plaintext email
 * allowlist here would ship the address to every visitor, which is exactly the leak
 * this design is meant to avoid. VITE_INTERNAL_ACCOUNT_EMAIL_HASHES holds
 * comma-separated lowercase SHA-256 hex digests instead — generate one with
 * `echo -n "someone@example.com" | shasum -a 256`. For a gmail-family address, hash
 * the CANONICAL form (see canonicalizeGmailFamily below) — the googlemail.com domain
 * variant and any +tag must be normalized away first, or the hash won't match.
 */
function internalEmailHashAllowlist(): Set<string> {
  const raw = import.meta.env.VITE_INTERNAL_ACCOUNT_EMAIL_HASHES as string | undefined;
  if (!raw) {
    // P1133: silent-forever gap otherwise — this is the only place absence is
    // observable, since setUserProperties() itself is a no-op outside production.
    if (import.meta.env.PROD) {
      console.warn(
        '[P1133] VITE_INTERNAL_ACCOUNT_EMAIL_HASHES is unset in production — ' +
        'non-domain internal accounts (e.g. a personal login) will be tagged is_internal:false.'
      );
    }
    return new Set();
  }
  return new Set(
    raw.split(',').map((hash) => hash.trim().toLowerCase()).filter(Boolean)
  );
}

/**
 * P1133: is this a known non-customer account? Add a new internal/service account
 * by its domain (if @claritypledge.com) or its hash in VITE_INTERNAL_ACCOUNT_EMAIL_HASHES
 * (otherwise) — is_test_account-flagged profiles are already covered automatically.
 */
export async function isInternalAccount(
  email: string | null | undefined,
  isTestAccount: boolean | null | undefined
): Promise<boolean> {
  if (isTestAccount) return true;
  if (!email) return false;
  const lower = email.toLowerCase();
  if (lower.endsWith(INTERNAL_EMAIL_DOMAIN)) {
    // P1133: visibility for the inverse failure mode — a real customer/certifier/
    // employee given a @claritypledge.com address is classified internal by
    // construction, silently, with no other signal. Loud in prod only (matches
    // the rest of this file's isProduction discipline); harmless in dev/test.
    if (import.meta.env.PROD) {
      console.warn('[P1133] is_internal:true via @claritypledge.com domain match — verify this is a service account, not a real customer.');
    }
    return true;
  }
  const hash = await sha256Hex(canonicalizeGmailFamily(lower));
  return internalEmailHashAllowlist().has(hash);
}

export const analytics = {
  /**
   * Register an ML events collector. While registered, ALL tracked events
   * are automatically captured for ML training (not just live_* events).
   * Call unregisterMLCollector() when session ends.
   */
  registerMLCollector: (collector: SessionEventsCollector) => {
    mlCollector = collector;
    console.log('[Analytics] ML collector registered - all events will be captured');
  },

  /**
   * Unregister the ML events collector.
   */
  unregisterMLCollector: () => {
    mlCollector = null;
    console.log('[Analytics] ML collector unregistered');
  },

  track: (event: string, properties?: Record<string, unknown>) => {
    // P28.2: Capture for ML training if collector is registered and started
    if (mlCollector?.isStarted()) {
      mlCollector.addEvent(event, properties ?? {});
    }

    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.track(event, properties);
    }
  },

  identify: (userId: string) => {
    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.identify(userId);
    }
  },

  setUserProperties: (properties: Record<string, unknown>) => {
    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.people.set(properties);
    }
  },

  reset: () => {
    if (!isProduction) return;
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.reset();
    }
  },
};

