/**
 * @file feed-story-card.tsx
 * @description P491: Lightweight story card for the public feed.
 * Takes StoryWithAuthor (production type), renders author row, story text, tag pills.
 * Blue left border. Clickable → navigates to /story/:id.
 */

import { useNavigate } from 'react-router-dom';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { EarBadge } from '@/components/ui/ear-badge';
import { LinkedText } from '@/app/components/shared/linked-text';
import { TagPills } from '@/app/components/shared/tag-pills';
import type { StoryWithAuthor } from '@/app/types';

interface FeedStoryCardProps {
  story: StoryWithAuthor;
  activeTag?: string;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function FeedStoryCard({ story, activeTag }: FeedStoryCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/story/${story.id}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="p-4">
        {/* Author row */}
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/p/${story.authorSlug}`);
            }}
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <GravatarAvatar
              name={story.authorName}
              photoUrl={story.authorAvatarUrl}
              avatarColor={story.authorAvatarColor}
              size="sm"
              isPledger={story.authorHasPledged ?? false}
            />
          </button>

          <div className="flex-1 min-w-0">
            <div className="mb-1">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/p/${story.authorSlug}`);
                  }}
                  className="font-semibold text-foreground hover:underline text-sm"
                >
                  {story.authorName}
                </button>
                <EarBadge count={story.authorEarsCount ?? 0} name={story.authorName} />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {story.authorRole && <span>{story.authorRole}</span>}
                {story.authorRole && <span className="opacity-40">·</span>}
                <span>{formatTimeAgo(story.createdAt)}</span>
              </div>
            </div>

            {/* Story text */}
            <p className="text-foreground break-words text-sm line-clamp-4">
              <LinkedText text={story.content} />
            </p>

            {/* Tag pills */}
            <TagPills tags={story.tags} context="feed" activeTag={activeTag} className="mt-2" />

            {/* Stats */}
            {story.understoodCount > 0 && (
              <div className="mt-2">
                <span className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-muted-foreground">
                  {story.understoodCount} understood
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
