/**
 * @file feed-story-card.tsx
 * @description P491: Lightweight story card for the public feed.
 * Takes StoryWithAuthor (production type), renders author row, story text, tag pills.
 * Blue left border. Clickable → navigates to /story/:id.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
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
import { AgentByline } from '@/app/components/shared/agent-byline';
import { useLazyStoryPlayer } from '@/app/hooks/use-lazy-story-player';
import { useTextOverflow } from '@/app/hooks/use-text-overflow';
import { QuotedPointCard } from '@/app/components/shared/quoted-point-card';
import { ThreadLineGroup, ThreadLineItem } from '@/app/components/shared';
import { AddPointPill, CardOpenButton, CardShareButton } from '@/app/components/shared/card-footer-controls';
import type { GroupPlayer } from '@/app/components/shared/source-group';
import { pointsService } from '@/app/data/points-service';
import type { Position } from '@/app/types';
import { normalizeVideoQuotes } from '@/lib/video';
import type { StoryWithAuthor, PointSummary } from '@/app/types';

interface FeedStoryCardProps {
  story: StoryWithAuthor;
  activeTag?: string;
  /**
   * P1212 §5 — the points this story argues, batch-fetched by the page
   * (`getPointsForStories`, one query per page — never per card).
   *
   * Undefined means "not loaded", which renders no count. An empty array means
   * "loaded, none linked" and renders the `0 points` label. The distinction matters: a
   * card that flashes `0 points` while the links are still in flight reads as a fact
   * about the story rather than about the fetch.
   */
  linkedPoints?: PointSummary[];
  /**
   * The signed-in viewer. Forwarded to `QuotedPointCard`, which renders its position
   * controls only for a known viewer, and decides whether the author's `+ Add point` shows.
   * Omitting it is why the feed rendered a read-only slab where the profile rendered an
   * interactive card, from the same component (adversarial review, 2026-09-04) — and why
   * `/stake` did the same until P1296.
   */
  currentUserId?: string;
  /**
   * P1296 item 7 — this card sits inside a `SourceGroup`, whose single player stands in for
   * this card's own. The card then renders NO media box, and its timecodes seek the group's
   * player rather than mounting a second copy of the same video. Absent everywhere else.
   */
  groupPlayer?: GroupPlayer;
  /** Which list the card sits on — carried on `feed_card_shared`. */
  surface?: 'feed' | 'stake';
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

