/**
 * @file ClarifyDraftCard.tsx
 * @description P1631: one Clarify draft as the product's point card: a "Draft" pill with the private icon (informational, not a control), the
 * statement, the owner's own position buttons, Edit (a pencil that opens the text in place, as canvas drafts do), Delete (the product's confirm
 * dialog) and a collapsed "Cited lines (may be wrong)" list. No Publish in this step.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared';
import { deleteClarifyDraft, editClarifyDraft, type ClarifyDraft, type OwnerPosition } from '@/app/data/clarify-service';
import { UNRESOLVED_WRITE_MESSAGE, isNetworkWriteFailure } from '@/app/hooks/use-online-write-guard';
import { networkMark } from '@/lib/network-outcome';
import {
  beginPositionWrite, endPositionWrite, isLatestPositionWrite, recordConfirmedPosition, sendPositionWrite, settlePositionWrite,
} from '@/app/data/position-write-outcome';
import type { PositionType } from '@/app/types';
import { ConfirmDialog } from './ChatDialogs';
import { CITED_LABEL, DELETE_DESCRIPTION, DELETE_FAILED_TEXT, DELETE_TITLE, DRAFT_MAX, DRAFT_PILL, DRAFT_PRIVATE_LABEL, EMPTY_DRAFT_TEXT, SAVE_FAILED_TEXT } from './clarify-copy';

const NO_COUNTS: SevenPointCounts = {
  strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
};

/**
 * The owner's own position write, the way every point card writes it (P1420): checked in order, an unanswered write is settled by asking the
 * server (never rolled back at once), a newer click owns the display, and a changed server value is taken once no write is pending.
 */
function useOwnerPosition(userId: string, pointId: string, serverValue: OwnerPosition) {
  const [position, setPosition] = useState<OwnerPosition>(serverValue);
  const saved = useRef<OwnerPosition>(serverValue);
  const pendingWrites = useRef(0);
  // a server value that arrived while a write was pending: applied when the write settles, never lost
  const latestServer = useRef<OwnerPosition>(serverValue);
  const serverMovedDuringWrite = useRef(false);
  const unmounted = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    latestServer.current = serverValue;
    if (pendingWrites.current > 0) {
      serverMovedDuringWrite.current = true;
      return;
    }
    saved.current = serverValue;
    setPosition(serverValue);
  }, [serverValue]);
  const choose = async (picked: PositionType | null) => {
    const next = picked === position ? null : picked;
    const generation = beginPositionWrite(userId, pointId);
    const isLatest = () => isLatestPositionWrite(userId, pointId, generation);
    pendingWrites.current += 1;
    setPosition(next);
    try {
      const sentAt = networkMark();
      try {
        await sendPositionWrite(userId, pointId, next, generation);
        if (isLatest()) saved.current = next; // an older write's late success is not the baseline
      } catch (err) {
        if (!isNetworkWriteFailure(err, sentAt)) {
          if (!isLatest()) return;
          setPosition(saved.current);
          toast.error('Failed to save position.');
          return;
        }
        // sent, never answered: it may have landed. Ask the server. Nothing thrown here may escape the click.
        try {
          const outcome = await settlePositionWrite({ userId, pointId, generation, expected: next, signal: unmounted.current.signal });
          if (outcome.kind === 'superseded') return;
          if (outcome.kind === 'confirmed') {
            saved.current = next;
            recordConfirmedPosition(userId, pointId, generation, next);
            return;
          }
          setPosition(saved.current);
          toast.error(outcome.kind === 'rejected' ? 'Your position was not saved. Try again.' : UNRESOLVED_WRITE_MESSAGE);
        } catch {
          if (!isLatest()) return;
          setPosition(saved.current);
          toast.error(UNRESOLVED_WRITE_MESSAGE);
        }
      }
    } finally {
      pendingWrites.current -= 1;
      endPositionWrite(userId, pointId);
      if (pendingWrites.current === 0 && serverMovedDuringWrite.current) {
        serverMovedDuringWrite.current = false;
        saved.current = latestServer.current;
        setPosition(latestServer.current);
      }
    }
  };
  return { position, choose };
}

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

function CitedLines({ draft }: { draft: ClarifyDraft }) {
  const [open, setOpen] = useState(false);
  if (draft.cited.length === 0) return null;
  return (
    <div className="mt-2" data-testid="clarify-cited">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        {CITED_LABEL}
      </button>
      {open && (
        <ul className="mt-1 space-y-1.5" data-testid="clarify-cited-list">
          {draft.cited.map((l) => (
            <li key={l.id} className="break-words border-l-2 border-border pl-2 text-sm text-muted-foreground">{l.text}</li>
          ))}
        </ul>
      )}
    </div>
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

export function ClarifyDraftCard({ draft, userId, onChanged }: { draft: ClarifyDraft; userId: string; onChanged: () => void }) {
  const point = draft.point;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { position, choose } = useOwnerPosition(userId, point?.id ?? '', point?.ownerPosition ?? null);
  if (!point) return null;
  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-card p-4" data-testid={`clarify-draft-${draft.id}`}>
        <DraftBadge />
        <DraftEditor draft={draft} onClose={() => setEditing(false)} onSaved={onChanged} />
      </div>
    );
  }
  return (
    <>
      <PointCardShell
        aria-label={`Draft point: ${point.statement}`}
        data-testid={`clarify-draft-${draft.id}`}
        data-card="point"
        header={<DraftBadge />}
        statement={<p className="min-w-0 flex-1 break-words text-base font-medium text-foreground" data-testid="clarify-draft-statement">{point.statement}</p>}
        footer={
          <div className="flex items-center justify-end gap-1 px-2 pb-2">
            <Button type="button" variant="ghost" className="h-11 w-11 p-0 text-foreground/70" aria-label="Edit this point" data-testid={`clarify-edit-${draft.id}`} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" className="h-11 w-11 p-0 text-foreground/70" aria-label="Delete this draft" data-testid={`clarify-delete-${draft.id}`} onClick={() => setDeleting(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        }
      >
        <div role="presentation" className="mt-2">
          <PositionButtons userPosition={position} counts={NO_COUNTS} compact onPositionClick={(p) => void choose(p)} onClear={() => void choose(null)} />
        </div>
        <CitedLines draft={draft} />
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
