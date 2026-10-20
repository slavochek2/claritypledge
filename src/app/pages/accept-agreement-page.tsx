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
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { invokeAgreementEmails } from '@/lib/agreement-emails';
import { requestAgreementSignIn } from '@/lib/agreement-signin';
import { ensureUniqueSlug, updateProfile } from '@/app/data/api';
import { toast } from 'sonner';
import { analytics } from '@/lib/mixpanel';
import { triggerConfetti } from '@/lib/confetti';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Input } from '@/components/ui/input';
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

/** P1487: names the sign-in callback gives a profile when it has none to give. */
function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  return !n || n === 'Anonymous' || n === 'Unknown';
}

/** P1487: a slug the sign-in callback derived from a placeholder name (`anonymous`, `anonymous-2`, …). */
function isPlaceholderSlug(slug: string | null | undefined): boolean {
  return !slug || /^(anonymous|unknown)(-\d+)?$/.test(slug) || /^user-\d+$/.test(slug);
}

/** P1487: created within the sign-in link's lifetime (one hour) — too new to have shared links. */
function isFreshProfile(createdAt: string | null | undefined): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && Date.now() - t <= 60 * 60 * 1000;
}

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

  const { user: currentUser, isLoading: _authLoading, sessionChecked, refreshProfile } = useAuth();

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
      // P1364: keep react-router's { key, idx } — a null state left Back with no history index.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
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
      // P1364: keep react-router's { key, idx } — a null state left Back with no history index.
      window.history.replaceState(window.history.state, '', window.location.pathname);

      // P483: use profile name for existing user with valid name
      if (!isPlaceholderName(currentUser.name)) {
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

      // P1487: a partner who first signed in through the emailed link has a placeholder profile
      // name — the server never writes a name sent with the sign-in request (whoever holds the
      // invitation may not be the partner). The name signed with here comes only from this
      // browser: typed on this page while signed in, or typed before sign-in and kept in this
      // browser's localStorage (the auto-accept intent) — never from the server.
      const signedName = nameToUse.trim();
      if (signedName && isPlaceholderName(currentUser.name)) {
        // The slug is rewritten only for a profile created within the sign-in link's hour: an
        // older placeholder profile may already have shared /p/<slug> links that must not break.
        const slug = isFreshProfile(currentUser.signedAt) && isPlaceholderSlug(currentUser.slug)
          ? await ensureUniqueSlug(signedName)
          : undefined;
        let { error: profileError } = await updateProfile(currentUser.id, { name: signedName, ...(slug ? { slug } : {}) });
        if (profileError && slug) {
          // e.g. a reserved slug prefix, or a slug taken in the meantime: keep the name at least.
          console.warn('[accept-agreement] name + slug update refused, retrying with the name only:', profileError.message);
          ({ error: profileError } = await updateProfile(currentUser.id, { name: signedName }));
        }
        if (profileError) console.error('[accept-agreement] could not set the signed name on the profile:', profileError.message);
        else void refreshProfile?.();
      }

      // Fire-and-forget email
      invokeAgreementEmails('accepted', agreementId);

      triggerConfetti();
      toast.success(`Agreement Sealed — your Clarity Partner Agreement with ${nameToUse || 'your partner'} is now active.`);
      // P1364: REPLACE — the accept form is spent. A push left it one Back step behind the
      // agreement, re-showing a form that had already been submitted.
      navigate(`/agreements/${agreementId}`, { replace: true });
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
  /**
   * P1487: email the invitee their one-time sign-in link through the server (create-and-sign),
   * never through the auth server's own email sign-in — an unconfirmed account at the invited
   * address must be reset before any link can activate it, which only the server can do. The
   * terms version shown on this page is sent along; the server keeps it and records it once the
   * invitee signs in.
   */
  const sendSignInLink = async (partnerName: string, isExistingUser: boolean) => {
    if (!agreement || !agreementId) return;
    setIsSigningUp(true);
    try {
      // Store intent so we can auto-accept when they return after clicking the link
      localStorage.setItem(`clarity-pending-accept-${agreementId}`, JSON.stringify({ partnerName }));

      const termsVersion = CURRENT_TERMS_VERSION; // the version this page shows next to the button
      const result = await requestAgreementSignIn({ agreementId, token, partnerName, termsVersion });
      if (!result.ok) {
        localStorage.removeItem(`clarity-pending-accept-${agreementId}`);
        toast.error(result.message);
        return;
      }

      navigate('/agreements/confirm-email', {
        state: {
          email: agreement.partnerEmail,
          agreementId,
          token,
          partnerName,
          termsVersion,
          ...(isExistingUser ? { isExistingUser: true } : {}),
        },
      });
    } finally {
      setIsSigningUp(false);
    }
  };

  // P483: sign-in for an existing user (unauthenticated) — same server path.
  const handleExistingUserSignIn = () => sendSignInLink(existingPartner?.name ?? partnerDisplayName.trim(), true);

  // Inline signup: the server emails the sign-in link to the address the agreement was sent to.
  const handleInlineSignup = async () => {
    if (partnerDisplayName.trim().length > 100) {
      setNameError('Name must be 100 characters or fewer');
      return;
    }
    setNameError(null);
    await sendSignInLink(partnerDisplayName.trim(), false);
  };

  // P527 → P1487: "sign" for a partner without a session. The invitation token is not proof of
  // owning the partner's mailbox (the creator can read it), so it never creates an account or
  // a session here. The partner gets a sign-in link at the invited address; on return, signed
  // in, the stored intent auto-accepts the agreement (see the auto-accept effect above).
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
    analytics.track('agreement_direct_sign_started', { agreement_id: agreementId });
    if (existingPartner) {
      await handleExistingUserSignIn();
    } else {
      await handleInlineSignup();
    }
  };

  // ---- Render helpers ----

  if (pageState === 'loading') {
    return <ClarityPageLoader />;
  }

  // P1512: this page hides the phone bottom bar, so every state keeps a Back (in the shell's top bar when
  // signed in, in place otherwise) — an invitee must never be left on a dead end.
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <FocusHeader fallback="/feed" />
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This invitation has expired or is invalid
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          The link may have been used already, expired, or is not valid.
        </p>
        <a
          href="https://claritypledge.com"
          className="text-sm text-blue-600 hover:underline mt-2"
        >
          Return to Clarity Pledge
        </a>
      </div>
    );
  }

  if (pageState === 'wrong-user') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <FocusHeader fallback="/feed" />
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This agreement has already been signed or is not addressed to you
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          You can still view the agreement if you have access to it.
        </p>
        <Link
          to={`/agreements/${agreementId}`}
          className="text-sm text-blue-600 hover:underline mt-2"
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
      <FocusHeader fallback="/feed" />
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
            onPartnerNameChange={pageState === 'partner' && currentUser && isPlaceholderName(currentUser.name) ? (name) => { setPartnerDisplayName(name); setNameError(null); } : undefined}
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
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base md:text-lg py-4 md:py-6 relative overflow-hidden group"
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
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base md:text-lg py-4 md:py-6 relative overflow-hidden group"
                        size="lg"
                        onClick={handleDirectSign}
                        disabled={isSigningUp}
                      >
                        {isSigningUp ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2Icon className="w-5 h-5 animate-spin" />
                            Sending sign-in link...
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
                      className="bg-blue-600 hover:bg-blue-700 text-white"
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
            <Button variant="ghost" onClick={() => setShowDeclineConfirm(false)}>
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
