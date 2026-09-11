/**
 * @file stake-grouping-demo.tsx
 * @module app/pages/tree
 *
 * P1296 item 7 — the grouping reference. Route: `/tree/stake-grouping` (DEV only).
 * THROWAWAY: deleted in the build's last commit, after UAT sign-off (spec, item 7).
 *
 * WHY IT STILL EXISTS DURING THE BUILD. The test database's `aisafety1` stories are four
 * stories on four different videos, so nothing there groups; the grouping can only be seen
 * against prod's content, where three videos back more than one story. This page renders a
 * frozen snapshot of prod's eight `aisafety1` stories (see `aisafety1-fixture.ts`) through the
 * SHIPPING pieces — `groupBySource`, `SourceGroup`, `FeedStoryCard` — exactly as `/stake`
 * composes them. Nothing here is a variant any more: the founder chose (b), and the choice is
 * what renders.
 */
import { useMemo } from 'react';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { SourceGroup, type GroupPlayer } from '@/app/components/shared/source-group';
import { AgentAccountsContext } from '@/app/contexts/agent-accounts-context';
import { groupBySource } from '@/lib/group-by-source';
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
 * override every card would render agent-authored content as a person's.
 */
const AGENT_FIXTURE = {
  isAgentAccountId: (id?: string | null) => (id ? AGENT_PROFILE_IDS.has(id) : false),
  operatorNameFor: (id?: string | null) => (id && AGENT_PROFILE_IDS.has(id) ? AGENT_OPERATOR_NAME : null),
  isLoading: false,
};

export function StakeGroupingDemo() {
  const entries = useMemo(() => groupBySource(AISAFETY1_STORIES), []);

  const renderStoryCard = (story: StoryWithAuthor, groupPlayer?: GroupPlayer) => (
    <FeedStoryCard
      key={story.id}
      story={story}
      activeTag="aisafety1"
      linkedPoints={AISAFETY1_LINKED_POINTS[story.id] ?? []}
      groupPlayer={groupPlayer}
      surface="stake"
    />
  );

  return (
    <AgentAccountsContext.Provider value={AGENT_FIXTURE}>
      <div className="min-h-screen bg-background py-6 text-foreground">
        <div className="mx-auto w-full max-w-2xl px-4">
          <h1 className="text-2xl font-bold">Grouping on /stake/aisafety1</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            P1296 reference, until UAT sign-off. Prod&rsquo;s eight stories, grouped by source through
            the shipping components.
          </p>
          <div className="mt-4 space-y-4" data-testid="stake-list">
            {entries.map((entry) =>
              entry.kind === 'group' ? (
                <SourceGroup key={entry.key} stories={entry.stories} renderStory={renderStoryCard} />
              ) : (
                renderStoryCard(entry.story)
              ),
            )}
          </div>
        </div>
      </div>
    </AgentAccountsContext.Provider>
  );
}

export default StakeGroupingDemo;
