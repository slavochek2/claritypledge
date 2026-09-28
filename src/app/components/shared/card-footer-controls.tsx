/**
 * @file card-footer-controls.tsx
 * @description P1296 item 1, re-laid-out by P1366 — the controls a story or point LIST card
 * carries, on `/feed`, `/stake/:tag` and the profile.
 *
 * THE LAYOUT (P1366, prototype K). One rule: the top-right `⋯` manages the card, the bottom row
 * engages with it.
 *   - Top row, right: `CardMenu` — a `⋯` holding `Share` on every card, plus `Edit` and a red
 *     `Delete` on the viewer's own story card on the profile. It joins whatever top row the card
 *     already has (a statement, an author row, a profile owner's quote row).
 *   - Bottom row, via `CardFooterActions`: left a SOLID blue `CardExpander` (`N stories` /
 *     `N points`, or the profile's `Maya's story` / `Your story`), rendered only for a count
 *     above zero; then the viewer's one `CardSlotLink` (`+ Add a story` · `✓ Your story` ·
 *     `+ Add a point`); `CardCountText` (`0 stories`) only when there is neither. Right: an
 *     outlined `Details →` that is always visible — it replaced the external-link icon, which
 *     read as "leaves the site" and hid its label in a tooltip.
 *
 * WHY A SHARED FILE AND NOT A SHARED CARD. The spec rejects extracting a shared card twice
 * (P500 in March, P1296 again): `StoryCardFull` is an owner-editing surface and the feed cards
 * carry P1212's accessibility fixes, so the cards stay separate. What they must NOT do is each
 * spell their own controls — that is how the feed once had a share icon floating above its
 * divider while the profile had one inside a footer row. The cards own their layout; the
 * controls inside it come from here, so the same control reads, sizes and behaves the same
 * wherever it appears.
 *
 * PROPAGATION — TWO LAYERS, AND THE SECOND ONE IS THE CALLER'S. Each card's root is a link to the
 * story or point, so any click that reaches it navigates. These controls stop their OWN click.
 * They cannot stop clicks inside what they open in a PORTAL — the menu's items and the share
 * sheet — because React still bubbles portal events through the component tree to the card root.
 * (The profile's delete confirmation is the native `window.confirm`, which dispatches no React
 * events at all.) Two wrappers stop the portal clicks:
 *   - `CardMenu` renders its own `role="presentation"` + stopPropagation wrapper, and the menu
 *     content AND the share sheet are React descendants of it (the sheet is a sibling of the
 *     menu, so it survives the menu closing).
 *   - The footer ROW each card wraps `CardFooterActions` in carries the same wrapper.
 * Keyboard is covered separately by each root's `e.target !== e.currentTarget` guard. So: place
 * the footer controls inside such a row, never directly inside a clickable card.
 */
import { useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { analytics } from '@/lib/mixpanel';
import { MobileTooltip } from './mobile-tooltip';
import { ShareDialog, type ShareSurface } from './ShareDialog';
import type { PositionCTACopy } from '@/app/utils/position-helpers';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/** 44px — the profile's icon size since P1296. */
const ICON_BUTTON =
  `min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors ${FOCUS_RING}`;

/** Prototype K's expander (`STORIES_CLASS.i`): the card's loud, labelled action. */
const EXPANDER =
  `inline-flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors ${FOCUS_RING}`;

/** Prototype K's `ADD_LINK`: the viewer's slot, a blue text link with a 40px hit area. */
const SLOT_LINK =
  `inline-flex h-10 items-center text-sm font-medium text-blue-700 hover:underline whitespace-nowrap rounded-sm ${FOCUS_RING}`;

/** Prototype K's outlined `Details` button. */
const DETAILS_BUTTON =
  `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted ${FOCUS_RING}`;

type CardType = 'story' | 'point';

// ─── Bottom row ─────────────────────────────────────────────────────────────

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
  loading = false,
  children,
}: {
  type: CardType;
  onDetails: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
        {loading && <span aria-hidden="true" className="inline-block h-10" data-testid="card-footer-loading" />}
        {children}
      </div>
      <CardDetailsButton type={type} onOpen={onDetails} />
    </div>
  );
}

