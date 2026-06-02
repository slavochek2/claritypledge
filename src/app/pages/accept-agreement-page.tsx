/**
 * @file accept-agreement-page.tsx
 * @description P422/P466: Accept Agreement page — accessible without authentication.
 * Route: /agreements/:id/accept?token=[token]
 *
 * P466 additions:
 *   - Partner name pre-filled from `partner_display_name` (creator-set)
 *   - Partner can edit their name before signing
 *   - Edited name passed to accept_agreement RPC
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { ClarityAgreement } from '@/app/data/agreements-service';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { supabase } from '@/lib/supabase';
import { invokeAgreementEmails } from '@/lib/agreement-emails';
import { toast } from 'sonner';
import { analytics } from '@/lib/mixpanel';
import { triggerConfetti } from '@/lib/confetti';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2Icon, PenToolIcon } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Helmet } from 'react-helmet-async';
import type { AgreementParty } from '@/app/data/agreements-service';

type PageState = 'loading' | 'invalid' | 'unauthenticated' | 'partner' | 'wrong-user';

/** P483: Does this lookup result represent an existing user with a valid name? */
function isExistingUserWithName(party: { name: string }): boolean {
  const name = party.name?.trim();
  return !!name && name !== 'Unknown';
}

export function AcceptAgreementPage() {
  const { id: agreementId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const { user: currentUser, isLoading: _authLoading, sessionChecked } = useAuth();

  const [agreement, setAgreement] = useState<ClarityAgreement | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');

  // P466: editable partner name (pre-filled from partner_display_name)
  const [partnerDisplayName, setPartnerDisplayName] = useState('');

  // P483: existing partner detected via email lookup (for unauthenticated flow)
  const [existingPartner, setExistingPartner] = useState<AgreementParty | null>(null);

  // Action UI state
  const [isAccepting, setIsAccepting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  // Inline signup (unauthenticated flow): magic link sent to partner email
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Auto-accept intent — set when returning from OTP email (via localStorage)
  const [autoAcceptWith, setAutoAcceptWith] = useState<string | null>(null);

  // Auto-accept intent stored before OTP redirect — consumed when user returns authenticated
  const pendingAutoAcceptRef = useRef<string | false>(false); // false = none, string = partnerName (may be '')

  // P488: On mount, clear Supabase auth error hash fragments (e.g. expired magic link redirects)
  // so the page proceeds cleanly to the unauthenticated fallback flow.
  useEffect(() => {
    if (window.location.hash.includes('#error=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Check localStorage for a pending auto-accept intent (set before OTP redirect)
  useEffect(() => {
    if (!agreementId) return;
    const key = `clarity-pending-accept-${agreementId}`;
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      localStorage.removeItem(key);
      try {
        const { partnerName } = JSON.parse(stored) as { partnerName: string };
        pendingAutoAcceptRef.current = partnerName ?? '';
      } catch {
        pendingAutoAcceptRef.current = '';
      }
    }

  }, [agreementId]);

  // Load agreement by token once auth state is resolved
  useEffect(() => {
    if (!sessionChecked) return;
    if (!token) {
      setPageState('invalid');
      return;
    }

    const load = async () => {
      setPageState('loading');
      const ag = await agreementsService.getAgreementByToken(token);

      if (!ag) {
        setPageState('invalid');
        return;
      }

      setAgreement(ag);

      // P466: pre-fill partner name from creator-set display name
      setPartnerDisplayName(ag.partnerDisplayName ?? '');

      if (!currentUser) {
        setPageState('unauthenticated');

        // P483: detect existing user via email lookup
        if (ag.partnerEmail) {
          try {
            const partner = await agreementsService.lookupUserByEmail(ag.partnerEmail);
            if (partner && isExistingUserWithName(partner)) {
              setExistingPartner(partner);
            }
          } catch {
            // Lookup failure — fall back to new-user path
          }
        }
        return;
      }

      if (
        ag.status !== 'pending' ||
        ag.creatorProfileId === currentUser.id ||
        (ag.partnerProfileId && ag.partnerProfileId !== currentUser.id)
      ) {
        setPageState('wrong-user');
        return;
      }

      setPageState('partner');

      // P488: Clean up ?token= from URL now that we're authenticated — prevents token leakage
      window.history.replaceState(null, '', window.location.pathname);

      // P483: use profile name for existing user with valid name
      if (currentUser.name && currentUser.name.trim() && currentUser.name.trim() !== 'Unknown') {
        setPartnerDisplayName(currentUser.name);
      }

      // Auto-accept if returning from inline signup OTP flow
      if (pendingAutoAcceptRef.current !== false) {
        const nameToUse = pendingAutoAcceptRef.current;
        pendingAutoAcceptRef.current = false; // consume it
        if (nameToUse) setPartnerDisplayName(nameToUse);
        setAutoAcceptWith(nameToUse); // triggers auto-accept effect
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, token, currentUser?.id]);

  // ---- Handlers ----

  const handleAccept = async (nameOverride?: string) => {
    if (!agreement || !currentUser || !agreementId) return;
    const nameToUse = nameOverride !== undefined ? nameOverride : partnerDisplayName;
    if (nameToUse.trim().length > 100) {
      setNameError('Name must be 100 characters or fewer');
      return;
    }
    setNameError(null);
    setIsAccepting(true);
    analytics.track('agreement_accept_started', { agreement_id: agreementId });
    try {
      const accepted = await agreementsService.acceptAgreement({
        agreementId,
        token,
        partnerId: currentUser.id,
        partnerDisplayName: nameToUse.trim() || undefined,
      });

      if (!accepted) {
        analytics.track('agreement_accept_failed', { agreement_id: agreementId, reason: 'rpc_returned_false' });
        toast.error('Something went wrong. Please try again or use the link from your invitation email.');
        return;
      }

      analytics.track('agreement_accept_success', { agreement_id: agreementId });

      // Fire-and-forget email
      invokeAgreementEmails('accepted', agreementId);

      triggerConfetti();
      toast.success(`Agreement Sealed — your Clarity Partner Agreement with ${nameToUse || 'your partner'} is now active.`);
      navigate(`/agreements/${agreementId}`);
    } finally {
      setIsAccepting(false);
    }
  };

  const declineAgreement = async (): Promise<boolean> => {
    if (!agreementId) return false;
    // Use SECURITY DEFINER RPC via direct supabase call (no service method for decline)
    const { data, error } = await supabase.rpc('decline_agreement', {
      p_agreement_id: agreementId,
      p_token: token,
    });
    if (error) {
      console.error('[AcceptAgreementPage] decline error:', error);
      return false;
    }
    return data === true;
  };

  const handleDeclineConfirmed = async () => {
    if (!agreement || !agreementId) return;
    setIsDeclining(true);
    setShowDeclineConfirm(false);
    analytics.track('agreement_decline_started', { agreement_id: agreementId });
    try {
      const ok = await declineAgreement();
      if (!ok) {
        analytics.track('agreement_decline_failed', { agreement_id: agreementId });
        toast.error('Failed to decline. Please try again.');
        return;
      }
      analytics.track('agreement_decline_success', { agreement_id: agreementId });
      invokeAgreementEmails('declined', agreementId);
      navigate(`/agreements/${agreementId}/declined`);
    } finally {
      setIsDeclining(false);
    }
  };

  const handleUnauthDecline = () => {
    setShowDeclineConfirm(true);
  };

  const handleUnauthDeclineConfirmed = async () => {
    if (!agreementId) return;
    setIsDeclining(true);
    setShowDeclineConfirm(false);
    try {
      const ok = await declineAgreement();
      if (!ok) {
        toast.error('Failed to decline. Please try again.');
        return;
      }
      invokeAgreementEmails('declined', agreementId);
      navigate(`/agreements/${agreementId}/declined`);
    } finally {
      setIsDeclining(false);
    }
  };

  // Auto-accept when returning from OTP email (inline signup flow)
  // Using a ref to the latest handleAccept to avoid stale closure in the effect
  const handleAcceptRef = useRef(handleAccept);
  handleAcceptRef.current = handleAccept;
  useEffect(() => {
    if (autoAcceptWith === null || pageState !== 'partner') return;
    setAutoAcceptWith(null);
    handleAcceptRef.current(autoAcceptWith);
   
  }, [autoAcceptWith, pageState]);

  // P483: Sign-in for existing user (unauthenticated) — OTP with shouldCreateUser: false
  const handleExistingUserSignIn = async () => {
    if (!agreement || !agreementId) return;
    setIsSigningUp(true);
    try {
      // Store intent so we can auto-accept when they return after clicking the magic link
      localStorage.setItem(
        `clarity-pending-accept-${agreementId}`,
        JSON.stringify({ partnerName: existingPartner?.name ?? '' })
      );

      const redirectUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: agreement.partnerEmail,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: false,
        },
      });

      if (error) {
        localStorage.removeItem(`clarity-pending-accept-${agreementId}`);
        toast.error('Failed to send sign-in link. Please try again.');
        return;
      }

      navigate('/agreements/confirm-email', {
        state: {
          email: agreement.partnerEmail,
          agreementId,
          token,
          partnerName: existingPartner?.name ?? '',
          isExistingUser: true,
        },
      });
    } finally {
      setIsSigningUp(false);
    }
  };

  // Inline signup: send magic link to the partner email we already have
  const handleInlineSignup = async () => {
    if (!agreement || !agreementId) return;
    if (partnerDisplayName.trim().length > 100) {
      setNameError('Name must be 100 characters or fewer');
      return;
    }
    setNameError(null);
    setIsSigningUp(true);
    try {
      // Store intent so we can auto-accept when they return after clicking the magic link
      localStorage.setItem(
        `clarity-pending-accept-${agreementId}`,
        JSON.stringify({ partnerName: partnerDisplayName.trim() })
      );

      const redirectUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: agreement.partnerEmail,
        options: {
          emailRedirectTo: redirectUrl,
          data: { name: partnerDisplayName.trim() || undefined, avatar_color: ["#0044CC", "#002B5C", "#FFD700", "#FF6B6B", "#4ECDC4"][Math.floor(Math.random() * 5)] },
          shouldCreateUser: true,
        },
      });

      if (error) {
        localStorage.removeItem(`clarity-pending-accept-${agreementId}`);
        toast.error('Failed to send sign-in link. Please try again.');
        return;
      }

      navigate('/agreements/confirm-email', {
        state: {
          email: agreement.partnerEmail,
          agreementId,
          token,
          partnerName: partnerDisplayName.trim(),
        },
      });
    } finally {
      setIsSigningUp(false);
    }
  };

  // P527: Direct sign for new users — server-side user creation + agreement acceptance
  const handleDirectSign = async () => {
    if (!agreement || !agreementId) return;
    if (!partnerDisplayName.trim()) {
      setNameError('Please enter your name');
      return;
    }
    if (partnerDisplayName.trim().length > 100) {
      setNameError('Name must be 100 characters or fewer');
      return;
    }
    setNameError(null);
    setIsSigningUp(true);
    analytics.track('agreement_direct_sign_started', { agreement_id: agreementId });
    try {
      const { data, error } = await supabase.functions.invoke('create-and-sign', {
        body: {
          agreementId,
          token,
          partnerName: partnerDisplayName.trim(),
          termsVersion: CURRENT_TERMS_VERSION,
        },
      });

      if (error || !data?.ok || !data?.hashedToken) {
        // Check if this is a USER_EXISTS error — don't fall back, show appropriate message
        if (data?.error === 'USER_EXISTS') {
          analytics.track('agreement_direct_sign_user_exists', { agreement_id: agreementId });
          // Fall through to existing user sign-in flow
          await handleExistingUserSignIn();
          return;
        }
        // For all other errors, fall back to OTP flow
        console.warn('[P527] Direct sign failed, falling back to OTP:', error?.message || data?.error);
        analytics.track('agreement_direct_sign_fallback', { agreement_id: agreementId, error: data?.error || error?.message });
        await handleInlineSignup();
        return;
      }

      // Exchange hashed token for a session
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.hashedToken,
        type: 'magiclink',
      });

      if (otpError) {
        console.error('[P527] verifyOtp failed:', otpError.message);
        analytics.track('agreement_direct_sign_session_failed', { agreement_id: agreementId });
        // Agreement is already accepted server-side; navigate to it anyway
        // User may need to log in separately, but the agreement is signed
        toast.success('Agreement sealed! You may need to log in to view it.');
        navigate(`/agreements/${agreementId}`);
        return;
      }

      // Success — session established, agreement accepted, email sent by edge function
      analytics.track('agreement_direct_sign_success', { agreement_id: agreementId });
      triggerConfetti();
      toast.success(`Agreement Sealed — your Clarity Partner Agreement is now active.`);

      // Clean up token from URL (security: prevent token leakage)
      window.history.replaceState(null, '', window.location.pathname);

      // Do NOT fire invokeAgreementEmails — the edge function already did
      navigate(`/agreements/${agreementId}`);
    } catch (err) {
      console.error('[P527] Direct sign error:', err);
      analytics.track('agreement_direct_sign_error', { agreement_id: agreementId });
      // Fall back to existing OTP flow
      await handleInlineSignup();
    } finally {
      setIsSigningUp(false);
    }
  };

  // ---- Render helpers ----

  if (pageState === 'loading') {
    return <ClarityPageLoader />;
  }

  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This invitation has expired or is invalid
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          The link may have been used already, expired, or is not valid.
        </p>
        <a
          href="https://claritypledge.com"
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          Return to Clarity Pledge
        </a>
      </div>
    );
  }

  if (pageState === 'wrong-user') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This agreement has already been signed or is not addressed to you
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          You can still view the agreement if you have access to it.
        </p>
        <Link
          to={`/agreements/${agreementId}`}
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          View agreement
        </Link>
      </div>
    );
  }

  // Build the full redirect URL with token embedded so it survives the login → auth/callback → accept round-trip
  const redirectAfterLogin = `/agreements/${agreementId}/accept?token=${encodeURIComponent(token)}`;

  // P466: name to show in certificate — live state only (pre-filled from ag.partnerDisplayName on load)
  const certificatePartnerName = partnerDisplayName || undefined;

  return (
    <CertificatePageShell parchment className="py-10 space-y-6">
      {/* P488: Prevent invitation token leakage in Referer headers */}
      <Helmet>
        <meta name="referrer" content="same-origin" />
      </Helmet>

        {/* Page title */}
        <div className="text-center">
          <h1
            className="text-2xl md:text-3xl font-serif text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            {agreement?.creator?.name ?? 'Someone'} invited you
          </h1>
        </div>

        {/* Certificate — CTA lives inside as footer */}
        {agreement && (
          <>
          <AgreementCertificate
            variant="pending"
            displayId={agreement.displayId}
            agreementVersion={agreement.agreementVersion}
            creatorName={agreement.creator?.name ?? 'Creator'}
            creatorSignedAt={agreement.createdAt}
            partnerName={certificatePartnerName}
            partnerSignedAt={agreement.partnerSignedAt}
            termsText={agreement.termsText}
            creatorAvatarUrl={agreement.creator?.avatarUrl}
            partnerAvatarUrl={agreement.partner?.avatarUrl}
            creatorProfileUrl={agreement.creator?.slug ? `/p/${agreement.creator.slug}` : null}
            partnerProfileUrl={agreement.partner?.slug ? `/p/${agreement.partner.slug}` : null}
            onPartnerNameChange={pageState === 'partner' && currentUser && !(currentUser.name && currentUser.name.trim() && currentUser.name.trim() !== 'Unknown') ? (name) => { setPartnerDisplayName(name); setNameError(null); } : undefined}
            partnerNameValue={partnerDisplayName}
            partnerNameError={nameError ?? undefined}
            footer={
              pageState === 'unauthenticated' ? (
                <div className="space-y-3">
                  {/* P483: hide name input for existing users */}
                  {!existingPartner && (
                    <div>
                      <label
                        htmlFor="unauth-partner-name"
                        className="block text-sm font-medium text-[#1A1A1A]/70 mb-1"
                      >
                        Your name on this agreement
                      </label>
                      <Input
                        id="unauth-partner-name"
                        type="text"
                        value={partnerDisplayName}
                        onChange={e => { setPartnerDisplayName(e.target.value); setNameError(null); }}
                        placeholder="Your full name"
                        maxLength={100}
                      />
                      {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
                    </div>
                  )}
                  <div className="space-y-2">
                    {existingPartner ? (
                      <Button
                        className="w-full bg-[#002B5C] hover:bg-[#001f45] text-white font-semibold text-base md:text-lg py-4 md:py-6 relative overflow-hidden group"
                        size="lg"
                        onClick={handleExistingUserSignIn}
                        disabled={isSigningUp}
                      >
                        {isSigningUp ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2Icon className="w-5 h-5 animate-spin" />
                            Signing in...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <PenToolIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            Sign In to Co-Sign
                          </span>
                        )}
                      </Button>
                    ) : (
                      <Button
                        className="w-full bg-[#002B5C] hover:bg-[#001f45] text-white font-semibold text-base md:text-lg py-4 md:py-6 relative overflow-hidden group"
                        size="lg"
                        onClick={handleDirectSign}
                        disabled={isSigningUp}
                      >
                        {isSigningUp ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2Icon className="w-5 h-5 animate-spin" />
                            Sealing...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <PenToolIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            Seal &amp; Sign
                          </span>
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#1A1A1A]/50 hover:text-[#1A1A1A]/70"
                      onClick={handleUnauthDecline}
                      disabled={isDeclining}
                    >
                      {isDeclining ? <Loader2Icon className="w-4 h-4 animate-spin mr-2" /> : null}
                      Decline
                    </Button>
                  </div>
                  <p className="text-[10px] md:text-xs text-center text-[#1A1A1A]/60">
                    By signing, you agree to our{" "}
                    <Link to="/terms-of-service" className="underline hover:text-[#1A1A1A]">Terms</Link>{" "}
                    &amp;{" "}
                    <Link to="/privacy-policy" className="underline hover:text-[#1A1A1A]">Privacy</Link>.
                  </p>
                </div>
              ) : pageState === 'partner' && currentUser ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      className="bg-[#002B5C] hover:bg-[#001f42] text-white"
                      onClick={() => handleAccept()}
                      disabled={isAccepting}
                    >
                      {isAccepting ? <Loader2Icon className="w-4 h-4 animate-spin mr-2" /> : null}
                      I Accept &amp; Co-Sign ✦
                    </Button>
                  </div>
                  <div className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#1A1A1A]/50 hover:text-[#1A1A1A]/70"
                      onClick={() => setShowDeclineConfirm(true)}
                      disabled={isDeclining}
                    >
                      {isDeclining ? <Loader2Icon className="w-4 h-4 animate-spin mr-2" /> : null}
                      Decline
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
          />

          {/* "Already have an account?" — outside the certificate frame, hidden for existing users (P483) */}
          {pageState === 'unauthenticated' && !existingPartner && (
            <div className="text-center pt-2">
              <Link
                to={`/login?redirect=${encodeURIComponent(redirectAfterLogin)}`}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Already have an account? Log in
              </Link>
            </div>
          )}
          </>
        )}

      {/* Decline confirmation dialog — used for both auth states */}
      <Dialog open={showDeclineConfirm} onOpenChange={setShowDeclineConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Decline this agreement?</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowDeclineConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={
                pageState === 'unauthenticated'
                  ? handleUnauthDeclineConfirmed
                  : handleDeclineConfirmed
              }
              disabled={isDeclining}
            >
              {isDeclining ? (
                <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Decline
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </CertificatePageShell>
  );
}
