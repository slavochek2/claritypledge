/**
 * P1449 — the bottom row of CP's list cards with no product dependencies: the row layout
 * (`CardFooterActions`), the solid `N stories` expander (`CardExpander`), the zero-state text
 * (`CardCountText`) and `Details →` (`CardDetailsButton`). Moved here unchanged from
 * card-footer-controls.tsx, which re-exports them, so every CP call site renders the same output.
 * The one addition: `onDetails` may be omitted, and then no `Details →` renders — the Day board
 * (tools/kanban) has no page to open. Never import product state here: the kanban boundary test
 * follows imports transitively.
 *
 * P1468 — the viewer's slot (`CardSlotLink`) moved here the same way, so the Day board renders
 * CP's own `+ Add a story`, and its copy lives here once (`ADD_STORY_COPY`, read by
 * `getPositionCTACopy`).
 */
import type { ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { CARD_FOCUS_RING, DETAILS_BUTTON_CLASS } from '../card-action-classes';

const FOCUS_RING = CARD_FOCUS_RING;

/** Prototype K's expander (`STORIES_CLASS.i`): the card's loud, labelled action. */
const EXPANDER =
  `inline-flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors ${FOCUS_RING}`;

/** Prototype K's outlined `Details` button. */
const DETAILS_BUTTON = DETAILS_BUTTON_CLASS;

export type CardType = 'story' | 'point';

/**
 * The bottom row's layout: engagement controls on the left (they wrap below 375px rather than
 * overflow), `Details →` pinned right. While the card's links are still loading, an h-10
 * placeholder holds the EXPANDER's place so nothing jumps when the count arrives.
 *
 * `loading` hides nothing: the caller decides which children wait for the links. A control
 * whose condition depends on them (the count, a point card's `+ Add a story` / `✓ Your story`)
 * must not render until they load; one that does not (a story author's `+ Add a point`) renders
 * immediately — otherwise a links fetch that fails, which the feed and stake pages swallow,
 * would hide it for good (review finding).
 */
export function CardFooterActions({
  type,
  onDetails,
  describedBy,
  loading = false,
  children,
}: {
  type: CardType;
  /** P1449: omitted → no `Details →` (a surface with no page to open) */
  onDetails?: () => void;
  /** P1415: the id of the card root, whose name ("Point: …" / "Story by …") describes `Details →`
   *  — otherwise a screen reader's button list reads N identical "Details for this point". */
  describedBy?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        {loading && <span aria-hidden="true" className="inline-block h-10" data-testid="card-footer-loading" />}
        {children}
      </div>
      {onDetails && <CardDetailsButton type={type} onOpen={onDetails} describedBy={describedBy} />}
    </div>
  );
}

/**
 * Expands the card's linked stories / points in place. Callers render it only for a count > 0.
 *
 * It can never overflow its group: the button may shrink (`min-w-0 max-w-full`) and its LABEL
 * truncates, so a long label ends in an ellipsis instead of running under
 * `Details →` (measured: 20px under it at 375, 75px at 320). The no-wrap rule lives on the
 * label via `truncate` — on the button it would defeat the truncation. The full label stays in
 * the DOM, so the accessible name is unchanged; `title` shows it on hover.
 */
export function CardExpander({
  label,
  expanded,
  onToggle,
  testId,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={EXPANDER}
      aria-expanded={expanded}
      data-testid={testId}
    >
      {expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
      <span className="truncate" title={label}>{label}</span>
    </button>
  );
}

/** Prototype K's `ADD_LINK`: the viewer's slot, a blue text link with a 40px hit area. */
const SLOT_LINK =
  `inline-flex h-10 items-center text-sm font-medium text-blue-700 hover:underline whitespace-nowrap rounded-sm ${FOCUS_RING}`;

/** P1366: "+ Add a story" on every surface. P1468: its one home (`getPositionCTACopy` reads it). */
// eslint-disable-next-line react-refresh/only-export-components -- the slot link's copy lives beside the slot link (P1468)
export const ADD_STORY_COPY = { ctaText: '+ Add a story', ariaLabel: 'Add a story for this point' } as const;

type SlotLinkProps =
  /** P822 — a viewer holding a position on a point, with no story linked to it yet. */
  | { kind: 'add-story'; copy: { ctaText: string; ariaLabel: string }; onClick: () => void }
  /** P470 Case E — the viewer's own story on this point. Opens it to READ; editing stays on the story page. */
  | { kind: 'your-story'; onClick: () => void }
  /** P580 — a story's AUTHOR can add a point to it. */
  | { kind: 'add-point'; onClick: () => void };

/** The viewer's one slot in the bottom row. */
export function CardSlotLink(props: SlotLinkProps) {
  // add-point: the same accessible name as the story page's `+ Add a point` pills
  // (story-card-with-links.tsx, StoryCardDetail.tsx).
  const label =
    props.kind === 'add-story'
      ? props.copy.ariaLabel
      : props.kind === 'your-story'
        ? 'Your story'
        : 'Add a point to this story';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      aria-label={label}
      className={SLOT_LINK}
    >
      {props.kind === 'add-story' && props.copy.ctaText}
      {props.kind === 'your-story' && (
        <>
          <Check className="mr-1 h-4 w-4" aria-hidden="true" />
          Your story
        </>
      )}
      {props.kind === 'add-point' && '+ Add a point'}
    </button>
  );
}

/** The zero state with no slot link: plain text, never a dead button. */
export function CardCountText({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap text-sm text-muted-foreground">{children}</span>;
}
/**
 * Opens the card's own page — the ONLY way in since P1415 (the card body no longer navigates).
 * A real <button>, so keyboard and screen-reader users reach it by Tab, labelled
 * "Details for this story/point" (P1366).
 */
export function CardDetailsButton({ type, onOpen, describedBy }: { type: CardType; onOpen: () => void; describedBy?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={DETAILS_BUTTON}
      aria-label={`Details for this ${type}`}
      aria-describedby={describedBy}
    >
      Details <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
