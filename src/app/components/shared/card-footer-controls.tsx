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
 *     `N points`, or the profile's `Their story` / `Your story`), rendered only for a count
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
 * OPENING THE CARD (P1415). `Details →` is the ONLY way a list card opens its page: the card root
 * is an <article>, not a link, so tapping its body navigates nowhere (on phones the whole-card
 * tap kept sending readers away by accident). Explicit links inside the card still open what
 * they name.
 *
 * PROPAGATION — TWO LAYERS, AND THE SECOND ONE IS THE CALLER'S. Until P1415 each card's root was
 * a link to the story or point, so any click that reached it navigated. The guards below are kept
 * so a control's click never reaches whatever hosts the card. These controls stop their OWN click.
 * They cannot stop clicks inside what they open in a PORTAL — the menu's items and the share
 * sheet — because React still bubbles portal events through the component tree to the card root.
 * (The profile's delete confirmation is the native `window.confirm`, which dispatches no React
 * events at all.) Two wrappers stop the portal clicks:
 *   - `CardMenu` renders its own `role="presentation"` + stopPropagation wrapper, and the menu
 *     content AND the share sheet are React descendants of it (the sheet is a sibling of the
 *     menu, so it survives the menu closing).
 *   - The footer ROW each card wraps `CardFooterActions` in carries the same wrapper.
 * So: place the footer controls inside such a row.
 */
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight, Check, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react';
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
import { CARD_FOCUS_RING, NESTED_DETAILS_BUTTON_CLASS } from './card-action-classes';
import {
  CardFooterActions as FooterRow,
  CardExpander,
  CardCountText,
  CardDetailsButton,
  type CardType,
} from './presentational/card-footer';

// P1449: the bottom row's markup lives in presentational/card-footer.tsx (the Day board renders it
// too); CP's call sites keep importing it from here.
export { CardExpander, CardCountText, CardDetailsButton };

const FOCUS_RING = CARD_FOCUS_RING;

/** 44px — the profile's icon size since P1296. */
const ICON_BUTTON =
  `min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors ${FOCUS_RING}`;

/** Prototype K's `ADD_LINK`: the viewer's slot, a blue text link with a 40px hit area. */
const SLOT_LINK =
  `inline-flex h-10 items-center text-sm font-medium text-blue-700 hover:underline whitespace-nowrap rounded-sm ${FOCUS_RING}`;


// ─── Bottom row ─────────────────────────────────────────────────────────────

/** P1449: CP's wrapper — on a CP list card `Details →` is always there, so `onDetails` is required. */
export function CardFooterActions(props: {
  type: CardType;
  onDetails: () => void;
  describedBy?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  return <FooterRow {...props} />;
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
 * P1424 — opens a NESTED item (a quoted point under a story card, a linked story under a point
 * card): the only way into it on a list card, where tapping the nested body does nothing, exactly
 * as P1415 made the card body do nothing. Sits bottom-right inside the nested box.
 */
export function NestedDetailsButton({
  type,
  onOpen,
  describedBy,
}: {
  type: CardType;
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void;
  describedBy?: string;
}) {
  return (
    <div className="mt-2 flex justify-end">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(e);
        }}
        className={NESTED_DETAILS_BUTTON_CLASS}
        aria-label={`Details for this ${type}`}
        aria-describedby={describedBy}
        data-testid={`nested-details-${type}`}
      >
        Details <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
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
