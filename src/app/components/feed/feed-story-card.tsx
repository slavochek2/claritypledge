/**
 * @file feed-story-card.tsx
 * @description P491: Lightweight story card for the public feed.
 * Takes StoryWithAuthor (production type), renders author row, story text, tag pills.
 * Blue left border. Clickable → navigates to /story/:id.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';
import { analytics } from '@/lib/mixpanel';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import { EarBadge } from '@/components/ui/ear-badge';
import { UnderstoodBadge } from '@/components/ui/understood-badge';
import { linkifyText } from '@/app/utils/linkify';
import { TagPills } from '@/app/components/shared/tag-pills';
import { storyTextForDisplay } from '@/lib/story-quotes';
import { InlineVisibilityIcon } from '@/app/components/shared';
import { StoryMedia } from '@/app/components/shared/story-media';
import { StoryVideoQuotes } from '@/app/components/shared/story-video-quotes';
import { stripAgentPrefix } from '@/lib/utils';
import { AgentByline } from '@/app/components/shared/agent-byline';
import { QuotedPointCard } from '@/app/components/shared/quoted-point-card';
import { ThreadLineGroup, ThreadLineItem } from '@/app/components/shared';
import { pointsService } from '@/app/data/points-service';
import type { Position } from '@/app/types';
import { normalizeVideoQuotes } from '@/lib/video';
import type { StoryWithAuthor, PointSummary } from '@/app/types';

interface FeedStoryCardProps {
  story: StoryWithAuthor;
  activeTag?: string;
  /**
   * P1212 §5 — the points this story argues, batch-fetched by the feed page
   * (`getPointsForStories`, one query per page — never per card).
   *
   * Undefined means "not loaded", which renders no footer at all. An empty array means
   * "loaded, none linked" and renders the `0 points` label. The distinction matters: a
   * card that flashes `0 points` while the links are still in flight reads as a fact
   * about the story rather than about the fetch.
   */
  linkedPoints?: PointSummary[];
  /**
   * The signed-in viewer. Forwarded to `QuotedPointCard`, which renders its position
   * controls only for a known viewer. Omitting it is why the feed rendered a read-only
   * slab where the profile rendered an interactive card, from the same component
   * (adversarial review, 2026-09-04).
   */
  currentUserId?: string;
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

