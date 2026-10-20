/**
 * @file ShareableCard.tsx
 * @description P1512: a point or story drawn with the feed's own cards, read-only. Used where the card is
 * something to pick or to review (the attach picker, the composer's pending attachment), never to act on:
 * `inert` keeps its buttons, links and menu out of reach, and the authoring chrome is hidden.
 */
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import type { Shareable } from '@/app/data/chat-ui-helpers';
import { cn } from '@/lib/utils';
import { HIDE_CARD_CHROME } from './AttachmentCard';

export function ShareableCard({ item, className, announce = false }: { item: Shareable; className?: string; /** Name the item for screen readers, which cannot reach inside the inert card (the composer's pending attachment). */ announce?: boolean }) {
  return (
    <>
      {announce && <span className="sr-only">{`Attached ${item.kind}: ${item.title}`}</span>}
      <div inert className={cn('pointer-events-none w-full', HIDE_CARD_CHROME, className)} data-testid={`attach-card-${item.kind}`}>
      {item.kind === 'point' && item.point && <FeedPointCard point={item.point} compact />}
      {item.kind === 'story' && item.story && <FeedStoryCard story={item.story} compact />}
      </div>
    </>
  );
}
