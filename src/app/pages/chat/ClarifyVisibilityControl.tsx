/**
 * @file ClarifyVisibilityControl.tsx
 * @description P1722: the visibility of a Clarify draft card. On the latest card of a never-published draft it is one blue-bordered button reading "Private" or "Public" that
 * switches by click and by keyboard; going Public first shows the warning when the server says it is needed ("Keep private" leaves it private). On an earlier version or a draft
 * that was ever posted it is the read-only badge (the lock or the globe). Public is applied at Publish; here only the owner's choice is stored.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VisibilityBadge } from '@/app/components/shared/visibility-badge';
import { setClarifyVisibility, type ClarifyDraft, type ClarifyVisibility } from '@/app/data/clarify-service';
import { markWarningAcked } from './clarify-warning-ack';
import {
  PUBLISH_ANSWERED_TOAST, PUBLIC_WARNING_CONFIRM, PUBLIC_WARNING_KEEP, PUBLIC_WARNING_TITLE, VISIBILITY_FAILED_TOAST, VISIBILITY_PRIVATE_LABEL, VISIBILITY_PUBLIC_LABEL, publicWarningBody,
} from './clarify-copy';

/** `returnFocusTo`: the control that opened it (it is not a Radix trigger, so focus would otherwise be lost on close). */
/** `onKeep` is the explicit "Keep private" button; `onDismiss` (Escape, backdrop, close icon) only closes and writes nothing. */
export function PublicWarningDialog({ source, busy, onConfirm, onKeep, onDismiss, returnFocusTo }: { source: string; busy: boolean; onConfirm: () => void; onKeep: () => void; onDismiss: () => void; returnFocusTo?: RefObject<HTMLElement | null> }) {
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onDismiss()}>
      <DialogContent
        className="w-[calc(100vw-2rem)] rounded-lg sm:max-w-sm"
        data-testid="clarify-public-warning"
        onCloseAutoFocus={(e) => { e.preventDefault(); returnFocusTo?.current?.focus(); }}
      >
        <DialogHeader className="text-left">
          <DialogTitle>{PUBLIC_WARNING_TITLE}</DialogTitle>
          <DialogDescription>{publicWarningBody(source)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" className="min-h-10 text-muted-foreground" disabled={busy} onClick={onKeep} data-testid="clarify-public-keep">{PUBLIC_WARNING_KEEP}</Button>
          <Button type="button" className="min-h-10" disabled={busy} onClick={onConfirm} data-testid="clarify-public-confirm">{PUBLIC_WARNING_CONFIRM}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClarifyVisibilityControl({ draft, earlier, sourceName, onChanged }: { draft: ClarifyDraft; earlier: boolean; sourceName: string; onChanged: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const current: ClarifyVisibility = draft.visibility ?? 'private';
  const locked = earlier || draft.isLatest === false || draft.everPublished === true || draft.published.length > 0;
  // the card became read-only (published, or a newer card replaced it) while the warning was open: the question is moot, so it is dropped, not shown again
  useEffect(() => { if (locked) setAsking(false); }, [locked]);
  if (locked) {
    return <span className="inline-flex" data-testid="clarify-draft-lock"><VisibilityBadge visibility={current} size={14} /></span>;
  }
  const change = async (to: ClarifyVisibility) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setClarifyVisibility(draft.id, to);
      if (r.status === 'refused') toast(r.code === 'answered' ? PUBLISH_ANSWERED_TOAST : VISIBILITY_FAILED_TOAST);
      else if (to === 'public' && asking) markWarningAcked(draft.id, draft.point?.statement ?? '');
      onChanged(); // re-read either way: a refusal means the card's state moved
    } catch {
      toast.error(VISIBILITY_FAILED_TOAST);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };
  const press = () => {
    if (current === 'public') void change('private');
    else if (draft.publicWarning !== false) setAsking(true);
    else void change('public');
  };
  const Icon = current === 'public' ? Globe : Lock;
  return (
    <>
      <Button
        ref={opener}
        type="button"
        variant="outline"
        disabled={busy}
        aria-busy={busy || undefined}
        className="h-11 min-h-11 gap-1 px-3"
        data-testid={`clarify-visibility-${draft.id}`}
        data-visibility={current}
        onClick={press}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {current === 'public' ? VISIBILITY_PUBLIC_LABEL : VISIBILITY_PRIVATE_LABEL}
      </Button>
      {asking && <PublicWarningDialog returnFocusTo={opener} source={sourceName} busy={busy} onConfirm={() => void change('public')} onKeep={() => setAsking(false)} onDismiss={() => setAsking(false)} />}
    </>
  );
}
