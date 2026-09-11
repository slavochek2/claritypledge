/**
 * @file stake-grouping-demo.tsx
 * @module app/pages/tree
 *
 * P1296 item 8 — the repeat-source artifact, second pass. Route: `/tree/stake-grouping` (DEV only).
 *
 * WHAT THIS IS FOR. `/stake/aisafety1?tab=stories` renders eight stories built on four
 * videos, so three of them mount the same video twice or three times. The spec defers one
 * call to "after artifacts exist": whether a repeated source should (a) COLLAPSE on its
 * later appearances, or (b) GROUP its stories under one heading with the player shown once.
 *
 * WHY IT RENDERS THE REAL CARD. The thing being judged is density — how much vertical space
 * a repeated video costs, and what the page reads like once that cost is paid three times.
 * A hand-drawn approximation cannot answer that, so this mounts the SHIPPING `FeedStoryCard`
 * against a frozen snapshot of prod's eight `aisafety1` stories (see `aisafety1-fixture.ts`).
 * Approving what you see here approves the component that ships.
 *
 * ── WHAT CHANGED SINCE THE FIRST PASS ───────────────────────────────────────────────────
 *
 * The first version faked the fold with a CSS rule that hid the media box. Everything the
 * founder asked for next was a thing that rule could not do, so the fold is now real and
 * lives in the card itself, behind opt-in props no shipping call site passes:
 *
 *   1. "how do I uncollapse it?" — a collapsed source is now a labelled control that says
 *      whose card holds the video and gives it back on click.
 *   2. "if we collapse, we collapse both" — the supporting quotes fold too, behind a toggle
 *      carrying their count. It is a page-level switch here because the founder's question
 *      is bigger than this page: *"generally supporting quotes, maybe we collapse
 *      everywhere"*. Turn it off on the Today tab to see today's /feed with quotes folded.
 *   3. "it doesn't work — I mean on the timestamp" — a timecode on a collapsed card now
 *      opens the fold and seeks its player; inside a group it seeks the group's player.
 *   4. "if it's group, then it has to look like a group" — group members are indented
 *      under a rule, and long groups show two stories with the rest behind one control.
 *
 * WHAT IS STILL SIMULATED. Nothing about the card. Only the page is a prototype: the
 * variants, the toggles, and the fixture standing in for a live `/stake` fetch.
 *
 * WHY TABS AND NOT THREE COLUMNS. Side-by-side would squeeze each variant to a third of the
 * feed's real width, and the whole question is how the real width reads. Each tab renders at
 * `max-w-2xl`, which is what `/stake` and `/feed` actually use.
 */
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { StoryMedia } from '@/app/components/shared/story-media';
import { useLazyStoryPlayer } from '@/app/hooks/use-lazy-story-player';
import { AgentAccountsContext } from '@/app/contexts/agent-accounts-context';
import { stripAgentPrefix } from '@/lib/utils';
import { normalizeVideoQuotes } from '@/lib/video';
import type { StoryWithAuthor } from '@/app/types';
import {
  AISAFETY1_STORIES,
  AISAFETY1_LINKED_POINTS,
  AGENT_PROFILE_IDS,
  AGENT_OPERATOR_NAME,
} from './aisafety1-fixture';

/**
 * The app-wide registry is fetched from whichever Supabase project the app points at, and
 * local dev points at TEST — which does not contain these four prod agent ids. Without this
 * override every card would render agent-authored content as a person's, changing the card's
 * whole visual weight and so changing the very thing being judged. Frozen, never loading.
 */
const AGENT_FIXTURE = {
  isAgentAccountId: (id?: string | null) => (id ? AGENT_PROFILE_IDS.has(id) : false),
  operatorNameFor: (id?: string | null) => (id && AGENT_PROFILE_IDS.has(id) ? AGENT_OPERATOR_NAME : null),
  isLoading: false,
};

const FEED_COLUMN = 'mx-auto w-full max-w-2xl px-4';

/** How many stories a group shows before the rest go behind one control. */
const GROUP_PREVIEW = 2;

function linkedPointsFor(storyId: string) {
  return AISAFETY1_LINKED_POINTS[storyId] ?? [];
}

function subjectOf(story: StoryWithAuthor) {
  return stripAgentPrefix(story.authorName) ?? story.authorName;
}

interface CardProps {
  story: StoryWithAuthor;
  quotesCollapsed: boolean;
  sourceCollapsed?: { expandLabel?: string; onSeek?: (seconds: number) => void };
}

