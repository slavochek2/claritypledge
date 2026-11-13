/**
 * @file ClarifyDrafts.tsx
 * @description P1631: what a Clarify thread draws for the Mirror agent's side of the conversation. Each draft is a message FROM the Mirror (its face and name, as its replies are shown
 * everywhere): thinking, a point card (the lines it cites above it), suggestions when the agent found nothing to test, or a failure with Try again. The view draws the drafts of ONE place in the thread
 * (the ones that follow one owner message), so the thread reads in time order; the first place also carries the loading and load-failure lines, the last carries the
 * row under the latest card: "Another point" and "Publish to chat".
 */
import { Fragment, useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ClarifyDraft } from '@/app/data/clarify-service';
import { ClarifyDraftCard } from './ClarifyDraftCard';
import { ClarifyPublishButton } from './ClarifyPublishButton';
import { MirrorThinking } from './MirrorReplyState';
import { MirrorMark } from './chat-kit';
import { ANOTHER_POINT_LABEL, CAPPED_TEXT, CITED_LEAD, FAILED_TEXT, LOAD_FAILED_TEXT, MAKE_ANYWAY_INSTRUCTION, MAKE_ANYWAY_LABEL, NO_SPLIT_TEXT, RETRY_LABEL, UPDATED_LEAD } from './clarify-copy';
import { earlierDraftIds, mayAddAnother } from './clarify-timeline';
import type { ClarifyActions } from './use-clarify-actions';

/**
 * One Mirror message: its face and name on one line, then what it says UNDER them across the whole width. Beside the face the card would lose 46px, and the
 * position row (which drops its words below 270px) would show icons only in a 370px side panel; under it, the row keeps its words from a 320px screen up.
 */
function AgentTurn({ name, children, testId }: { name: string; children: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 max-w-full space-y-1.5 px-3 pt-2.5" data-testid={testId ?? 'clarify-agent-turn'}>
      <div className="flex min-w-0 items-center gap-2.5">
        <MirrorMark size="md" />
        <p className="min-w-0 truncate text-[15px] font-semibold leading-6 text-foreground" data-testid="clarify-agent-name">{name}</p>
      </div>
      {children}
    </div>
  );
}

function Refused({ draft, onPick, latest }: { draft: ClarifyDraft; onPick: (text: string) => void; latest: boolean }) {
  return (
    <div data-testid={`clarify-refused-${draft.id}`} className="space-y-2">
      <p className="text-sm text-foreground">{NO_SPLIT_TEXT}</p>
      <div className="flex flex-wrap gap-2">
        {draft.suggestions.slice(0, 3).map((s) => (
          <Button key={s} type="button" variant="outline" className="h-auto min-h-11 whitespace-normal rounded-2xl px-3 py-2 text-left text-sm font-normal" onClick={() => onPick(s)} data-testid="clarify-suggestion">
            {s}
          </Button>
        ))}
        {/* only on the newest answer of the thread: it drafts from the pressed item although the Mirror found no split */}
        {latest && (
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal rounded-2xl px-3 py-2 text-left text-sm font-normal" onClick={() => onPick(MAKE_ANYWAY_INSTRUCTION)} data-testid="clarify-make-anyway">
            {MAKE_ANYWAY_LABEL}
          </Button>
        )}
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

/**
 * The lines a draft cites, in the Mirror only and never on the card (founder asks A5 and A7): the text the server read from the rows, with no names and
 * no count, under a lead that marks them as possibly wrong (live text is rough). A published card in the chat carries none of this.
 */
function CitedLines({ draft }: { draft: ClarifyDraft }) {
  const leadId = useId();
  const lines = draft.cited.filter((l) => l.text.trim() !== ''); // a row with no words would draw an empty bordered line
  if (lines.length === 0) return null;
  return (
    <div className="min-w-0 space-y-1" data-testid={`clarify-cited-${draft.id}`}>
      <p id={leadId} className="text-xs text-muted-foreground">{CITED_LEAD}</p>
      <ul className="space-y-1" aria-labelledby={leadId}>
        {lines.map((l) => (
          <li key={l.id} className="break-words border-l-2 border-border pl-2 text-sm text-muted-foreground">{l.text}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The card Publish belongs to: the newest finished point that is not an earlier version. A refine or Another point that failed, was capped or
 * found nothing to split leaves the card before it current, so that card keeps its Publish.
 */
function publishable(all: ClarifyDraft[], earlier: ReadonlySet<string>): ClarifyDraft | null {
  for (let i = all.length - 1; i >= 0; i--) {
    const d = all[i];
    if (d && d.state === 'done' && d.point && !earlier.has(d.id)) return d;
  }
  return null;
}

/** A right-aligned row: Another point (the product's blue-outline secondary) and/or Publish to chat (the filled primary, right-most). */
function LatestRow({ latest, onAnother, onPublished }: { latest: ClarifyDraft | null; onAnother?: () => void; onPublished?: ClarifyActions['onPublished'] }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-3 pt-1" data-testid="clarify-latest-row">
      {onAnother && (
        <Button type="button" variant="outline" className="h-11 min-h-11 border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={onAnother} data-testid="clarify-another">
          {ANOTHER_POINT_LABEL}
        </Button>
      )}
      {latest?.point && (
        <ClarifyPublishButton
          id={latest.id} pointId={latest.point.id} serverHasPosition={latest.point.ownerPosition !== null}
          published={latest.published.length > 0} sourceKind={latest.sourceKind} onPublished={onPublished}
        />
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
  if (draft.state === 'refused') return <AgentTurn name={name}><Refused draft={draft} onPick={actions.onPick} latest={all[all.length - 1]?.id === draft.id} /></AgentTurn>;
  if (draft.state !== 'done') return <AgentTurn name={name}><Failed draft={draft} onRetry={() => actions.onRetry(draft)} /></AgentTurn>;
  const refines = !!draft.refineTargetId && all.some((d) => d.id === draft.refineTargetId);
  return (
    <AgentTurn name={name}>
      <CitedLines draft={draft} />
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
  // Publish sits right under the card it publishes, wherever that card is drawn (a newer run that is thinking, failed or found nothing comes
  // after it). Another point sits at the end of the thread; when the current card is the last thing drawn, the two share one row.
  const current = publishable(all, earlier);
  const here = current && drafts.some((d) => d.id === current.id) ? current : null;
  const shared = another && here !== null && drafts[drafts.length - 1]?.id === here.id;
  if (drafts.length === 0 && !another && !(first && failed)) return null;
  return (
    <div className="min-w-0 max-w-full space-y-1" data-testid="clarify-drafts">
      {first && failed && (
        <div role="alert" data-testid="clarify-load-failed" className="flex flex-wrap items-center gap-x-2 px-3 text-sm text-muted-foreground">
          <span>{LOAD_FAILED_TEXT}</span>
          <Button type="button" variant="ghost" className="h-11 min-h-11 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={onReload} data-testid="clarify-reload">{RETRY_LABEL}</Button>
        </div>
      )}
      {drafts.map((d) => (
        <Fragment key={d.id}>
          <DraftTurn draft={d} props={props} earlier={earlier} />
          {here?.id === d.id && <LatestRow latest={here} onAnother={shared ? actions.onAnother : undefined} onPublished={actions.onPublished} />}
        </Fragment>
      ))}
      {another && !shared && <LatestRow latest={null} onAnother={actions.onAnother} />}
    </div>
  );
}
