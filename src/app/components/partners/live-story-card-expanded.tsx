'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Pin, Ear } from 'lucide-react';
import type { StoryWithPoints, PointSummary, PositionType } from '@/app/types';
import { toSevenPointCounts } from '@/app/utils/position-helpers';
import { formatTimeAgo } from '@/app/utils/format-time';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import {
  PositionButtons,
  PositionBadge,
  ThreadLineGroup,
  ThreadLineItem,
} from '@/app/components/shared';
import { linkifyText } from '@/app/utils/linkify';
import { TagPills } from '@/app/components/shared/tag-pills';
import { StoryMedia } from '@/app/components/shared/story-media';
import { StoryVideoQuotes } from '@/app/components/shared/story-video-quotes';
import { AgentByline } from '@/app/components/shared/agent-byline';
import { AgentStoryFooter } from '@/app/components/shared/agent-story-footer';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import { normalizeVideoQuotes, quotesNotInStoryText } from '@/lib/video';
import { stripQuoteLabel } from '@/lib/story-quotes';
import { stripAgentPrefix, stripHashtags } from '@/lib/utils';

interface LiveStoryCardExpandedProps {
  story: StoryWithPoints;
  /** When true, the current user owns this story (accepted but no-op after P733 CTA removal) */
  isOwnStory?: boolean;
  /** P490: When true, user is a guest (unauthenticated) — shows "sign up to save" hint instead of CTA */
  isGuest?: boolean;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  className?: string;
  /** When set, overrides authorName in the position badge (used in host view to show partner's name) */
  badgePersonName?: string;
  /** Ear count for badgePersonName — shown in badge when host view is active */
  badgePersonEarsCount?: number;
  /** Avatar URL for badgePersonName — shown when badge person has a profile photo */
  badgePersonAvatarUrl?: string;
  /** Avatar color for badgePersonName — used as fallback when no photo */
  badgePersonAvatarColor?: string;
  /** Whether badge person has pledged — shows blue ring when true */
  badgePersonHasPledged?: boolean;
  /** When true, points are expanded on first render and on story change.
   * Must be a literal constant at each call site — not derived from changing state.
   * If it changed independently of story.id, the reset effect (P799) would use a stale value. */
  defaultExpanded?: boolean;
  /** P661: When true, PositionButtons hidden, story CTA hidden. Does NOT auto-expand (use defaultExpanded for that). Used in letter prediction walk. */
  readOnly?: boolean;
  /** P705: When true, story text starts expanded (full text visible). Defaults to readOnly for backward compat. */
  defaultStoryExpanded?: boolean;
  /** P673: When true, hide the points section entirely (footer trigger + expanded points). Used in letters where points are shown as separate step cards. */
  hidePoints?: boolean;
  /** Slot rendered inside the card at the bottom — used for "Open Story" link in letter results */
  footerSlot?: React.ReactNode;
  /** P711: When false (default true), hides author PositionBadge in letter-mode headers.
   * Non-letter callers always show badge when profileSubjectPosition exists. */
  revealed?: boolean;
  /** P847: Clear viewer's persisted position for the given point. Wire onClear once at page level. Do not instantiate a per-row guard. */
  onClear?: (pointId: string) => void;
  /** P852 Round-E: optional className applied to the story image wrapper.
   * Use for height caps (e.g., `max-h-[50vh]`) on tall-image surfaces like letter reading. */
  imageClassName?: string;
  /** P852 Round-E: image fit policy. Defaults to 'cover' (4:3 crop, current behavior).
   * Use 'contain' for diagram-style images where edges must remain visible. */
  imageFit?: 'cover' | 'contain';
  /** P904: Render extra content inside each point's row (PointRow.children slot).
   * Used by the letter results page to inject the "Explain your position" affordance. */
  renderPointChildren?: (pointId: string) => React.ReactNode;
}

const STORY_THRESHOLD = 100;

