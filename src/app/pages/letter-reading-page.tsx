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

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useParams, useSearchParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { ClarityPageLoader, ClarityLoader } from '@/components/ui/clarity-loader';
import { LetterCover } from '@/app/components/letters/letter-cover';
import { LetterCompletionSummary } from '@/app/components/letters/letter-completion-summary';
import { LetterStaleTermsModal } from '@/app/components/letters/letter-stale-terms-modal';
import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import { CURRENT_TERMS_VERSION, ACCEPTED_TERMS_VERSIONS } from '@/lib/constants';
import { useLetterReadingState, loadState as loadReadingState, loadLocalState } from '@/app/hooks/useLetterReadingState';
import { countTotalPoints, estimateReadingMinutes } from '@/app/utils/letter-reading-utils';
import {
  getLetterForReading,
  getLetterForReadingByToken,
  getLetterForPublicReading,
  claimLetterDelivery,
  updateDeliveryStatus,
  updateDeliveryStatusByToken,
  submitLetterResponseAuthenticated,
} from '@/app/data/letters-service';
import { useOpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';
import { LetterLiveBanner } from '@/app/components/letters/letter-live-banner';
import { LetterLiveOverlay } from '@/app/components/letters/letter-live-overlay';
import { analytics } from '@/lib/mixpanel';
import type { ClarityLetter, LetterStorySnapshot, LetterDelivery, PositionType } from '@/app/types';
import { pointsService } from '@/app/data/points-service';

// ============================================================================
// TYPES
// ============================================================================

type PageState = 'loading' | 'invalid' | 'unauthenticated' | 'wrong_user' | 'expired' | 'expired-token' | 'ready' | 'ready_public' | 'own_letter';

type ViewState = 'cover' | 'reading' | 'complete';

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterReadingPage() {
  const { id: deliveryId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, session, sessionChecked, isLoading: authLoading, signOut } = useAuth();

  // P696: skip cover when arriving from confirm page (avoids flash)
  const skipToComplete = (location.state as { skipToComplete?: boolean } | null)?.skipToComplete === true;

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

  // Author interception: when sender opens own letter, tracks which state to restore on Preview
  const [previewState, setPreviewState] = useState<'ready' | 'ready_public' | null>(null);

  // P684: one-to-many public reading state
  const [publicPredictions, setPublicPredictions] = useState<Map<string, number> | undefined>();
  const [completedDeliveryId, setCompletedDeliveryId] = useState<string | null>(null);
  const [_wasAlreadyCompleted, setWasAlreadyCompleted] = useState(false);

  // P683: TOS consent
  const [consentError, setConsentError] = useState<string | null>(null);
  const [showStaleTerms, setShowStaleTerms] = useState(false);
  const [staleTermsResolved, setStaleTermsResolved] = useState(false);

  // P710: PKCE client does not extract implicit-flow hash tokens automatically.
  // If a magic-link CTA brought the user here, the session is in the URL hash.
  // Detect it synchronously (useState initializer) so the load effect is blocked
  // until setSession() stores the tokens and auth propagates through AuthContext.
  const [magicLinkProcessing, setMagicLinkProcessing] = useState(() => {
    const hash = window.location.hash;
    return hash.includes('access_token=') && hash.includes('type=magiclink');
  });

  useEffect(() => {
    if (!magicLinkProcessing) return;
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const cleanup = () => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setMagicLinkProcessing(false);
    };
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(cleanup).catch(cleanup);
    } else {
      cleanup();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data on mount (skip re-load if already past cover — avoids flash after verifyOtp auth)
  // P691: authed-first branch — if user has a session, trust RLS via getLetterForReading.
  // The token is a single-use bootstrap for first-open only; once the receiver has a session,
  // their auth cookie is authoritative. Token RPC branch runs only for anon users.
  //
  // P694: Three race-condition guards:
  // 1. authLoading gate: don't run until auth fully settles (prevents transient user=null window).
  // 2. pageStateRef guard: skip re-load if already ready (covers currentUser?.id dep change).
  // 3. Cancellation flag: stale async runs cannot mutate state after a newer run starts.
  // P710: 4. magicLinkProcessing gate: block load until magic-link hash session is established.
  useEffect(() => {
    if (!sessionChecked || authLoading || !deliveryId || magicLinkProcessing) return;
    if (viewState !== 'cover') return;
    if (pageStateRef.current === 'ready' || pageStateRef.current === 'ready_public' || pageStateRef.current === 'own_letter') return; // already loaded

    let cancelled = false;
    const setSafe = (s: PageState) => { if (!cancelled) setPageState(s); };
    const setLetterSafe = (l: ClarityLetter | null) => { if (!cancelled) setLetter(l); };
    const setSnapshotsSafe = (s: LetterStorySnapshot[]) => { if (!cancelled) setSnapshots(s); };
    const setDeliverySafe = (d: LetterDelivery | null) => { if (!cancelled) setDelivery(d); };
    const setSenderNameSafe = (n: string) => { if (!cancelled) setSenderName(n); };
    const setReceiverDisplayNameSafe = (n: string) => { if (!cancelled) setReceiverDisplayName(n); };
    const setPublicPredictionsSafe = (preds: Array<{ story_id: string; prediction: number }>) => {
      if (!cancelled) setPublicPredictions(new Map(preds.map(p => [p.story_id, p.prediction])));
    };

    const load = async () => {
      setSafe('loading');

      try {
        // Authed-first: if user has a session, try RLS-based read before token path
        if (currentUser) {
          const readData = await getLetterForReading('', deliveryId);
          if (cancelled) return;
          if (readData) {
            // Sender viewing recipient link with token — skip authed read,
            // fall through to token path so they see the recipient experience
            const isSender = readData.letter.sender_id === currentUser.id;
            if (isSender && token) {
              // fall through to token path below
            } else if (isSender) {
              // Author opening their own letter without a token — intercept before reading flow
              setLetterSafe(readData.letter);
              setSnapshotsSafe(readData.snapshots);
              setDeliverySafe(readData.delivery);
              setSenderNameSafe(readData.letter.sender_display_name || 'Someone');
              if (!cancelled) setPreviewState('ready');
              setSafe('own_letter');
              return;
            } else if (
              readData.delivery?.receiver_profile_id &&
              readData.delivery.receiver_profile_id !== currentUser.id
            ) {
              // Wrong user — neither the receiver nor the sender with a token
              setSafe('wrong_user');
              return;
            } else {
              // P717: email guard for unclaimed deliveries (receiver_profile_id = null).
              // receiver_profile_id is null until claimed, so the existing guard above
              // never fires — wrong authenticated user would fall through to 'ready'.
              if (readData.delivery?.receiver_email) {
                const intendedEmail = readData.delivery.receiver_email.toLowerCase();
                const currentEmail = (currentUser.email ?? '').toLowerCase();
                if (currentEmail !== intendedEmail) {
                  setSafe('wrong_user');
                  return;
                }
              }
              // Receiver (or sender without token viewing their own letter)
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

              // P695: skip to completion view if delivery is already completed.
              // Use completed_at as truth — status may lag (inbox uses same signal).
              if (readData.delivery?.completed_at) {
                setSafe('ready');
                if (!cancelled) { setWasAlreadyCompleted(true); setViewState('complete'); }
                return;
              }

              setSafe('ready');
              return;
            }
          }
          // Authed read returned null — fall through to token path only if token present
          // (edge case: receiver hasn't claimed yet, token still valid on first open)
          // P684: Also try public reading for authenticated one-to-many readers
          if (!token) {
            try {
              const publicData = await getLetterForPublicReading(deliveryId);
              if (cancelled) return;
              if (publicData?.letter && publicData.letter.mode === 'one-to-many') {
                const letterObj = publicData.letter;

                // Author opening their own one-to-many letter — intercept
                const letterSenderId = (letterObj as unknown as ClarityLetter).sender_id;
                if (letterSenderId === currentUser.id) {
                  setLetterSafe(letterObj as unknown as ClarityLetter);
                  setSnapshotsSafe(publicData.snapshots);
                  setDeliverySafe(null);
                  setSenderNameSafe((letterObj.sender_display_name as string) ?? 'Someone');
                  setPublicPredictionsSafe(publicData.predictions);
                  if (!cancelled) setPreviewState('ready_public');
                  setSafe('own_letter');
                  return;
                }

                setLetterSafe(letterObj as unknown as ClarityLetter);
                setSnapshotsSafe(publicData.snapshots);
                setDeliverySafe(null);
                setSenderNameSafe((letterObj.sender_display_name as string) ?? 'Someone');
                setPublicPredictionsSafe(publicData.predictions);
                setSafe('ready_public');

                // Check if authed user already completed this letter — skip cover on revisit
                const { data: existingDelivery } = await supabase
                  .from('letter_deliveries')
                  .select('id')
                  .eq('letter_id', letterObj.id as string)
                  .eq('receiver_profile_id', currentUser.id)
                  .eq('status', 'completed')
                  .maybeSingle();
                if (cancelled) return;
                if (existingDelivery) {
                  setCompletedDeliveryId(existingDelivery.id as string);
                  setWasAlreadyCompleted(true);
                  setViewState('complete');
                }
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
            // Token was present but invalid/consumed — show specific expired-link error
            setSafe('expired-token');
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

          // P717: Guard against wrong authenticated user claiming a delivery.
          // Unclaimed deliveries have receiver_profile_id = null, so the existing
          // receiver_profile_id check doesn't fire. Compare emails instead.
          if (currentUser && readData.delivery?.receiver_email) {
            const intendedEmail = readData.delivery.receiver_email.toLowerCase();
            const currentEmail = (currentUser.email ?? '').toLowerCase();
            if (currentEmail !== intendedEmail) {
              setSafe('wrong_user');
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

          // P695: skip to completion view if delivery is already completed.
          // P722: guard requires currentUser — anon/race user (currentUser=null)
          // must not see confetti for a delivery they haven't been verified for.
          if (currentUser && readData.delivery?.status === 'completed') {
            setSafe('ready');
            if (!cancelled) setViewState('complete');
            return;
          }

          // P705: fetch shared predictions for anon one-to-many token path
          if (readData.letter.mode === 'one-to-many' && !currentUser) {
            try {
              const publicData = await getLetterForPublicReading(readData.letter.id as string);
              if (!cancelled && publicData?.predictions) {
                setPublicPredictionsSafe(publicData.predictions);
              }
            } catch { /* non-fatal */ }
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
            const letterObj = publicData.letter;
            if (letterObj.mode !== 'one-to-many') {
              setSafe('unauthenticated');
              return;
            }
            setLetterSafe(letterObj as unknown as ClarityLetter);
            setSnapshotsSafe(publicData.snapshots);
            // No delivery for public one-to-many reading
            setDeliverySafe(null);
            setSenderNameSafe((letterObj.sender_display_name as string) ?? 'Someone');
            setPublicPredictionsSafe(publicData.predictions);
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
  }, [sessionChecked, authLoading, deliveryId, token, currentUser?.id, magicLinkProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup auth delay timer
  useEffect(() => {
    return () => {
      if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
    };
  }, []);

  // P710: Late-auth claim — if the user authenticates after the initial load
  // (e.g. magic-link hash processed after the anon-token path already ran),
  // claim the delivery so write operations can proceed.
  useEffect(() => {
    if (!currentUser || !token || !delivery) return;
    if (delivery.receiver_profile_id) return; // already claimed
    claimLetterDelivery(token).catch(() => {});
  }, [currentUser?.id, token, delivery?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-skip cover when the user has in-progress reading state in sessionStorage
  useEffect(() => {
    if (pageState !== 'ready') return;
    if (viewState !== 'cover') return;
    if (!currentUser) return;           // anon users must click Open Letter (triggers auth flow)
    if (!staleTermsResolved) return;    // wait for stale-terms check before skipping
    if (!deliveryId) return;

    const saved = loadReadingState(deliveryId);
    if (!saved || saved.stories.length !== snapshots.length) return;

    const hasProgress =
      saved.currentStoryIndex > 0 ||
      saved.stories.some((s) => s.rating !== null || Object.keys(s.positions).length > 0);
    if (hasProgress) {
      setViewState('reading');
    }
  }, [pageState, viewState, currentUser, staleTermsResolved, deliveryId, snapshots.length]);

  // Auto-skip cover for public letters when localStorage has in-progress state
  useEffect(() => {
    if (pageState !== 'ready_public') return;
    if (viewState !== 'cover') return;
    if (!letter) return;

    const saved = loadLocalState(letter.id);
    if (!saved || saved.stories.length !== snapshots.length) return;

    const hasProgress =
      saved.currentStoryIndex > 0 ||
      saved.stories.some((s) => s.rating !== null || Object.keys(s.positions).length > 0);
    if (hasProgress) {
      setViewState('reading');
    }
  }, [pageState, viewState, letter, snapshots.length]);

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

  if (pageState === 'expired-token') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This letter link has expired or has already been used
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          Letter links can only be opened once. Ask {senderName !== 'Someone' ? senderName : 'the sender'} to send a new link.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md mt-2 min-h-[40px]"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (pageState === 'wrong_user') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This link is for a different account
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          Sign out and reopen the link to receive it as the intended recipient.
        </p>
        <div className="flex gap-3 mt-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors rounded-md min-h-[40px]"
          >
            Go home
          </Link>
          <button
            type="button"
            onClick={async () => {
              if (currentUser) {
                await signOut();
                navigate(`/letter/${deliveryId}?token=${token}`);
              }
            }}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-[#0044CC] hover:bg-[#0033AA] transition-colors rounded-md min-h-[40px]"
          >
            Sign out
          </button>
        </div>
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

  // ---- Own letter screen ----

  if (pageState === 'own_letter') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This is your letter
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          You sent this letter. To see how it looks to recipients, you can preview it.
        </p>
        <div className="flex gap-3 mt-2">
          <Link
            to="/letters"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-50 transition-colors rounded-md min-h-[40px]"
          >
            Go to my letters
          </Link>
          {previewState && (
            <button
              type="button"
              onClick={() => setPageState(previewState)}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md min-h-[40px]"
            >
              Preview
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Ready state ----

  // ready_public: one-to-many public reading — no delivery, letter loaded via getLetterForPublicReading
  if (pageState === 'ready_public') {
    if (!letter || snapshots.length === 0) return <ClarityPageLoader />;

    return (
      <CertificatePageShell className="min-h-screen py-6 space-y-6">
        {viewState === 'cover' && skipToComplete && <ClarityPageLoader />}
        {viewState === 'cover' && !skipToComplete && (
          <LetterCover
            senderName={senderName}
            senderSlug={letter.sender_slug}
            senderAvatarUrl={letter.sender_avatar_url}
            senderAvatarColor={letter.sender_avatar_color}
            senderHasPledged={letter.sender_has_pledged}
            receiverName={receiverDisplayName}
            storyCount={snapshots.length}
            pointCount={countTotalPoints(snapshots)}
            estimatedMinutes={estimateReadingMinutes(snapshots.length, countTotalPoints(snapshots))}
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
            publicPredictions={publicPredictions}
            onComplete={(draft) => {
              if (currentUser) {
                // Authenticated one-to-many reader: submit directly, skip signup form.
                // setViewState('complete') is inside .then() — must not fire before the write resolves.
                submitLetterResponseAuthenticated(
                  letter.id,
                  draft.ratings,
                  draft.positions.map((p) => ({ pointId: p.pointId, position: p.position })),
                  CURRENT_TERMS_VERSION,
                ).then((newDeliveryId) => {
                  setCompletedDeliveryId(newDeliveryId);
                  setViewState('complete');
                }).catch((err: unknown) => {
                  console.error('[letter-reading] submitLetterResponseAuthenticated error:', err);
                  toast.error('Something went wrong saving your response. Please try again.');
                });
                return;
              } else {
                // Persist draft client-side so the confirm page can write the pending row
                const draftKey = `letter-response-draft-${deliveryId}`;
                sessionStorage.setItem(draftKey, JSON.stringify({
                  letterId: deliveryId,
                  ratings: draft.ratings,
                  positions: draft.positions.map((p) => ({ pointId: p.pointId, position: p.position })),
                }));
                // Clear local reading progress so returning to the letter page shows the cover
                localStorage.removeItem(`p684_letter_state:${letter.id}`);
                const confirmRedirect = `/letter/${deliveryId}/confirm`;
                navigate(`/signup?source=letter-response&letterId=${deliveryId}&senderName=${encodeURIComponent(senderName)}&redirect=${encodeURIComponent(confirmRedirect)}`);
                return;
              }
            }}
          />
        )}

        {/* Authenticated one-to-many: show completion summary */}
        {viewState === 'complete' && !!currentUser && !completedDeliveryId && (
          <div className="flex justify-center py-12">
            <ClarityLoader size="lg" />
          </div>
        )}
        {viewState === 'complete' && !!currentUser && completedDeliveryId && (
          <LetterCompletionSummary
            deliveryId={completedDeliveryId}
            letterId={letter.id}
            letterData={{
              snapshots,
              senderName,
              mode: letter.mode,
            }}
            isAuthenticated={true}
            senderName={senderName}
            senderSlug={letter.sender_slug}
            senderAvatarUrl={letter.sender_avatar_url}
            senderAvatarColor={letter.sender_avatar_color}
            senderHasPledged={letter.sender_has_pledged}
          />
        )}
      </CertificatePageShell>
    );
  }

  // ---- Authed ready state ----

  if (!letter || !delivery || snapshots.length === 0) {
    return <ClarityPageLoader />;
  }

  // P704: anon one-to-many recipients must NOT call *_by_token RPCs — P684 guards block them.
  // Buffer responses locally and submit via confirm-letter-response after signup (same as ready_public).
  // P715: bufferOnly only for truly anonymous link access (no token).
  // Email deliveries (token present) go through handleOneToOneOpen() regardless of letter mode.
  const bufferOnly = letter.mode === 'one-to-many' && !session && !token;

  return (
    <CertificatePageShell className="min-h-screen py-6 space-y-6">
      {viewState === 'cover' && skipToComplete && <ClarityPageLoader />}
      {viewState === 'cover' && !skipToComplete && (
        <>
          <LetterCover
            senderName={senderName}
            senderSlug={letter.sender_slug}
            senderAvatarUrl={letter.sender_avatar_url}
            senderAvatarColor={letter.sender_avatar_color}
            senderHasPledged={letter.sender_has_pledged}
            receiverName={receiverDisplayName}
            storyCount={snapshots.length}
            pointCount={countTotalPoints(snapshots)}
            estimatedMinutes={estimateReadingMinutes(snapshots.length, countTotalPoints(snapshots))}
            mode={letter.mode}
            isAuthenticated={!!session}
            isEmailDelivery={!!token}
            isAuthenticating={isAuthenticating}
            authDelayed={authDelayed}
            errorMessage={consentError}
            onOpen={() => {
              // P715: fire account-creation for any email delivery (token present),
              // regardless of letter mode (private or public).
              if (token && !currentUser) {
                handleOneToOneOpen();
              } else if (bufferOnly) {
                // Anon one-to-many: skip updateDeliveryStatusByToken — P684 guard blocks it.
                // Just transition to reading; responses are buffered until post-signup confirm.
                setViewState('reading');
                analytics.track('letter_opened', {
                  delivery_id: delivery.id,
                  letter_id: letter.id,
                  mode: letter.mode,
                  story_count: snapshots.length,
                });
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
        bufferOnly ? (
          // P704: Anon one-to-many — use local mode (no RPCs); buffer responses for post-signup confirm.
          <LetterReadingFlowPublic
            letter={letter}
            snapshots={snapshots}
            senderName={senderName}
            isAuthenticated={false}
            publicPredictions={publicPredictions}
            onComplete={(draft) => {
              const letterId = letter.id;
              const draftKey = `letter-response-draft-${letterId}`;
              sessionStorage.setItem(draftKey, JSON.stringify({
                letterId,
                ratings: draft.ratings,
                positions: draft.positions.map((p) => ({ pointId: p.pointId, position: p.position })),
              }));
              localStorage.removeItem(`p684_letter_state:${letterId}`);
              const confirmRedirect = `/letter/${letterId}/confirm`;
              navigate(`/signup?source=letter-response&letterId=${letterId}&senderName=${encodeURIComponent(senderName)}&redirect=${encodeURIComponent(confirmRedirect)}`);
            }}
          />
        ) : (
          <LetterReadingFlow
            letter={letter}
            snapshots={snapshots}
            delivery={delivery}
            senderName={senderName}
            token={token || undefined}
            isAuthenticated={!!session}
            onComplete={() => setViewState('complete')}
          />
        )
      )}

      {viewState === 'complete' && (
        <LetterCompletionSummary
          deliveryId={delivery.id}
          letterId={letter.id}
          letterData={{
            snapshots,
            senderName,
            mode: letter.mode,
          }}
          isAuthenticated={!!session}
          senderName={senderName}
          senderSlug={letter.sender_slug}
          senderAvatarUrl={letter.sender_avatar_url}
          senderAvatarColor={letter.sender_avatar_color}
          senderHasPledged={letter.sender_has_pledged}
        />
      )}
    </CertificatePageShell>
  );
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnFromLive = searchParams.get('returnFromLive') === '1';
  const { invite } = useOpenLiveInvite();
  const [liveSessionCode, setLiveSessionCode] = useState<string | null>(null);
  // Tracks whether the receiver has ever opened the overlay — survives manual close so the
  // completion toast still fires when the author ends the session after the receiver left.
  const hasJoinedRef = useRef(false);

  // P745: Detect session completion via invite closure (clarity_live_invites has REPLICA IDENTITY FULL;
  // clarity_sessions does not — UPDATE payloads from clarity_sessions don't carry new column values).
  // When the invite disappears (closed_at set → reducer removes invite), the session ended —
  // return to letter and show resume toast regardless of whether overlay is still visible.
  useEffect(() => {
    if (hasJoinedRef.current && !invite) {
      hasJoinedRef.current = false;
      setLiveSessionCode(null);
      toast.success('Welcome back — continuing your letter');
    }
  }, [invite]);

  // P745: also fire resume toast when navigating back via ?returnFromLive=1
  useEffect(() => {
    if (returnFromLive) {
      toast.success('Welcome back — continuing your letter');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — param is stable

  // Pass the invitation token if present — the hook routes to the token-based RPC
  // (SECURITY DEFINER, no expiry check since P683) when available, falling back to
  // the authed RLS path when not. P714's token-drop assumption was wrong: invitation_token
  // is a stable UUID, not the one-time OTP hash consumed by create-and-open-letter.
  const effectiveToken = token;
  const readingState = useLetterReadingState({
    mode: 'remote',
    deliveryId: delivery.id,
    senderId: letter.sender_id,
    snapshots,
    token: effectiveToken,
    savedStoryIndex: delivery.saved_story_index ?? undefined,
  });
  const { state, currentPhase, nextStory, tokenExpired } = readingState;
  const { user } = useAuth();

  // P711: Post-reveal position edits — writes directly to point_positions (does not transition phase).
  // Mirrors handleResultsPositionChange in letter-results-page.tsx. Auth-only; anon path no-ops.
  const handleLivePositionChange = useCallback(async (pointId: string, position: PositionType | null) => {
    if (!user) return;
    try {
      if (position === null) {
        await pointsService.removePosition(pointId, user.id);
      } else {
        await pointsService.setPosition(pointId, user.id, position);
      }
    } catch {
      // Non-fatal — UI already reflects optimistic update from PointRow local state
    }
  }, [user]);

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

  // P714: If token-path submit fails (defensive — should not happen after isAuthenticated fix),
  // redirect to signup-page "Save your responses" recovery instead of dead-end expired screen.
  useEffect(() => {
    if (!tokenExpired) return;
    const recoveryUrl = `/signup?source=letter-response&letterId=${encodeURIComponent(letter.id)}&senderName=${encodeURIComponent(senderName)}`;
    navigate(recoveryUrl, { replace: true });
  }, [tokenExpired, letter.id, senderName, navigate]);

  // P745: live invite handlers — must be declared before early return
  const handleJoin = useCallback(() => {
    if (!invite) return;
    hasJoinedRef.current = true;
    setLiveSessionCode(invite.code);
  }, [invite]);


  if (tokenExpired) return null;

  // P676: Build profileOwner for LetterFlowContent — sender data from letter record
  const senderProfileOwner: PointProfileOwner = {
    id: letter.sender_id,
    name: senderName,
    avatarUrl: letter.sender_avatar_url,
    avatarColor: letter.sender_avatar_color,
    hasPledged: letter.sender_has_pledged ?? false,
  };

  // Auth gate shown in story-rate phase when reader is not signed in
  const authGateNode: ReactNode = !isAuthenticated ? (
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
  ) : undefined;

  const onStoryRated = (storyIndex: number, rating: number) => {
    analytics.track('letter_story_rated', {
      story_index: storyIndex,
      total_stories: snapshots.length,
      rating,
    });
  };

  const showBanner = invite
    && invite.closedAt === null
    && liveSessionCode === null
;

  return (
    <>
      {liveSessionCode && (
        <LetterLiveOverlay sessionCode={liveSessionCode} onClose={() => setLiveSessionCode(null)} />
      )}
      {showBanner && (
        <LetterLiveBanner invite={invite} onJoin={handleJoin} />
      )}
      <LetterFlowContent
        snapshots={snapshots}
        senderName={senderName}
        senderProfileOwner={senderProfileOwner}
        readingState={readingState}
        showFocusHeader={true}
        authGateAtStoryRate={authGateNode}
        renderCompletion={() => null}
        onStoryRated={onStoryRated}
        onLivePositionChange={handleLivePositionChange}
      />
    </>
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
  publicPredictions,
  onComplete,
}: {
  letter: ClarityLetter;
  snapshots: LetterStorySnapshot[];
  senderName: string;
  isAuthenticated: boolean;
  publicPredictions?: Map<string, number>;
  onComplete: (draft: {
    ratings: Array<{ storyId: string; rating: number }>;
    positions: Array<{ pointId: string; position: string }>;
  }) => void;
}) {
  const readingState = useLetterReadingState({
    mode: 'local',
    letterId: letter.id,
    senderId: letter.sender_id,
    snapshots,
    publicPredictions,
  });

  const { state, currentPhase, nextStory, isLocalCompleted } = readingState;

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

  const senderProfileOwner: PointProfileOwner = {
    id: letter.sender_id,
    name: senderName,
    avatarUrl: letter.sender_avatar_url,
    avatarColor: letter.sender_avatar_color,
    hasPledged: letter.sender_has_pledged ?? false,
  };

  const onStoryRated = (storyIndex: number, rating: number) => {
    analytics.track('letter_story_rated', {
      story_index: storyIndex,
      total_stories: snapshots.length,
      rating,
      is_authenticated: isAuthenticated,
    });
  };

  return (
    <LetterFlowContent
      snapshots={snapshots}
      senderName={senderName}
      senderProfileOwner={senderProfileOwner}
      readingState={readingState}
      showFocusHeader={true}
      renderCompletion={() => null}
      onStoryRated={onStoryRated}
    />
  );
}
