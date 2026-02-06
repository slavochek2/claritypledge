/**
 * @file live-content-cards.tsx
 * @description P128: Lightweight story/point cards for /live beginning screen content picker.
 * Uses production types (StoryWithAuthor, PointWithCreator).
 * Design reference: prototype at src/app/prototypes/linkedin-like/components/
 */
import { useState, useMemo } from 'react';
import { Search, CheckCircle2, BookOpen, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { StoryWithAuthor, PointWithCreator } from '@/app/types';

// ============================================================================
// LIVE STORY CARD
// ============================================================================

interface LiveStoryCardProps {
  story: StoryWithAuthor;
  onSelect: (storyId: string, title: string) => void;
  disabled?: boolean;
}

export function LiveStoryCard({ story, onSelect, disabled }: LiveStoryCardProps) {
  // Truncate content preview to ~100 chars
  const preview = story.content.length > 100
    ? story.content.slice(0, 100).trimEnd() + '…'
    : story.content;

  return (
    <button
      type="button"
      onClick={() => onSelect(story.id, story.title)}
      disabled={disabled}
      className="w-full text-left bg-card rounded-lg border-l-4 border-l-blue-500 border border-border shadow-sm p-4 hover:border-blue-300 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      data-testid={`live-story-card-${story.id}`}
    >
      <p className="text-sm font-medium text-foreground line-clamp-2">{story.title}</p>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{preview}</p>
      <p className="text-xs text-muted-foreground mt-2">
        {story.understoodCount} understood
      </p>
    </button>
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
  return (
    <button
      type="button"
      onClick={() => onSelect(point.id, point.statement)}
      disabled={disabled}
      className="w-full text-left bg-card rounded-lg border-l-4 border-l-muted-foreground/50 border border-border shadow-sm p-4 hover:border-muted-foreground/70 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      data-testid={`live-point-card-${point.id}`}
    >
      <p className="text-sm font-medium text-foreground line-clamp-2">{point.statement}</p>
      {point.context && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{point.context}</p>
      )}
    </button>
  );
}

// ============================================================================
// CONTENT PICKER
// ============================================================================

interface ContentPickerProps {
  stories: StoryWithAuthor[];
  points: PointWithCreator[];
  onSelectStory: (storyId: string, title: string) => void;
  onSelectPoint: (pointId: string, title: string) => void;
  disabled?: boolean;
}

export function ContentPicker({
  stories,
  points,
  onSelectStory,
  onSelectPoint,
  disabled,
}: ContentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const totalItems = stories.length + points.length;
  const showSearch = totalItems >= 5;

  const filteredStories = useMemo(() => {
    if (!searchQuery.trim()) return stories;
    const q = searchQuery.toLowerCase();
    return stories.filter(s =>
      s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
    );
  }, [stories, searchQuery]);

  const filteredPoints = useMemo(() => {
    if (!searchQuery.trim()) return points;
    const q = searchQuery.toLowerCase();
    return points.filter(p =>
      p.statement.toLowerCase().includes(q) || (p.context?.toLowerCase().includes(q))
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
            onChange={(e) => setSearchQuery(e.target.value)}
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
              onSelect={onSelectStory}
              disabled={disabled}
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

interface SessionHistoryItem {
  title: string;
  type: 'story' | 'point' | 'free';
}

interface SessionHistoryListProps {
  history: SessionHistoryItem[];
  className?: string;
}

export function SessionHistoryList({ history, className = '' }: SessionHistoryListProps) {
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
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        This session
      </p>
      <div className="space-y-2">
        {history.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            {iconForType(item.type)}
            <span className="text-muted-foreground line-clamp-1">{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SELECTED CONTENT DISPLAY (shown during rating screens)
// ============================================================================

interface SelectedContentDisplayProps {
  story?: StoryWithAuthor | null;
  point?: PointWithCreator | null;
}

/**
 * Shows the selected story/point card during the verification flow
 * so both users see what's being verified.
 */
export function SelectedContentDisplay({ story, point }: SelectedContentDisplayProps) {
  if (!story && !point) return null;

  return (
    <div className="w-full max-w-sm" data-testid="selected-content-display">
      {story && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-semibold text-foreground">{story.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{story.content}</p>
        </div>
      )}
      {point && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <p className="text-sm font-semibold text-foreground">{point.statement}</p>
          {point.context && (
            <p className="text-xs text-muted-foreground mt-1">{point.context}</p>
          )}
        </div>
      )}
    </div>
  );
}
