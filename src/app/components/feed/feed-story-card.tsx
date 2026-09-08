/**
 * @file feed-story-card.tsx
 * @description P491: Lightweight story card for the public feed.
 * Takes StoryWithAuthor (production type), renders author row, story text, tag pills.
 * Blue left border. Clickable → navigates to /story/:id.
 */

import { useState, useRef } from 'react';
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
import { useLazyStoryPlayer } from '@/app/hooks/use-lazy-story-player';
import { useTextOverflow } from '@/app/hooks/use-text-overflow';
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
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);

  /* P1259 change 6 — measured overflow, via the shared hook rather than this card's own
     one-shot effect. The old version measured on mount and on content change only, so a
     viewport resize or a late webfont left the answer stale; change 5 raising the clamp
     makes both of those far likelier to flip the result. */
  const isOverflowing = useTextOverflow(textRef, [story.content]);

  /* P1259 change 1 — a real player on the feed, mounted lazily. Before this the timecodes
     below were open-in-a-new-tab links: the reader who followed the evidence left the page
     to do it. Enabled only when there is a video to mount. */
  const player = useLazyStoryPlayer(!!story.videoUrl);

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
      /* P1212 — parity with profile-page-v2.tsx:1363, in the accessibility layer. A
         role="button" with no accessible name takes it from its SUBTREE, so without this the
         same story announces as a cleanly named control on the profile and as one button
         whose name is the story text plus the counts plus the expander label plus the whole
         quoted point list on the feed — a concatenation §4 and §5 made longer by putting
         anchors and buttons inside this root.
         The RAW authorName is deliberate: for an agent it reads `Agent · {Name}`, so a
         screen-reader user hears the marker. Stripping it would delete the disclosure from
         the one channel that carries no chip and no drained card. */
      aria-label={`Story by ${story.authorName}`}
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
              /* P1259 change 1 — `mode` comes from the lazy-mount hook: a thumbnail until
                 the card approaches the viewport, a live embed after. The wrapper is the
                 intersection target and the scroll anchor, so it cannot be dropped.
                 `role="presentation"` + stopPropagation because the card root navigates to
                 the story: without it, pressing play sends the reader to another page. */
              <div ref={player.containerRef} role="presentation" onClick={(e) => e.stopPropagation()}>
                <StoryMedia
                  ref={player.playerRef}
                  videoUrl={story.videoUrl}
                  durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
                  mode={player.mode}
                  onBlockedChange={player.onBlockedChange}
                  storyHref={`/story/${story.id}`}
                  className="mt-2 mb-2"
                  imageProps={story.imageUrl ? {
                    src: story.imageUrl,
                    authorName: story.authorName,
                    onClick: () => navigate(`/story/${story.id}`),
                    className: 'mt-2 mb-2',
                  } : undefined}
                />
              </div>
            )}

            {/* Story text */}
            <p
              ref={textRef}
              /* P1259 change 5 — ~3x the old `line-clamp-6`. Bodies of 545-858 characters were
                 being cut at roughly 190, so no one had yet read a filed agent story in place.
                 ARBITRARY VALUE, deliberately: Tailwind 3.4's default `lineClamp` scale is
                 1-6, so a bare `line-clamp-18` compiles to NOTHING and the clamp silently
                 disappears. That is not hypothetical — `line-clamp-8` on the profile has never
                 clamped anything, which is the real reason its "Show more" did nothing. */
              className={`text-foreground break-words text-sm ${textExpanded ? '' : 'line-clamp-[18]'}`}
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
                  onSeek={player.onSeek}
                  playerBlocked={player.playerBlocked}
                />
              </div>
            )}

            {/* P1259 change 2 — the two-sentence agent footer USED TO RENDER HERE and no
                longer does, on this surface and the five others. Founder, 2026-09-07:
                "i would remove it from stories and put only below desiption on profile of
                agents" — the repetition across every card in a feed is what stopped it
                being read at all, and one line per card still repeats.

                THE DISCLOSURE DID NOT MOVE WITHOUT A ROUTE. Two adversarial reviewers of
                the spec independently objected that removing the footer, while the AGENT
                chip is settled as deliberately not-a-link, would leave no clickable path
                to the disclosure at all. The answer is the byline NAME above, which
                navigates to the agent profile — where the disclosure now lives, visible on
                arrival rather than behind the info icon. That is why `onNameClick` on
                `AgentByline` is load-bearing on every one of these surfaces now and not a
                nicety: a surface that renders the name as a plain span has no route.

                What stays here is `AGENT · on {Full Name}`, so authorship is never
                unmarked even for a reader who never clicks. */}

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
                    /* P1270 §4 — THE SIX AUTHOR PROPS ABOVE ARE NO LONGER INERT, and the
                       open question this comment used to record is closed.

                       It said: "Whether the feed should carry the subject's stance is an
                       OPEN FOUNDER QUESTION recorded in the spec, not a settled piece of
                       §5." Founder decided it 2026-09-08 — the feed is the ONE surface
                       where a point carries several stories by different authors at once,
                       so it is the only place two authors can visibly disagree with nothing
                       saying so. That makes it the surface that needs the stance most.

                       The old comment's warning still holds and is why this needed no prop
                       change: the header captions a POSITION, and the position it captions
                       must be THE STORY AUTHOR'S. These six props are already
                       `story.author*`, and `getPointsForStories` now fills
                       `point.profileSubjectPosition` from `story_points.author_id` — the
                       same person. Supplying the stance from anyone else would caption one
                       author's identity with another's position, which is the mistake the
                       prop contract on QuotedPointCardProps exists to prevent.

                       The two surfaces now render the same header. The profile keeps its
                       own stance-above-the-point layout unchanged (founder: "profile stay
                       same"), so placement still differs by surface — only the missing
                       information is restored. */
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
