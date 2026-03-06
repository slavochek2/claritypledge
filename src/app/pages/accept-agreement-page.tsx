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
import { CelebrationDialog } from '@/app/components/agreements/celebration-dialog';
import { supabase } from '@/lib/supabase';
import { invokeAgreementEmails } from '@/lib/agreement-emails';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2Icon, PenToolIcon } from 'lucide-react';

type PageState = 'loading' | 'invalid' | 'unauthenticated' | 'partner' | 'wrong-user';

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

  // Action UI state
  const [isAccepting, setIsAccepting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [acceptedAgreement, setAcceptedAgreement] = useState<ClarityAgreement | null>(null);

  // Inline signup (unauthenticated flow): magic link sent to partner email
  const [isSigningUp, setIsSigningUp] = useState(false);

  // Auto-accept intent — set when returning from OTP email (via localStorage)
  const [autoAcceptWith, setAutoAcceptWith] = useState<string | null>(null);

  // Auto-accept intent stored before OTP redirect — consumed when user returns authenticated
  const pendingAutoAcceptRef = useRef<string | false>(false); // false = none, string = partnerName (may be '')

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
    try {
      const accepted = await agreementsService.acceptAgreement({
        agreementId,
        token,
        partnerId: currentUser.id,
        partnerDisplayName: nameToUse.trim() || undefined,
      });

      if (!accepted) {
        toast.error('Something went wrong. Please try again or use the link from your invitation email.');
        return;
      }

      // Fire-and-forget email
      invokeAgreementEmails('accepted', agreementId);

      // Reload the updated agreement to show in celebration dialog
      const updated = await agreementsService.getAgreement(agreementId);
      setAcceptedAgreement(updated ?? agreement);
      setShowCelebration(true);
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
          data: { name: partnerDisplayName.trim() || undefined },
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

  // ---- Render helpers ----

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2Icon className="w-6 h-6 animate-spin text-[#002B5C]/40" />
      </div>
    );
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
    <div className="min-h-screen bg-[#F5F3EF] py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

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
            creatorName={agreement.creator?.name ?? 'Creator'}
            creatorSignedAt={agreement.createdAt}
            partnerName={certificatePartnerName}
            partnerSignedAt={agreement.partnerSignedAt}
            termsText={agreement.termsText}
            onPartnerNameChange={pageState === 'partner' ? (name) => { setPartnerDisplayName(name); setNameError(null); } : undefined}
            partnerNameValue={partnerDisplayName}
            partnerNameError={nameError ?? undefined}
            footer={
              pageState === 'unauthenticated' ? (
                <div className="space-y-3">
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
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-[#002B5C] hover:bg-[#001f45] text-white font-semibold text-base md:text-lg py-4 md:py-6 relative overflow-hidden group"
                      size="lg"
                      onClick={handleInlineSignup}
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
                    <p className="text-[10px] md:text-xs text-center text-[#1A1A1A]/60">
                      By signing, you agree to our{" "}
                      <Link to="/terms-of-service" className="underline hover:text-[#1A1A1A]">Terms</Link>{" "}
                      &amp;{" "}
                      <Link to="/privacy-policy" className="underline hover:text-[#1A1A1A]">Privacy</Link>.
                    </p>
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

          {/* "Already have an account?" — outside the certificate frame */}
          {pageState === 'unauthenticated' && (
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
      </div>

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

      {/* Celebration dialog — shown after successful acceptance */}
      {acceptedAgreement && (
        <CelebrationDialog
          open={showCelebration}
          onClose={() => setShowCelebration(false)}
          agreement={acceptedAgreement}
          onViewAgreement={() => {
            setShowCelebration(false);
            navigate(`/agreements/${agreementId}`);
          }}
        />
      )}
    </div>
  );
}
