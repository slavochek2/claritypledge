/**
 * @file AuthVerifyPage.tsx
 * @module auth
 *
 * P1257: the generic sign-in landing page. Route: /auth/verify?token_hash=...
 *
 * WHY THIS EXISTS. `supabase.auth.admin.generateLink()` returns an implicit-flow URL
 * (`#access_token=...`). This app's client sets `flowType: 'pkce'` (src/lib/supabase.ts),
 * and auth-js REFUSES an implicit callback URL under PKCE — it throws
 * `AuthPKCEGrantCodeExchangeError("Not a valid PKCE flow url")` rather than consuming the
 * token. So before this page existed, no link we minted server-side or by hand was
 * redeemable by this app at all: a valid, unexpired token rendered "Link Expired or
 * Invalid" with zero Supabase keys in localStorage. Verified end-to-end 2026-09-07.
 *
 * The fix is the mechanism already running in production for letter responses
 * (`letter-response-confirm-page.tsx`, P684/P527): take `properties.hashed_token` from
 * generateLink and redeem it here with `verifyOtp({ token_hash })`. That call is a plain
 * POST from JS — it needs no PKCE code verifier, so it works cross-browser, and a
 * non-executing link pre-fetcher never triggers it.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT DO. It does not create or upsert a profile.
 * `AuthCallbackPage` is the single Writer for that transaction and says so in its own
 * header; duplicating it here would create exactly the race that header exists to prevent.
 * This page establishes the session and hands off to `/auth/callback`, forwarding every
 * query param except the token so `redirect`/`action` post-auth intent keeps working and
 * the redirect allowlist stays the one in `redirect-allowlist.ts`.
 *
 * INVARIANT: this route is ADDITIVE. `/auth/callback` is untouched and PKCE stays on.
 * docs/decisions.md 2026-09-03 rejected converting the callback itself to token_hash while
 * the pre-fetch question is open — that rejection is about the callback, not about adding
 * a separate redemption route beside it.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AlertCircleIcon } from "lucide-react";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * OTP types this route will redeem. Narrowed on purpose: `token_hash` arrives from the
 * URL, and `type` steers which GoTrue verification path runs, so it is attacker-supplied
 * input to a security-relevant call. Anything not listed falls back to 'magiclink'.
 *
 * 'signup' and 'email' cover the confirmation link a self-service signup produces;
 * 'recovery' covers a password-reset-shaped link; 'magiclink' is the plain sign-in case.
 */
const ALLOWED_OTP_TYPES = ['magiclink', 'signup', 'email', 'recovery'] as const;

function parseOtpType(raw: string | null): EmailOtpType {
  return (ALLOWED_OTP_TYPES as readonly string[]).includes(raw ?? '')
    ? (raw as EmailOtpType)
    : 'magiclink';
}

export function AuthVerifyPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  // Guard against React StrictMode's double-invoke and any re-render: a token_hash is
  // single-use, so a second verifyOtp with the same token fails and would flip a
  // successful sign-in into an error screen.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Read from window.location, not useLocation: this is the real URL the mail client
    // opened, which is a browser-level fact. Same reasoning as AuthCallbackPage's
    // error-param parsing.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const otpType = parseOtpType(params.get('type'));

    // Forward everything except the token itself, so ?redirect= / ?action= post-auth
    // intent survives the hand-off to the Writer.
    params.delete('token_hash');
    params.delete('type');
    const forwarded = params.toString();
    const callbackUrl = forwarded ? `/auth/callback?${forwarded}` : '/auth/callback';

    if (!tokenHash) {
      setFailed(true);
      return;
    }

    // Strip the token from the address bar before redeeming it, so it does not linger in
    // history, referrers, or a screenshot. Same treatment as letter-response-confirm.
    window.history.replaceState(null, '', window.location.pathname);

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: otpType })
      .then(({ error }) => {
        if (error) {
          console.error('[auth-verify] verifyOtp failed:', error.message);
          setFailed(true);
          return;
        }
        // Session established. AuthCallbackPage owns the profile upsert and the
        // post-auth routing from here.
        navigate(callbackUrl, { replace: true });
      })
      .catch((err: unknown) => {
        console.error('[auth-verify] verifyOtp threw:', err);
        setFailed(true);
      });
  }, [navigate]);

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <div className="h-16 w-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
              <AlertCircleIcon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">This link can't be used</h1>
            {/*
              Deliberately does NOT say "valid for 1 hour" — a used link and an expired
              link are indistinguishable from here, and AuthCallbackPage's version of this
              copy states a cause it cannot know (noted in docs/decisions.md 2026-09-03).
            */}
            <p className="text-lg text-muted-foreground">
              It may already have been used, or it may have expired. Sending yourself a new
              one will work.
            </p>
          </div>
          {/*
            Routes to /login, not /sign-pledge. This link is how a person who ALREADY has
            an account gets back in; sending them to the pledge signup is the mis-route
            docs/decisions.md 2026-09-03 flagged as "a loop with no exit".
          */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white"
            >
              Send me a new link
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              Return home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <ClarityPageLoader />;
}
