/**
 * @file letter-reading-page.tsx
 * @description P581 Task 7 / P673: Letter reading page with token validation + reading flow.
 * Route: /letter/:id (id = deliveryId) with optional ?token=xxx for 1-to-1.
 *
 * P673/P676: LetterReadingFlow composes shared components:
 * - LiveStoryCardExpanded (hidePoints) for story display
 * - ComprehensionRatingCard in Drawer for rating
 * - JourneyToUnderstanding + GapBanner for gap reveal
 * - PointCardWithLinks (same as profile) for point engagement
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { LetterCover } from '@/app/components/letters/letter-cover';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { LetterCompletionSummary } from '@/app/components/letters/letter-completion-summary';
import { LetterRecipientDone } from '@/app/components/letters/letter-recipient-done';
import { LetterResponseSignupForm } from '@/app/components/letters/letter-response-signup-form';
import { LetterStaleTermsModal } from '@/app/components/letters/letter-stale-terms-modal';
import { CURRENT_TERMS_VERSION, ACCEPTED_TERMS_VERSIONS } from '@/lib/constants';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import { JourneyToUnderstanding } from '@/app/components/partners/live-mode-view';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import type { StoryPhase } from '@/app/hooks/useLetterReadingState';
import { snapshotToStoryWithPoints, pointSummaryToProtoPoint } from '@/app/utils/letter-snapshot-mapper';
import {
  getLetterForReading,
  getLetterForReadingByToken,
  getLetterForPublicReading,
  claimLetterDelivery,
  updateDeliveryStatus,
  updateDeliveryStatusByToken,
  requestLetterResponseSignin,
  submitLetterResponseAuthenticated,
} from '@/app/data/letters-service';
import { analytics } from '@/lib/mixpanel';
import type { ClarityLetter, LetterStorySnapshot, LetterDelivery, PositionType } from '@/app/types';
import type { Position } from '@/app/components/shared/prototype-types';

// ============================================================================
// TYPES
// ============================================================================

type PageState = 'loading' | 'invalid' | 'unauthenticated' | 'wrong_user' | 'expired' | 'ready' | 'ready_public';

type ViewState = 'cover' | 'reading' | 'complete';

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterReadingPage() {
  const { id: deliveryId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { user: currentUser, session, sessionChecked, isLoading: authLoading } = useAuth();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [viewState, setViewState] = useState<ViewState>('cover');

  // P694: track pageState in a ref so the load effect closure can read the latest value
  // without re-registering. Used for the "already ready" guard.
  const pageStateRef = useRef<PageState>('loading');
  useEffect(() => { pageStateRef.current = pageState; }, [pageState]);

  const [letter, setLetter] = useState<ClarityLetter | null>(null);
  const [snapshots, setSnapshots] = useState<LetterStorySnapshot[]>([]);
  const [delivery, setDelivery] = useState<LetterDelivery | null>(null);
  const [senderName, setSenderName] = useState('Someone');
  const [receiverDisplayName, setReceiverDisplayName] = useState('you');

  // 1-to-1 auth flow state
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authDelayed, setAuthDelayed] = useState(false);
  const authDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P684: one-to-many public reading state
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState('');
  // Collected draft from local state — populated on form submit
  const [localDraft, setLocalDraft] = useState<{
    ratings: Array<{ storyId: string; rating: number }>;
    positions: Array<{ pointId: string; position: string }>;
  } | null>(null);

  // P683: TOS consent
  const [consentError, setConsentError] = useState<string | null>(null);
  const [showStaleTerms, setShowStaleTerms] = useState(false);
  const [staleTermsResolved, setStaleTermsResolved] = useState(false);

  // Load data on mount (skip re-load if already past cover — avoids flash after verifyOtp auth)
  // P691: authed-first branch — if user has a session, trust RLS via getLetterForReading.
  // The token is a single-use bootstrap for first-open only; once the receiver has a session,
  // their auth cookie is authoritative. Token RPC branch runs only for anon users.
  //
  // P694: Three race-condition guards:
  // 1. authLoading gate: don't run until auth fully settles (prevents transient user=null window).
  // 2. pageStateRef guard: skip re-load if already ready (covers currentUser?.id dep change).
  // 3. Cancellation flag: stale async runs cannot mutate state after a newer run starts.
  useEffect(() => {
    if (!sessionChecked || authLoading || !deliveryId) return;
    if (viewState !== 'cover') return;
    if (pageStateRef.current === 'ready' || pageStateRef.current === 'ready_public') return; // already loaded

    let cancelled = false;
    const setSafe = (s: PageState) => { if (!cancelled) setPageState(s); };
    const setLetterSafe = (l: ClarityLetter | null) => { if (!cancelled) setLetter(l); };
    const setSnapshotsSafe = (s: LetterStorySnapshot[]) => { if (!cancelled) setSnapshots(s); };
    const setDeliverySafe = (d: LetterDelivery | null) => { if (!cancelled) setDelivery(d); };
    const setSenderNameSafe = (n: string) => { if (!cancelled) setSenderName(n); };
    const setReceiverDisplayNameSafe = (n: string) => { if (!cancelled) setReceiverDisplayName(n); };

    const load = async () => {
      setSafe('loading');

      try {
        // Authed-first: if user has a session, try RLS-based read before token path
        if (currentUser) {
          const readData = await getLetterForReading('', deliveryId);
          if (cancelled) return;
          if (readData) {
            // Wrong user check
            if (
              readData.delivery?.receiver_profile_id &&
              readData.delivery.receiver_profile_id !== currentUser.id
            ) {
              setSafe('wrong_user');
              return;
            }

            setLetterSafe(readData.letter);
            setSnapshotsSafe(readData.snapshots);
            setDeliverySafe(readData.delivery);
            setSenderNameSafe(readData.letter.sender_display_name || 'Someone');

            const deliveryReceiverName = (readData.delivery as Record<string, unknown>)?.['receiver_name'] as string | undefined;
            if (deliveryReceiverName) {
              setReceiverDisplayNameSafe(deliveryReceiverName.split(' ')[0]);
            } else if (currentUser.user_metadata?.name) {
              setReceiverDisplayNameSafe(currentUser.user_metadata.name);
            }

            setSafe('ready');
            return;
          }
          // Authed read returned null — fall through to token path only if token present
          // (edge case: receiver hasn't claimed yet, token still valid on first open)
          // P684: Also try public reading for authenticated one-to-many readers
          if (!token) {
            try {
              const publicData = await getLetterForPublicReading(deliveryId);
              if (cancelled) return;
              if (publicData?.letter && (publicData.letter as Record<string, unknown>).mode === 'one-to-many') {
                const letterObj = publicData.letter as Record<string, unknown>;
                setLetterSafe(letterObj as unknown as ClarityLetter);
                setSnapshotsSafe((publicData.snapshots ?? []) as LetterStorySnapshot[]);
                setDeliverySafe(null);
                setSenderNameSafe((letterObj.sender_display_name as string) ?? 'Someone');
                // Authenticated one-to-many reader: use ready_public path
                setSafe('ready_public');
                return;
              }
            } catch { /* fall through */ }
            // Authenticated user but letter not accessible — show invalid
            setSafe('invalid');
            return;
          }
        }

        // Anon or authed-fallback: token path
        if (token) {
          // Token-based access (1-to-1) — single RPC bypasses RLS for anon
          const readData = await getLetterForReadingByToken(token);
          if (cancelled) return;
          if (!readData) {
            setSafe('invalid');
            return;
          }

          // Check expiry
          if (readData.delivery?.access_token_expires_at) {
            const expiresAt = new Date(readData.delivery.access_token_expires_at);
            if (expiresAt < new Date()) {
              setSafe('expired');
              return;
            }
          }

          // Claim delivery if authenticated (sets receiver_profile_id for write RLS)
          if (currentUser) {
            await claimLetterDelivery(token).catch(() => {});
          }

          setLetterSafe(readData.letter);
          setSnapshotsSafe(readData.snapshots);
          setDeliverySafe(readData.delivery);

          // Use sender_display_name from RPC (joined to profiles), not UUID
          setSenderNameSafe(readData.letter.sender_display_name || 'Someone');

          // Use receiver_name first name from delivery, fallback to user name or 'you'
          const deliveryReceiverName = readData.delivery?.receiver_name;
          if (deliveryReceiverName) {
            setReceiverDisplayNameSafe(deliveryReceiverName.split(' ')[0]);
          } else if (currentUser?.user_metadata?.name) {
            setReceiverDisplayNameSafe(currentUser.user_metadata.name);
          }

          setSafe('ready');
        } else {
          // No currentUser AND no token — try one-to-many public reading
          // deliveryId param doubles as letterId for one-to-many public letters
          try {
            const publicData = await getLetterForPublicReading(deliveryId);
            if (cancelled) return;
            if (!publicData || !publicData.letter) {
              setSafe('unauthenticated');
              return;
            }
            const letterObj = publicData.letter as Record<string, unknown>;
            if (letterObj.mode !== 'one-to-many') {
              setSafe('unauthenticated');
              return;
            }
            setLetterSafe(letterObj as unknown as ClarityLetter);
            setSnapshotsSafe((publicData.snapshots ?? []) as LetterStorySnapshot[]);
            // No delivery for public one-to-many reading
            setDeliverySafe(null);
            setSenderNameSafe((letterObj.sender_display_name as string) ?? 'Someone');
            setSafe('ready_public');
          } catch {
            setSafe('unauthenticated');
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[letter-reading] Load error:', err);
        toast.error('Failed to load letter. Please check your connection and try again.');
        setSafe('invalid');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [sessionChecked, authLoading, deliveryId, token, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup auth delay timer
  useEffect(() => {
    return () => {
      if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
    };
  }, []);

  // 1-to-1 auth handler: calls create-and-open-letter edge function → verifyOtp
  const handleOneToOneOpen = useCallback(async () => {
    if (!token || !delivery) return;

    setIsAuthenticating(true);
    setAuthDelayed(false);
    setConsentError(null);

    // Start 5s delay timer for "Setting up your access..." message
    authDelayTimerRef.current = setTimeout(() => setAuthDelayed(true), 5000);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        'create-and-open-letter',
        {
          body: {
            token,
            termsAccepted: true,
            termsVersion: CURRENT_TERMS_VERSION,
          },
        }
      );

      if (fnError || !result?.ok) {
        // Prefer server-supplied message (already user-friendly: "Invalid or expired invitation", etc.)
        // When fnError is FunctionsHttpError, data is undefined — parse the response body directly.
        let serverMessage: string | undefined = result?.message;
        if (!serverMessage && fnError instanceof FunctionsHttpError) {
          try {
            const body = await (fnError.context as Response).clone().json();
            serverMessage = body?.message;
          } catch { /* body not JSON — keep fallback */ }
        }
        const friendlyFallback = "Something went wrong opening this letter. Please try again, or contact us if it keeps happening.";
        throw new Error(serverMessage || friendlyFallback);
      }

      if (result.hashedToken) {
        // Instant auth via verifyOtp
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: result.hashedToken,
          type: 'magiclink',
        });

        if (otpError) {
          console.warn('[letter-reading] verifyOtp failed:', otpError.message);
          setConsentError("We couldn't sign you in automatically. Please try again in a moment.");
          setIsAuthenticating(false);
          setAuthDelayed(false);
          if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
          return;
        }

        // Auth succeeded
        if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
        setAuthDelayed(false);

        updateDeliveryStatusByToken(token, 'opened').catch(() => {});

        analytics.track('letter_opened', {
          delivery_id: delivery.id,
          letter_id: letter?.id,
          mode: letter?.mode,
          story_count: snapshots.length,
          auth_method: 'create-and-open-letter',
        });

        setIsAuthenticating(false);
        setViewState('reading');
      } else {
        // No hashedToken — delivery was already linked, just proceed
        if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
        updateDeliveryStatusByToken(token, 'opened').catch(() => {});
        setIsAuthenticating(false);
        setViewState('reading');
      }
    } catch (err) {
      console.error('[letter-reading] Auth flow error:', err);
      if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
      setIsAuthenticating(false);
      setAuthDelayed(false);

      const message = err instanceof Error && err.message.includes('timed out')
        ? 'The connection timed out. Please check your internet and try again.'
        : err instanceof Error && err.message
          ? err.message
          : 'Something went wrong. Please try again.';
      setConsentError(message);
    }
  }, [token, delivery, letter, snapshots.length]);

  // P683: check stale terms for authenticated users before opening
  useEffect(() => {
    if (!currentUser || !letter || staleTermsResolved) return;
    if (viewState !== 'cover') return;

    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('accepted_terms_version')
        .eq('id', currentUser.id)
        .single();
      const current = data?.accepted_terms_version;
      if (!current || !(ACCEPTED_TERMS_VERSIONS as readonly string[]).includes(current)) {
        setShowStaleTerms(true);
      } else {
        setStaleTermsResolved(true);
      }
    })();
  }, [currentUser, letter, viewState, staleTermsResolved]);

  const handleStaleTermsAccept = useCallback(async () => {
    if (!currentUser) return;
    try {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ accepted_terms_version: CURRENT_TERMS_VERSION })
        .eq('id', currentUser.id);
      if (updErr) throw updErr;
      // Client-side audit row — server-side IP hashing not available here, so leave ip_hash null
      await supabase.from('terms_acceptances').insert({
        user_id: currentUser.id,
        terms_version: CURRENT_TERMS_VERSION,
        user_agent: navigator.userAgent,
      });
      setShowStaleTerms(false);
      setStaleTermsResolved(true);
    } catch (err) {
      console.error('[letter-reading] Stale terms accept failed:', err);
      toast.error('Could not save your acceptance. Please try again.');
    }
  }, [currentUser]);

  // ---- Error states ----

  if (pageState === 'loading') {
    return <ClarityPageLoader />;
  }

  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          Letter not found
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          This link may be invalid or the letter may no longer be available.
        </p>
        <Link
          to="/"
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          Return home
        </Link>
      </div>
    );
  }

  if (pageState === 'expired') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This letter has expired
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          This letter has expired. Contact {senderName !== 'Someone' ? senderName : 'the sender'} for a new one.
        </p>
        <Link
          to="/"
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          Return home
        </Link>
      </div>
    );
  }

  if (pageState === 'wrong_user') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This letter wasn&apos;t sent to you
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          This letter is addressed to a different person.
        </p>
        <Link
          to="/docs"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md mt-2 min-h-[40px]"
        >
          Back to docs
        </Link>
      </div>
    );
  }

  if (pageState === 'unauthenticated') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          Sign in to read this letter
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          You need to be signed in to access this letter.
        </p>
        <Link
          to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          Sign in
        </Link>
      </div>
    );
  }

  // ---- Ready state ----

  // ready_public: one-to-many public reading — no delivery, letter loaded via getLetterForPublicReading
  if (pageState === 'ready_public') {
    if (!letter || snapshots.length === 0) return <ClarityPageLoader />;

    // P684: "check your email" state after signup form submission
    if (emailSent) {
      return (
        <CertificatePageShell className="min-h-screen py-6 space-y-6">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
            <h2 className="text-xl font-semibold text-[#1A1A1A]">Check your email</h2>
            <p className="text-sm text-[#1A1A1A]/70 max-w-sm">
              We sent a link to {sentToEmail}. Click it to save your responses and create your account.
            </p>
            <p className="text-xs text-[#1A1A1A]/40 max-w-sm">
              You can close this tab — the link works on any device.
            </p>
          </div>
        </CertificatePageShell>
      );
    }

    return (
      <CertificatePageShell className="min-h-screen py-6 space-y-6">
        {viewState === 'cover' && (
          <LetterCover
            senderName={senderName}
            receiverName={receiverDisplayName}
            storyCount={snapshots.length}
            estimatedMinutes={Math.max(1, Math.ceil(snapshots.length * 2))}
            mode={letter.mode}
            isAuthenticated={false}
            onOpen={() => {
              setViewState('reading');
              analytics.track('letter_opened', {
                letter_id: letter.id,
                mode: letter.mode,
                story_count: snapshots.length,
              });
            }}
          />
        )}

        {viewState === 'reading' && (
          <LetterReadingFlowPublic
            letter={letter}
            snapshots={snapshots}
            senderName={senderName}
            isAuthenticated={!!session}
            onComplete={(draft) => {
              setLocalDraft(draft);
              if (currentUser) {
                // Authenticated one-to-many reader: submit directly, skip signup form
                submitLetterResponseAuthenticated(
                  letter.id,
                  draft.ratings,
                  draft.positions.map((p) => ({ pointId: p.pointId, position: p.position })),
                  CURRENT_TERMS_VERSION,
                ).catch((err: unknown) => {
                  console.error('[letter-reading] submitLetterResponseAuthenticated error:', err);
                });
              } else {
                setShowSignupForm(true);
              }
              setViewState('complete');
            }}
          />
        )}

        {viewState === 'complete' && showSignupForm && !currentUser && (
          <div className="max-w-md mx-auto px-4 py-6">
            <LetterResponseSignupForm
              senderName={senderName}
              onSubmit={async (formData) => {
                const draft = localDraft ?? { ratings: [], positions: [] };
                await requestLetterResponseSignin({
                  letterId: deliveryId ?? '',
                  name: formData.name,
                  email: formData.email,
                  termsAccepted: true,
                  termsVersion: CURRENT_TERMS_VERSION,
                  ratings: draft.ratings,
                  positions: draft.positions.map((p) => ({
                    pointId: p.pointId,
                    position: p.position as unknown as number,
                  })),
                });
                setSentToEmail(formData.email);
              }}
              onSuccess={() => {
                setShowSignupForm(false);
                setEmailSent(true);
              }}
            />
          </div>
        )}

        {/* Authenticated one-to-many: State 8 completion (submit happens in LetterReadingFlowPublic) */}
        {viewState === 'complete' && !!currentUser && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-2 px-4">
            <p className="text-lg font-semibold text-center">
              Your responses have been shared with {senderName}.
            </p>
            <p className="text-sm text-muted-foreground text-center">
              You can close this tab.
            </p>
          </div>
        )}
      </CertificatePageShell>
    );
  }

  // ---- Authed ready state ----

  if (!letter || !delivery || snapshots.length === 0) {
    return <ClarityPageLoader />;
  }

  return (
    <CertificatePageShell className="min-h-screen py-6 space-y-6">
      {viewState === 'cover' && (
        <>
          <LetterCover
            senderName={senderName}
            receiverName={receiverDisplayName}
            storyCount={snapshots.length}
            estimatedMinutes={Math.max(1, Math.ceil(snapshots.length * 2))}
            mode={letter.mode}
            isAuthenticated={!!session}
            isAuthenticating={isAuthenticating}
            authDelayed={authDelayed}
            errorMessage={consentError}
            onOpen={() => {
              if (letter.mode === 'one-to-one' && token && !currentUser) {
                handleOneToOneOpen();
              } else {
                if (currentUser && !staleTermsResolved) {
                  setShowStaleTerms(true);
                  return;
                }
                if (token) {
                  updateDeliveryStatusByToken(token, 'opened').catch(() => {});
                } else {
                  updateDeliveryStatus(delivery.id, 'opened').catch(() => {});
                }
                setViewState('reading');
                analytics.track('letter_opened', {
                  delivery_id: delivery.id,
                  letter_id: letter.id,
                  mode: letter.mode,
                  story_count: snapshots.length,
                });
              }
            }}
          />
          <LetterStaleTermsModal
            open={showStaleTerms}
            onAccept={handleStaleTermsAccept}
            onCancel={() => setShowStaleTerms(false)}
          />
        </>
      )}

      {viewState === 'reading' && (
        <LetterReadingFlow
          letter={letter}
          snapshots={snapshots}
          delivery={delivery}
          senderName={senderName}
          token={token || undefined}
          isAuthenticated={!!session}
          onComplete={() => setViewState('complete')}
        />
      )}

      {viewState === 'complete' && letter.mode === 'one-to-one' && (
        <LetterRecipientDone senderName={senderName} />
      )}

      {viewState === 'complete' && letter.mode !== 'one-to-one' && (
        <LetterCompletionSummary
          deliveryId={delivery.id}
          letterData={{
            snapshots,
            senderName,
            mode: letter.mode,
          }}
          isAuthenticated={!!session}
          senderName={senderName}
        />
      )}
    </CertificatePageShell>
  );
}

