/**
 * @file ClarifyPublishButton.tsx
 * @description P1631: Publish to chat, the filled primary at the right end of the row under the latest card. Without the owner's position it wears the standard disabled look and a tap
 * says why (aria-disabled, so it stays focusable and the tap is heard). With one, a tap posts the point into the chat it came from and hands the answer to `onPublished` (the panel closes).
 * A card already published shows "Published" as quiet text. A card made in the Mirror posts into the Mirror's main chat (P1722).
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { publishClarify, setClarifyVisibility, type ClarifyVisibility, type PublishResult } from '@/app/data/clarify-service';
import { PublicWarningDialog } from './ClarifyVisibilityControl';
import { isWarningAcked, markWarningAcked } from './clarify-warning-ack';
import { CLARIFY_FAILED_TOAST, PUBLISH_ANSWERED_TOAST, PUBLISH_CHANGED_TOAST, PUBLISH_NEEDS_WARNING_TOAST, PUBLISH_VISIBILITY_CHANGED_TOAST, PUBLISH_LABEL, PUBLISH_MIRROR_LABEL, PUBLISH_NEEDS_POSITION_TOAST, PUBLISH_NOT_AVAILABLE_TOAST, PUBLISH_PUBLISHED_TEXT, VISIBILITY_FAILED_TOAST } from './clarify-copy';
import { useHasPosition } from './clarify-position-store';

export interface ClarifyPublishButtonProps {
  pointId: string;
  serverHasPosition: boolean;
  id: string;
  /** The point already has a live card in a chat. */
  published?: boolean;
  /** Kind of the chat the card came from: a Mirror-sourced card reads "Publish" (it posts into the Mirror's main chat, there is no one else to publish to). */
  sourceKind?: string | null;
  /** The visibility the card shows: what Publish asks for. */
  visibility?: ClarifyVisibility;
  /** The server wants the Public warning confirmed before a public publish (unset counts as yes). */
  publicWarning?: boolean;
  /** The point was posted before: the server asks for no acknowledgement again, so neither does this. */
  everPublished?: boolean;
  /** The statement the card shows: Publish posts exactly this (the server refuses `changed` if it moved). */
  statement?: string;
  /** Name of the chat the warning speaks of. */
  sourceName?: string;
  /** Re-read the thread (the server says the card's state moved). */
  onReload?: () => void;
  onPublished?: (result: PublishResult) => void;
}

/** Public goes out only after the owner confirmed the warning for exactly these words, and never again once the point was posted before. */
const mustAskFirst = (a: { visibility: ClarifyVisibility; publicWarning?: boolean; everPublished: boolean; confirmed: boolean; id: string; statement: string }): boolean =>
  a.visibility === 'public' && a.publicWarning !== false && !a.everPublished && !a.confirmed && !isWarningAcked(a.id, a.statement);

/** What a refusal says. `no_position` shares the toast of the disabled tap. */
function refusalToast(code: string): string {
  if (code === 'no_position') return PUBLISH_NEEDS_POSITION_TOAST;
  if (code === 'not_available') return PUBLISH_NOT_AVAILABLE_TOAST;
  if (code === 'answered') return PUBLISH_ANSWERED_TOAST;
  if (code === 'changed') return PUBLISH_CHANGED_TOAST;
  if (code === 'visibility_changed') return PUBLISH_VISIBILITY_CHANGED_TOAST;
  if (code === 'needs_warning') return PUBLISH_NEEDS_WARNING_TOAST;
  return CLARIFY_FAILED_TOAST;
}

export function ClarifyPublishButton({ pointId, serverHasPosition, id, published = false, visibility = 'private', publicWarning, everPublished = false, sourceKind, statement = '', sourceName = 'this chat', onReload, onPublished }: ClarifyPublishButtonProps) {
  const hasPosition = useHasPosition(pointId, serverHasPosition);
  const [busy, setBusy] = useState(false);
  // a ref, not state: a second tap in the same tick must see the first
  const pending = useRef(false);
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  // "Keep private" does what the card's own control does: the draft becomes Private, and the card re-reads
  const keepPrivate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setClarifyVisibility(id, 'private');
      if (r.status === 'refused') toast(r.code === 'answered' ? PUBLISH_ANSWERED_TOAST : VISIBILITY_FAILED_TOAST);
    } catch {
      toast.error(VISIBILITY_FAILED_TOAST);
    } finally {
      setBusy(false);
      setAsking(false);
      onReload?.(); // the card shows what the server now says either way
    }
  };
  if (published) {
    return <span className="px-2 text-sm text-muted-foreground" data-testid={`clarify-published-${id}`}>{PUBLISH_PUBLISHED_TEXT}</span>;
  }
  const publish = async (confirmed = false) => {
    if (!hasPosition) {
      toast(PUBLISH_NEEDS_POSITION_TOAST);
      return;
    }
    // after a reload the confirmation is forgotten: ask again here instead of sending a publish the server will refuse
    if (mustAskFirst({ visibility, publicWarning, everPublished, confirmed, id, statement })) {
      setAsking(true);
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await publishClarify(id, { visibility, warningAck: visibility === 'public' && isWarningAcked(id, statement), expectedStatement: statement || undefined });
      if (r.status === 'refused' && r.code === 'needs_warning') {
        setAsking(true); // the dialog is the answer, not a toast
        onReload?.();
      } else if (r.status === 'refused') {
        toast(refusalToast(r.code));
        if (r.code === 'visibility_changed' || r.code === 'needs_warning' || r.code === 'answered' || r.code === 'changed') onReload?.();
      }
      else onPublished?.(r);
    } catch {
      toast.error(CLARIFY_FAILED_TOAST);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
    <Button
      ref={opener}
      type="button"
      aria-disabled={!hasPosition || busy}
      className={cn('h-11 min-h-11 px-4', (!hasPosition || busy) && 'opacity-50')}
      data-testid={`clarify-publish-${id}`}
      onClick={() => void publish()}
    >
      {sourceKind === 'mirror' ? PUBLISH_MIRROR_LABEL : PUBLISH_LABEL}
    </Button>
    {asking && (
      <PublicWarningDialog
        source={sourceName}
        busy={busy}
        onKeep={() => void keepPrivate()}
        onDismiss={() => setAsking(false)}
        returnFocusTo={opener}
        onConfirm={() => { markWarningAcked(id, statement); setAsking(false); void publish(true); }}
      />
    )}
    </>
  );
}
