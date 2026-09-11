/**
 * @file source-group.tsx
 * @description P1296 item 7 — one video, its player mounted once, and every story built on it
 * underneath. Rendered on `/feed` Stories, `/stake/:tag` Stories and the profile's Stories tab.
 *
 * The design is the one the founder chose on the `/tree/stake-grouping` artifact, option (b),
 * after three passes: *"I do like the grouping"*, *"if it's group, then it has to look like a
 * group"*, *"show more stories... otherwise people just scroll and scroll"*.
 *
 * THE PLAYER BELONGS TO THE GROUP. Member cards render no media box of their own and hand their
 * timecodes to this player instead of each unfolding a second copy of the same video — which is
 * the difference between a group and a list that happens to be sorted.
 *
 * THE CARD IS A RENDER PROP, so `FeedStoryCard` and the profile's `StoryCardFull` both sit
 * inside it unchanged in shape. A group removes a PLAYER, never a card's controls: every member
 * keeps its full footer, its folded quotes and its points.
 */
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { StoryMedia } from '@/app/components/shared/story-media';
import { useLazyStoryPlayer } from '@/app/hooks/use-lazy-story-player';
import { normalizeVideoQuotes } from '@/lib/video';

/** What a member card needs from the group in place of its own player. */
export interface GroupPlayer {
  onSeek: (seconds: number) => void;
  playerBlocked: boolean;
}

/** How many stories a group shows before the rest go behind one control. */
const GROUP_PREVIEW = 2;

interface SourceGroupProps<T> {
  stories: T[];
  renderStory: (story: T, groupPlayer: GroupPlayer) => ReactNode;
}

export function SourceGroup<T extends { id: string; videoUrl?: string | null; videoQuotes?: unknown }>({
  stories,
  renderStory,
}: SourceGroupProps<T>) {
  const lead = stories[0];
  const player = useLazyStoryPlayer(!!lead?.videoUrl);
  const [showAll, setShowAll] = useState(false);
  const headingId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const focusRevealedRef = useRef(false);

  /* The "Show N more" control removes itself when pressed, so without this a keyboard user's
     focus falls to <body> and they start again from the top of the page. It goes to the first
     story it revealed instead. Cards announce themselves as "Story by …" (their root's
     aria-label), which is how the revealed one is found. */
  useEffect(() => {
    if (!showAll || !focusRevealedRef.current) return;
    focusRevealedRef.current = false;
    listRef.current?.querySelectorAll<HTMLElement>('[aria-label^="Story by"]')[GROUP_PREVIEW]?.focus();
  }, [showAll]);

  if (!lead) return null;

  const hidden = showAll ? 0 : Math.max(0, stories.length - GROUP_PREVIEW);
  const visible = hidden > 0 ? stories.slice(0, GROUP_PREVIEW) : stories;
  const groupPlayer: GroupPlayer = { onSeek: player.onSeek, playerBlocked: player.playerBlocked };

  return (
    /* The tray is `bg-muted`, not a translucent tint: visual QA on the artifact measured
       `bg-muted/30` at about 1.03:1 over white — invisible — so the group's edge read as a
       hairline alone. Side padding is tighter on phones because every pixel comes out of the
       cards' text column. */
    <section
      aria-labelledby={headingId}
      data-testid="source-group"
      className="rounded-lg border border-border bg-muted px-2 py-3 sm:p-3"
    >
      {/* The count and nothing else (founder: *"too much text that is not needed?"*). The
          player names the video once it mounts; the bylines name the people. It reads the same
          whether one author or several. */}
      <p id={headingId} className="mb-2 text-sm font-semibold text-foreground" data-testid="source-group-heading">
        {stories.length} stories from this video
      </p>

      <div ref={player.containerRef}>
        <StoryMedia
          ref={player.playerRef}
          videoUrl={lead.videoUrl}
          durationSeconds={normalizeVideoQuotes(lead.videoQuotes).durationSeconds}
          mode={player.mode}
          onBlockedChange={player.onBlockedChange}
          storyHref={`/story/${lead.id}`}
        />
      </div>

      {/* Indented under a rule from 640px up; NOT below it. Measured at 320px on the artifact,
          the tray plus rule plus indent cost 36px, which wrapped agent bylines onto two lines on
          grouped cards only and pushed an opened point's stance badge to the card's border. */}
      <div ref={listRef} className="mt-3 space-y-3 sm:border-l-2 sm:border-border sm:pl-5">
        {visible.map((story) => (
          <Fragment key={story.id}>{renderStory(story, groupPlayer)}</Fragment>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => {
              focusRevealedRef.current = true;
              setShowAll(true);
            }}
            data-testid="source-group-show-more"
            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground transition-colors hover:border-blue-300 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown size={14} aria-hidden="true" />
            Show {hidden} more {hidden === 1 ? 'story' : 'stories'}
          </button>
        )}
      </div>
    </section>
  );
}
