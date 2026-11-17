/**
 * @file feed-story-badges.tsx
 * @description The figures row under a story card's tags: the card's own "N verified" badge (its children, gated
 * where it is written, P1141) and, after it, P1061's "N moved" chip (hidden at 0). The count rides on the story
 * itself (`movementOf(story)`), set only by a list read (the feed, /stake, the pinned story), so the chat cards, which
 * render the same card from other reads, never show it. No chip for an agent's story, or while the agent registry
 * is still loading (P1141: it fails closed, and reading it early renders an agent story as a human one).
 */
import type { ReactNode } from 'react';
import { StoryCountChip } from '@/app/components/movement/movement-bits';
import { movementOf } from '@/app/data/movement-for-list';
import type { StoryWithAuthor } from '@/app/types';

export function FeedStoryFigures({ story, isAgent, identityPending, className, children }: {
  story: StoryWithAuthor;
  isAgent: boolean;
  identityPending: boolean;
  className: string;
  children: ReactNode;
}) {
  const movement = isAgent || identityPending ? undefined : movementOf(story);
  return (
    <div className={className}>
      {children}
      {movement && <StoryCountChip movement={movement} authorName={story.authorName} pointCount={movement.points.length} />}
    </div>
  );
}
