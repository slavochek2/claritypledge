/**
 * @file story-detail-movement.tsx
 * @description P1061 on the story page: the "N moved" chip beside the "N verified" badge, opening the panel, and
 * each linked point's arrows chip. The count rides on the story (`movementOf(story)`), which only the story page's
 * read attaches; every other surface that renders StoryCardDetail shows exactly what it showed before.
 */
import { useContext, type ReactNode } from 'react';
import { TagPills } from '@/app/components/shared/tag-pills';
import { MovedChip } from '@/app/components/movement/movement-bits';
import { StoryMovementPanel } from '@/app/components/movement/story-movement-panel';
import type { PointSummary, StoryWithAuthor } from '@/app/types';
import { movementOf } from '@/app/data/movement-for-list';
import { arrowsOn } from '@/lib/position-movement';
import { StoryMovementContext } from './story-detail-movement-context';

/**
 * The card's figures row: its own "N verified" badge (the children, gated where it is written, P1141), then the
 * "N moved" chip opening the panel. No chip for an agent's story, or while the agent registry loads.
 */
export function StoryDetailFigures({ story, isAgent, identityPending, points, className, children }: {
  story: StoryWithAuthor;
  isAgent: boolean;
  identityPending: boolean;
  points: PointSummary[];
  className: string;
  children: ReactNode;
}) {
  const movement = isAgent || identityPending ? undefined : movementOf(story);
  return (
    <div className={className}>
      {children}
      {movement && (
        <span className="ml-2 inline-flex">
          <StoryMovementPanel movement={movement} authorName={story.authorName} points={points.map(p => ({ id: p.id, statement: p.statement }))} />
        </span>
      )}
    </div>
  );
}

/** The quoted points' container, which also hands the story's movement to each point's arrows. */
export function StoryMovementPoints({ story, className, children }: { story: StoryWithAuthor; className: string; children: ReactNode }) {
  const movement = movementOf(story);
  const body = <div className={className}>{children}</div>;
  return movement ? <StoryMovementContext.Provider value={{ movement, authorName: story.authorName }}>{body}</StoryMovementContext.Provider> : body;
}

/**
 * A quoted point's tags, as before, and under them the arrows of the people the story's author verified (hidden
 * when nobody moved). The point box is itself a link to the point: clicks and keys on the chip, and in its
 * explanation (a portal, still a React child here), stop at this wrapper.
 */
export function QuotedPointTags({ point }: { point: PointSummary }) {
  const story = useContext(StoryMovementContext);
  const systemTags = (point as { systemTags?: string[] }).systemTags;
  const arrows = story ? arrowsOn(story.movement, point.id) : null;
  return (
    <>
      {((point.tags?.length ?? 0) > 0 || (systemTags?.length ?? 0) > 0) && <TagPills tags={point.tags} systemTags={systemTags} context="detail" className="mt-1" />}
      {arrows && story && (
        <div role="presentation" className="mt-2" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} data-testid="point-arrows">
          <MovedChip arrows={arrows} authorName={story.authorName} />
        </div>
      )}
    </>
  );
}
