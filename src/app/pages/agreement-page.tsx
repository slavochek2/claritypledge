/**
 * @file agreement-page.tsx
 * @description P422: Agreement detail page — state-branched view for a Clarity Partner Agreement.
 * Route: /agreements/:id
 *
 * Branches on agreement.status:
 *   'pending'    → PendingView (creator: invitation status + resend; partner: Review & Sign)
 *   'active'     → ActiveView (certificate with gold seal + terminate option)
 *   'declined'   → DeclinedView (muted certificate + suggestion)
 *   'expired'    → ExpiredView (muted certificate + resend for creator)
 *   'terminated' → TerminatedView (muted certificate + history notice)
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, LockIcon } from 'lucide-react';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { ClarityAgreement } from '@/app/data/agreements-service';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function MutedCertificate({ agreement }: { agreement: ClarityAgreement }) {
  return (
    <div className="opacity-40 grayscale">
      <AgreementCertificate
        variant="pending"
        displayId={agreement.displayId}
        creatorName={agreement.creator?.name ?? 'Creator'}
        creatorSignedAt={agreement.createdAt}
        partnerName={agreement.partner?.name ?? 'Invited party'}
        partnerSignedAt={agreement.partnerSignedAt}
        termsText={agreement.termsText}
      />
    </div>
  );
}

// ─── Terminate confirmation dialog ────────────────────────────────────────────

function TerminateDialog({
  open,
  onConfirm,
  onCancel,
  isTerminating,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isTerminating: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminate this agreement?</DialogTitle>
          <DialogDescription>
            This will permanently end the Clarity Partner Agreement. Both parties will still be
            able to view it as history, but it will no longer be active.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isTerminating} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isTerminating}>
            {isTerminating ? (
              <>
                <Loader2 size={16} className="animate-spin mr-1" />
                Terminating...
              </>
            ) : (
              'Terminate Agreement'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── State views ──────────────────────────────────────────────────────────────

function PendingView({
  agreement,
  isPartner,
}: {
  agreement: ClarityAgreement;
  isCreator: boolean;
  isPartner: boolean;
}) {
  return (
    <div className="space-y-6">
      <AgreementCertificate
        variant="pending"
        displayId={agreement.displayId}
        creatorName={agreement.creator?.name ?? 'Creator'}
        creatorSignedAt={agreement.createdAt}
        partnerName={agreement.partner?.name ?? 'Invited party'}
        partnerSignedAt={null}
        termsText={agreement.termsText}
      />

      {isPartner && (
        <div className="flex justify-center">
          <Button asChild className="min-h-[44px] px-8">
            <Link to={`/agreements/${agreement.id}/accept?token=${encodeURIComponent(agreement.invitationToken)}`}>Review &amp; Sign</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function ActiveView({
  agreement,
  isParty,
  onTerminate,
}: {
  agreement: ClarityAgreement;
  isParty: boolean;
  onTerminate: () => void;
}) {
  return (
    <div className="space-y-6">
      <AgreementCertificate
        variant="active"
        displayId={agreement.displayId}
        creatorName={agreement.creator?.name ?? 'Creator'}
        creatorSignedAt={agreement.createdAt}
        partnerName={agreement.partner?.name ?? 'Partner'}
        partnerSignedAt={agreement.partnerSignedAt}
        termsText={agreement.termsText}
      />

      {agreement.partnerSignedAt && (
        <p className="text-sm text-center text-muted-foreground">
          Active since{' '}
          <span className="font-medium text-foreground">
            {formatDate(agreement.partnerSignedAt)}
          </span>
        </p>
      )}

      {isParty && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onTerminate}
            className="text-destructive border-destructive/30 hover:bg-destructive/5 min-h-[36px]"
          >
            Terminate Agreement
          </Button>
        </div>
      )}
    </div>
  );
}

function DeclinedView({
  agreement,
  isCreator,
}: {
  agreement: ClarityAgreement;
  isCreator: boolean;
}) {
  return (
    <div className="space-y-6">
      <MutedCertificate agreement={agreement} />

      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-center">
        <p className="text-sm text-muted-foreground font-medium">
          {isCreator ? 'Your invitation was declined.' : 'This invitation was declined.'}
        </p>
        {isCreator && (
          <p className="text-sm text-muted-foreground">
            Consider{' '}
            <Link to="/live" className="text-[#0044CC] hover:underline">
              scheduling a /live session first
            </Link>{' '}
            to practice together before sending another agreement.
          </p>
        )}
      </div>
    </div>
  );
}

function ExpiredView({
  agreement,
  isCreator,
  onResend,
  isResending,
}: {
  agreement: ClarityAgreement;
  isCreator: boolean;
  onResend: () => void;
  isResending: boolean;
}) {
  return (
    <div className="space-y-6">
      <MutedCertificate agreement={agreement} />

      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-center">
        <p className="text-sm text-muted-foreground font-medium">Invitation expired.</p>
        {isCreator && (
          <Button
            variant="outline"
            size="sm"
            onClick={onResend}
            disabled={isResending}
            className="min-h-[36px]"
          >
            {isResending ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                Resending...
              </>
            ) : (
              'Resend Invitation'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function TerminatedView({ agreement }: { agreement: ClarityAgreement }) {
  return (
    <div className="space-y-6">
      <MutedCertificate agreement={agreement} />

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          This agreement was terminated
          {agreement.terminatedAt ? (
            <>
              {' '}on{' '}
              <span className="font-medium text-foreground">
                {formatDate(agreement.terminatedAt)}
              </span>
            </>
          ) : null}
          .
        </p>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="h-4 bg-muted rounded w-20 mb-6 animate-pulse" />
      <div className="rounded-lg border border-border overflow-hidden animate-pulse">
        <div className="p-8 space-y-4">
          <div className="h-6 bg-muted rounded w-3/5 mx-auto" />
          <div className="h-4 bg-muted rounded w-2/5 mx-auto" />
          <div className="space-y-2 mt-6">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-5/6" />
            <div className="h-4 bg-muted rounded w-4/5" />
          </div>
          <div className="flex justify-between mt-8 pt-6 border-t">
            <div className="h-10 bg-muted rounded w-28" />
            <div className="h-10 bg-muted rounded w-10 rounded-full" />
            <div className="h-10 bg-muted rounded w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AgreementPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [agreement, setAgreement] = useState<ClarityAgreement | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const [isResending, setIsResending] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);

  // Fetch agreement after auth settles
  useEffect(() => {
    async function load() {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Wait for auth to resolve so RLS sees the correct user
      if (authLoading) return;

      setLoading(true);
      setNotFound(false);
      setIsPrivate(false);

      try {
        const data = await agreementsService.getAgreement(id);
        if (!data) {
          // Distinguish between truly not-found and private/access-denied
          if (isValidUuid(id) && !user) {
            setIsPrivate(true);
          } else {
            setNotFound(true);
          }
        } else {
          setAgreement(data);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, authLoading, user]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleResend = useCallback(async () => {
    if (!agreement || isResending) return;
    setIsResending(true);
    try {
      const ok = await agreementsService.resendInvitation(agreement.id);
      if (ok) {
        toast.success('Invitation resent');
        const refreshed = await agreementsService.getAgreement(agreement.id);
        if (refreshed) setAgreement(refreshed);
      } else {
        toast.error('Failed to resend invitation. Try again.');
      }
    } catch {
      toast.error('Failed to resend invitation. Try again.');
    } finally {
      setIsResending(false);
    }
  }, [agreement, isResending]);

  const handleTerminateConfirm = useCallback(async () => {
    if (!agreement || isTerminating) return;
    setIsTerminating(true);
    try {
      const ok = await agreementsService.terminateAgreement(agreement.id);
      if (ok) {
        setTerminateOpen(false);
        toast.success('Agreement terminated');
        // Reload page to reflect updated status
        const refreshed = await agreementsService.getAgreement(agreement.id);
        if (refreshed) setAgreement(refreshed);
      } else {
        toast.error('Failed to terminate agreement. Try again.');
      }
    } catch {
      toast.error('Failed to terminate agreement. Try again.');
    } finally {
      setIsTerminating(false);
    }
  }, [agreement, isTerminating]);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingSkeleton />;
  }

  // ── Private / unauthenticated ────────────────────────────────────────────────

  if (isPrivate) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <FocusHeader onBack={handleBack} />
        <div className="text-center py-12 space-y-4">
          <LockIcon className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">This agreement is private.</p>
          <Button asChild>
            <Link to="/login">Sign in to view</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────

  if (notFound || !agreement) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <FocusHeader onBack={handleBack} />
        <div className="text-center py-12">
          <p className="text-muted-foreground">Agreement not found.</p>
        </div>
      </div>
    );
  }

  // ── Party detection ──────────────────────────────────────────────────────────

  const currentProfileId = user?.id ?? null;
  const isCreator = !!currentProfileId && currentProfileId === agreement.creatorProfileId;
  const isPartner = !!currentProfileId && (
    currentProfileId === agreement.partnerProfileId
  );
  const isParty = isCreator || isPartner;

  // ── State-branched content ───────────────────────────────────────────────────

  let content: React.ReactNode;

  switch (agreement.status) {
    case 'pending':
      content = (
        <PendingView
          agreement={agreement}
          isCreator={isCreator}
          isPartner={isPartner}
        />
      );
      break;

    case 'active':
      content = (
        <>
          <TerminateDialog
            open={terminateOpen}
            onConfirm={handleTerminateConfirm}
            onCancel={() => setTerminateOpen(false)}
            isTerminating={isTerminating}
          />
          <ActiveView
            agreement={agreement}
            isParty={isParty}
            onTerminate={() => setTerminateOpen(true)}
          />
        </>
      );
      break;

    case 'declined':
      content = (
        <DeclinedView agreement={agreement} isCreator={isCreator} />
      );
      break;

    case 'expired':
      content = (
        <ExpiredView
          agreement={agreement}
          isCreator={isCreator}
          onResend={handleResend}
          isResending={isResending}
        />
      );
      break;

    case 'terminated':
      content = <TerminatedView agreement={agreement} />;
      break;

    default:
      content = (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Unknown agreement state.</p>
        </div>
      );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <FocusHeader onBack={handleBack} />
      {content}
    </div>
  );
}
