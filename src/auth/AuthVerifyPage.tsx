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
 * query param except the token so `redirect`/`action` post-auth intent keeps working.
 *
 * **This page is NOT a validation boundary and must not be treated as one.** It does no
 * filtering of the params it forwards — it merely declines to strip them. The redirect
 * allowlist (`redirect-allowlist.ts`) is enforced downstream by `AuthCallbackPage`, which
 * re-validates `redirect` with `isSafeRedirectPath` before navigating. If that downstream
 * check is ever removed or weakened, this page becomes an open-redirect vector; it is not
 * a second line of defence.
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
import { isSafeRedirectPath } from "./redirect-allowlist";

/**
 * OTP types this route will redeem. Narrowed on purpose: `token_hash` arrives from the
 * URL, and `type` steers which GoTrue verification path runs, so it is attacker-supplied
 * input to a security-relevant call. Anything not listed falls back to 'magiclink'.
 *
 * 'signup' and 'email' cover the confirmation link a self-service signup produces;
 * 'recovery' covers a password-reset-shaped link; 'magiclink' is the plain sign-in case.
 */
// This is the COMPLETE EmailOtpType union as of @supabase/auth-js in node_modules
// (lib/types.d.ts: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email').
// Listing a subset is worse than it looks: an omitted-but-valid type silently falls back to
// 'magiclink', GoTrue rejects the mismatch, and the page tells the user their perfectly good
// link "can't be used". The first version of this list omitted 'invite' and 'email_change'.
// If you narrow this list, narrow it deliberately and say why — do not let it drift.
const ALLOWED_OTP_TYPES = [
  'magiclink',
  'signup',
  'email',
  'recovery',
  'invite',
  'email_change',
] as const;

function parseOtpType(raw: string | null): EmailOtpType {
  return (ALLOWED_OTP_TYPES as readonly string[]).includes(raw ?? '')
    ? (raw as EmailOtpType)
    : 'magiclink';
}

const CALLBACK_PATH = '/auth/callback';

/**
 * P1325: the signup and magic-link email templates point here with
 * `redirect_to={{ .RedirectTo }}` — the full `/auth/callback?source=…&redirect=…&action=…` URL
 * the app passed as `emailRedirectTo`. The hosted template may render it escaped or raw, and
 * raw its own `&` split it into top-level params, so the value is recovered from the raw query
 * string rather than from URLSearchParams. `redirect_to` is expected to be the LAST param.
 *
 * Returns the callback's query params when `redirect_to` names this origin's /auth/callback;
 * EMPTY params when it is present but names anything else (sign-in proceeds, intent is dropped,
 * and nothing smuggled beside it is forwarded); null when there is no `redirect_to` at all, so
 * P1257 operator links keep their flat-param forwarding.
 *
 * This is not the redirect boundary — AuthCallbackPage re-validates `redirect` with
 * isSafeRedirectPath. It only refuses to let an email link choose where the hand-off goes.
 */
function parseCarriedRedirect(rawSearch: string, origin: string): URLSearchParams | null {
  const match = /(?:^\?|[?&])redirect_to=/.exec(rawSearch);
  if (!match) return null;
  const remainder = rawSearch.slice(match.index + match[0].length);

  let candidate: string;
  if (/^https?%3A/i.test(remainder)) {
    const end = remainder.indexOf('&');
    try {
      candidate = decodeURIComponent(end === -1 ? remainder : remainder.slice(0, end));
    } catch {
      return new URLSearchParams();
    }
  } else {
    candidate = remainder;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return new URLSearchParams();
  }
  if (url.origin !== origin || url.pathname !== CALLBACK_PATH) return new URLSearchParams();

  const carried = new URLSearchParams(url.search);
  carried.delete('token_hash');
  carried.delete('type');
  return carried;
}

/**
 * P1325: supabase-js RETURNS network failures and 5xx as `AuthRetryableFetchError` (auth-js
 * lib/fetch.js handleError) — it does not throw them, so a `.catch` never sees a dropped
 * connection. 429 is a refusal to process, not a verdict on the token. All of these leave the
 * token unspent as far as this page can know, so the link must survive them.
 */
function isRetryableError(error: { name?: string; status?: number }): boolean {
  if (error.name === 'AuthRetryableFetchError') return true;
  const status = error.status;
  return status === 0 || status === 429 || (typeof status === 'number' && status >= 500);
}

