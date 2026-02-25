/**
 * @file accept-agreement-page.tsx
 * @description P422: Accept Agreement page — accessible without authentication.
 * Route: /agreements/:id/accept?token=[token]
 *
 * The partner can read the full agreement before deciding to sign in.
 * - Unauthenticated: shows certificate + sign-in/sign-up CTAs
 * - Authenticated (partner): shows accept/decline actions
 * - Authenticated (wrong user): shows "already signed or not addressed to you"
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { ClarityAgreement } from '@/app/data/agreements-service';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { CelebrationDialog } from '@/app/components/agreements/celebration-dialog';
import { invokeAgreementEmails } from '@/lib/agreement-emails';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
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

  // Action UI state
  const [isAccepting, setIsAccepting] = useState(false);
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

      if (!currentUser) {
        setPageState('unauthenticated');
        return;
      }

      // Determine if this user is the intended partner.
      // A pending agreement has no partner_profile_id yet — match by the invitation token
      // being valid (already validated above). If the agreement is no longer pending or
      // has been accepted by a different profile, the current user is the wrong viewer.
      if (ag.status !== 'pending' || (ag.partnerProfileId && ag.partnerProfileId !== currentUser.id)) {
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
    setIsAccepting(true);
    try {
      const { error } = await supabase
        .from('clarity_agreements')
        .update({
          partner_profile_id: currentUser.id,
          partner_signed_at: new Date().toISOString(),
          status: 'active',
        })
        .eq('id', agreementId)
        .eq('invitation_token', token)
        .eq('status', 'pending');

      if (error) {
        console.error('[AcceptAgreementPage] accept error:', error);
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

  const handleDeclineConfirmed = async () => {
    if (!agreement || !agreementId) return;
    setIsDeclining(true);
    setShowDeclineConfirm(false);
    try {
      const { error } = await supabase
        .from('clarity_agreements')
        .update({ status: 'declined' })
        .eq('id', agreementId)
        .eq('invitation_token', token);

      if (error) {
        console.error('[AcceptAgreementPage] decline error:', error);
        return;
      }

      // Fire-and-forget
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
      const { error } = await supabase
        .from('clarity_agreements')
        .update({ status: 'declined' })
        .eq('id', agreementId)
        .eq('invitation_token', token);

      if (error) {
        console.error('[AcceptAgreementPage] decline error:', error);
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

  return (
    <div className="min-h-screen bg-[#F5F3EF] py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Page title */}
        <div className="text-center space-y-1">
          <h1
            className="text-2xl md:text-3xl font-serif text-[#002B5C]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Clarity Partner Agreement
          </h1>
          <p className="text-sm text-[#1A1A1A]/60">
            {agreement?.creator?.name
              ? `${agreement.creator.name} has invited you to co-sign this agreement.`
              : 'You have been invited to co-sign this agreement.'}
          </p>
        </div>

        {/* Certificate */}
        {agreement && (
          <AgreementCertificate
            variant="pending"
            displayId={agreement.displayId}
            creatorName={agreement.creator?.name ?? 'Creator'}
            creatorSignedAt={agreement.createdAt}
            partnerName={agreement.partner?.name}
            partnerSignedAt={agreement.partnerSignedAt}
            termsText={agreement.termsText}
          />
        )}

        {/* Unauthenticated CTA */}
        {pageState === 'unauthenticated' && (
          <div className="rounded-lg border border-[#002B5C]/20 bg-white p-5 space-y-4">
            <p className="text-sm text-[#1A1A1A]/70 text-center">
              To co-sign this agreement, you'll need a Clarity Pledge account.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                asChild
                className="bg-[#002B5C] hover:bg-[#001f42] text-white"
              >
                <Link to={`/signup?returnTo=${encodeURIComponent(returnTo)}&${tokenParam}`}>
                  Create Account &amp; Sign
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
              >
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
                {isDeclining ? (
                  <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Decline
              </Button>
            </div>
          </div>
        )}

        {/* Authenticated partner CTA */}
        {pageState === 'partner' && currentUser && (
          <div className="rounded-lg border border-[#002B5C]/20 bg-white p-5 space-y-4">
            <p className="text-sm text-[#1A1A1A]/70 text-center">
              Signing as: <span className="font-semibold text-[#1A1A1A]">{currentUser.name}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                className="bg-[#002B5C] hover:bg-[#001f42] text-white"
                onClick={handleAccept}
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                ) : null}
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
                {isDeclining ? (
                  <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Decline
              </Button>
            </div>
          </div>
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
