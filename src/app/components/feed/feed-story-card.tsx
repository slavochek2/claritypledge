/**
 * @file feed-story-card.tsx
 * @description P491: Lightweight story card for the public feed.
 * Takes StoryWithAuthor (production type), renders author row, story text, tag pills.
 * Blue left border. Clickable → navigates to /story/:id.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';
import { analytics } from '@/lib/mixpanel';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import { EarBadge } from '@/components/ui/ear-badge';
import { UnderstoodBadge } from '@/components/ui/understood-badge';
import { linkifyText } from '@/app/utils/linkify';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';
import { InlineVisibilityIcon } from '@/app/components/shared';
import { StoryMedia } from '@/app/components/shared/story-media';
import { AgentByline } from '@/app/components/shared/agent-byline';
import { normalizeVideoQuotes } from '@/lib/video';
import type { StoryWithAuthor } from '@/app/types';

interface FeedStoryCardProps {
  story: StoryWithAuthor;
  activeTag?: string;
  /** Optional point count — when available, shown in footer */
  pointCount?: number;
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

export function FeedStoryCard({ story, activeTag, pointCount }: FeedStoryCardProps) {
  const navigate = useNavigate();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [textExpanded, setTextExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);

  const checkOverflow = useCallback(() => {
    const el = textRef.current;
    if (el) setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    checkOverflow();
  }, [checkOverflow, story.content]);

  const handleClick = () => {
    navigate(`/story/${story.id}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
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
              isAgent={isAgent}
              identityPending={identityPending}
            />
          </button>

          {/* P1141 amendment: the drain is NOT applied here — it used to wrap this whole
              content column and greyed the video, the quote pills and the viewer's own
              controls. See src/index.css. */}
          <div className="flex-1 min-w-0">
            <div className="mb-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {/* P1141: `[MACHINE] reading of {Full Name}`, NAME is the only link.
                    AgentByline owns its own button — never wrap it in one. */}
                {isAgent && !identityPending ? (
                  <AgentByline
                    name={story.authorName}
                    onNameClick={(e) => {
                      e.stopPropagation();
                      navigate(`/p/${story.authorSlug}`);
                    }}
                  />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/p/${story.authorSlug}`);
                    }}
                    className="font-semibold text-foreground hover:underline text-sm min-w-0"
                  >
                    {story.authorName}
                  </button>
                )}
                {!isAgent && !identityPending && <EarBadge count={story.authorEarsCount ?? 0} name={story.authorName} />}
              </div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                {story.authorRole && <span>{story.authorRole} · </span>}
                <span>{formatTimeAgo(story.createdAt)}</span>
                <InlineVisibilityIcon visibility={story.visibility ?? 'public'} />
              </div>
            </div>

            {/* Supporting image. P1141: video wins when present; the image path is untouched. */}
            {(story.videoUrl || story.imageUrl) && (
              <StoryMedia
                videoUrl={story.videoUrl}
                durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
                mode="thumbnail"
                storyHref={`/story/${story.id}`}
                className="mt-2 mb-2"
                imageProps={story.imageUrl ? {
                  src: story.imageUrl,
                  authorName: story.authorName,
                  onClick: () => navigate(`/story/${story.id}`),
                  className: 'mt-2 mb-2',
                } : undefined}
              />
            )}

            {/* Story text */}
            <p
              ref={textRef}
              className={`text-foreground break-words text-sm ${textExpanded ? '' : 'line-clamp-6'}`}
            >
              {linkifyText(stripHashtags(story.content, story.tags))}
            </p>
            {isOverflowing && !textExpanded && (
              <button
                onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
                className="text-sm text-blue-600 font-medium mt-1"
              >
                show more
              </button>
            )}
            {textExpanded && (
              <button
                onClick={(e) => { e.stopPropagation(); setTextExpanded(false); }}
                className="text-sm text-muted-foreground mt-1"
              >
                show less
              </button>
            )}

            {/* Tag pills */}
            <TagPills tags={story.tags} context="feed" activeTag={activeTag} className="mt-2" />

            {/* Stats + share */}
            <div className="mt-2 flex items-center gap-2">
{/* P1141: gated on identityPending too — the registry fails closed, and reading
                    isAgent while it loads renders an agent story as a human one. */}
                {!isAgent && !identityPending && <UnderstoodBadge count={story.understoodCount} size="xs" />}
              <div className="flex-1" />
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  analytics.track('feed_card_shared', { type: 'story', id: story.id });
                  const url = `${window.location.origin}/story/${story.id}`;
                  const ok = await copyToClipboard(url);
                  if (ok) toast.success('Link copied!');
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Share story"
                title="Copy link"
              >
                <Share2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: point count */}
      {pointCount !== undefined && (
        <div
          role="presentation"
          className="flex items-center justify-between px-4 py-2.5 border-t border-border"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-sm text-muted-foreground">
            {pointCount} {pointCount === 1 ? 'point' : 'points'}
          </span>
        </div>
      )}
    </div>
  );
}
