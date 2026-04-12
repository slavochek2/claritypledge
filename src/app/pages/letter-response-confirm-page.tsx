/**
 * @file letter-response-confirm-page.tsx
 * @description P684 State 7-9: Confirm route for one-to-many letter response.
 * Route: /letter/:letterId/confirm
 *
 * Supabase's OTP handler has already authenticated the reader by the time this
 * page mounts (the magic link URL was processed by Supabase's auth redirect).
 *
 * AD4.1 anti-flash invariants (P692 + P693 KDDs):
 * - Gate on !!session, NOT !!currentUser. currentUser lags session by ~200ms
 *   during profile fetch — gating on currentUser causes a "Sign in" flash.
 * - Use ClarityLoader (inline) NOT ClarityPageLoader (route-gate) for State 7's
 *   "Saving your responses…" spinner.
 */

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { ClarityLoader } from '@/components/ui/clarity-loader';
import { LetterResponseLinkExpired } from '@/app/components/letters/letter-response-link-expired';
import {
  confirmLetterResponse,
  getLetterForPublicReading,
} from '@/app/data/letters-service';

// ============================================================================
// TYPES
// ============================================================================

type PageState =
  | 'waiting-for-session'   // State 7a: Session not yet established — spinner only
  | 'confirming'            // State 7b: confirmLetterResponse in flight — "Saving…"
  | 'complete'              // State 8: Confirmation succeeded
  | 'expired'               // State 9: Pending row missing or expired
  | 'unauthenticated'       // Unexpected: session never arrived
  | 'error';                // Generic error

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterResponseConfirmPage() {
  const { letterId } = useParams<{ letterId: string }>();
  const { session, sessionChecked } = useAuth();

  const [pageState, setPageState] = useState<PageState>('waiting-for-session');
  const [senderName, setSenderName] = useState<string>('Someone');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Guard: only run confirm once per mount, even if session re-fires
  const confirmedRef = useRef(false);

  // Load sender name in parallel (used in State 8 completion message).
  // Fire once on mount — does not depend on session; uses SECURITY DEFINER RPC.
  useEffect(() => {
    if (!letterId) return;
    getLetterForPublicReading(letterId)
      .then((data) => {
        // RPC returns JSONB: { id, sender_display_name, ... }
        const name = (data as Record<string, unknown>)?.sender_display_name;
        if (typeof name === 'string' && name) {
          setSenderName(name);
        }
      })
      .catch(() => {
        // Non-critical — fall back to "Someone"
      });
  }, [letterId]);

  // Main confirm flow: wait for session, then call confirmLetterResponse once.
  useEffect(() => {
    if (!sessionChecked) return;         // Auth hasn't settled yet
    if (!letterId) return;

    if (!session) {
      // sessionChecked but no session — magic link may have expired before OTP
      setPageState('unauthenticated');
      return;
    }

    if (confirmedRef.current) return;    // Already ran — don't re-fire on re-render
    confirmedRef.current = true;

    setPageState('confirming');

    confirmLetterResponse(letterId)
      .then((result) => {
        if ('ok' in result && result.ok) {
          setPageState('complete');
        } else {
          const err = (result as { error: string; message?: string }).error;
          if (err === 'expired' || err === 'invalid' || err === 'not_found') {
            setPageState('expired');
          } else if (err === 'unauthenticated') {
            setPageState('unauthenticated');
          } else {
            setErrorMessage((result as { error: string; message?: string }).message ?? null);
            setPageState('error');
          }
        }
      })
      .catch((err: unknown) => {
        console.error('[letter-response-confirm] confirmLetterResponse error:', err);
        setPageState('error');
      });
  }, [sessionChecked, session, letterId]);

  // ---- State 7a / 7b: Loading / Saving ----
  if (pageState === 'waiting-for-session' || pageState === 'confirming') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <ClarityLoader size="md" />
        {pageState === 'confirming' && (
          <p className="text-sm text-muted-foreground text-center">
            Saving your responses…
          </p>
        )}
      </div>
    );
  }

  // ---- State 8: Complete ----
  if (pageState === 'complete') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-lg font-semibold text-center text-[#1A1A1A]">
          Your responses have been shared with {senderName}.
        </p>
        <p className="text-sm text-muted-foreground text-center">
          You can close this tab.
        </p>
      </div>
    );
  }

  // ---- State 9: Expired / pending row missing ----
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LetterResponseLinkExpired letterId={letterId ?? ''} senderName={senderName} />
      </div>
    );
  }

  // ---- Unauthenticated (should not happen post-verifyOtp, defensive only) ----
  if (pageState === 'unauthenticated') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-[#1A1A1A]">Sign in required</h1>
        <p className="text-sm text-muted-foreground">
          Your sign-in link may have expired. Please open the letter again to re-submit.
        </p>
      </div>
    );
  }

  // ---- Generic error ----
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-semibold text-[#1A1A1A]">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        {errorMessage ?? 'Please check your connection and try again.'}
      </p>
      <button
        type="button"
        onClick={() => {
          confirmedRef.current = false;
          setPageState('confirming');
        }}
        className="text-sm text-[#0044CC] hover:underline mt-2"
      >
        Try again
      </button>
    </div>
  );
}