// ============================================================================
// PROGRESS — calculates sub-fill fraction for current story segment
// ============================================================================

function calculateStoryProgress(
  phase: StoryPhase,
  currentPointIndex: number,
  visiblePointCount: number
): number {
  if (visiblePointCount >= 2) {
    const total = 4 + 2 * (visiblePointCount - 1);
    let screen: number;
    switch (phase) {
      case 'point-engage':             screen = 0; break;
      case 'point-revealed':           screen = 1; break;
      case 'story-rate':               screen = 2; break;
      case 'story-revealed':           screen = 3; break;
      case 'remaining-point-engage':   screen = 4 + (currentPointIndex - 1) * 2; break;
      case 'remaining-point-revealed': screen = 5 + (currentPointIndex - 1) * 2; break;
      case 'transition':               screen = total; break;
      default:                         screen = 0;
    }
    return Math.min(screen / total, 1);
  }
  if (visiblePointCount === 1) {
    const total = 4;
    let screen: number;
    switch (phase) {
      case 'story-rate':     screen = 0; break;
      case 'story-revealed': screen = 1; break;
      case 'point-engage':   screen = 2; break;
      case 'point-revealed': screen = 3; break;
      case 'transition':     screen = total; break;
      default:               screen = 0;
    }
    return Math.min(screen / total, 1);
  }
  // 0 visible points: story-rate(0) → story-revealed(0.5) → transition(1)
  switch (phase) {
    case 'story-rate':     return 0;
    case 'story-revealed': return 0.5;
    case 'transition':     return 1;
    default:               return 0;
  }
}

