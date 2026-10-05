/**
 * P1421: a per-device hint that this auth user id last resolved to a VERIFIED profile.
 *
 * The signed-in header and bottom nav render their final layout while the profile is still
 * loading — but only with this evidence. Without it (first sign-in on a device, a profile that
 * last resolved unverified or failed to load) the nav keeps its old loading behaviour, so a
 * session that ends up signed-out-shaped is not shown signed-in chrome first.
 * Only a layout hint: it never grants anything, and every read/write tolerates blocked storage.
 */
const KEY_PREFIX = "cp:nav-verified:";

export function hasNavVerifiedHint(userId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function setNavVerifiedHint(userId: string, verified: boolean): void {
  try {
    if (verified) localStorage.setItem(KEY_PREFIX + userId, "1");
    else localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    // storage blocked — the nav just falls back to its no-hint loading behaviour
  }
}

/**
 * Remove every marker. Called on each way a session ends (sign-out, expiry, revocation, a
 * sign-out in another tab) so a shared device keeps no trace of the previous account.
 */
export function clearAllNavVerifiedHints(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage blocked — nothing was stored either
  }
}