export function FeedStoryCard({
  story,
  activeTag,
  linkedPoints,
  currentUserId,
  groupPlayer,
  surface = 'feed',
}: FeedStoryCardProps) {
  const navigate = useNavigate();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [textExpanded, setTextExpanded] = useState(false);
  const [pointsExpanded, setPointsExpanded] = useState(false);
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);
  const isAuthor = !!currentUserId && currentUserId === story.authorId;

  /* P1259 change 6 — measured overflow, via the shared hook rather than this card's own
     one-shot effect. The old version measured on mount and on content change only, so a
     viewport resize or a late webfont left the answer stale. */
  const isOverflowing = useTextOverflow(textRef, [story.content]);

  /* P1259 change 1 — a real player on the feed, mounted lazily. Enabled only when there is a
     video to mount AND this card owns its media: inside a group the group's player stands in,
     and an enabled hook here would mount an embed nobody can see. */
  const player = useLazyStoryPlayer(!!story.videoUrl && !groupPlayer);
  const quoteSeek = groupPlayer ? groupPlayer.onSeek : player.onSeek;
  const quotePlayerBlocked = groupPlayer ? groupPlayer.playerBlocked : player.playerBlocked;
  const videoQuotes = normalizeVideoQuotes(story.videoQuotes);

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
      /* P1212 — parity with profile-page-v2.tsx's StoryCardFull, in the accessibility layer.
         A role="button" with no accessible name takes it from its SUBTREE, so without this the
         same story announces as a cleanly named control on the profile and as one button
         whose name is the story text plus the counts plus the expander label plus the whole
         quoted point list on the feed.
         The RAW authorName is deliberate: for an agent it reads `Agent · {Name}`, so a
         screen-reader user hears the marker. Stripping it would delete the disclosure from
         the one channel that carries no chip and no drained card. */
      aria-label={`Story by ${story.authorName}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        // P1212: only the CARD ITSELF activates on Enter/Space. Without this target check
        // the handler fires for a keydown on any control nested inside — the point
        // expander, a position button, a quote timecode, the share sheet (a portal, but
        // React still bubbles its events through this tree) — and because it calls
        // preventDefault() it CANCELS that control's own activation before navigating.
        //
        // Guarding at the root rather than per-control is the point: the alternative is
        // remembering to add stopPropagation to every interactive element this card will
        // ever contain.
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

            {/* Supporting media. P1141: video wins when present; the image path is untouched.
                Not rendered inside a group — the group's one player stands in for it. */}
            {!groupPlayer && (story.videoUrl || story.imageUrl) && (
              /* P1259 change 1 — `mode` comes from the lazy-mount hook: a thumbnail until
                 the card approaches the viewport, a live embed after. The wrapper is the
                 intersection target and the scroll anchor, so it cannot be dropped.
                 `role="presentation"` + stopPropagation because the card root navigates to
                 the story: without it, pressing play sends the reader to another page. */
              <div ref={player.containerRef} role="presentation" onClick={(e) => e.stopPropagation()}>
                <StoryMedia
                  ref={player.playerRef}
                  videoUrl={story.videoUrl}
                  durationSeconds={videoQuotes.durationSeconds}
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
              /* P1296 item 6 — 40 lines of `text-base`, on every story and point body.
                 FOUNDER DECISION 2026-09-11: *"lets do 40 lines everywhere on all surfaces
                 for story and point text"*. Measured on the eight real aisafety1 bodies at
                 16px/24px: 18-28 lines at a 375px column, 21-34 at 320px — so every real
                 story shows in full, and "show more" appears only for longer text.
                 ARBITRARY VALUE, deliberately: Tailwind 3.4's default `lineClamp` scale is
                 1-6, so a bare `line-clamp-40` compiles to NOTHING and the clamp silently
                 disappears (the P1259 trap). */
              className={`text-foreground break-words text-base ${textExpanded ? '' : 'line-clamp-[40]'}`}
            >
              {/* P1212 §1 — the label is StoryVideoQuotes' own heading, never inline prose. */}
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
                P1348 — never folded (StoryVideoQuotes owns that).
                Timecodes seek this card's player, or the group's player inside a group.

                `stopPropagation` because the card root is a link to the story: without it,
                clicking a timecode navigates to the story instead. */}
            {videoQuotes.quotes.length > 0 && story.videoUrl && (
              <div role="presentation" onClick={(e) => e.stopPropagation()}>
                <StoryVideoQuotes
                  videoUrl={story.videoUrl}
                  quotes={videoQuotes.quotes}
                  onSeek={quoteSeek}
                  playerBlocked={quotePlayerBlocked}
                />
              </div>
            )}

            {/* P1259 change 2 — the two-sentence agent footer USED TO RENDER HERE and no
                longer does, on this surface and the five others. Founder, 2026-09-07:
                "i would remove it from stories and put only below desiption on profile of
                agents" — the repetition across every card in a feed is what stopped it
                being read at all, and one line per card still repeats.

                THE DISCLOSURE DID NOT MOVE WITHOUT A ROUTE. The answer is the byline NAME
                above, which navigates to the agent profile — where the disclosure now lives,
                visible on arrival rather than behind the info icon. That is why
                `onNameClick` on `AgentByline` is load-bearing on every one of these surfaces
                now and not a nicety: a surface that renders the name as a plain span has no
                route.

                What stays here is `AGENT · on {Full Name}`, so authorship is never
                unmarked even for a reader who never clicks. */}

            {/* Tag pills */}
            <TagPills tags={story.tags} context="feed" activeTag={activeTag} className="mt-2" />

            {/* P1141: gated on identityPending too — the registry fails closed, and reading
                isAgent while it loads renders an agent story as a human one.
                `empty:hidden` — the share control used to share this row; with it moved to the
                footer, an agent story leaves the row empty and must not keep its margin. */}
            <div className="mt-2 flex items-center gap-2 empty:hidden">
              {!isAgent && !identityPending && <UnderstoodBadge count={story.understoodCount} size="xs" />}
            </div>
          </div>
        </div>
      </div>

      {/* P1296 item 1 — the footer, the same controls in the same order on /feed, /stake and
          the profile. Left: the point count (expands in place) and the author's `+ Add point`.
          Right: share, then open-in-new.

          It used to render only once the linked points had loaded, and `/stake` never loaded
          them, so a stake card had no footer at all and its share control floated above the
          divider in the body. The row now always renders; only the COUNT waits for the
          links, because `undefined` (not loaded) and `[]` (none linked) must not read alike. */}
      <div
        role="presentation"
        /* From `sm` the row starts at the body's column (16 padding + 40 avatar + 12 gap), the
           profile card's `sm:pl-[68px]` — founder, UAT: *"move in a bit? to be consistent on all
           surfaces"*. Below `sm` it stays at the edge, as the profile's does. */
        className="flex flex-col gap-2 pl-4 sm:pl-[68px] pr-4 py-2.5 border-t border-border"
        onClick={(e) => e.stopPropagation()}
        data-testid="story-card-footer"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {linkedPoints !== undefined && (
              linkedPoints.length > 0 ? (
                <button
                  onClick={() => setPointsExpanded(!pointsExpanded)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors min-h-[40px]"
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
              )
            )}
            {/* P580, on every surface now — founder 2026-09-11: *"footer probably needs the
                'add point' and 'add your story' when needed — same logic as in profile"*. */}
            {isAuthor && <AddPointPill onClick={() => navigate(`/story/${story.id}?addPoint=true`)} />}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <CardShareButton
              type="story"
              id={story.id}
              surface={surface}
              title={`${story.authorName}'s story`}
              description={story.content.slice(0, 100)}
            />
            <CardOpenButton type="story" onOpen={handleClick} />
          </div>
        </div>

        {/* The expanded content renders through the SAME shared component the profile
            uses (extracted from `profile-page-v2.tsx` for exactly this). The first P1212 §5
            pass matched only the TRIGGER and rendered the points as bare `<button>` text
            here; founder, from a screenshot: "weird this is not consistent with rest?". */}
        {pointsExpanded && linkedPoints && linkedPoints.length > 0 && (
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
                  /* P1270 §4 — these six author props caption THE STORY AUTHOR'S stance on
                     the point: `getPointsForStories` fills `point.profileSubjectPosition`
                     from `story_points.author_id`, the same person. Supplying the stance
                     from anyone else would caption one author's identity with another's
                     position, which is the mistake QuotedPointCardProps exists to prevent.
                     The profile keeps its own stance-above-the-point layout (founder:
                     "profile stay same"); only the missing information is restored here. */
                />
              </ThreadLineItem>
            ))}
          </ThreadLineGroup>
        )}
      </div>
    </div>
  );
}
