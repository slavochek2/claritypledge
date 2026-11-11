/**
 * @file ClarifyDraftCard.tsx
 * @description P1631: one Clarify draft as the product's point card: a "Draft" pill with the private icon (informational, not a control), the statement, the owner's own
 * position buttons under "Your position", then two quiet rows: "N cited" (collapsed lines) on the left with Edit, Delete and Mention in chat on the right, and a right-aligned
 * Publish to chat. An earlier version (a newer card was made from it) shows a quiet label and no position and no Publish. Publishing itself is the next part: until then a
 * tap on an enabled Publish says so.
 */
import { useState } from 'react';
import { Check, ChevronRight, Lock, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared';
import { MENTIONED_LABEL, MENTION_IN_CHAT_LABEL } from '@/app/components/canvas/canvas-mention-in-chat';
import { CANVAS_QUIET_ACTION } from '@/app/components/canvas/canvas-pill-styles';
import { deleteClarifyDraft, editClarifyDraft, type ClarifyDraft } from '@/app/data/clarify-service';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './ChatDialogs';
import { useOwnerPosition } from './use-owner-position';
import {
  CITED_LABEL, DELETE_DESCRIPTION, DELETE_FAILED_TEXT, DELETE_TITLE, DRAFT_MAX, DRAFT_PILL, DRAFT_PRIVATE_LABEL, EARLIER_LABEL, EMPTY_DRAFT_TEXT, POSITION_LABEL,
  PUBLISH_COMING_TOAST, PUBLISH_LABEL, PUBLISH_NEEDS_POSITION_TOAST, SAVE_FAILED_TEXT, citedToggleLabel,
} from './clarify-copy';

const NO_COUNTS: SevenPointCounts = {
  strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
};

function DraftBadge() {
  return (
    <div className="mb-1 flex items-center gap-2" data-testid="clarify-draft-badge">
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" data-testid="clarify-draft-pill">{DRAFT_PILL}</span>
      <span role="img" aria-label={DRAFT_PRIVATE_LABEL} className="inline-flex text-muted-foreground" data-testid="clarify-draft-lock">
        <Lock size={14} aria-hidden="true" />
      </span>
    </div>
  );
}

/** The cited lines, once opened: from the server's text, never the model's. */
function CitedList({ draft }: { draft: ClarifyDraft }) {
  return (
    <ul className="mt-1 space-y-1.5" data-testid="clarify-cited-list" aria-label={CITED_LABEL}>
      {draft.cited.map((l) => (
        <li key={l.id} className="break-words border-l-2 border-border pl-2 text-sm text-muted-foreground">{l.text}</li>
      ))}
    </ul>
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

/** Publish to chat: always visible; without the owner's position it wears the standard disabled look and a tap says why (aria-disabled, so it stays focusable and the tap is heard). */
function PublishButton({ hasPosition, id }: { hasPosition: boolean; id: string }) {
  return (
    <Button
      type="button"
      aria-disabled={!hasPosition}
      className={cn('h-11 min-h-11 px-4', !hasPosition && 'opacity-50')}
      data-testid={`clarify-publish-${id}`}
      onClick={() => toast(hasPosition ? PUBLISH_COMING_TOAST : PUBLISH_NEEDS_POSITION_TOAST)}
    >
      {PUBLISH_LABEL}
    </Button>
  );
}

function CardActions({ draft, open, onToggle, onEdit, onDelete, mentioned, onMention }: {
  /** Absent on an earlier version: it is no longer edited by hand (Delete and Mention in chat stay). */
  draft: ClarifyDraft; open: boolean; onToggle: () => void; onEdit?: () => void; onDelete: () => void; mentioned: boolean; onMention: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-1" data-testid={`clarify-actions-${draft.id}`}>
      {draft.cited.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          data-testid="clarify-cited"
          className={cn('flex min-h-10 items-center gap-1 rounded-md px-1 text-sm text-foreground/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-500')}
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          {citedToggleLabel(draft.cited.length)}
        </button>
      ) : <span />}
      <div className="flex flex-wrap items-center justify-end gap-x-1">
        {onEdit && (
          <Button type="button" variant="ghost" className={`${CANVAS_QUIET_ACTION} h-auto min-h-11`} aria-label="Edit this point" data-testid={`clarify-edit-${draft.id}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />Edit
          </Button>
        )}
        <Button type="button" variant="ghost" className={`${CANVAS_QUIET_ACTION} h-auto min-h-11 w-11 px-0`} aria-label="Delete this draft" data-testid={`clarify-delete-${draft.id}`} onClick={onDelete}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
        <MentionButton id={draft.id} mentioned={mentioned} onClick={onMention} />
      </div>
    </div>
  );
}

export function ClarifyDraftCard({ draft, userId, onChanged, earlier = false, mentioned = false, onMention = () => undefined }: {
  draft: ClarifyDraft; userId: string; onChanged: () => void; earlier?: boolean; mentioned?: boolean; onMention?: () => void;
}) {
  const point = draft.point;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [citedOpen, setCitedOpen] = useState(false);
  const { position, choose, reset } = useOwnerPosition(userId, point?.id ?? '', point?.ownerPosition ?? null);
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
            {/* The position row sits here, across the whole card, not in the statement column beside the pin: below 270px it drops its words, and 76px of chrome would cost that in a side panel. */}
            {!earlier && (
              <div className="min-w-0 pt-1" data-testid="clarify-position-row">
                <p className="mb-1 text-xs text-muted-foreground" data-testid="clarify-position-label">{POSITION_LABEL}</p>
                <div role="presentation" className="min-w-0">
                  <PositionButtons userPosition={position} counts={NO_COUNTS} compact narrow onPositionClick={(p) => void choose(p)} onClear={() => void choose(null)} />
                </div>
              </div>
            )}
            <CardActions draft={draft} open={citedOpen} onToggle={() => setCitedOpen((o) => !o)} onEdit={earlier ? undefined : () => setEditing(true)} onDelete={() => setDeleting(true)} mentioned={mentioned} onMention={onMention} />
            {citedOpen && draft.cited.length > 0 && <CitedList draft={draft} />}
            {earlier ? (
              <p className="px-1 py-2 text-right text-sm text-muted-foreground" data-testid="clarify-earlier">{EARLIER_LABEL}</p>
            ) : (
              <div className="flex justify-end"><PublishButton id={draft.id} hasPosition={position !== null} /></div>
            )}
          </div>
        }
      />
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