// ============================================================================
// READING FLOW — composes /live components (P673)
// ============================================================================

function LetterReadingFlow({
  letter,
  snapshots,
  delivery,
  senderName,
  token,
  isAuthenticated,
  onComplete,
}: {
  letter: ClarityLetter;
  snapshots: LetterStorySnapshot[];
  delivery: LetterDelivery;
  senderName: string;
  token?: string;
  isAuthenticated: boolean;
  onComplete: () => void;
}) {
  const {
    state,
    currentPhase,
    submitPointPosition,
    submitStoryRating,
    advanceFromPointReveal,
    advanceFromStoryReveal,
    advanceFromRemainingPointReveal,
    nextStory,
    isSubmitting,
  } = useLetterReadingState(delivery.id, letter.sender_id, snapshots, token);

  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);

  // When the state machine reports complete, notify parent
  useEffect(() => {
    if (state.isComplete) {
      onComplete();
    }
  }, [state.isComplete, onComplete]);

  // Bug 7: Auto-advance through transition interstitial — skip it entirely
  useEffect(() => {
    if (currentPhase === 'transition') {
      nextStory();
    }
  }, [currentPhase, nextStory]);

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  if (!currentSnapshot || !currentStory) return null;

  // P676: Build profileOwner for PointCardWithLinks — sender data from letter record
  const senderProfileOwner: PointProfileOwner = {
    id: letter.sender_id,
    name: senderName,
  };

  const storyWithPoints = snapshotToStoryWithPoints(currentSnapshot, { name: senderName });
  const visiblePoints = storyWithPoints.points;
  const currentPoint = visiblePoints[currentStory.currentPointIndex];
  const gap = currentStory.rating !== null && currentStory.prediction !== null
    ? Math.abs(currentStory.rating - currentStory.prediction)
    : 0;
  const isOverconfident = currentStory.rating !== null && currentStory.prediction !== null
    ? currentStory.prediction > currentStory.rating
    : false;

  const storyProgress = calculateStoryProgress(currentPhase, currentStory.currentPointIndex, visiblePoints.length);

  return (
    <div className="max-w-md mx-auto w-full space-y-6">
      <FocusHeader
        onBack={() => window.history.back()}
        label="Leave letter"
      />

      <LetterProgressBar
        currentIndex={state.currentStoryIndex}
        totalStories={snapshots.length}
        storyProgress={storyProgress}
      />

      {/* PHASE: point-engage — sealed-bid: author position hidden until receiver picks */}
      {currentPhase === 'point-engage' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint)}
            profileOwner={senderProfileOwner}
            liveSessionMode
            disableNavigation
            currentUserId="__receiver__"
            onPositionSelect={(pos) => { setSelectedPosition(pos as PositionType | null); }}
            selectedPosition={selectedPosition as Position}
          />
          <Button
            onClick={() => { if (selectedPosition) { submitPointPosition(currentPoint.id, selectedPosition); setSelectedPosition(null); } }}
            disabled={!selectedPosition || isSubmitting}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
          {!selectedPosition && !isSubmitting && (
            <p className="text-sm text-muted-foreground text-center">
              Select your position above to continue
            </p>
          )}
        </div>
      )}

      {/* PHASE: point-revealed — author's position now visible via quote pattern */}
      {currentPhase === 'point-revealed' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint, (currentStory.positions[currentPoint.id] as PositionType) ?? null)}
            profileOwner={{ ...senderProfileOwner, position: currentPoint.profileSubjectPosition ?? undefined }}
            liveSessionMode
            disableNavigation
            disablePositionButtons
            currentUserId="__receiver__"
            selectedPosition={(currentStory.positions[currentPoint.id] as Position) ?? null}
          />
          <Button
            onClick={advanceFromPointReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: story-rate — story card + rating Drawer */}
      {currentPhase === 'story-rate' && (
        <>
          <LiveStoryCardExpanded
            story={storyWithPoints}
            hidePoints
            readOnly
            className="w-full max-w-sm"
          />

          {!isAuthenticated ? (
            <div className="space-y-4 text-center py-4">
              <p className="text-sm text-[#1A1A1A]/70">
                Sign in to rate how well you understood this story and see {senderName}&apos;s prediction.
              </p>
              <Link
                to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-[#0044CC] hover:bg-[#0033AA] rounded-md min-h-[44px]"
              >
                Sign in to continue
              </Link>
            </div>
          ) : (
            <Drawer open dismissible={false}>
              <DrawerContent overlayClassName="bg-transparent">
                <DrawerHeader className="sr-only">
                  <DrawerTitle>Rate this story</DrawerTitle>
                </DrawerHeader>
                <div className="px-4 pb-8 pt-4 space-y-4">
                  <ComprehensionRatingCard
                    question="How well do you believe you understand this story?"
                    onSelect={(rating) => {
                      analytics.track('letter_story_rated', {
                        story_index: state.currentStoryIndex,
                        total_stories: snapshots.length,
                        rating,
                      });
                      submitStoryRating(rating);
                    }}
                    disabled={isSubmitting || currentStory.rating !== null}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </>
      )}

      {/* PHASE: story-revealed — JourneyToUnderstanding + GapBanner above story */}
      {currentPhase === 'story-revealed' && (
        <div className="space-y-4">
          <JourneyToUnderstanding
            checkerRating={currentStory.prediction ?? undefined}
            responderRating={currentStory.rating ?? undefined}
            explainBackRatings={[]}
            isChecker={false}
            displayPartnerName={senderName}
            checkerName={senderName}
            compact
            className="w-full max-w-sm"
          />
          <GapBanner
            gap={gap}
            senderName={senderName}
            isOverconfident={isOverconfident}
            className="-mt-3"
          />
          <LiveStoryCardExpanded
            story={storyWithPoints}
            hidePoints
            readOnly
            className="w-full max-w-sm"
          />
          <Button
            onClick={advanceFromStoryReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: remaining-point-engage — remaining point cards after story */}
      {currentPhase === 'remaining-point-engage' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint)}
            profileOwner={senderProfileOwner}
            liveSessionMode
            disableNavigation
            currentUserId="__receiver__"
            onPositionSelect={(pos) => { setSelectedPosition(pos as PositionType | null); }}
            selectedPosition={selectedPosition as Position}
          />
          <Button
            onClick={() => { if (selectedPosition) { submitPointPosition(currentPoint.id, selectedPosition); setSelectedPosition(null); } }}
            disabled={!selectedPosition || isSubmitting}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
          {!selectedPosition && !isSubmitting && (
            <p className="text-sm text-muted-foreground text-center">
              Select your position above to continue
            </p>
          )}
        </div>
      )}

      {/* PHASE: remaining-point-revealed — sender position visible via quote pattern */}
      {currentPhase === 'remaining-point-revealed' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint, (currentStory.positions[currentPoint.id] as PositionType) ?? null)}
            profileOwner={{ ...senderProfileOwner, position: currentPoint.profileSubjectPosition ?? undefined }}
            liveSessionMode
            disableNavigation
            disablePositionButtons
            currentUserId="__receiver__"
            selectedPosition={(currentStory.positions[currentPoint.id] as Position) ?? null}
          />
          <Button
            onClick={advanceFromRemainingPointReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

    </div>
  );
}

