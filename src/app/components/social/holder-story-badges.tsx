/**
 * @file holder-story-badges.tsx
 * @description The figures row of a story opened inside a list (StoryCardWithLinks): its own "N verified" badge
 * (the children, gated where it is written, P1141) and, on the point page only, P1061's arrows for this point
 * (hidden when nobody the author verified moved). No arrows for an agent's story, or while the registry loads.
 */
import { useContext, type ReactNode } from 'react';
import { MovedChip } from '@/app/components/movement/movement-bits';
import { PointStoryArrowsContext } from '@/app/components/movement/point-story-arrows-context';

export function HolderStoryFigures({ storyId, isAgent, identityPending, className, children }: {
  storyId: string;
  isAgent: boolean;
  identityPending: boolean;
  className: string;
  children: ReactNode;
}) {
  const arrowsFor = useContext(PointStoryArrowsContext);
  const moved = isAgent || identityPending ? null : arrowsFor?.(storyId) ?? null;
  return (
    <div className={className}>
      {children}
      {moved && <span className="ml-2 inline-flex"><MovedChip arrows={moved.arrows} authorName={moved.authorName} /></span>}
    </div>
  );
}
