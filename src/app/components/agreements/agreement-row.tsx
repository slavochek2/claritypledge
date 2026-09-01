/**
 * @file agreement-row.tsx
 * @description P422: Single agreement row for the profile agreements list.
 * Shows partner name, status badge, seal date, duration, and display ID.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';
import { agreementsService } from '@/app/data/agreements-service';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';

export interface AgreementRowProps {
  agreement: ClarityAgreement;
  currentProfileId: string;
  /** When true, shows an inline Resend button on pending rows (owner view only). */
  resendable?: boolean;
  /** When true, shows a Cancel button on pending rows (owner view only). */
  cancelable?: boolean;
  /** Called after a successful cancel so the parent can remove the row. */
  onCancelled?: (agreementId: string) => void;
  onClick?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPartnerName(agreement: ClarityAgreement, currentProfileId: string): string {
  if (agreement.creatorProfileId === currentProfileId) {
    return agreement.partner?.name ?? agreement.partnerDisplayName ?? 'Invited party';
  }
  return agreement.creator?.name ?? 'Unknown';
}

function formatSealDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function getDurationLabel(isoDate: string): string {
  const start = new Date(isoDate).getTime();
  const now = Date.now();
  const diffMs = now - start;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} active`;
  }
  const months = Math.floor(diffDays / 30);
  return `${months} month${months !== 1 ? 's' : ''} active`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ClarityAgreement['status'] }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Active
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        Pending
      </span>
    );
  }
  // terminated / declined / expired
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      Terminated
    </span>
  );
}

// ─── Sub-label text ───────────────────────────────────────────────────────────

function subLabel(agreement: ClarityAgreement): string {
  const { status, partnerSignedAt, terminatedAt, createdAt } = agreement;

  if (status === 'active' && partnerSignedAt) {
    return `Sealed ${formatSealDate(partnerSignedAt)} · ${getDurationLabel(partnerSignedAt)}`;
  }
  if (status === 'pending') {
    return `Invited ${formatSealDate(createdAt)}`;
  }
  if (terminatedAt) {
    return `Terminated ${formatSealDate(terminatedAt)}`;
  }
  return '';
}

// ─── Inline resend button (pending rows, owner only) ──────────────────────────

function ResendButton({ agreementId }: { agreementId: string }) {
  const resendKey = `clarity-resend-${agreementId}`;
  const [cooldownStart] = useState<number | null>(() => {
    const stored = localStorage.getItem(resendKey);
    return stored ? new Date(stored).getTime() : null;
  });
  const [sentAt, setSentAt] = useState<number | null>(cooldownStart);
  const [isResending, setIsResending] = useState(false);

  const isOnCooldown = sentAt !== null && Date.now() < sentAt + 86400000;
  const remainingHours = isOnCooldown
    ? Math.ceil((sentAt + 86400000 - Date.now()) / 3600000)
    : 0;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isResending) return;
    if (isOnCooldown) {
      toast.info(`Already resent — can send again in ${remainingHours}h`);
      return;
    }

    setIsResending(true);
    try {
      const ok = await agreementsService.resendInvitation(agreementId);
      if (ok) {
        const now = Date.now();
        setSentAt(now);
        localStorage.setItem(resendKey, new Date(now).toISOString());
        toast.success('Invitation resent.');
      } else {
        toast.error('Failed to resend. Try again.');
      }
    } catch {
      toast.error('Failed to resend. Try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isResending}
      className="text-xs px-2.5 py-1 rounded-md border border-input text-muted-foreground hover:bg-muted disabled:opacity-50 flex-shrink-0 min-h-[32px]"
    >
      {isResending ? '...' : 'Resend'}
    </button>
  );
}

// ─── Revoke trigger button (pending rows, owner only) ────────────────────────

function RevokeTrigger({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-md border border-input text-muted-foreground hover:bg-muted flex-shrink-0 min-h-[32px]"
    >
      Revoke
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgreementRow({ agreement, currentProfileId, resendable, cancelable, onCancelled, onClick }: AgreementRowProps) {
  const partnerName = getPartnerName(agreement, currentProfileId);
  const isTerminated =
    agreement.status === 'terminated' ||
    agreement.status === 'declined' ||
    agreement.status === 'expired';
  const showResend = resendable && agreement.status === 'pending';
  const showCancel = cancelable && agreement.status === 'pending';

  // Dialog state lifted to row level so ConfirmDialog renders outside the <Link>
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleRevokeTrigger = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRevokeOpen(true);
  };

  const handleRevokeConfirm = async () => {
    setIsCancelling(true);
    try {
      const ok = await agreementsService.cancelInvitation(agreement.id);
      if (ok) {
        toast.success('Invitation cancelled.');
        setRevokeOpen(false);
        onCancelled?.(agreement.id);
      } else {
        toast.error('Failed to cancel. Try again.');
      }
    } catch {
      toast.error('Failed to cancel. Try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const isPending = agreement.status === 'pending';

  const rowContent = (
    <div
      className={`flex items-center gap-3 px-4 py-3 min-h-14 rounded-lg transition-colors ${isPending ? '' : 'hover:bg-muted/50 active:bg-muted'} ${isTerminated ? 'opacity-50' : ''}`}
    >
      {/* Partner name + sub-label */}
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm truncate ${isTerminated ? 'text-muted-foreground' : 'text-foreground'}`}>
          {partnerName}
        </p>
        <p className="text-xs text-muted-foreground truncate">{subLabel(agreement)}</p>
      </div>

      {/* Right side: resend + cancel (pending, owner) OR status badge */}
      {showResend || showCancel ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          {showResend && <ResendButton agreementId={agreement.id} />}
          {showCancel && <RevokeTrigger onClick={handleRevokeTrigger} />}
        </div>
      ) : (
        <StatusBadge status={agreement.status} />
      )}
    </div>
  );

  return (
    <li>
      {isPending ? (
        <div className="rounded-lg" aria-label={`Pending invitation for ${partnerName}`}>
          {rowContent}
        </div>
      ) : (
        <Link
          to={`/agreements/${agreement.id}`}
          onClick={onClick}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
          aria-label={`Agreement with ${partnerName}`}
        >
          {rowContent}
        </Link>
      )}
      {/* Dialog rendered OUTSIDE the Link/div to prevent click-through navigation */}
      {showCancel && (
        <ConfirmDialog
          open={revokeOpen}
          onOpenChange={setRevokeOpen}
          title="Revoke invitation?"
          description={`${partnerName} will no longer be able to accept this invite.`}
          confirmLabel="Revoke"
          cancelLabel="Keep"
          variant="destructive"
          onConfirm={handleRevokeConfirm}
          isLoading={isCancelling}
        />
      )}
    </li>
  );
}