function Card({ story, quotesCollapsed, sourceCollapsed }: CardProps) {
  return (
    <FeedStoryCard
      story={story}
      activeTag="aisafety1"
      linkedPoints={linkedPointsFor(story.id)}
      quotesCollapsed={quotesCollapsed}
      sourceCollapsed={sourceCollapsed}
    />
  );
}

/* ─────────────────────────────── variant: today ─────────────────────────────── */

/** Exactly what `/stake/aisafety1?tab=stories` renders now: flat, oldest-first, nothing folded. */
function VariantToday({ quotesCollapsed }: { quotesCollapsed: boolean }) {
  return (
    <div className="space-y-4">
      {AISAFETY1_STORIES.map((story) => (
        <Card key={story.id} story={story} quotesCollapsed={quotesCollapsed} />
      ))}
    </div>
  );
}

/* ────────────────────────────── variant: collapse ────────────────────────────── */

/**
 * (a) COLLAPSE REPEATS — the rule the spec originally carried.
 *
 * Order is untouched, which is the property that matters: `/stake` requests stories
 * oldest-first FROM the database and treats that stored order as the render order
 * (`stake-page.tsx`). A source's FIRST appearance keeps its player; every later appearance
 * keeps its quotes and timecodes and trades the player for a control naming the card that
 * has it.
 */
