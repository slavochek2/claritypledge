/**
 * @file card-footer-controls.tsx
 * @description P1296 item 1 — the controls a story or point LIST card carries in its footer,
 * on `/feed`, `/stake/:tag` and the profile.
 *
 * WHY A SHARED FILE AND NOT A SHARED CARD. The spec rejects extracting a shared card twice
 * (P500 in March, P1296 again): `StoryCardFull` is an owner-editing surface and the feed cards
 * carry P1212's accessibility fixes, so the cards stay separate. What they must NOT do is each
 * spell their own footer controls — that is how the feed ended up with a share icon floating
 * above its divider while the profile had one inside a footer row, with an open-in-new icon the
 * feed never had. The cards own their layout; the controls inside it come from here, so the
 * same control reads, sizes and behaves the same wherever it appears.
 *
 * Every control stops propagation itself: each card's root is a link to the story or point,
 * and a footer control that let its click through would navigate a second time.
 */
import { ExternalLink } from 'lucide-react';
import { MobileTooltip } from './mobile-tooltip';
import { ShareButton, type ShareSurface } from './ShareDialog';
import type { PositionCTACopy } from '@/app/utils/position-helpers';

/** 44px — the profile's existing icon size, now every card's (spec item 1). */
const ICON_BUTTON =
  'min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** The profile's P580 / P822 contribution pill, unchanged in look. */
const PILL =
  'px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap';

interface CardShareButtonProps {
  type: 'story' | 'point';
  id: string;
  /**
   * Which list the card sits on — carried on `feed_card_shared`. Absent only where the card
   * is not on a list surface (a landing-page demo), which then fires nothing.
   */
  surface?: ShareSurface;
  title?: string;
  description?: string;
  /** The profile passes its owner so the embed shows their position; feed and stake pass none. */
  fromUserId?: string;
}

/**
 * Share opens the share SHEET on every card — link plus embed code. FOUNDER DECISION
 * 2026-09-11: *"sheet on every card is better because then people can embed it"*. This
 * replaces the feed cards' one-tap copy-and-toast.
 */
export function CardShareButton({ type, id, surface, title, description, fromUserId }: CardShareButtonProps) {
  return (
    <ShareButton
      type={type}
      id={id}
      surface={surface}
      title={title}
      description={description}
      fromUserId={fromUserId}
      className={ICON_BUTTON}
    />
  );
}

/**
 * Open-in-new. Not redundant with the card's own click: the footer row stops propagation,
 * so it is the one band of the card where clicking goes nowhere without this.
 */
export function CardOpenButton({ type, onOpen }: { type: 'story' | 'point'; onOpen: () => void }) {
  const label = type === 'story' ? 'Open story' : 'Open point';
  return (
    <MobileTooltip content={label}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className={ICON_BUTTON}
        aria-label={label}
      >
        <ExternalLink className="w-4 h-4" />
      </button>
    </MobileTooltip>
  );
}

/** P580 — a story's AUTHOR can add a point to it. */
export function AddPointPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={PILL}
    >
      + Add point
    </button>
  );
}

/** P822 — a viewer holding a position on a point, with no story linked to it yet. */
export function AddStoryPill({ copy, onClick }: { copy: PositionCTACopy; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={copy.ariaLabel}
      className={PILL}
    >
      {copy.ctaText}
    </button>
  );
}

/** P470 Case E — the viewer already has a story on this point: go to its editor. */
export function EditYourStoryLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
      aria-label="Edit your story"
    >
      · ✏ your story
    </button>
  );
}
