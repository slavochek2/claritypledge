/**
 * @file stake-grouping-demo.tsx
 * @module app/pages/tree
 *
 * P1296 item 8 — the repeat-source artifact. Route: `/tree/stake-grouping` (DEV only).
 *
 * WHAT THIS IS FOR. The spec defers one call to "after artifacts exist": whether a source
 * that appears more than once in a list should (a) COLLAPSE its player on the second and
 * later appearances, or (b) GROUP its stories under one heading with the player shown once.
 * Founder, verbatim: *"group by source is interesting but I guess we need to build artifact
 * to see how it would look to decide if we do that or dedup as originally thought of?"*
 *
 * WHY IT RENDERS THE REAL CARD. The thing being judged is density — how much vertical space
 * a repeated video costs, and what the page reads like once that cost is paid three times.
 * A hand-drawn approximation cannot answer that, so this mounts the SHIPPING `FeedStoryCard`
 * against a frozen snapshot of prod's eight `aisafety1` stories (see `aisafety1-fixture.ts`).
 * Approving what you see here approves the component that ships.
 *
 * WHY TABS AND NOT THREE COLUMNS. Side-by-side would squeeze each variant to a third of the
 * feed's real width, and the whole question is how the real width reads. Each tab renders at
 * `max-w-2xl`, which is what `/stake` and `/feed` actually use.
 *
 * ── WHAT IS SIMULATED, AND WHAT THAT COSTS ──────────────────────────────────────────────
 *
 * Neither variant is implemented in `FeedStoryCard` — that is the point; the spec's Non-Goals
 * forbid implementing either before this decision. The card gates BOTH its player and its
 * quotes on the same `story.videoUrl`, so there is no prop that says "quotes yes, player no".
 * This page therefore hides the media box with a scoped CSS rule and leaves the card
 * untouched. Consequences, stated rather than hidden:
 *
 *   1. The quotes and their timecodes stay rendered and visible in every variant. That is
 *      the spec's hard invariant ("hiding a repeated PLAYER is dedup; hiding repeated quotes
 *      or timestamps is not, and is out of bounds") and it is preserved here by construction.
 *
 *   2. A timecode CLICK on a suppressed card seeks a player that is not visible, so it looks
 *      dead. That is a limitation of this artifact — but it is also a real finding about both
 *      designs, and it is NOT in the spec: `useLazyStoryPlayer` swallows a seek whenever its
 *      `enabled` flag is false (`mode` stays `'thumbnail'`, `playerRef` never populates), so
 *      whichever design wins has to say where a collapsed or grouped card's timecode seeks.
 *      P1259 change 1 exists precisely to stop a timecode throwing the reader out to YouTube,
 *      so "fall back to the external link" would walk that back on five of these eight cards.
 *
 * These are prototype seams, not proposals. Do not copy the CSS below into anything shipped.
 */
import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { StoryMedia } from '@/app/components/shared/story-media';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
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

/** Suppresses the card's media box without touching the card. See the header note. */
const SUPPRESS_PLAYER_CSS = `
.proto-no-player [role="presentation"]:has([data-testid="video-thumbnail-image"]),
.proto-no-player [role="presentation"]:has([data-testid="story-video-player"]),
.proto-no-player [role="presentation"]:has([data-testid="story-video-blocked"]) {
  display: none;
}
`;

const FEED_COLUMN = 'mx-auto w-full max-w-2xl px-4';

function linkedPointsFor(storyId: string) {
  return AISAFETY1_LINKED_POINTS[storyId] ?? [];
}

function Card({ story }: { story: StoryWithAuthor }) {
  return <FeedStoryCard story={story} activeTag="aisafety1" linkedPoints={linkedPointsFor(story.id)} />;
}

/* ─────────────────────────────── variant: today ─────────────────────────────── */

