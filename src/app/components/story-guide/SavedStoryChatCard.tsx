/**
 * @file SavedStoryChatCard.tsx
 * @description P425: Chat-bubble card shown after a story is saved in the AI guide flow.
 * Displays story preview, author info, visibility, and stub actions.
 */
import { useState } from 'react';
import type { StoryVisibility } from '@/app/types';

const SHOW_MORE_THRESHOLD = 180;

const VISIBILITY_BADGE: Record<StoryVisibility, { icon: string; label: string }> = {
  private: { icon: '🔒', label: 'Private' },
  public: { icon: '🌐', label: 'Public' },
};

interface SavedStoryChatCardProps {
  storyId: string;
  content: string;
  authorName: string;
  visibility: StoryVisibility;
  linkedPointText?: string;
  createdAt?: Date;
}

export function SavedStoryChatCard({
  storyId: _storyId,
  content,
  authorName,
  visibility,
  linkedPointText,
  createdAt: _createdAt,
}: SavedStoryChatCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const badge = VISIBILITY_BADGE[visibility] ?? VISIBILITY_BADGE.private;
  const isTruncated = content.length > SHOW_MORE_THRESHOLD;
  const displayedContent =
    isTruncated && !isExpanded ? content.slice(0, SHOW_MORE_THRESHOLD) : content;

  return (
    <div
      data-testid="saved-story-chat-card"
      className="rounded-xl border border-border bg-background p-4"
    >
      {/* Author row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground"
            aria-hidden="true"
          >
            ●
          </span>
          <span className="font-medium text-foreground">{authorName}</span>
          <span aria-hidden="true">·</span>
          <span>just now</span>
          <span aria-hidden="true">·</span>
          <span
            className="inline-flex items-center gap-1 text-xs"
            aria-label={`Visibility: ${badge.label}`}
          >
            <span aria-hidden="true">{badge.icon}</span>
            {badge.label}
          </span>
        </div>

        {/* Action stubs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled
            aria-label="Edit story (coming soon)"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground rounded border border-border opacity-50 cursor-not-allowed"
          >
            ✏ Edit
          </button>
          <button
            type="button"
            disabled
            aria-label="More options (coming soon)"
            className="px-2 py-1 text-xs text-muted-foreground rounded border border-border opacity-50 cursor-not-allowed"
          >
            ···
          </button>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground leading-relaxed">
        {displayedContent}
        {isTruncated && !isExpanded && (
          <>
            {'... '}
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              Show more
            </button>
          </>
        )}
      </p>

      {/* Linked point */}
      {linkedPointText && (
        <p className="text-xs text-muted-foreground mt-2">
          ↳ linked to: {linkedPointText}
        </p>
      )}
    </div>
  );
}