/**
 * P1325: the way out of a dead link keeps the post-auth intent. A failed SIGNUP goes back to
 * /signup — /login refuses anyone without a profile ("No account found"), which is exactly the
 * person whose confirmation just failed. Only an allowlisted redirect is carried.
 */
function recoveryHref(forwarded: URLSearchParams): string {
  const base = forwarded.get('source') === 'signup' ? '/signup' : '/login';
  const redirect = forwarded.get('redirect');
  if (!isSafeRedirectPath(redirect)) return base;
  const out = new URLSearchParams({ redirect });
  const action = forwarded.get('action');
  if (action) out.set('action', action);
  return `${base}?${out.toString()}`;
}

export function AuthVerifyPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  // Distinguishes "GoTrue rejected this token" from "we never reached GoTrue". Only the
  // second is retryable, and only the second leaves the link still usable.
  const [networkError, setNetworkError] = useState(false);
  const [recoverTo, setRecoverTo] = useState('/login');

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
    // intent survives the hand-off to the Writer. P1325: a template-carried redirect_to
    // replaces the flat params entirely when present.
    params.delete('token_hash');
    params.delete('type');
    const carried = parseCarriedRedirect(window.location.search, window.location.origin);
    params.delete('redirect_to');
    const forwardedParams = carried ?? params;
    const forwarded = forwardedParams.toString();
    const callbackUrl = forwarded ? `${CALLBACK_PATH}?${forwarded}` : CALLBACK_PATH;
    setRecoverTo(recoveryHref(forwardedParams));

    if (!tokenHash) {
      setFailed(true);
      return;
    }

    // Strip the token from the address bar so it does not linger in history, referrers or a
    // screenshot — but only once we know its fate.
    const stripToken = () =>
      window.history.replaceState(null, '', window.location.pathname);

    const retryable = (err: unknown) => {
      // NOT definitive — the token is still UNSPENT as far as we can know. Deliberately do not
      // strip it: leaving it in the URL means a refresh retries, which is the one recovery a
      // person can find on their own. Stripping here would destroy a working link from their
      // side and then tell them it was already used — the exact dead end this page exists to
      // remove.
      console.error('[auth-verify] verifyOtp did not reach a verdict:', err);
      setNetworkError(true);
      setFailed(true);
    };

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: otpType })
      .then(async ({ error }) => {
        if (error && isRetryableError(error)) {
          retryable(error);
          return;
        }
        // Anything else is DEFINITIVE: GoTrue answered. On success the token is spent; on an
        // auth error it is rejected. Nothing is lost by removing it from the URL now.
        stripToken();
        if (error) {
          console.error('[auth-verify] verifyOtp failed:', error.message);
          // P1325: a second click on the same link, in a browser that is already signed in,
          // is not a failure worth a dead end — carry on with the intent.
          try {
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
              navigate(callbackUrl, { replace: true });
              return;
            }
          } catch {
            // fall through to the error screen
          }
          setFailed(true);
          return;
        }
        // Session established. AuthCallbackPage owns the profile upsert and the
        // post-auth routing from here.
        navigate(callbackUrl, { replace: true });
      })
      .catch(retryable);
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
            {/*
              Two genuinely different situations, and conflating them is what strands people.
              A network failure leaves the link UNSPENT and still in the address bar, so the
              honest instruction is "try again" — telling that person to request a new link
              would be advice to abandon a link that still works.
            */}
            <h1 className="text-3xl font-bold">
              {networkError ? "We couldn't reach the server" : "This link can't be used"}
            </h1>
            {/*
              The non-network branch deliberately does NOT say "valid for 1 hour" — a used
              link and an expired link are indistinguishable from here, and AuthCallbackPage's
              version of this copy states a cause it cannot know (docs/decisions.md 2026-09-03).
            */}
            <p className="text-lg text-muted-foreground">
              {networkError
                ? 'Your link is still good. Check your connection and reload this page to try again.'
                : 'It may already have been used, or it may have expired. Sending yourself a new one will work.'}
            </p>
          </div>
          {/*
            Routes to /login, not /sign-pledge. This link is how a person who ALREADY has
            an account gets back in; sending them to the pledge signup is the mis-route
            docs/decisions.md 2026-09-03 flagged as "a loop with no exit".
          */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            {networkError ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white"
              >
                Try again
              </button>
            ) : (
              <Link
                to={recoverTo}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white"
              >
                Send me a new link
              </Link>
            )}
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