/** Exactly what `/stake/aisafety1?tab=stories` renders now: flat, oldest-first, nothing folded. */
function VariantToday() {
  return (
    <div className="space-y-4">
      {AISAFETY1_STORIES.map((story) => (
        <Card key={story.id} story={story} />
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
 * keeps its quotes and timecodes and trades the player for a one-line affordance.
 */
function VariantCollapse() {
  const seen = new Set<string>();
  return (
    <div className="space-y-4">
      {AISAFETY1_STORIES.map((story) => {
        const key = story.videoUrl ?? '';
        const isRepeat = key !== '' && seen.has(key);
        if (key) seen.add(key);
        if (!isRepeat) return <Card key={story.id} story={story} />;
        return (
          <div key={story.id} className="proto-no-player">
            <div className="mb-1 flex items-center gap-2 px-4 text-sm text-muted-foreground">
              <span aria-hidden>▸</span>
              <span>
                Same source as {stripAgentPrefix(story.authorName) ?? story.authorName}&rsquo;s
                {' '}card above — quotes and timecodes below
              </span>
            </div>
            <Card story={story} />
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────── variant: group ─────────────────────────────── */

/** One live player for the whole group, mounted lazily exactly as a card's own player is. */
function GroupHeader({ story, count }: { story: StoryWithAuthor; count: number }) {
  const player = useLazyStoryPlayer(!!story.videoUrl);
  const name = stripAgentPrefix(story.authorName) ?? story.authorName;
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2">
        <GravatarAvatar
          name={name}
          photoUrl={story.authorAvatarUrl ?? undefined}
          avatarColor={story.authorAvatarColor}
          isPledger={story.authorHasPledged ?? false}
        />
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-muted-foreground">
            {count} {count === 1 ? 'story' : 'stories'} from one source
          </div>
        </div>
      </div>
      <div ref={player.containerRef}>
        <StoryMedia
          ref={player.playerRef}
          videoUrl={story.videoUrl}
          durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
          mode={player.mode}
          onBlockedChange={player.onBlockedChange}
          storyHref={`/story/${story.id}`}
        />
      </div>
    </div>
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
 */
function VariantGroup() {
  const groups = useMemo(() => {
    const map = new Map<string, StoryWithAuthor[]>();
    for (const story of AISAFETY1_STORIES) {
      const key = story.videoUrl ?? `no-video:${story.id}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(story);
      else map.set(key, [story]);
    }
    // `lead` is carried explicitly rather than read back as `stories[0]`: every bucket is
    // created with one story in it, but the index signature cannot know that.
    return [...map.values()].map((stories) => ({ lead: stories[0] as StoryWithAuthor, stories }));
  }, []);

  return (
    <div className="space-y-8">
      {groups.map(({ lead, stories }) => (
        <section key={lead.id} className="rounded-lg border border-border p-3">
          <GroupHeader story={lead} count={stories.length} />
          <div className="proto-no-player space-y-4">
            {stories.map((story) => (
              <Card key={story.id} story={story} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ─────────────────────────────────── page ─────────────────────────────────── */

const NOTES: Record<string, string> = {
  today:
    'What /stake/aisafety1?tab=stories renders today. Leahy’s video is mounted three times (cards 1, 3, 8); LeCun’s and Bengio’s twice each, already adjacent.',
  collapse:
    '(a) Order untouched. A source keeps its player on first appearance only; later appearances keep every quote and timecode. Nothing moves position.',
  group:
    '(b) One player per source, stories clustered under it. Reads as a person rather than a claim — and it reorders the list, which /stake’s oldest-first fetch treats as meaningful.',
};

export function StakeGroupingDemo() {
  const [variant, setVariant] = useState('today');

  return (
    <AgentAccountsContext.Provider value={AGENT_FIXTURE}>
      <style>{SUPPRESS_PLAYER_CSS}</style>
      <div className="min-h-screen bg-background py-6 text-foreground">
        <div className={FEED_COLUMN}>
          <h1 className="text-2xl font-bold">Repeat sources on /stake/aisafety1</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            P1296 item 8. Eight real stories, four people, four videos &mdash; a frozen snapshot of
            prod. Real feed cards, so what you pick here is what ships.
          </p>

          <Tabs value={variant} onValueChange={setVariant} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="collapse">(a) Collapse</TabsTrigger>
              <TabsTrigger value="group">(b) Group</TabsTrigger>
            </TabsList>

            <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {NOTES[variant]}
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              Prototype seam: clicking a timecode on a card whose player is hidden looks dead.
              That is this page, not a proposal &mdash; but it is the open question both designs
              inherit, and it is not yet in the spec.
            </p>

            <div className="mt-4">
              <TabsContent value="today"><VariantToday /></TabsContent>
              <TabsContent value="collapse"><VariantCollapse /></TabsContent>
              <TabsContent value="group"><VariantGroup /></TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </AgentAccountsContext.Provider>
  );
}

export default StakeGroupingDemo;
