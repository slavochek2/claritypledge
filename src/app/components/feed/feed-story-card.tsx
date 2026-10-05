/**
 * @file feed-story-card.tsx
 * @description P491: Lightweight story card for the public feed.
 * Takes StoryWithAuthor (production type), renders author row, story text, tag pills.
 * Blue left border. Opens /story/:id through its `Details →` button only (P1415).
 */

import { useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  CardCountText,
  CardExpander,
  CardFooterActions,
  CardMenu,
  CardSlotLink,
} from '@/app/components/shared/card-footer-controls';
import type { GroupPlayer } from '@/app/components/shared/source-group';
import { saveInOrder, useOnlineWriteGuard, writeFailureMessage } from '@/app/hooks/use-online-write-guard';
import { networkMark } from '@/lib/network-outcome';
import { pointsService } from '@/app/data/points-service';
import type { Position } from '@/app/types';
import { normalizeVideoQuotes } from '@/lib/video';
import { parseVideoUrl } from '@/lib/video';
import type { StoryWithAuthor, PointSummary } from '@/app/types';
import { useReturnState } from '@/app/hooks/use-return-state';

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
  /** P1401: start the story's video as soon as the card mounts — the featured story's
   *  "play" in its collapsed bar opens the card AND plays, instead of open-then-play. */
  autoPlay?: boolean;
  linkedPoints?: PointSummary[];
  /**
   * The signed-in viewer. Forwarded to `QuotedPointCard`, which renders its position
   * controls only for a known viewer, and decides whether the author's `+ Add a point` shows.
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
  autoPlay = false,
  currentUserId,
  groupPlayer,
  surface = 'feed',
}: FeedStoryCardProps) {
  const navigate = useNavigate();
  const textRef = useRef<HTMLParagraphElement>(null);
  // P1364 §5: remembered per visit — Back reopens what the reader had open (use-return-state.ts).
  const [textExpanded, setTextExpanded] = useReturnState(`feed-story-text:${story.id}`, false);
  const [pointsExpanded, setPointsExpanded] = useReturnState(`feed-story-points:${story.id}`, false);
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
  const player = useLazyStoryPlayer(!!parseVideoUrl(story.videoUrl) && !groupPlayer);
  const quoteSeek = groupPlayer ? groupPlayer.onSeek : player.onSeek;
  const quotePlayerBlocked = groupPlayer ? groupPlayer.playerBlocked : player.playerBlocked;
  const videoQuotes = normalizeVideoQuotes(story.videoQuotes);

  // P1401: onSeek(0) mounts the player if needed and plays from the start. Once, on mount.
  useEffect(() => {
    if (autoPlay && parseVideoUrl(story.videoUrl) && !groupPlayer) player.onSeek(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardId = useId(); // P1415: describes `Details →` by this card's name
  const openDetails = () => {
    navigate(`/story/${story.id}`);
  };

  const canWrite = useOnlineWriteGuard();

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
  const handlePointPosition = async (pointId: string, position: Position): Promise<boolean | undefined> => {
    if (!currentUserId || position === null) return;
    // P1369: /feed and /stake render cached cards offline. Resolving false makes the quoted
    // card take its optimistic selection back — a vote that did not land never looks saved.
    if (!canWrite()) return false;
    const sentAt = networkMark();
    try {
      // Bounded: a captive portal can leave the request unanswered for good.
      await saveInOrder(`position:${pointId}`, () => pointsService.setPosition(pointId, currentUserId, position));
      return true;
    } catch (err) {
      toast.error(writeFailureMessage(err, 'Failed to save position.', sentAt));
      return false;
    }
  };

  return (
    /* P1415 — the card is NOT a control: tapping its body navigates nowhere, at any width.
       `Details →` in the footer opens the story; the links inside open what they name. So no
       role="button", tab stop, pointer cursor or "the whole card is a link" hover border. */
    <article
      /* -1, never 0: not a Tab stop, but a focus target — `SourceGroup`'s "Show N more" removes
         itself and hands focus to the first story it revealed (source-group.tsx). The ring shows
         only for that keyboard path, never on a tap. */
      tabIndex={-1}
      className={`bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
      /* P1212 — parity with profile-page-v2.tsx's StoryCardFull, in the accessibility layer.
         The card is announced by this name, never by its whole subtree (story text, counts,
         the expander label and the quoted point list).
         The RAW authorName is deliberate: for an agent it reads `Agent · {Name}`, so a
         screen-reader user hears the marker. Stripping it would delete the disclosure from
         the one channel that carries no chip and no drained card. */
      aria-label={`Story by ${story.authorName}`}
      /* P1364: a stable per-card handle for the Back-position e2e (first card fully in view). */
      data-testid={`feed-story-card-${story.id}`}
    >
      {/* P1415: the card's name, referenced by `Details →` (aria-describedby); `hidden`, so it is
          read only through that reference. */}
      <span id={cardId} hidden>{`Story by ${story.authorName}`}</span>
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
            {/* P1366 — the author block is the card's top row, so the `⋯` menu joins it on the
                right. The name truncates (`min-w-0 truncate`) and the menu never shrinks, so a
                long name at 320px ends in an ellipsis instead of running under the menu. */}
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="min-w-0">
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
                      className="font-semibold text-foreground hover:underline text-sm min-w-0 truncate"
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
              {/* Share only, the author included: the feed has no edit/delete (the profile does). */}
              <CardMenu
                type="story"
                id={story.id}
                surface={surface}
                title={`${story.authorName}'s story`}
                description={story.content.slice(0, 100)}
                className="-mt-2 -mr-2"
              />
            </div>

            {/* Supporting media. P1141: video wins when present; the image path is untouched.
                Not rendered inside a group — the group's one player stands in for it. */}
            {!groupPlayer && (story.videoUrl || story.imageUrl) && (
              /* P1259 change 1 — `mode` comes from the lazy-mount hook: a thumbnail until
                 the card approaches the viewport, a live embed after. The wrapper is the
                 intersection target and the scroll anchor, so it cannot be dropped.
                 `role="presentation"` + stopPropagation: the card root used to navigate to the
                 story (until P1415), and pressing play must never reach whatever hosts the card. */
              <div ref={player.containerRef} role="presentation" onClick={(e) => e.stopPropagation()}>
                <StoryMedia
                  ref={player.playerRef}
                  videoUrl={story.videoUrl}
                  durationSeconds={videoQuotes.durationSeconds}
                  mode={player.mode}
                  onActivate={player.onActivate}
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

                `stopPropagation`: the card root used to be a link to the story (until P1415),
                and a timecode click must never reach whatever hosts the card. */}
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
            <TagPills tags={story.tags} systemTags={story.systemTags} context="feed" activeTag={activeTag} className="mt-2" />

            {/* P1141: gated on identityPending too — the registry fails closed, and reading
                isAgent while it loads renders an agent story as a human one.
                `empty:hidden` — the share control used to share this row; with it moved out (the
                `⋯` menu since P1366), an agent story leaves the row empty and must not keep its
                margin. */}
            <div className="mt-2 flex items-center gap-2 empty:hidden">
              {!isAgent && !identityPending && <UnderstoodBadge count={story.understoodCount} size="xs" />}
            </div>
          </div>
        </div>
      </div>

      {/* P1296 item 1, laid out by P1366 — the footer, the same controls in the same order on
          /feed, /stake and the profile. Left: the solid point expander and the author's
          `+ Add a point`. Right: `Details →`. Share lives in the `⋯` up top.

          The row always renders — `/stake` once never loaded the links and so had no footer at
          all. Only the COUNT waits for the links, because `undefined` (not loaded) and `[]`
          (none linked) must not read alike; meanwhile a placeholder holds the row's height. */}
      <div
        role="presentation"
        /* FOUNDER DECISION 2026-09-29: the row starts at the card's left edge, in line with the
           avatar, mirroring `Details →` flush right — `px-4`. (It used to indent to the body
           column from `sm`, P1296.) Same on every list card. */
        className="flex flex-col gap-2 px-4 py-2.5 border-t border-border"
        onClick={(e) => e.stopPropagation()}
        data-testid="story-card-footer"
      >
        <CardFooterActions type="story" onDetails={openDetails} describedBy={cardId} loading={linkedPoints === undefined}>
          {linkedPoints && linkedPoints.length > 0 && (
            <CardExpander
              label={`${linkedPoints.length} ${linkedPoints.length === 1 ? 'point' : 'points'}`}
              expanded={pointsExpanded}
              onToggle={() => setPointsExpanded(!pointsExpanded)}
              testId="feed-story-point-expander"
            />
          )}
          {/* P580, on every surface — founder 2026-09-11: *"footer probably needs the 'add point'
              and 'add your story' when needed — same logic as in profile"*. Nobody else gets a
              slot on a story card: there is no "your point". */}
          {isAuthor && (
            <CardSlotLink kind="add-point" onClick={() => navigate(`/story/${story.id}?addPoint=true`)} />
          )}
          {linkedPoints?.length === 0 && !isAuthor && <CardCountText>0 points</CardCountText>}
        </CardFooterActions>

        {/* The expanded content renders through the SAME shared component the profile
            uses (extracted from `profile-page-v2.tsx` for exactly this). The first P1212 §5
            pass matched only the TRIGGER and rendered the points as bare `<button>` text
            here; founder, from a screenshot: "weird this is not consistent with rest?". */}
        {pointsExpanded && linkedPoints && linkedPoints.length > 0 && (
          /* The expanded points keep the body-column indent (16 + 52 = the old 68px). */
          <div className="sm:pl-[52px]">
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
          </div>
        )}
      </div>
    </article>
  );
}