function VariantCollapse({ quotesCollapsed }: { quotesCollapsed: boolean }) {
  const firstHolder = new Map<string, string>();
  return (
    <div className="space-y-4">
      {AISAFETY1_STORIES.map((story) => {
        const key = story.videoUrl ?? '';
        const holder = key ? firstHolder.get(key) : undefined;
        if (key && !holder) firstHolder.set(key, subjectOf(story));
        return (
          <Card
            key={story.id}
            story={story}
            quotesCollapsed={quotesCollapsed}
            sourceCollapsed={
              holder
                ? {
                    // Naming the holder only when it is someone else. On this data every
                    // repeat is the same subject's own reading, so "same video as Connor
                    // Leahy's card above" on a Connor Leahy card is a sentence that says
                    // nothing — and the label is the entire promise the fold makes.
                    expandLabel:
                      holder === subjectOf(story)
                        ? 'Same video as above — show it here'
                        : `Same video as ${holder}'s card above — show it here`,
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── variant: group ─────────────────────────────── */

/**
 * One source, its player mounted once, and every story built on it indented underneath.
 *
 * The player belongs to the GROUP, so the member cards hand their timecodes to it rather
 * than each unfolding a second copy of the same video — which is the difference between a
 * group and a list that happens to be sorted.
 */
function SourceGroup({
  stories,
  quotesCollapsed,
  capLong,
}: {
  stories: StoryWithAuthor[];
  quotesCollapsed: boolean;
  capLong: boolean;
}) {
  const lead = stories[0] as StoryWithAuthor;
  const player = useLazyStoryPlayer(!!lead.videoUrl);
  const [showAll, setShowAll] = useState(false);

  const hidden = capLong && !showAll ? Math.max(0, stories.length - GROUP_PREVIEW) : 0;
  const visible = hidden > 0 ? stories.slice(0, GROUP_PREVIEW) : stories;

  return (
    /* Visual QA, third pass: the old tray was `bg-muted/30` — rgba over white measured about
       1.03:1, i.e. invisible, so the group's edge was a hairline border alone. A tray the eye
       can actually see is what makes the white cards inside read as members. Side padding is
       tighter on phones because every pixel here comes out of the cards' text column. */
    <section className="rounded-lg border border-border bg-muted px-2 py-3 sm:p-3">
      {/* Founder, on the second artifact: *"too much text that is not needed?"* The heading
          used to be an avatar, "One source · {name}" and a subtitle — the name then repeated
          on every card inside. The group IS the video, and the player names it (title and
          channel) the moment it mounts, so the only thing left to say is the count. On prod
          no video has been read by two different authors (2026-09-11), so every byline
          inside already carries the name. */}
      <p className="mb-2 text-sm font-semibold text-foreground">
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

      {/* Founder: *"if it's group, then it has to look like a group... maybe we switch them
          a bit to the right"*. The indent under a rule is the desktop answer. ON PHONES IT IS
          DROPPED, and the tray carries the grouping alone: measured at 320px, the tray plus
          rule plus indent cost 36px, which wrapped "AGENT on Connor Leahy" onto two lines on
          grouped cards only and pushed the opened point's stance badge out to the card's
          border. A layout that is only coherent at desktop width is not the group. */}
      <div className="mt-3 space-y-3 sm:border-l-2 sm:border-border sm:pl-5">
        {visible.map((story) => (
          <Card
            key={story.id}
            story={story}
            quotesCollapsed={quotesCollapsed}
            sourceCollapsed={{ onSeek: player.onSeek }}
          />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            <ChevronDown size={14} />
            Show {hidden} more {hidden === 1 ? 'story' : 'stories'}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * (b) GROUP BY SOURCE.
 *
 * Groups keep first-appearance order and so do the stories inside them, so nothing is
 * re-sorted by date or author name — but the LIST IS STILL REORDERED, and that is the whole
 * cost of this option. On this data Leahy's three stories sit at positions 1, 3 and 8; under
 * grouping they become adjacent, which moves five cards. `/stake` treats its oldest-first
 * order as meaningful, and on `/feed` the same rule would rearrange the global feed around
 * whoever posted the video.
 *
 * A source with ONE story gets no group chrome. A box around a single card says "group"
 * where there is nothing to group, and it makes the real groups harder to pick out.
 */
function VariantGroup({ quotesCollapsed, capLong }: { quotesCollapsed: boolean; capLong: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, StoryWithAuthor[]>();
    for (const story of AISAFETY1_STORIES) {
      const key = story.videoUrl ?? `no-video:${story.id}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(story);
      else map.set(key, [story]);
    }
    return [...map.values()];
  }, []);

  return (
    <div className="space-y-6">
      {groups.map((stories) => {
        const lead = stories[0] as StoryWithAuthor;
        if (stories.length === 1) {
          return <Card key={lead.id} story={lead} quotesCollapsed={quotesCollapsed} />;
        }
        return (
          <SourceGroup
            key={lead.id}
            stories={stories}
            quotesCollapsed={quotesCollapsed}
            capLong={capLong}
          />
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────── page ─────────────────────────────────── */

const NOTES: Record<string, string> = {
  today:
    'What /stake/aisafety1?tab=stories renders today. Leahy’s video is mounted three times (cards 1, 3, 8); LeCun’s and Bengio’s twice each, already adjacent.',
  collapse:
    '(a) Order untouched. A source keeps its player on first appearance; later appearances carry a control naming the card that holds the video, and their timecodes open it and play from there.',
  group:
    '(b) One player per source, its stories indented under it. Reads as a source rather than a moment in the list — and it reorders the list, which /stake’s oldest-first fetch treats as meaningful.',
};

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[40px] rounded-full border px-3 text-sm transition-colors ${
        on
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
          : 'border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

export function StakeGroupingDemo() {
  const [variant, setVariant] = useState('today');
  const [quotesCollapsed, setQuotesCollapsed] = useState(true);
  const [capLong, setCapLong] = useState(true);

  return (
    <AgentAccountsContext.Provider value={AGENT_FIXTURE}>
      <div className="min-h-screen bg-background py-6 text-foreground">
        <div className={FEED_COLUMN}>
          <h1 className="text-2xl font-bold">Repeat sources on /stake/aisafety1</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            P1296 item 8. Eight real stories, four people, four videos &mdash; a frozen snapshot of
            prod. Real feed cards, so what you pick here is what ships.
          </p>

          {/* The two switches are page-level because both questions are bigger than one
              variant: quotes-folded applies to /feed and every profile too, and the
              show-more cap is the answer to "people just scroll and scroll". */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Toggle on={quotesCollapsed} onClick={() => setQuotesCollapsed(!quotesCollapsed)}>
              Supporting quotes folded
            </Toggle>
            <Toggle on={capLong} onClick={() => setCapLong(!capLong)}>
              Show {GROUP_PREVIEW} stories per source
            </Toggle>
          </div>

          <Tabs value={variant} onValueChange={setVariant} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="collapse">(a) Collapse</TabsTrigger>
              <TabsTrigger value="group">(b) Group</TabsTrigger>
            </TabsList>

            <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {NOTES[variant]}
            </p>

            {/* Remounting on the toggles is deliberate: a card that is already open should
                not stay open when the page-level answer changes under it. */}
            <div className="mt-4" key={`${quotesCollapsed}-${capLong}`}>
              <TabsContent value="today">
                <VariantToday quotesCollapsed={quotesCollapsed} />
              </TabsContent>
              <TabsContent value="collapse">
                <VariantCollapse quotesCollapsed={quotesCollapsed} />
              </TabsContent>
              <TabsContent value="group">
                <VariantGroup quotesCollapsed={quotesCollapsed} capLong={capLong} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </AgentAccountsContext.Provider>
  );
}

export default StakeGroupingDemo;
