/**
 * @file ClarifyDraftCard.tsx
 * @description P1631: one Clarify draft as the product's point card: a "Draft" pill with the product's private lock (its hint on hover and tap), the statement, the owner's own
 * position buttons in the statement's column, then one quiet row of small icons: Edit, Delete and Mention in chat. Publish to chat and Another point sit under the latest card,
 * not in it. An earlier version (a newer card was made from it) shows a quiet label and no position.
 */
import { useEffect, useState } from 'react';
import { Check, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell';
import { VisibilityBadge } from '@/app/components/shared/visibility-badge';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared';
import { MENTIONED_LABEL, MENTION_IN_CHAT_LABEL } from '@/app/components/canvas/canvas-mention-in-chat';
import { CANVAS_QUIET_ACTION } from '@/app/components/canvas/canvas-pill-styles';
import { deleteClarifyDraft, editClarifyDraft, type ClarifyDraft } from '@/app/data/clarify-service';
import { ConfirmDialog } from './ChatDialogs';
import { useOwnerPosition } from './use-owner-position';
import { DELETE_DESCRIPTION, DELETE_FAILED_TEXT, DELETE_TITLE, DRAFT_MAX, DRAFT_PILL, EARLIER_LABEL, EMPTY_DRAFT_TEXT, SAVE_FAILED_TEXT } from './clarify-copy';
import { setHasPosition } from './clarify-position-store';

const NO_COUNTS: SevenPointCounts = {
  strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
};

function DraftBadge() {
  return (
    <div className="mb-1 flex items-center gap-2" data-testid="clarify-draft-badge">
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" data-testid="clarify-draft-pill">{DRAFT_PILL}</span>
      <span className="inline-flex" data-testid="clarify-draft-lock"><VisibilityBadge visibility="private" size={14} /></span>
    </div>
  );
}

/** "Mention in chat", as the canvas card wears it: quiet grey, "Mentioned" with a tick while its pill is in the typing box. */
function MentionButton({ mentioned, onClick, id }: { mentioned: boolean; onClick: () => void; id: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-pressed={mentioned}
      aria-label={mentioned ? MENTIONED_LABEL : MENTION_IN_CHAT_LABEL}
      data-testid={`clarify-mention-${id}`}
      data-mentioned={mentioned || undefined}
      className={`${CANVAS_QUIET_ACTION} h-auto shrink-0 whitespace-normal text-left`}
    >
      {mentioned ? <Check aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
      <span>{mentioned ? MENTIONED_LABEL : MENTION_IN_CHAT_LABEL}</span>
    </Button>
  );
}

function DraftEditor({ draft, onClose, onSaved }: { draft: ClarifyDraft; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(draft.point?.statement ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async () => {
    const next = text.trim();
    if (!next) { setProblem(EMPTY_DRAFT_TEXT); return; }
    if (next === (draft.point?.statement ?? '').trim()) { onClose(); return; } // nothing changed: nothing is written
    setSaving(true);
    setProblem(null);
    try {
      const r = await editClarifyDraft(draft.id, next);
      if (r.status === 'refused') {
        // the editor stays open with what was typed
        setSaving(false);
        setProblem(SAVE_FAILED_TEXT);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setSaving(false);
      setProblem(SAVE_FAILED_TEXT);
    }
  };
  return (
    <div className="flex flex-col gap-2" data-testid="clarify-draft-editor">
      <Textarea
        value={text}
        onChange={(e) => { setText(e.target.value); if (problem === EMPTY_DRAFT_TEXT) setProblem(null); }}
        maxLength={DRAFT_MAX}
        rows={4}
        autoFocus
        readOnly={saving}
        aria-label="Point text"
        onKeyDown={(e) => { if (e.key === 'Escape' && !saving) { e.preventDefault(); e.stopPropagation(); onClose(); } }}
        className="min-h-24 resize-y text-base"
        data-testid="clarify-draft-editor-text"
      />
      {problem && <p role="alert" className="break-words text-sm text-red-800 dark:text-red-300" data-testid="clarify-draft-editor-problem">{problem}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11 min-h-11" disabled={saving} onClick={onClose} data-testid="clarify-draft-editor-cancel">Cancel</Button>
        <Button type="button" className="h-11 min-h-11" disabled={saving} onClick={() => void save()} data-testid="clarify-draft-editor-save">{saving ? 'Saving' : 'Save'}</Button>
      </div>
    </div>
  );
}

function CardActions({ draft, onEdit, onDelete, mentioned, onMention }: {
  /** Absent on an earlier version: it is no longer edited by hand (Delete and Mention in chat stay). */
  draft: ClarifyDraft; onEdit?: () => void; onDelete: () => void; mentioned: boolean; onMention: () => void;
}) {
  const icon = `${CANVAS_QUIET_ACTION} h-auto min-h-11 w-11 px-0`;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-1" data-testid={`clarify-actions-${draft.id}`}>
      {onEdit && (
        <MobileTooltip content="Edit">
          <Button type="button" variant="ghost" className={icon} aria-label="Edit" data-testid={`clarify-edit-${draft.id}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
        </MobileTooltip>
      )}
      <MobileTooltip content="Delete">
        <Button type="button" variant="ghost" className={icon} aria-label="Delete" data-testid={`clarify-delete-${draft.id}`} onClick={onDelete}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </MobileTooltip>
      <MentionButton id={draft.id} mentioned={mentioned} onClick={onMention} />
    </div>
  );
}

export function ClarifyDraftCard({ draft, userId, onChanged, earlier = false, mentioned = false, onMention = () => undefined }: {
  draft: ClarifyDraft; userId: string; onChanged: () => void; earlier?: boolean; mentioned?: boolean; onMention?: () => void;
}) {
  const point = draft.point;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { position, choose, reset } = useOwnerPosition(userId, point?.id ?? '', point?.ownerPosition ?? null);
  const hasPosition = position !== null;
  const pointId = point?.id;
  useEffect(() => { if (pointId) setHasPosition(pointId, hasPosition); }, [pointId, hasPosition]);
  if (!point) return null;
  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-card p-4" data-testid={`clarify-draft-${draft.id}`}>
        <DraftBadge />
        <DraftEditor draft={draft} onClose={() => setEditing(false)} onSaved={() => { reset(null); onChanged(); }} />
      </div>
    );
  }
  return (
    <>
      <PointCardShell
        aria-label={`Draft point: ${point.statement}`}
        data-testid={`clarify-draft-${draft.id}`}
        data-card="point"
        data-earlier={earlier || undefined}
        header={<DraftBadge />}
        statement={<p className="min-w-0 flex-1 break-words text-base font-medium text-foreground" data-testid="clarify-draft-statement">{point.statement}</p>}
        footer={
          <div className="min-w-0 space-y-1 px-2 pb-2" data-testid={`clarify-card-footer-${draft.id}`}>
            <CardActions draft={draft} onEdit={earlier ? undefined : () => setEditing(true)} onDelete={() => setDeleting(true)} mentioned={mentioned} onMention={onMention} />
            {earlier && <p className="px-1 py-2 text-right text-sm text-muted-foreground" data-testid="clarify-earlier">{EARLIER_LABEL}</p>}
          </div>
        }
      >
        {/* in the statement's column, as on the canvas card: the buttons start at the text's left edge */}
        {!earlier && (
          <div className="min-w-0 pt-2" data-testid="clarify-position-row">
            <div role="presentation" className="min-w-0">
              <PositionButtons userPosition={position} counts={NO_COUNTS} compact narrow onPositionClick={(p) => void choose(p)} onClear={() => void choose(null)} />
            </div>
          </div>
        )}
      </PointCardShell>
      {deleting && (
        <ConfirmDialog
          title={DELETE_TITLE}
          description={DELETE_DESCRIPTION}
          confirmLabel="Delete"
          onConfirm={async () => {
            // a failure or a refusal says so and closes the dialog; the draft stays where it is
            try {
              const r = await deleteClarifyDraft(draft.id);
              if (r.status === 'refused') toast.error(DELETE_FAILED_TEXT);
              else onChanged();
            } catch {
              toast.error(DELETE_FAILED_TEXT);
            }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}
