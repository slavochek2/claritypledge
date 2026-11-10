/**
 * @file ClarifyDrafts.tsx
 * @description P1631: what a Clarify thread in the Mirror shows under its source copy: each draft by its state (thinking, a point card,
 * suggestions when the agent found nothing to test, a failure with Retry) and the "Another point" button under the last draft.
 * A press while a draft is being made does nothing further (the server answers busy and the screen stays as it is).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { anotherPoint, retryClarify, type ClarifyDraft } from '@/app/data/clarify-service';
import { ClarifyDraftCard } from './ClarifyDraftCard';
import { MirrorThinking } from './MirrorReplyState';
import { ANOTHER_POINT_LABEL, CAPPED_TEXT, FAILED_TEXT, NO_SPLIT_TEXT, RETRY_LABEL } from './clarify-copy';
import { forgetClarifyRun, runClarifyDraft } from './clarify-run';
import { useClarifyThread } from './use-clarify-thread';

function Refused({ draft, onPick }: { draft: ClarifyDraft; onPick: (text: string) => void }) {
  return (
    <div data-testid={`clarify-refused-${draft.id}`} className="space-y-2">
      <p className="text-sm text-muted-foreground">{NO_SPLIT_TEXT}</p>
      <div className="flex flex-wrap gap-2">
        {draft.suggestions.slice(0, 3).map((s) => (
          <Button key={s} type="button" variant="outline" className="h-auto min-h-10 whitespace-normal rounded-2xl px-3 py-2 text-left text-sm font-normal" onClick={() => onPick(s)} data-testid="clarify-suggestion">
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
      <Button type="button" variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={onRetry} data-testid="clarify-retry">{RETRY_LABEL}</Button>
    </div>
  );
}

export function ClarifyDrafts({ rootId, name, userId }: { rootId: string; name: string; userId: string }) {
  const { drafts, reload } = useClarifyThread(rootId);
  const [pending, setPending] = useState(false);

  // One action at a time; busy is a value and changes nothing on screen.
  const act = async (start: () => Promise<{ status: string; draftId?: string | null }>) => {
    if (pending) return;
    setPending(true);
    try {
      const r = await start();
      if (r.status === 'started') {
        if (r.draftId) void runClarifyDraft(r.draftId);
        await reload();
      }
    } catch {
      /* the draft list is the truth; a call that could not be made leaves it as it was */
    } finally {
      setPending(false);
    }
  };

  const last = drafts[drafts.length - 1];
  const canAddAnother = !!last && (last.state === 'done' || last.state === 'refused');

  return (
    <div className="space-y-3 px-3 py-2" data-testid="clarify-drafts">
      {drafts.map((d) => {
        if (d.state === 'queued' || d.state === 'running') return <MirrorThinking key={d.id} name={name} testId="clarify-thinking" className="" />;
        if (d.state === 'done') return <ClarifyDraftCard key={d.id} draft={d} userId={userId} onChanged={() => void reload()} />;
        if (d.state === 'refused') return <Refused key={d.id} draft={d} onPick={(text) => void act(() => anotherPoint(rootId, text))} />;
        return (
          <Failed
            key={d.id}
            draft={d}
            onRetry={() => void act(async () => {
              forgetClarifyRun(d.id);
              const r = await retryClarify(d.id);
              return { status: r.status, draftId: d.id };
            })}
          />
        );
      })}
      {canAddAnother && (
        <Button type="button" variant="outline" className="min-h-10" onClick={() => void act(() => anotherPoint(rootId))} data-testid="clarify-another">
          {ANOTHER_POINT_LABEL}
        </Button>
      )}
    </div>
  );
}
