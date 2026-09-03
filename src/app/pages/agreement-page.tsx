/**
 * @file agreement-page.tsx
 * @description P422: Agreement detail page — state-branched view for a Clarity Partner Agreement.
 * Route: /agreements/:id
 *
 * Branches on agreement.status:
 *   'pending'    → PendingView (partner: Review & Sign; creator: certificate only)
 *   'active'     → ActiveView (certificate with gold seal + terminate option)
 *   'declined'   → DeclinedView (muted certificate + suggestion)
 *   'expired'    → ExpiredView (muted certificate + resend for creator)
 *   'terminated' → TerminatedView (muted certificate + history notice)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, LockIcon } from 'lucide-react';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { ClarityAgreement } from '@/app/data/agreements-service';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { AgreementShareDropdown } from '@/app/components/agreements/agreement-share-dropdown';
import { Button } from '@/components/ui/button';
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

// P466: Decision F — state-dependent fallback chain
// partner.name (profile) → partnerDisplayName (DB) → 'Invited party' (pending) | 'Partner' (other)
function resolvePartnerName(
  partner: ClarityAgreement['partner'],
  partnerDisplayName: string | null,
  isPending: boolean,
): string {
  return partner?.name ?? partnerDisplayName ?? (isPending ? 'Invited party' : 'Partner');
}

function MutedCertificate({ agreement }: { agreement: ClarityAgreement }) {
  const partnerName = resolvePartnerName(
    agreement.partner,
    agreement.partnerDisplayName,
    agreement.status === 'pending',
  );
  return (
    <div className="opacity-40 grayscale">
      <AgreementCertificate
        variant="pending"
        displayId={agreement.displayId}
        agreementVersion={agreement.agreementVersion}
        creatorName={agreement.creator?.name ?? 'Creator'}
        creatorSignedAt={agreement.createdAt}
        partnerName={partnerName}
        partnerSignedAt={agreement.partnerSignedAt}
        termsText={agreement.termsText}
        creatorAvatarUrl={agreement.creator?.avatarUrl}
        partnerAvatarUrl={agreement.partner?.avatarUrl}
        creatorProfileUrl={agreement.creator?.slug ? `/p/${agreement.creator.slug}` : null}
        partnerProfileUrl={agreement.partner?.slug ? `/p/${agreement.partner.slug}` : null}
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
  partnerName,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isTerminating: boolean;
  partnerName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this agreement?</DialogTitle>
          <DialogDescription>
            This will permanently end your Clarity Partner Agreement with {partnerName}. Both of
            you will be notified by email. You can still view it as history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isTerminating} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isTerminating}>
            {isTerminating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
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
  isCreator,
  onResend,
  isResending,
}: {
  agreement: ClarityAgreement;
  isPartner: boolean;
  isCreator: boolean;
  onResend: () => void;
  isResending: boolean;
}) {
  const partnerName = resolvePartnerName(
    agreement.partner,
    agreement.partnerDisplayName,
    true,
  );

  const resendKey = `clarity-resend-${agreement.id}`;
  const [cooldownStart, setCooldownStart] = useState<number | null>(null);
  // Prevents double-click state mismatch before React re-renders with cooldownStart
  const sentRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(resendKey);
    if (stored) {
      const t = new Date(stored).getTime();
      if (Date.now() - t < 86400000) setCooldownStart(t);
    }
  }, [resendKey]);

  const remainingHours = cooldownStart
    ? Math.ceil((cooldownStart + 86400000 - Date.now()) / 3600000)
    : 0;

  const handleResendClick = () => {
    if (sentRef.current) return;
    sentRef.current = true;
    const now = Date.now();
    localStorage.setItem(resendKey, new Date(now).toISOString());
    setCooldownStart(now);
    onResend();
  };

  const isOnCooldown = cooldownStart !== null;

  return (
    <div className="space-y-6">
      <AgreementCertificate
        variant="pending"
        displayId={agreement.displayId}
        agreementVersion={agreement.agreementVersion}
        creatorName={agreement.creator?.name ?? 'Creator'}
        creatorSignedAt={agreement.createdAt}
        partnerName={partnerName}
        partnerSignedAt={null}
        termsText={agreement.termsText}
        creatorAvatarUrl={agreement.creator?.avatarUrl}
        partnerAvatarUrl={agreement.partner?.avatarUrl}
        creatorProfileUrl={agreement.creator?.slug ? `/p/${agreement.creator.slug}` : null}
        partnerProfileUrl={agreement.partner?.slug ? `/p/${agreement.partner.slug}` : null}
      />

      {isPartner && (
        <div className="flex justify-center">
          <Button asChild className="min-h-11 px-8">
            <Link to={`/agreements/${agreement.id}/accept?token=${encodeURIComponent(agreement.invitationToken)}`}>Review &amp; Sign</Link>
          </Button>
        </div>
      )}

      {isCreator && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResendClick}
            disabled={isResending || isOnCooldown}
            className="min-h-[36px]"
          >
            {sentRef.current || !isOnCooldown
              ? isResending
                ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1" />
                    Resending...
                  </>
                )
                : 'Resend Invitation'
              : `Resend available in ${remainingHours}h`
            }
          </Button>
        </div>
      )}
    </div>
  );
}

function ActiveView({
  agreement,
  isParty,
  isCreator,
  onTerminate,
}: {
  agreement: ClarityAgreement;
  isParty: boolean;
  isCreator: boolean;
  onTerminate: () => void;
}) {
  const creatorName = agreement.creator?.name ?? 'Creator';
  const partnerName = resolvePartnerName(
    agreement.partner,
    agreement.partnerDisplayName,
    false,
  );
  const agreementUrl = `${window.location.origin}/agreements/${agreement.id}`;
  const currentUserName = isCreator ? creatorName : partnerName;

  return (
    <div className="space-y-6">
      {isParty && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 text-center sm:text-left">Your Agreement</p>
          <AgreementShareDropdown
            agreementUrl={agreementUrl}
            agreementId={agreement.id}
            displayId={agreement.displayId}
            creatorName={creatorName}
            partnerName={partnerName}
            partnerSignedAt={agreement.partnerSignedAt ?? agreement.createdAt}
            termsText={agreement.termsText}
            agreementVersion={agreement.agreementVersion}
            currentUserName={currentUserName}
          />
        </div>
      )}

      <AgreementCertificate
        variant="active"
        displayId={agreement.displayId}
        agreementVersion={agreement.agreementVersion}
        creatorName={creatorName}
        creatorSignedAt={agreement.createdAt}
        partnerName={partnerName}
        partnerSignedAt={agreement.partnerSignedAt}
        termsText={agreement.termsText}
        creatorAvatarUrl={agreement.creator?.avatarUrl}
        partnerAvatarUrl={agreement.partner?.avatarUrl}
        creatorProfileUrl={agreement.creator?.slug ? `/p/${agreement.creator.slug}` : null}
        partnerProfileUrl={agreement.partner?.slug ? `/p/${agreement.partner.slug}` : null}
      />

      <div className="text-center">
        <Link to="/live" className="text-sm text-[#0044CC] hover:underline">
          Ready to practice? Start a /live session →
        </Link>
      </div>

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
    <CertificatePageShell className="py-8">
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
    </CertificatePageShell>
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
    navigate('/me');
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
      <CertificatePageShell className="py-8">
        <FocusHeader onBack={handleBack} />
        <div className="text-center py-12 space-y-4">
          <LockIcon className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">This agreement is private.</p>
          <Button asChild>
            <Link to="/login">Sign in to view</Link>
          </Button>
        </div>
      </CertificatePageShell>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────

  if (notFound || !agreement) {
    return (
      <CertificatePageShell className="py-8">
        <FocusHeader onBack={handleBack} />
        <div className="text-center py-12">
          <p className="text-muted-foreground">Agreement not found.</p>
        </div>
      </CertificatePageShell>
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
          isPartner={isPartner}
          isCreator={isCreator}
          onResend={handleResend}
          isResending={isResending}
        />
      );
      break;

    case 'active': {
      const activePartnerName = resolvePartnerName(
        agreement.partner,
        agreement.partnerDisplayName,
        false,
      );
      content = (
        <>
          <TerminateDialog
            open={terminateOpen}
            onConfirm={handleTerminateConfirm}
            onCancel={() => setTerminateOpen(false)}
            isTerminating={isTerminating}
            partnerName={activePartnerName ?? 'your partner'}
          />
          <ActiveView
            agreement={agreement}
            isParty={isParty}
            isCreator={isCreator}
            onTerminate={() => setTerminateOpen(true)}
          />
        </>
      );
      break;
    }

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
    <CertificatePageShell className="py-6">
      <FocusHeader onBack={handleBack} />
      {content}
    </CertificatePageShell>
  );
}
