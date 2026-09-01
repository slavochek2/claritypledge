/**
 * @file live-content-cards.tsx
 * @description P128: Lightweight story/point cards for /live beginning screen content picker.
 * P133: Enhanced with inline expansion pattern + rich cards (avatar, metadata)
 * Uses production types (StoryWithPoints, PointWithCreator).
 * Design reference: shared components at src/app/components/shared/
 */
import { useState, useMemo } from 'react';
import { Search, CheckCircle2, BookOpen, MessageSquare, Loader2, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { StoryWithAuthor, StoryWithPoints, PointWithCreator, SessionHistoryItem } from '@/app/types';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { analytics } from '@/lib/mixpanel';
import { linkifyText } from '@/app/utils/linkify';
import { TagPills } from '@/app/components/shared/tag-pills';
import { UnderstoodBadge } from '@/components/ui/understood-badge';
import { StoryImage } from '@/app/components/shared/story-image';
import { stripHashtags } from '@/lib/utils';
import { getFirstName, RatingButtons } from './shared';

// ============================================================================
// LIVE STORY CARD (P133: Enhanced with inline expansion)
// ============================================================================

interface LiveStoryCardProps {
  story: StoryWithPoints;
  partnerName: string;
  isExpanded: boolean;
  isSubmitting: boolean;
  selectedRating: number | null;
  error?: string;
  onExpand: () => void;
  onRatingSelect: (rating: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onRetry?: () => void;
  disabled?: boolean;
}

export function LiveStoryCard({
  story,
  partnerName,
  isExpanded,
  isSubmitting,
  selectedRating,
  error,
  onExpand,
  onRatingSelect,
  onSubmit,
  onCancel,
  onRetry,
  disabled
}: LiveStoryCardProps) {
  const linkedPointsCount = story.points.length;
  const partnerFirstName = getFirstName(partnerName);
  const strippedContent = stripHashtags(story.content, story.tags);

  // Truncate content preview to 2 lines (~100 chars) when collapsed
  const preview = strippedContent.length > 100
    ? strippedContent.slice(0, 100).trimEnd() + '…'
    : strippedContent;

  // Collapsed state
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        disabled={disabled || isSubmitting}
        className="w-full text-left bg-card rounded-lg border-l-4 border-l-blue-500 border border-border shadow-sm p-4 hover:border-blue-300 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid={`live-story-card-${story.id}`}
      >
        {/* Avatar + Story Preview */}
        <div className="flex gap-3 mb-3">
          <GravatarAvatar
            name={story.authorName}
            size="sm"
            avatarColor={story.authorAvatarColor}
            photoUrl={story.authorAvatarUrl}
            isPledger={!!story.authorEarsCount}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground line-clamp-2 break-words">{linkifyText(preview)}</p>
            {strippedContent.length > 100 && (
              <p className="text-xs text-muted-foreground mt-0.5">Read more ↓</p>
            )}
          </div>
        </div>

        {/* Story image preview */}
        {story.imageUrl && (
          <div className="mb-3">
            <StoryImage
              src={story.imageUrl}
              authorName={story.authorName}
            />
          </div>
        )}

        {/* Metadata Row */}
        <p className="text-xs text-muted-foreground mb-3">
          {linkedPointsCount} {linkedPointsCount === 1 ? 'point' : 'points'} linked · <UnderstoodBadge count={story.understoodCount} size="xs" />
        </p>

        {/* P491: Tag pills (display-only in live context) */}
        {story.tags && story.tags.length > 0 && (
          <div className="mb-3">
            <TagPills tags={story.tags} context="live" />
          </div>
        )}

        {/* CTA Button (visual emphasis, entire card is clickable) */}
        <div className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md text-center transition-colors">
          Does {partnerFirstName} understand your story?
        </div>
      </button>
    );
  }

  // Expanded state
  return (
    <div
      className="w-full bg-card rounded-lg border-l-4 border-l-blue-500 border border-border shadow-sm p-4"
      data-testid={`live-story-card-${story.id}-expanded`}
    >
      {/* Avatar + Full Story Text (scrollable if long) */}
      <div className="flex gap-3 mb-3">
        <GravatarAvatar
          name={story.authorName}
          size="sm"
          avatarColor={story.authorAvatarColor}
          photoUrl={story.authorAvatarUrl}
          isPledger={!!story.authorEarsCount}
        />
        <div className="flex-1 min-w-0 max-h-[200px] overflow-y-auto">
          <p className="text-sm font-medium text-foreground break-words">{linkifyText(strippedContent)}</p>
        </div>
      </div>

      {/* Story image preview */}
      {story.imageUrl && (
        <div className="mb-3">
          <StoryImage
            src={story.imageUrl}
            authorName={story.authorName}
          />
        </div>
      )}

      {/* Metadata (show points only when expanded) */}
      <p className="text-xs text-muted-foreground mb-4">
        {linkedPointsCount} {linkedPointsCount === 1 ? 'point' : 'points'} linked
      </p>

      {/* Divider */}
      <div className="border-t border-border my-4" />

      {/* Rating UI (sticky on mobile) */}
      {/* P956: pb-[env(safe-area-inset-bottom)] keeps the sticky rating UI above the system bar (viewport-fit=cover); 0 elsewhere. */}
      <div className="sticky bottom-0 bg-card pt-2 pb-[env(safe-area-inset-bottom)]">
        {/* Rating Question */}
        <p className="text-sm font-medium text-foreground mb-3">
          How much do you believe {partnerFirstName} understands your story?
        </p>

        {/* Rating Buttons */}
        <div className="mb-4">
          <RatingButtons
            selectedValue={selectedRating}
            onSelect={onRatingSelect}
            disabled={isSubmitting}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">⚠️ {error}</p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={error ? onRetry : onSubmit}
          disabled={selectedRating === null || (isSubmitting && !error)}
          className="w-full mb-2"
          data-testid="submit-story-rating"
        >
          {isSubmitting && !error && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          {error ? 'Retry' : 'Submit Rating'}
        </Button>

        {/* Cancel Button */}
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting && !error}
          className="w-full"
          data-testid="cancel-story-rating"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// LIVE POINT CARD
// ============================================================================

interface LivePointCardProps {
  point: PointWithCreator;
  onSelect: (pointId: string, title: string) => void;
  disabled?: boolean;
}

export function LivePointCard({ point, onSelect, disabled }: LivePointCardProps) {
  const displayStatement = stripHashtags(point.statement, point.tags);
  return (
    <button
      type="button"
      onClick={() => onSelect(point.id, point.statement)}
      disabled={disabled}
      className="w-full text-left bg-card rounded-lg border-l-4 border-l-muted-foreground/50 border border-border shadow-sm p-4 hover:border-muted-foreground/70 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      data-testid={`live-point-card-${point.id}`}
    >
      <p className="text-sm font-medium text-foreground line-clamp-2 break-words">{linkifyText(displayStatement)}</p>
      {/* P491: Tag pills (display-only in live context) */}
      {point.tags && point.tags.length > 0 && (
        <TagPills tags={point.tags} context="live" className="mt-2" />
      )}
    </button>
  );
}

// ============================================================================
// CONTENT PICKER
// ============================================================================

interface ContentPickerProps {
  stories: StoryWithPoints[];
  points: PointWithCreator[];
  partnerName: string;
  onSelectStory: (storyId: string, title: string, rating: number) => void;
  onSelectPoint: (pointId: string, title: string) => void;
  disabled?: boolean;
}

export function ContentPicker({
  stories,
  points,
  partnerName,
  onSelectStory,
  onSelectPoint,
  disabled,
}: ContentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const totalItems = stories.length + points.length;
  const showSearch = totalItems >= 5;

  // P133: State management for inline expansion
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [submissionState, setSubmissionState] = useState<{
    status: 'idle' | 'submitting' | 'error';
    storyId: string | null;
    error?: string;
  }>({ status: 'idle', storyId: null });

  // P133: Handlers for inline expansion
  const handleExpand = (storyId: string) => {
    // Radio pattern: expanding one card auto-collapses others
    setExpandedStoryId(storyId);
    setSelectedRating(null); // Clear any prior selection
    setSubmissionState({ status: 'idle', storyId: null }); // Clear any errors
  };

  const handleCancel = () => {
    setExpandedStoryId(null);
    setSelectedRating(null);
    setSubmissionState({ status: 'idle', storyId: null });
  };

  const handleSubmit = async (storyId: string) => {
    // Guard: Don't allow submission while another is in progress
    if (submissionState.status === 'submitting' || selectedRating === null) return;

    const story = stories.find(s => s.id === storyId);
    if (!story) return;

    setSubmissionState({ status: 'submitting', storyId });

    try {
      // Use preview text (first 100 chars) as the label
      const preview = story.content.length > 100
        ? story.content.slice(0, 100).trimEnd() + '…'
        : story.content;

      await onSelectStory(storyId, preview, selectedRating);
      // Success: card will be replaced by StoryCardPreview in next phase
    } catch (error) {
      setSubmissionState({
        status: 'error',
        storyId,
        error: error instanceof Error ? error.message : 'Failed to submit. Check network.',
      });
    }
  };

  // P128: Track when user starts using search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Track first keystroke in search (when going from empty to non-empty)
    if (!searchQuery && newValue) {
      analytics.track('content_search_used', {
        storiesCount: stories.length,
        pointsCount: points.length,
      });
    }

    setSearchQuery(newValue);
  };

  const filteredStories = useMemo(() => {
    if (!searchQuery.trim()) return stories;
    const q = searchQuery.toLowerCase();
    return stories.filter(s =>
      s.content.toLowerCase().includes(q)
    );
  }, [stories, searchQuery]);

  const filteredPoints = useMemo(() => {
    if (!searchQuery.trim()) return points;
    const q = searchQuery.toLowerCase();
    return points.filter(p =>
      p.statement.toLowerCase().includes(q)
    );
  }, [points, searchQuery]);

  const hasResults = filteredStories.length > 0 || filteredPoints.length > 0;

  return (
    <div className="w-full max-w-sm space-y-3" data-testid="content-picker">
      {/* Search bar (progressive: only at 5+ items) */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search stories and points..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 text-sm"
            data-testid="content-search"
          />
        </div>
      )}

      {/* No results */}
      {searchQuery.trim() && !hasResults && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No matches for &ldquo;{searchQuery}&rdquo;
        </p>
      )}

      {/* Stories */}
      {filteredStories.length > 0 && (
        <div className="space-y-2">
          {(searchQuery.trim() || points.length > 0) && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stories</p>
          )}
          {filteredStories.map(story => (
            <LiveStoryCard
              key={story.id}
              story={story}
              partnerName={partnerName}
              isExpanded={expandedStoryId === story.id}
              isSubmitting={submissionState.status === 'submitting' && submissionState.storyId === story.id}
              selectedRating={expandedStoryId === story.id ? selectedRating : null}
              error={submissionState.storyId === story.id ? submissionState.error : undefined}
              onExpand={() => handleExpand(story.id)}
              onRatingSelect={setSelectedRating}
              onSubmit={() => handleSubmit(story.id)}
              onCancel={handleCancel}
              onRetry={() => handleSubmit(story.id)}
              disabled={disabled || (submissionState.status === 'submitting' && submissionState.storyId !== story.id)}
            />
          ))}
        </div>
      )}

      {/* Points */}
      {filteredPoints.length > 0 && (
        <div className="space-y-2">
          {(searchQuery.trim() || stories.length > 0) && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Points</p>
          )}
          {filteredPoints.map(point => (
            <LivePointCard
              key={point.id}
              point={point}
              onSelect={onSelectPoint}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SESSION HISTORY LIST
// ============================================================================

interface SessionHistoryListProps {
  history: SessionHistoryItem[];
  className?: string;
  onItemClick?: (index: number) => void;
}

export function SessionHistoryList({ history, className = '', onItemClick }: SessionHistoryListProps) {
  if (history.length === 0) return null;

  const iconForType = (type: SessionHistoryItem['type']) => {
    switch (type) {
      case 'story': return <BookOpen className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
      case 'point': return <MessageSquare className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />;
      case 'free': return null;
    }
  };

  return (
    <div className={`w-full max-w-sm ${className}`} data-testid="session-history">
      <p className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">
        This session
      </p>
      <div className="space-y-1">
        {history.map((item, i) => {
          const isClickable = !item.skipped && item.checkerRating !== undefined && !!onItemClick;
          const isSkipped = item.skipped;

          if (isClickable) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onItemClick(i)}
                aria-label={`View round summary: ${item.title}`}
                className="group w-full flex items-center gap-2 text-sm min-h-[44px] px-1 rounded-md hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                {iconForType(item.type)}
                <span className="text-muted-foreground line-clamp-1 flex-1 text-left">{item.title}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          }

          return (
            <div key={i} className="flex items-center gap-2 text-sm min-h-[44px] px-1 opacity-80">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {iconForType(item.type)}
              <span className="text-muted-foreground line-clamp-1 flex-1">{item.title}</span>
              {isSkipped && (
                <span className="text-xs text-muted-foreground flex-shrink-0">Skipped</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// STORY CARD PREVIEW (P133: Rich persistent card for flow)
// ============================================================================

interface StoryCardPreviewProps {
  story: StoryWithPoints;
  showLinkedPoints?: boolean;
}

/**
 * P133: Rich story card preview shown throughout the verification flow.
 * Replaces SelectedContentDisplay with avatar + metadata.
 */
export function StoryCardPreview({ story, showLinkedPoints = true }: StoryCardPreviewProps) {
  const linkedPointsCount = story.points.length;

  // Truncate to 2 lines — strip hashtags first for clean preview
  const stripped = stripHashtags(story.content, story.tags);
  const preview = stripped.length > 100
    ? stripped.slice(0, 100).trimEnd() + '…'
    : stripped;

  return (
    <div
      className="w-full max-w-sm bg-card rounded-lg border-l-4 border-l-blue-500 border border-border shadow-sm p-4"
      data-testid="story-card-preview"
    >
      {/* Avatar + Story Preview */}
      <div className="flex gap-3">
        <GravatarAvatar
          name={story.authorName}
          size="sm"
          avatarColor={story.authorAvatarColor}
          photoUrl={story.authorAvatarUrl}
          isPledger={!!story.authorEarsCount}
        />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground line-clamp-2">{linkifyText(preview)}</p>
        </div>
      </div>

      {/* Story image preview */}
      {story.imageUrl && (
        <div className="mt-3">
          <StoryImage
            src={story.imageUrl}
            authorName={story.authorName}
          />
        </div>
      )}

      {/* Metadata (optional linked points count) */}
      {showLinkedPoints && (
        <p className="text-xs text-muted-foreground mt-3">
          {linkedPointsCount} {linkedPointsCount === 1 ? 'point' : 'points'} linked
        </p>
      )}
    </div>
  );
}

// ============================================================================
// POINT CARD PREVIEW (P133: For consistency with story preview)
// ============================================================================

interface PointCardPreviewProps {
  point: PointWithCreator;
}

/**
 * P133: Point card preview shown throughout the verification flow.
 */
export function PointCardPreview({ point }: PointCardPreviewProps) {
  return (
    <div
      className="w-full max-w-sm bg-card rounded-lg border-l-4 border-l-muted-foreground/50 border border-border shadow-sm p-4"
      data-testid="point-card-preview"
    >
      <p className="text-sm font-semibold text-foreground">{linkifyText(stripHashtags(point.statement, point.tags))}</p>
    </div>
  );
}

// ============================================================================
// SELECTED CONTENT DISPLAY (DEPRECATED - kept for backwards compatibility)
// ============================================================================

interface SelectedContentDisplayProps {
  story?: StoryWithAuthor | null;
  point?: PointWithCreator | null;
}

/**
 * @deprecated Use StoryCardPreview and PointCardPreview instead (P133)
 * Shows the selected story/point card during the verification flow
 * so both users see what's being verified.
 */
export function SelectedContentDisplay({ story, point }: SelectedContentDisplayProps) {
  if (!story && !point) return null;

  return (
    <div className="w-full max-w-sm" data-testid="selected-content-display">
      {story && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-semibold text-foreground line-clamp-2">{linkifyText(stripHashtags(story.content, story.tags))}</p>
        </div>
      )}
      {point && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-semibold text-foreground">{linkifyText(stripHashtags(point.statement, point.tags))}</p>
        </div>
      )}
    </div>
  );
}
