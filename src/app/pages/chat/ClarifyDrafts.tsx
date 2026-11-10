/**
 * @file ClarifyDrafts.tsx
 * @description P1631: what a Clarify thread in the Mirror shows under its source copy: each draft by its state (thinking, a point card,
 * suggestions when the agent found nothing to test, a failure with Retry) and the "Another point" button under the last draft.
 * A press while a draft is being made does nothing further (the server answers busy and the screen stays as it is).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { anotherPoint, retryClarify, type ClarifyDraft } from '@/app/data/clarify-service';
import { ClarifyDraftCard } from './ClarifyDraftCard';
import { MirrorThinking } from './MirrorReplyState';
import { ANOTHER_POINT_LABEL, CAPPED_TEXT, CLARIFY_FAILED_TOAST, FAILED_TEXT, LOAD_FAILED_TEXT, NO_SPLIT_TEXT, RETRY_LABEL } from './clarify-copy';
import { forgetClarifyRun, runClarifyDraft } from './clarify-run';
import { useClarifyThread } from './use-clarify-thread';

function Refused({ draft, onPick }: { draft: ClarifyDraft; onPick: (text: string) => void }) {
  return (
    <div data-testid={`clarify-refused-${draft.id}`} className="space-y-2">
      <p className="text-sm text-muted-foreground">{NO_SPLIT_TEXT}</p>
      <div className="flex flex-wrap gap-2">
        {draft.suggestions.slice(0, 3).map((s) => (
          <Button key={s} type="button" variant="outline" className="h-auto min-h-11 whitespace-normal rounded-2xl px-3 py-2 text-left text-sm font-normal" onClick={() => onPick(s)} data-testid="clarify-suggestion">
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Failed({ draft, onRetry }: { draft: ClarifyDraft; onRetry: () => void }) {
  return (
    <div role="alert" data-testid={`clarify-failed-${draft.id}`} className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
      <span>{draft.state === 'capped' ? CAPPED_TEXT : FAILED_TEXT}</span>
      <Button type="button" variant="ghost" className="h-11 min-h-11 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={onRetry} data-testid="clarify-retry">{RETRY_LABEL}</Button>
    </div>
  );
}

export interface ClarifyDraftsViewProps {
  drafts: ClarifyDraft[];
  loaded: boolean;
  failed: boolean;
  name: string;
  userId: string;
  onPick: (text: string) => void;
  onRetry: (draft: ClarifyDraft) => void;
  onAnother: () => void;
  onChanged: () => void;
  onReload: () => void;
}

/** What the thread draws for a set of drafts: pure, so every state can be rendered with no network (and by the P955 gate fixture). */
export function ClarifyDraftsView({ drafts, loaded, failed, name, userId, onPick, onRetry, onAnother, onChanged, onReload }: ClarifyDraftsViewProps) {
  if (!loaded) {
    return (
      <div role="status" aria-label="Drafts" className="px-3 py-2" data-testid="clarify-drafts-loading">
        <Skeleton className="h-20 w-full rounded-lg" />
        <span className="sr-only">Loading drafts</span>
      </div>
    );
  }
  const last = drafts[drafts.length - 1];
  const canAddAnother = !!last && (last.state === 'done' || last.state === 'refused');
  return (
    <div className="space-y-3 px-3 py-2" data-testid="clarify-drafts">
      {failed && (
        <div role="alert" data-testid="clarify-load-failed" className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{LOAD_FAILED_TEXT}</span>
          <Button type="button" variant="ghost" className="h-11 min-h-11 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={onReload} data-testid="clarify-reload">{RETRY_LABEL}</Button>
        </div>
      )}
      {drafts.map((d) => {
        if (d.state === 'queued' || d.state === 'running') return <MirrorThinking key={d.id} name={name} testId="clarify-thinking" className="" />;
        if (d.state === 'done') return <ClarifyDraftCard key={d.id} draft={d} userId={userId} onChanged={onChanged} />;
        if (d.state === 'refused') return <Refused key={d.id} draft={d} onPick={onPick} />;
        return <Failed key={d.id} draft={d} onRetry={() => onRetry(d)} />;
      })}
      {canAddAnother && (
        <Button type="button" variant="outline" className="h-11 min-h-11" onClick={onAnother} data-testid="clarify-another">
          {ANOTHER_POINT_LABEL}
        </Button>
      )}
    </div>
  );
}

export function ClarifyDrafts({ rootId, name, userId }: { rootId: string; name: string; userId: string }) {
  const { drafts, loaded, failed, reload } = useClarifyThread(rootId);
  const [pending, setPending] = useState(false);

  // One action at a time; busy is a value and changes nothing on screen. Anything else that goes wrong says so.
  const act = async (start: () => Promise<{ status: string; draftId?: string | null }>) => {
    if (pending) return;
    setPending(true);
    try {
      const r = await start();
      if (r.status === 'started') {
        if (r.draftId) void runClarifyDraft(r.draftId);
        await reload();
      } else if (r.status !== 'busy') {
        toast.error(CLARIFY_FAILED_TOAST); // refused: not started
      }
    } catch {
      toast.error(CLARIFY_FAILED_TOAST);
    } finally {
      setPending(false);
    }
  };

  return (
    <ClarifyDraftsView
      drafts={drafts}
      loaded={loaded}
      failed={failed}
      name={name}
      userId={userId}
      onPick={(text) => void act(() => anotherPoint(rootId, text))}
      onRetry={(d) => void act(async () => {
        const r = await retryClarify(d.id);
        // a new run of the same draft may start again only once the server has queued it
        if (r.status === 'started') forgetClarifyRun(d.id);
        return { status: r.status, draftId: d.id };
      })}
      onAnother={() => void act(() => anotherPoint(rootId))}
      onChanged={() => void reload()}
      onReload={() => void reload()}
    />
  );
}
