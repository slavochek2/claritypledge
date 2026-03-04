/**
 * @file agreement-row.tsx
 * @description P422: Single agreement row for the profile agreements list.
 * Shows partner name, status badge, seal date, duration, and display ID.
 */

import { Link } from 'react-router-dom';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';

export interface AgreementRowProps {
  agreement: ClarityAgreement;
  currentProfileId: string;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function AgreementRow({ agreement, currentProfileId, onClick }: AgreementRowProps) {
  const partnerName = getPartnerName(agreement, currentProfileId);
  const isTerminated =
    agreement.status === 'terminated' ||
    agreement.status === 'declined' ||
    agreement.status === 'expired';

  const rowContent = (
    <div
      className={`flex items-center gap-3 px-4 py-3 min-h-[56px] rounded-lg hover:bg-muted/50 active:bg-muted transition-colors ${isTerminated ? 'opacity-50' : ''}`}
    >
      {/* Partner name + sub-label */}
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm truncate ${isTerminated ? 'text-muted-foreground' : 'text-foreground'}`}>
          {partnerName}
        </p>
        <p className="text-xs text-muted-foreground truncate">{subLabel(agreement)}</p>
      </div>

      {/* Right side: badge + display ID */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <StatusBadge status={agreement.status} />
        <span className="text-[10px] text-muted-foreground/60">{agreement.displayId}</span>
      </div>
    </div>
  );

  return (
    <li>
      <Link
        to={`/agreements/${agreement.id}`}
        onClick={onClick}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        aria-label={`Agreement ${agreement.displayId} with ${partnerName}`}
      >
        {rowContent}
      </Link>
    </li>
  );
}
