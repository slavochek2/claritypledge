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

import { useEffect, useState } from 'react';
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
import { Loader2Icon } from 'lucide-react';

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
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, token, currentUser?.id]);

  // ---- Handlers ----

  const handleAccept = async () => {
    if (!agreement || !currentUser || !agreementId) return;
    if (partnerDisplayName.trim().length > 100) {
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
        partnerDisplayName: partnerDisplayName.trim() || undefined,
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

  const returnTo = `/agreements/${agreementId}/accept`;
  const tokenParam = `token=${encodeURIComponent(token)}`;

  // P466: name to show in certificate — live state only (pre-filled from ag.partnerDisplayName on load)
  const certificatePartnerName = partnerDisplayName || undefined;

  return (
    <div className="min-h-screen bg-[#F5F3EF] py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Page title */}
        <div className="text-center">
          <h1
            className="text-2xl md:text-3xl font-serif text-[#002B5C]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Clarity Partner Agreement
          </h1>
        </div>

        {/* Certificate — CTA lives inside as footer */}
        {agreement && (
          <AgreementCertificate
            variant="pending"
            displayId={agreement.displayId}
            creatorName={agreement.creator?.name ?? 'Creator'}
            creatorSignedAt={agreement.createdAt}
            partnerName={certificatePartnerName}
            partnerSignedAt={agreement.partnerSignedAt}
            termsText={agreement.termsText}
            footer={
              pageState === 'unauthenticated' ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button asChild className="bg-[#002B5C] hover:bg-[#001f42] text-white">
                      <Link to={`/signup?returnTo=${encodeURIComponent(returnTo)}&${tokenParam}`}>
                        Create Account &amp; Sign
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}&${tokenParam}`}>
                        Log In &amp; Sign
                      </Link>
                    </Button>
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
                  <div>
                    <label
                      htmlFor="accept-partner-name"
                      className="block text-sm font-medium text-[#1A1A1A]/70 mb-1"
                    >
                      Your name on this agreement
                    </label>
                    <Input
                      id="accept-partner-name"
                      type="text"
                      aria-label="Partner's full name"
                      value={partnerDisplayName}
                      onChange={e => { setPartnerDisplayName(e.target.value); setNameError(null); }}
                      placeholder="Your full name"
                      maxLength={100}
                    />
                    {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
                  </div>
                  <p className="text-sm text-[#1A1A1A]/70 text-center">
                    Signing as: <span className="font-semibold text-[#1A1A1A]">{currentUser.name}</span>
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      className="bg-[#002B5C] hover:bg-[#001f42] text-white"
                      onClick={handleAccept}
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