// ============================================================================
// P684: PUBLIC READING FLOW — local mode (no delivery, no RPC writes during reading)
// ============================================================================

function LetterReadingFlowPublic({
  letter,
  snapshots,
  senderName,
  isAuthenticated,
  onComplete,
}: {
  letter: ClarityLetter;
  snapshots: LetterStorySnapshot[];
  senderName: string;
  isAuthenticated: boolean;
  onComplete: (draft: {
    ratings: Array<{ storyId: string; rating: number }>;
    positions: Array<{ pointId: string; position: string }>;
  }) => void;
}) {
  const {
    state,
    currentPhase,
    submitPointPosition,
    submitStoryRating,
    advanceFromPointReveal,
    advanceFromStoryReveal,
    advanceFromRemainingPointReveal,
    nextStory,
    isSubmitting,
    isLocalCompleted,
  } = useLetterReadingState({
    mode: 'local',
    letterId: letter.id,
    senderId: letter.sender_id,
    snapshots,
  });

  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // When local mode signals completion, derive draft and call onComplete
  useEffect(() => {
    if (!isLocalCompleted) return;

    const ratings: Array<{ storyId: string; rating: number }> = [];
    const positions: Array<{ pointId: string; position: string }> = [];

    state.stories.forEach((story, idx) => {
      const snap = snapshots[idx];
      if (!snap) return;
      if (story.rating !== null) {
        ratings.push({ storyId: snap.story_id, rating: story.rating });
      }
      Object.entries(story.positions).forEach(([pointId, position]) => {
        positions.push({ pointId, position });
      });
    });

    onCompleteRef.current({ ratings, positions });
  }, [isLocalCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance through transition interstitial
  useEffect(() => {
    if (currentPhase === 'transition') {
      nextStory();
    }
  }, [currentPhase, nextStory]);

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  if (!currentSnapshot || !currentStory) return null;

  const senderProfileOwner: PointProfileOwner = {
    id: letter.sender_id,
    name: senderName,
  };

  const storyWithPoints = snapshotToStoryWithPoints(currentSnapshot, { name: senderName });
  const visiblePoints = storyWithPoints.points;
  const currentPoint = visiblePoints[currentStory.currentPointIndex];
  const gap = currentStory.rating !== null && currentStory.prediction !== null
    ? Math.abs(currentStory.rating - currentStory.prediction)
    : 0;
  const isOverconfident = currentStory.rating !== null && currentStory.prediction !== null
    ? currentStory.prediction > currentStory.rating
    : false;

  const storyProgress = calculateStoryProgress(currentPhase, currentStory.currentPointIndex, visiblePoints.length);

  return (
    <div className="max-w-md mx-auto w-full space-y-6">
      <FocusHeader
        onBack={() => window.history.back()}
        label="Leave letter"
      />

      <LetterProgressBar
        currentIndex={state.currentStoryIndex}
        totalStories={snapshots.length}
        storyProgress={storyProgress}
      />

      {/* PHASE: point-engage */}
      {currentPhase === 'point-engage' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint)}
            profileOwner={senderProfileOwner}
            liveSessionMode
            disableNavigation
            currentUserId="__receiver__"
            onPositionSelect={(pos) => { setSelectedPosition(pos as PositionType | null); }}
            selectedPosition={selectedPosition as Position}
          />
          <Button
            onClick={() => { if (selectedPosition) { submitPointPosition(currentPoint.id, selectedPosition); setSelectedPosition(null); } }}
            disabled={!selectedPosition || isSubmitting}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
          {!selectedPosition && !isSubmitting && (
            <p className="text-sm text-muted-foreground text-center">
              Select your position above to continue
            </p>
          )}
        </div>
      )}

      {/* PHASE: point-revealed */}
      {currentPhase === 'point-revealed' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint, (currentStory.positions[currentPoint.id] as PositionType) ?? null)}
            profileOwner={{ ...senderProfileOwner, position: currentPoint.profileSubjectPosition ?? undefined }}
            liveSessionMode
            disableNavigation
            disablePositionButtons
            currentUserId="__receiver__"
            selectedPosition={(currentStory.positions[currentPoint.id] as Position) ?? null}
          />
          <Button
            onClick={advanceFromPointReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: story-rate — always show rating (no auth gate in local mode) */}
      {currentPhase === 'story-rate' && (
        <>
          <LiveStoryCardExpanded
            story={storyWithPoints}
            hidePoints
            readOnly
            className="w-full max-w-sm"
          />
          <Drawer open dismissible={false}>
            <DrawerContent overlayClassName="bg-transparent">
              <DrawerHeader className="sr-only">
                <DrawerTitle>Rate this story</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-8 pt-4 space-y-4">
                <ComprehensionRatingCard
                  question="How well do you believe you understand this story?"
                  onSelect={(rating) => {
                    analytics.track('letter_story_rated', {
                      story_index: state.currentStoryIndex,
                      total_stories: snapshots.length,
                      rating,
                      is_authenticated: isAuthenticated,
                    });
                    submitStoryRating(rating);
                  }}
                  disabled={isSubmitting || currentStory.rating !== null}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {/* PHASE: story-revealed */}
      {currentPhase === 'story-revealed' && (
        <div className="space-y-4">
          <JourneyToUnderstanding
            checkerRating={currentStory.prediction ?? undefined}
            responderRating={currentStory.rating ?? undefined}
            explainBackRatings={[]}
            isChecker={false}
            displayPartnerName={senderName}
            checkerName={senderName}
            compact
            className="w-full max-w-sm"
          />
          <GapBanner
            gap={gap}
            senderName={senderName}
            isOverconfident={isOverconfident}
            className="-mt-3"
          />
          <LiveStoryCardExpanded
            story={storyWithPoints}
            hidePoints
            readOnly
            className="w-full max-w-sm"
          />
          <Button
            onClick={advanceFromStoryReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: remaining-point-engage */}
      {currentPhase === 'remaining-point-engage' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint)}
            profileOwner={senderProfileOwner}
            liveSessionMode
            disableNavigation
            currentUserId="__receiver__"
            onPositionSelect={(pos) => { setSelectedPosition(pos as PositionType | null); }}
            selectedPosition={selectedPosition as Position}
          />
          <Button
            onClick={() => { if (selectedPosition) { submitPointPosition(currentPoint.id, selectedPosition); setSelectedPosition(null); } }}
            disabled={!selectedPosition || isSubmitting}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
          {!selectedPosition && !isSubmitting && (
            <p className="text-sm text-muted-foreground text-center">
              Select your position above to continue
            </p>
          )}
        </div>
      )}

      {/* PHASE: remaining-point-revealed */}
      {currentPhase === 'remaining-point-revealed' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint, (currentStory.positions[currentPoint.id] as PositionType) ?? null)}
            profileOwner={{ ...senderProfileOwner, position: currentPoint.profileSubjectPosition ?? undefined }}
            liveSessionMode
            disableNavigation
            disablePositionButtons
            currentUserId="__receiver__"
            selectedPosition={(currentStory.positions[currentPoint.id] as Position) ?? null}
          />
          <Button
            onClick={advanceFromRemainingPointReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
