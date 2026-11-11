/**
 * @file ClarifyDrafts.tsx
 * @description P1631: what a Clarify thread draws for the Mirror agent's side of the conversation. Each draft is a message FROM the Mirror (its face and name, as its replies are shown
 * everywhere): thinking, a point card, suggestions when the agent found nothing to test, or a failure with Try again. The view draws the drafts of ONE place in the thread
 * (the ones that follow one owner message), so the thread reads in time order; the first place also carries the loading and load-failure lines, the last carries the
 * "Another point" button under the latest card.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ClarifyDraft } from '@/app/data/clarify-service';
import { ClarifyDraftCard } from './ClarifyDraftCard';
import { MirrorThinking } from './MirrorReplyState';
import { MirrorMark } from './chat-kit';
import { ANOTHER_POINT_LABEL, CAPPED_TEXT, FAILED_TEXT, LOAD_FAILED_TEXT, NO_SPLIT_TEXT, RETRY_LABEL, UPDATED_LEAD } from './clarify-copy';
import { earlierDraftIds, mayAddAnother } from './clarify-timeline';
import type { ClarifyActions } from './use-clarify-actions';

/** One Mirror message: its face, its name, then what it says. */
function AgentTurn({ name, children, testId }: { name: string; children: ReactNode; testId?: string }) {
  return (
    <div className="mx-2 flex gap-2.5 px-2 pt-2.5" data-testid={testId ?? 'clarify-agent-turn'}>
      <div className="w-9 shrink-0"><MirrorMark size="md" /></div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-[15px] font-semibold leading-6 text-foreground" data-testid="clarify-agent-name">{name}</p>
        {children}
      </div>
    </div>
  );
}

function Refused({ draft, onPick }: { draft: ClarifyDraft; onPick: (text: string) => void }) {
  return (
    <div data-testid={`clarify-refused-${draft.id}`} className="space-y-2">
      <p className="text-sm text-foreground">{NO_SPLIT_TEXT}</p>
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
      {/* a capped draft cannot be retried: the cap is the answer */}
      {draft.state !== 'capped' && (
        <Button type="button" variant="ghost" className="h-11 min-h-11 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={onRetry} data-testid="clarify-retry">{RETRY_LABEL}</Button>
      )}
    </div>
  );
}

export interface ClarifyDraftsViewProps {
  /** The drafts drawn here: the ones that follow one owner message. */
  drafts: ClarifyDraft[];
  /** Every draft of the thread, for what only the whole shows (which cards are earlier versions, which is the latest). */
  all: ClarifyDraft[];
  loaded: boolean;
  failed: boolean;
  /** The Mirror's shown name. */
  name: string;
  userId: string;
  /** The card a Mention in chat names (its pill is in the typing box), or null. */
  mentionedId: string | null;
  onMention: (draftId: string) => void;
  actions: ClarifyActions;
  onReload: () => void;
  /** The first place: it also draws the loading skeleton and the load-failure line. */
  first: boolean;
  /** The last place: it draws "Another point" under the latest card. */
  last: boolean;
}

function DraftTurn({ draft, props, earlier }: { draft: ClarifyDraft; props: ClarifyDraftsViewProps; earlier: ReadonlySet<string> }) {
  const { name, userId, actions, all, mentionedId, onMention } = props;
  if (draft.state === 'queued' || draft.state === 'running') return <AgentTurn name={name}><MirrorThinking name={name} testId="clarify-thinking" className="" /></AgentTurn>;
  if (draft.state === 'refused') return <AgentTurn name={name}><Refused draft={draft} onPick={actions.onPick} /></AgentTurn>;
  if (draft.state !== 'done') return <AgentTurn name={name}><Failed draft={draft} onRetry={() => actions.onRetry(draft)} /></AgentTurn>;
  const refines = !!draft.refineTargetId && all.some((d) => d.id === draft.refineTargetId);
  return (
    <AgentTurn name={name}>
      {refines && <p className="text-sm text-muted-foreground" data-testid="clarify-updated-lead">{UPDATED_LEAD}</p>}
      <ClarifyDraftCard draft={draft} userId={userId} onChanged={actions.onChanged} earlier={earlier.has(draft.id)} mentioned={mentionedId === draft.id} onMention={() => onMention(draft.id)} />
    </AgentTurn>
  );
}

/** What the thread draws at one place for a set of drafts: pure, so every state can be rendered with no network (and by the P955 gate fixture). */
export function ClarifyDraftsView(props: ClarifyDraftsViewProps) {
  const { drafts, all, loaded, failed, onReload, first, last, actions } = props;
  if (!loaded) {
    return first ? (
      <div role="status" aria-label="Drafts" className="px-3 py-2" data-testid="clarify-drafts-loading">
        <Skeleton className="h-20 w-full rounded-lg" />
        <span className="sr-only">Loading drafts</span>
      </div>
    ) : null;
  }
  const earlier = earlierDraftIds(all);
  const another = last && mayAddAnother(all);
  if (drafts.length === 0 && !another && !(first && failed)) return null;
  return (
    <div className="space-y-1" data-testid="clarify-drafts">
      {first && failed && (
        <div role="alert" data-testid="clarify-load-failed" className="flex flex-wrap items-center gap-x-2 px-3 text-sm text-muted-foreground">
          <span>{LOAD_FAILED_TEXT}</span>
          <Button type="button" variant="ghost" className="h-11 min-h-11 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={onReload} data-testid="clarify-reload">{RETRY_LABEL}</Button>
        </div>
      )}
      {drafts.map((d) => <DraftTurn key={d.id} draft={d} props={props} earlier={earlier} />)}
      {another && (
        // under the latest card, in the card's column: the product's bordered secondary button
        <div className="flex gap-2.5 px-4 pt-1">
          <div className="w-9 shrink-0" aria-hidden="true" />
          <Button type="button" variant="outline" className="h-11 min-h-11" onClick={actions.onAnother} data-testid="clarify-another">
            {ANOTHER_POINT_LABEL}
          </Button>
        </div>
      )}
    </div>
  );
}
