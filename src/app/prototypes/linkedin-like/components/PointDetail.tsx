import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { PointCard } from './PointCard';
import { StoryCard } from './StoryCard';
import { FilterTabs, PositionBadge, UserCredibility, ThreadLineGroup, ThreadLineItem, type PositionFilter } from './shared';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { routes } from '../config';
import {
  getPointById,
  getStoriesForPoint,
  getUserById,
} from '../data/mock-data';
import type { PositionType, Story, User } from '../../shared/types';
import { getPositionGroup, type PositionButtonGroup } from '../../shared/types';

/**
 * PointDetail - Journey 1: "Explore a debate"
 * Shows a Point with linked Stories grouped by position.
 *
 * Layout:
 * - Filter tabs at top (no "All" tab - click active to deselect)
 * - When filter = 'all': show all position sections
 * - When filter = specific: show only that section
 * - Empty sections show "(no positions yet)"
 */
export function PointDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const point = getPointById(id || '');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');

  if (!point) {
    return (
      <PrototypeLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-gray-500">Point not found</p>
        </div>
      </PrototypeLayout>
    );
  }

  const linkedStories = getStoriesForPoint(point.id);

  // Create a map of authorId -> story for quick lookup
  const storyByAuthor: Record<string, Story> = {};
  for (const story of linkedStories) {
    storyByAuthor[story.authorId] = story;
  }

  // Group ALL position holders by their position (not just those with stories)
  type PositionHolder = { user: User; position: PositionType; story?: Story };
  const holdersByPosition: Record<PositionButtonGroup, PositionHolder[]> = {
    agree: [],
    disagree: [],
    unsure: [],
  };

  for (const [userId, entry] of Object.entries(point.positions)) {
    if (userId === 'current' || !entry?.position) continue;
    const user = getUserById(userId);
    if (!user) continue;

    const group = getPositionGroup(entry.position as PositionType);
    holdersByPosition[group].push({
      user,
      position: entry.position as PositionType,
      story: storyByAuthor[userId],
    });
  }

  // Count position holders (not just stories)
  const positionCounts = {
    all: Object.keys(point.positions).filter(id => id !== 'current').length,
    agree: holdersByPosition.agree.length,
    disagree: holdersByPosition.disagree.length,
    unsure: holdersByPosition.unsure.length,
  };

  // Which sections to show based on filter
  const positionsToShow: PositionButtonGroup[] =
    positionFilter === 'all'
      ? ['agree', 'disagree', 'unsure']
      : [positionFilter as PositionButtonGroup];

  return (
    <PrototypeLayout>
      <div className="max-w-lg mx-auto pb-8">
        {/* Back button */}
        <div className="px-4 pt-3">
          <button
            onClick={() => navigate(routes.myEvents)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 -ml-1"
          >
            <ArrowLeft size={16} />
            My Events
          </button>
        </div>

        {/* Point card */}
        <div className="px-2 pt-2">
          <PointCard point={point} isDetailView />
        </div>

        {/* Stories section */}
        <div className="bg-white border border-gray-200 mx-2 mt-3 rounded-lg">
          {/* Filter tabs */}
          <FilterTabs
            activeFilter={positionFilter}
            onFilterChange={setPositionFilter}
            counts={positionCounts}
          />

          {/* Position-grouped holders */}
          <div className="p-4 space-y-6">
            {positionsToShow.map(position => (
              <PositionSection
                key={position}
                position={position}
                holders={holdersByPosition[position]}
                showHeader={positionFilter === 'all'}
              />
            ))}
          </div>
        </div>
      </div>
    </PrototypeLayout>
  );
}

type PositionHolder = { user: User; position: PositionType; story?: Story };

/**
 * Section for a single position group (Agree/Disagree/Unsure)
 * Shows header only when viewing all positions (showHeader=true)
 * Shows all position holders - those with stories get StoryCard, others get a compact row
 */
function PositionSection({
  position,
  holders,
  showHeader,
}: {
  position: PositionButtonGroup;
  holders: PositionHolder[];
  /** Show position label header (when viewing all positions) */
  showHeader: boolean;
}) {
  const labels: Record<PositionButtonGroup, string> = {
    agree: 'Agree',
    disagree: 'Disagree',
    unsure: 'Unsure',
  };

  // When viewing all positions, hide empty sections entirely
  // Only show "(no positions yet)" when explicitly filtering to an empty category
  if (holders.length === 0 && showHeader) {
    return null;
  }

  return (
    <div>
      {/* Position label - shown when viewing all positions */}
      {showHeader && holders.length > 0 && (
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {labels[position]}
        </div>
      )}

      {/* Position holders or empty state */}
      {holders.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-3">
          (no positions yet)
        </p>
      ) : holders.length === 1 ? (
        // Single item - no thread lines
        holders[0].story ? (
          <StoryCard
            story={holders[0].story}
            compact
            context="point-detail"
            authorPosition={holders[0].position}
          />
        ) : (
          <PositionOnlyRow holder={holders[0]} />
        )
      ) : (
        // 2+ items - show thread lines
        <ThreadLineGroup>
          {holders.map((holder, index) =>
            <ThreadLineItem key={holder.user.id} isLast={index === holders.length - 1}>
              {holder.story ? (
                <StoryCard
                  story={holder.story}
                  compact
                  context="point-detail"
                  authorPosition={holder.position}
                />
              ) : (
                <PositionOnlyRow holder={holder} />
              )}
            </ThreadLineItem>
          )}
        </ThreadLineGroup>
      )}
    </div>
  );
}

/**
 * Compact row for position holders without a story.
 * Styled consistently with StoryCard/QuotedStory patterns.
 */
function PositionOnlyRow({ holder }: { holder: PositionHolder }) {
  const navigate = useNavigate();
  const { user, position } = holder;

  return (
    <div
      onClick={() => navigate(routes.profileById(user.id))}
      className="group flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors"
    >
      {/* Avatar - consistent with StoryCard */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(routes.profileById(user.id));
        }}
        className="flex-shrink-0 hover:opacity-80 transition-opacity"
      >
        <GravatarAvatar
          name={user.name}
          size="sm"
          isPledger={user.hasPledged}
        />
      </button>

      {/* Content - matches StoryCard author row structure */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Name - clickable */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(routes.profileById(user.id));
            }}
            className="font-medium text-gray-900 text-sm hover:underline truncate"
          >
            {user.name}
          </button>
          {/* Credibility - ear count */}
          <UserCredibility userId={user.id} userName={user.name} />
          {/* Position badge - after credibility */}
          <PositionBadge position={position} />
        </div>
        {/* Role metadata - consistent with StoryCard */}
        <p className="text-xs text-gray-500 truncate">
          {user.role}{user.company && ` at ${user.company}`}
        </p>
      </div>

      {/* No story indicator - subtle */}
      <span className="text-xs text-gray-400 italic flex-shrink-0">No story yet</span>
    </div>
  );
}
