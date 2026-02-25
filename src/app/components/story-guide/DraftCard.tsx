/**
 * @file DraftCard.tsx
 * @description Versioned draft card display for AI-guided story creation.
 * Stateless display component — no service calls. Content uses React text nodes only (XSS-safe).
 */

export interface DraftCardProps {
  version: number;
  content: string;
  status: 'draft' | 'polish';
  linkedPointText?: string;
  changeNote?: string;
}

const STATUS_LABELS: Record<DraftCardProps['status'], string> = {
  draft: 'Draft',
  polish: 'Polish',
};

const BADGE_CLASS =
  'bg-muted text-muted-foreground border border-border rounded-md px-2 py-0.5 text-xs';

export function DraftCard({
  version,
  content,
  status,
  linkedPointText,
  changeNote,
}: DraftCardProps) {
  const statusLabel = STATUS_LABELS[status];

  return (
    <div
      data-testid={status === 'polish' ? 'draft-card-polish' : 'draft-card'}
      data-draft-card="true"
      className="rounded-xl border border-border bg-muted/40 p-4"
    >
      {/* Version + status header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">
          Draft v{version} ·
        </span>
        <span className={BADGE_CLASS}>{statusLabel}</span>
        <span className="text-xs text-muted-foreground">· not saved</span>
      </div>

      {/* Content — React text node, no innerHTML */}
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>

      {/* Linked point */}
      {linkedPointText && (
        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-3">
          <span>linked to:</span>
          <span>📌</span>
          <span>{linkedPointText}</span>
        </div>
      )}

      {/* Change note */}
      {changeNote && (
        <p className="text-xs text-muted-foreground italic mt-1">{changeNote}</p>
      )}
    </div>
  );
}