export function LiveStoryCardExpanded({
  story,
  isGuest = false,
  onPositionSelect,
  className,
  badgePersonName,
  badgePersonEarsCount,
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  defaultExpanded = false,
  readOnly = false,
  defaultStoryExpanded,
  hidePoints = false,
  footerSlot,
  revealed = true,
  onClear,
  imageClassName,
  imageFit = 'cover',
  renderPointChildren,
}: LiveStoryCardExpandedProps) {
  // defaultStoryExpanded falls back to readOnly for backward compat (readOnly=true → story shown in full)
  const initialStoryExpanded = defaultStoryExpanded ?? readOnly;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [storyExpanded, setStoryExpanded] = useState(initialStoryExpanded);

  // Reset points-expand only when the story itself changes — not on prop changes,
  // which would override the user's manual collapse on every phase transition (P799).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setIsExpanded(defaultExpanded); }, [story.id]);

  // Reset story-text expand when story or read-only props change (separate concern).
  useEffect(() => {
    setStoryExpanded(defaultStoryExpanded ?? readOnly);
  }, [story.id, defaultStoryExpanded, readOnly]);

  // P1212 §4b — agent-ness comes from the story's OWN author id, never from `authorName`.
  //
  // This is not defensive style, it is the one thing that makes a byline here safe. On a
  // sealed letter `authorName` is the SENDER's name, not the story author's: the seal RPC
  // stores no story-author identity at all, so `snapshotToStoryWithPoints` sets
  // `authorId: ''` and derives the display name from the letter's sender
  // (`story-walk.tsx` — "Author of the story = sender"). Deriving the machine marker from
  // that name would put a machine byline on a human's name, or vice versa — false
  // attribution on the surface that actually gets sent to another person.
  //
  // With the id absent, `isAgentAccountId('')` is false and no agent chrome renders on a
  // sealed letter. That is correct today rather than merely safe: `doc_stories` INSERT
  // requires `stories.author_id = auth.uid()`, so a sender can only attach their OWN
  // stories and an agent story cannot reach that path. The live-session call sites, which
  // pass real story rows, do carry a real id and do render the contract.
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);

  // P1212 §4b — the quote block, minus anything the frozen prose already prints.
  // `quotesAlreadyInContent` is the pre-§1 snapshot case: quote bodies baked into
  // `storyText` AND frozen again in `videoQuotes`. See `quotesNotInStoryText`.
  const allQuotes = normalizeVideoQuotes(story.videoQuotes).quotes;
  const quotesToRender = quotesNotInStoryText(story.content, allQuotes);
  const quotesAlreadyInContent = allQuotes.length > 0 && quotesToRender.length < allQuotes.length;

  // P1212 §1 — the label is StoryVideoQuotes' own heading. Strip it from the prose
  // exactly when that block renders, so the heading appears once rather than twice.
  // When no block renders — a legacy letter whose bodies are already inline — the
  // frozen label stays, because it still has bodies under it.
  const contentForDisplay =
    quotesToRender.length > 0 ? stripQuoteLabel(story.content) : story.content;
  const strippedContent = stripHashtags(contentForDisplay, story.tags);
  const isLongStory = strippedContent.length > STORY_THRESHOLD;
  const displayText =
    isLongStory && !storyExpanded
      ? strippedContent.slice(0, STORY_THRESHOLD) + '…'
      : strippedContent;

  return (
    <div
      data-testid="live-story-card-expanded"
      // P1212 §4b legacy — observable so a snapshot fixture can assert WHICH branch ran,
      // not merely that the rendered output happened to look right. Present only on a
      // pre-§1 snapshot whose frozen prose already prints at least one of its quotes.
      {...(quotesAlreadyInContent ? { 'data-legacy-quotes-inline': 'true' } : {})}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
      className={`rounded-lg border-l-4 border-l-blue-500 border border-gray-200 bg-white shadow-sm shrink-0 overflow-hidden ${className ?? ''}`}
    >
      {/* Main content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <GravatarAvatar
            name={story.authorName}
            photoUrl={story.authorAvatarUrl}
            avatarColor={story.authorAvatarColor}
            size="sm"
            isPledger={story.authorHasPledged ?? false}
            isAgent={isAgent}
            identityPending={identityPending}
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            {/* P1212 §4b — this surface carried NONE of the agent disclosure contract: a
                machine-authored reading of a real named person rendered as a plain bold
                name, with no chip, no footer and no link to /machines, in the context
                where the reader has the least surrounding signal (no site chrome, no
                profile to click through). It is also the surface actually sent to another
                person. AgentByline is the one place an agent account is named, and it
                carries the MachineChip with it.

                The ear count is suppressed for agents for the reason P1141 suppresses it
                everywhere else: an agent cannot sit in a live session, so the number is
                permanently 0 and reads as "nobody understood this" rather than "this
                metric does not describe an agent story". Gated on identityPending too —
                the registry fails closed, and an unresolved fetch must not print a human
                trust affordance on a machine account. */}
            <div className="flex items-center gap-1.5 mb-0.5">
              {isAgent ? (
                <AgentByline name={story.authorName} className="min-w-0 flex-1" />
              ) : (
                <span className="font-semibold text-gray-900 text-sm">{story.authorName}</span>
              )}
              {!isAgent && !identityPending && (
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                  <Ear size={12} />
                  {story.authorEarsCount ?? 0}
                </span>
              )}
            </div>
            {(story.authorRole || story.createdAt || story.visibility) && (
              <p className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1">
                <span>{story.authorRole ? `${story.authorRole} · ` : ''}{story.createdAt ? formatTimeAgo(story.createdAt) : ''}</span>
                {story.visibility && <InlineVisibilityIcon visibility={story.visibility} />}
              </p>
            )}
            {/* P1212 §4b — was `StoryImage` alone, so the video was dropped on the one
                surface that gets sent to someone. Same defect class as the profile card.
                `StoryMedia` picks video over image and forwards the image path untouched,
                so a story with no parseable video renders exactly the markup it did
                before, `imageClassName` and `fit` included. `thumbnail`, not `player`:
                only a story's dedicated detail surface mounts a live embed. */}
            {(story.videoUrl || story.imageUrl) && (
              <div className="mb-2">
                <StoryMedia
                  videoUrl={story.videoUrl}
                  durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
                  mode="thumbnail"
                  storyHref={`/story/${story.id}`}
                  imageProps={story.imageUrl ? {
                    src: story.imageUrl,
                    authorName: story.authorName,
                    className: imageClassName,
                    fit: imageFit,
                  } : undefined}
                />
              </div>
            )}
            <p id={`live-story-text-${story.id}`} className="text-sm text-gray-900 leading-snug break-words">{linkifyText(displayText)}</p>
            {isLongStory && (
              <button
                type="button"
                onClick={() => { setStoryExpanded((prev) => { if (!prev) setIsExpanded(false); return !prev; }); }}
                aria-expanded={storyExpanded}
                aria-controls={`live-story-text-${story.id}`}
                className="text-sm text-blue-600 hover:text-blue-700 mt-1"
              >
                {storyExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>

        {/* P1212 §4b — the supporting quotes. This component had NO quote render path at
            all: zero references to `video_quotes` anywhere in the file. Today the quotes
            are readable here only because their bodies sit inline in `story.content`, so
            the moment §1 moves them out of the prose this surface would show the
            the quote-label heading with nothing beneath it. Rendering them
            here is the precondition §1 ships behind, not a follow-up.

            `quotesToRender` excludes any quote the prose already prints — see
            `quotesNotInStoryText`. Without that filter, adding this block would make every
            letter sealed before §1 render its quotes TWICE, since the seal freezes the
            prose and the quote array independently and snapshots are immutable.

            No `onSeek`: this card renders a thumbnail, not a player, so there is nothing to
            seek in place. StoryVideoQuotes falls back to open-at-timestamp links, which
            keeps the rule that no timecode is shown where clicking it does nothing. */}
        {story.videoUrl && quotesToRender.length > 0 && (
          <div className="mt-2 pl-4 sm:pl-[52px] pr-4">
            <StoryVideoQuotes
              videoUrl={story.videoUrl}
              quotes={quotesToRender}
              subjectName={stripAgentPrefix(story.authorName)}
            />
          </div>
        )}

        {/* P1212 §4b — level 2 of the three attribution levels, on the surface that had
            none. `hasQuotes` asks whether the reader can see quotes ON THIS PAGE at all,
            which includes the legacy case where they are inline in the prose — the
            footer's "except the quotes" clause is true either way, and false only when the
            story genuinely has none. */}
        {isAgent && !identityPending && (
          <div className="px-4 pl-4 sm:pl-[52px]">
            <AgentStoryFooter name={story.authorName} hasQuotes={allQuotes.length > 0} />
          </div>
        )}

        {/* P491: Tag pills (display-only in live context) */}
        {story.tags && story.tags.length > 0 && (
          <TagPills tags={story.tags} context="live" className="mt-2 pl-[52px]" />
        )}
      </div>

      {/* Footer — "N points" expand trigger + optional right action (hidden when hidePoints) */}
      {story.points.length > 0 && !hidePoints && (
        <div
          role="presentation"
          className="flex items-center justify-between pl-4 sm:pl-[52px] pr-2 py-2.5 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => { setIsExpanded((prev) => { if (!prev) setStoryExpanded(false); return !prev; }); }}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>
              {story.points.length} {story.points.length === 1 ? 'point' : 'points'}
            </span>
          </button>
          {footerSlot}
        </div>
      )}

      {/* Expanded points — ThreadLine for all counts (even single point needs
          the connecting line to visually anchor it to the parent story card). */}
      {isExpanded && story.points.length > 0 && !hidePoints && (
        <div className="px-3 pb-3">
          <ThreadLineGroup>
            {story.points.map((point, index) => (
              <ThreadLineItem key={point.id} isLast={index === story.points.length - 1}>
                <PointRow
                  point={point}
                  authorName={story.authorName}
                  authorAvatarUrl={story.authorAvatarUrl}
                  authorAvatarColor={story.authorAvatarColor}
                  authorHasPledged={story.authorHasPledged}
                  authorEarsCount={story.authorEarsCount}
                  onPositionSelect={onPositionSelect}
                  badgePersonName={badgePersonName}
                  badgePersonEarsCount={badgePersonEarsCount}
                  badgePersonAvatarUrl={badgePersonAvatarUrl}
                  badgePersonAvatarColor={badgePersonAvatarColor}
                  badgePersonHasPledged={badgePersonHasPledged}
                  isGuest={isGuest}
                  readOnly={readOnly}
                  revealed={revealed}
                  onClear={onClear ? () => onClear(point.id) : undefined}
                >
                  {renderPointChildren?.(point.id)}
                </PointRow>
              </ThreadLineItem>
            ))}
          </ThreadLineGroup>
        </div>
      )}

      {/* footerSlot fallback — shown only when there are no points (inline slot handled above) */}
      {footerSlot && (story.points.length === 0 || hidePoints) && (
        <div className="border-t border-gray-100">
          {footerSlot}
        </div>
      )}
    </div>
  );
}

export function PointRow({
  point,
  authorName,
  authorAvatarUrl,
  authorAvatarColor,
  authorHasPledged,
  authorEarsCount,
  onPositionSelect,
  badgePersonName,
  badgePersonEarsCount,
  badgePersonAvatarUrl,
  badgePersonAvatarColor,
  badgePersonHasPledged,
  isGuest = false,
  readOnly = false,
  letterMode = false,
  disablePositionButtons = false,
  revealed = false,
  onClear,
  children,
}: {
  point: PointSummary;
  authorName: string;
  authorAvatarUrl?: string;
  authorAvatarColor?: string;
  authorHasPledged?: boolean;
  authorEarsCount?: number;
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  badgePersonName?: string;
  badgePersonEarsCount?: number;
  badgePersonAvatarUrl?: string;
  badgePersonAvatarColor?: string;
  badgePersonHasPledged?: boolean;
  isGuest?: boolean;
  readOnly?: boolean;
  /** Letter context: hides story CTA, guest hint, tag pills, visibility icon */
  letterMode?: boolean;
  /** When true, position buttons render but are visually disabled (no hover/click) */
  disablePositionButtons?: boolean;
  /** P711: When true (with letterMode), shows author PositionBadge. Default false (engage = no badge).
   * In non-letter mode, badge always shows when profileSubjectPosition exists. */
  revealed?: boolean;
  // P847: Wire onClear once at page level. Do not instantiate a per-row guard.
  onClear?: () => void;
  /** Render slot after point content (e.g., Submit button, position reveal badges) */
  children?: React.ReactNode;
}) {
  // Local state so button highlights immediately on click, independent of the
  // frozen selectedStoryData snapshot. Echoes to onPositionSelect for liveState sync.
  const [userPosition, setUserPosition] = useState<PositionType | null>(point.userPosition ?? null);

  // Sync from prop when liveState updates (e.g. after confirm removes position via guard dialog)
  useEffect(() => {
    setUserPosition(point.userPosition ?? null);
  }, [point.userPosition]);

  const handlePositionClick = (position: PositionType) => {
    const next = userPosition === position ? null : position; // toggle same position off
    // Optimistically update immediately (both select and deselect).
    // /live sessions with confirm dialogs rely on useEffect sync from liveState after confirm.
    setUserPosition(next);
    onPositionSelect?.(point.id, next);
    // P451: Story CTA intentionally omitted here — /live has its own post-session story entry point
  };

  return (
    <div className="w-full text-left">
      {/* Position badge above point — shows badge person's stance (author for partner view, partner for host view).
          In letter mode: always renders when authorName exists (identity visible in engage; badge gated by revealed).
          In non-letter mode: renders only when profileSubjectPosition exists (unchanged behavior). */}
      {((letterMode && authorName) || point.profileSubjectPosition) && (
        <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
          <GravatarAvatar
            name={badgePersonName ?? authorName}
            photoUrl={badgePersonName ? badgePersonAvatarUrl : authorAvatarUrl}
            avatarColor={badgePersonName ? badgePersonAvatarColor : authorAvatarColor}
            isPledger={badgePersonName ? (badgePersonHasPledged ?? false) : (authorHasPledged ?? false)}
            size="sm"
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{badgePersonName ?? authorName}</span>
          <span className="inline-flex items-center gap-0.5 text-gray-600 text-xs">
            <Ear size={12} />
            {badgePersonName ? (badgePersonEarsCount ?? 0) : (authorEarsCount ?? 0)}
          </span>
          {point.profileSubjectPosition && (!letterMode || revealed) && (
            <PositionBadge position={point.profileSubjectPosition} />
          )}
        </div>
      )}

      {/* Point content — full text, always visible */}
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
            <Pin size={12} className="rotate-45" />
          </div>
          <p className="text-sm text-gray-800 flex-1 min-w-0 break-words">
            {!letterMode && <InlineVisibilityIcon visibility={point.visibility} />}{!letterMode && ' '}{linkifyText(stripHashtags(point.statement, point.tags))}
          </p>
        </div>

        {!letterMode && point.tags?.length > 0 && <TagPills tags={point.tags} context="live" className="mt-1" />}
        <PositionButtons
          userPosition={userPosition}
          counts={toSevenPointCounts(point.positionCounts)}
          onPositionClick={handlePositionClick}
          compact
          narrow
          disabled={readOnly || disablePositionButtons}
          onClear={onClear}
        />

        {/* P490: Guest hint — positions are ephemeral, prompt to sign up */}
        {!letterMode && !readOnly && isGuest && userPosition && (
          <div className="border-t border-gray-200 pt-2">
            <p className="text-xs text-gray-500">
              Position shared live — sign up to save it
            </p>
          </div>
        )}

        {/* Render slot for letter-specific content (Submit button, position reveal) */}
        {children}
      </div>
    </div>
  );
}