/**
 * Expands the card's linked stories / points in place. Callers render it only for a count > 0.
 *
 * It can never overflow its group: the button may shrink (`min-w-0 max-w-full`) and its LABEL
 * truncates, so a long `<First>'s story` ends in an ellipsis instead of running under
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

/** The zero state with no slot link: plain text, never a dead button. */
export function CardCountText({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap text-sm text-muted-foreground">{children}</span>;
}

type SlotLinkProps =
  /** P822 — a viewer holding a position on a point, with no story linked to it yet. */
  | { kind: 'add-story'; copy: PositionCTACopy; onClick: () => void }
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

/**
 * Opens the card's own page. Not redundant with the card's click: the footer row stops
 * propagation, so it is the one band of the card where clicking goes nowhere without this — and
 * a user who does not realise the card is tappable needs a labelled way in (P1366).
 */
export function CardDetailsButton({ type, onOpen }: { type: CardType; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={DETAILS_BUTTON}
      aria-label={`Details for this ${type}`}
    >
      Details <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

// ─── Top-right ⋯ ────────────────────────────────────────────────────────────

interface CardMenuProps {
  type: CardType;
  id: string;
  /**
   * Which list the card sits on — carried on `feed_card_shared` when `Share` is chosen. Absent
   * only where the card is not on a list surface, which then fires nothing.
   */
  surface?: ShareSurface;
  title?: string;
  description?: string;
  /** The profile passes its owner so the embed shows their position; feed and stake pass none. */
  fromUserId?: string;
  /** Own story card on the profile only: inline edit. Omit to leave `Edit` out of the menu. */
  onEdit?: () => void;
  /** Own story card on the profile only: the caller confirms and deletes. Omit to leave it out. */
  onDelete?: () => void;
  /** Disables `Delete` while a delete is in flight. */
  deleting?: boolean;
  /** Positioning in the host row (negative margins so the 44px target does not grow the row). */
  className?: string;
}

/**
 * The card's `⋯` menu — Share on every card; Edit and Delete on the viewer's own story card.
 *
 * `Share` opens the share SHEET (link + embed). FOUNDER DECISION 2026-09-11: *"sheet on every
 * card is better because then people can embed it"*. The sheet is controlled here and rendered
 * as a SIBLING of the menu, so it survives the menu closing, and inside this component's
 * propagation wrapper, so nothing in it reaches the card root.
 *
 * MODAL, deliberately (Radix's default). While the menu is open the rest of the page is inert to
 * the pointer (`pointer-events: none` on <body>), so the tap that dismisses the menu lands on
 * nothing. A non-modal menu let that same tap ALSO activate whatever was under it — navigate the
 * card, or take a position (a data write) — review finding, regression-tested in
 * p1366-card-footer.test.tsx.
 *
 * WHY THE CHOSEN ITEM RUNS AFTER THE MENU HAS CLOSED. A modal Radix menu that opens a Radix
 * dialog from inside an item's `onSelect` overlaps the two layers' <body> pointer-events
 * bookkeeping and can leave <body> inert after the dialog closes. So `onSelect` only records the
 * choice; it runs from the content's `onCloseAutoFocus`, which Radix fires once the menu content
 * has unmounted and released <body>. That is also where focus is decided: the sheet takes focus
 * (and hands it back to the ⋯ when it closes), Edit puts it in the textarea, and Delete's native
 * `window.confirm` appears with the menu already gone.
 */
export function CardMenu({
  type,
  id,
  surface,
  title,
  description,
  fromUserId,
  onEdit,
  onDelete,
  deleting = false,
  className = '',
}: CardMenuProps) {
  const [shareOpen, setShareOpen] = useState(false);
  /** Tracked only to silence the `More` hint while the menu is open (see below). */
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** The item chosen in the menu, run once the menu has closed (see above). */
  const pendingRef = useRef<'share' | 'edit' | 'delete' | null>(null);

  const runPending = () => {
    const action = pendingRef.current;
    pendingRef.current = null;
    if (action === 'share') {
      // `profile` is never a card type, and the event documents story | point only.
      if (surface) analytics.track('feed_card_shared', { type, id, surface });
      setShareOpen(true);
    } else if (action === 'edit') {
      onEdit?.();
    } else if (action === 'delete') {
      onDelete?.();
    }
    return action;
  };

  return (
    <div
      role="presentation"
      className={`shrink-0 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* The hint is for a CLOSED menu. Open, it is a second dismissable layer on top of the
            menu: the press that opened the menu left MobileTooltip's long-press timer running
            (the modal made <body> inert, so the pointerup never reached the trigger), the hint
            popped click-locked for 2s, and it swallowed the Escape meant for the menu. */}
        <MobileTooltip content="More" disabled={menuOpen || shareOpen}>
          <DropdownMenuTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              className={ICON_BUTTON}
              aria-label={`More actions for this ${type}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </MobileTooltip>
        <DropdownMenuContent
          align="end"
          className="w-40"
          onCloseAutoFocus={(e) => {
            // Default: focus returns to the trigger. Share and Edit move it elsewhere themselves;
            // Delete keeps the default so focus is on the ⋯ when the confirmation closes.
            const action = runPending();
            if (action === 'share' || action === 'edit') e.preventDefault();
          }}
        >
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => {
              pendingRef.current = 'share';
            }}
          >
            <Share2 aria-hidden="true" />
            Share
          </DropdownMenuItem>
          {onEdit && (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => {
                pendingRef.current = 'edit';
              }}
            >
              <Pencil aria-hidden="true" />
              Edit
            </DropdownMenuItem>
          )}
          {onDelete && (
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-700"
              disabled={deleting}
              onSelect={() => {
                pendingRef.current = 'delete';
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        type={type}
        /* The same `/story/:id` / `/point/:id` URL `ShareButton` builds for these types. */
        url={`${window.location.origin}/${type}/${id}`}
        title={title}
        description={description}
        fromUserId={fromUserId}
        onCloseAutoFocus={(e) => {
          // The item that opened the sheet is gone; hand focus back to the ⋯.
          e.preventDefault();
          triggerRef.current?.focus();
        }}
      />
    </div>
  );
}
