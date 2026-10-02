/** P1380: the event-link reply's `to` must be an app path; anything else is refused (no open redirect). */
export function safeAppPath(to: unknown): string | null {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//') || to.includes('\\')) return null;
  return to;
}

/** P1380: why an email button cannot sign this account in, in one plain sentence. */
export function loginReasonText(reason: string): string {
  switch (reason) {
    case 'used': return 'This button has already been used. Sign in to continue.';
    case 'expired': return 'This button has expired. Sign in to continue.';
    case 'restricted': return 'For security, your account signs in the usual way, not from an email button.';
    default: return 'Sign in to continue.';
  }
}