export function FeedStoryCard({ story, activeTag, linkedPoints, currentUserId }: FeedStoryCardProps) {
  const navigate = useNavigate();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [textExpanded, setTextExpanded] = useState(false);
  const [pointsExpanded, setPointsExpanded] = useState(false);
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

  /**
   * P1212: the WRITE half of the position controls this section put on the feed.
   *
   * `QuotedPointCard.handlePositionClick` sets its optimistic local state and then calls
   * `onPositionSelect?.()`. The profile passed that prop and the feed did not, so the
   * button lit up, the count moved, and nothing was persisted — the position was gone on
   * the next load. Rendering the control was never the claim; recording the position is,
   * and a control that only appears to work is worse than the read-only slab it replaced.
   *
   * Toggle-off is deliberately NOT handled here. On the feed point card that path goes
   * through `useRemovePositionGuard`, which warns when the position has linked stories
   * (P401); silently removing it from this surface would bypass that warning. Until this
   * card carries the dialog too, a toggle-off keeps its optimistic local state and writes
   * nothing — the same behaviour as before this fix, and only for that one case.
   */
  const handlePointPosition = async (pointId: string, position: Position) => {
    if (!currentUserId || position === null) return;
    try {
      await pointsService.setPosition(pointId, currentUserId, position);
    } catch {
      toast.error('Failed to save position.');
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
      onClick={handleClick}
      onKeyDown={(e) => {
        // P1212: only the CARD ITSELF activates on Enter/Space. Without this target check
        // the handler fires for a keydown on any control nested inside — the point
        // expander, a position button, a quote timecode — and because it calls
        // preventDefault() it CANCELS that control's own activation before navigating. A
        // keyboard reader pressing Enter on "2 points" was thrown to the story detail page
        // instead of expanding it, while the mouse path worked, because the
        // role="presentation" wrapper below stops onClick and not onKeyDown.
        //
        // Guarding at the root rather than per-control is the point: the alternative is
        // remembering to add stopPropagation to every interactive element this card will
        // ever contain, and the two added in this very spec are the proof that it gets
        // forgotten.
        if (e.target !== e.currentTarget) return;
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
              {/* P1212 §1 — the label is StoryVideoQuotes' own <h3>, never inline prose. */}
              {linkifyText(storyTextForDisplay(story.content, story.tags))}
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

            {/* P1212 §4 — the quotes travel with the story, on every surface that shows it.
                §1 took the bodies OUT of `content`; before this they were readable here only
                because they sat inline, so removing them left the argument with no evidence.
                No `onSeek`: there is no player on the feed, and StoryVideoQuotes' own fallback
                turns each timecode into a link that opens the source at that second — which is
                what §4's "timecodes only where clicking works" rule actually asks for.

                `stopPropagation` because the card root is a link to the story: without it,
                clicking a timecode navigates to the story instead of opening the source. */}
            {normalizeVideoQuotes(story.videoQuotes).quotes.length > 0 && story.videoUrl && (
              <div role="presentation" onClick={(e) => e.stopPropagation()}>
                <StoryVideoQuotes
                  videoUrl={story.videoUrl}
                  quotes={normalizeVideoQuotes(story.videoQuotes).quotes}
                  subjectName={stripAgentPrefix(story.authorName) ?? story.authorName}
                />
              </div>
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

      {/* P1212 §5 — linked-point expander. The feed showed a static count while the
          profile story card showed an expandable list of the same links, which is the
          per-surface drift this spec exists to close. Same affordance as
          profile-page-v2.tsx's StoryCardFull footer: chevron + count, expanding in place. */}
      {linkedPoints !== undefined && (
        <div
          role="presentation"
          className="flex flex-col px-4 py-2.5 border-t border-border gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {linkedPoints.length > 0 ? (
            <button
              onClick={() => setPointsExpanded(!pointsExpanded)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors self-start min-h-[40px]"
              aria-expanded={pointsExpanded}
              data-testid="feed-story-point-expander"
            >
              {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {linkedPoints.length} {linkedPoints.length === 1 ? 'point' : 'points'}
              </span>
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">0 points</span>
          )}

          {/* The expanded content renders through the SAME shared component the profile
              uses (extracted from `profile-page-v2.tsx` for exactly this). The first §5
              pass matched only the TRIGGER and rendered the points as bare `<button>`
              text here — no card, no author, no affordance until hover — beside a profile
              rendering full quoted cards and a feed POINT card rendering `QuotedStory`
              cards. Every assertion in the parity suite passed on that, because they all
              looked for the statement STRING. Founder, from a screenshot: "weird this is
              not consistent with rest?". */}
          {pointsExpanded && linkedPoints.length > 0 && (
            <ThreadLineGroup>
              {linkedPoints.map((point, index) => (
                <ThreadLineItem key={point.id} isLast={index === linkedPoints.length - 1}>
                  <QuotedPointCard
                    point={point}
                    authorId={story.authorId}
                    authorName={story.authorName}
                    authorAvatarUrl={story.authorAvatarUrl ?? undefined}
                    authorAvatarColor={story.authorAvatarColor}
                    authorEarCount={story.authorEarsCount ?? 0}
                    authorHasPledged={story.authorHasPledged ?? false}
                    currentUserId={currentUserId}
                    onPositionSelect={(pos) => handlePointPosition(point.id, pos)}
                    /* The six author props above are inert on THIS surface and that is not
                       an oversight. QuotedPointCard gates its whole author header on
                       `point.profileSubjectPosition`, which the feed's query deliberately
                       does not supply (see stories-service.interface.ts) — so the feed
                       shows the point and its controls, the profile additionally shows who
                       holds a position on it and where they stand.
                       SAY IT PLAINLY: the two surfaces share the component and do NOT
                       render identically. "Rendered through QuotedPointCard" is what the
                       parity test asserts and all it asserts. Whether the feed should carry
                       the subject's stance is an OPEN FOUNDER QUESTION recorded in the
                       spec, not a settled piece of §5. */
                  />
                </ThreadLineItem>
              ))}
            </ThreadLineGroup>
          )}
        </div>
      )}
    </div>
  );
}
