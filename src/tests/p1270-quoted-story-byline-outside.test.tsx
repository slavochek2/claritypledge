/**
 * @file p1270-quoted-story-byline-outside.test.tsx
 * @description P1270 §5 — `QuotedStory`'s byline sits INSIDE the bordered box; it must move
 * OUTSIDE, matching `QuotedPointCard` (`quoted-point-card.tsx:132-160`), where the author row
 * renders above the box and the box holds only the point's own content.
 *
 * EXPECTED RED until /dev implements §5. Today (`point-card-with-links.tsx:758-861`) the
 * outer `<div role="button" ...rounded-lg border border-border bg-gray-50...>` (the box) is
 * the ROOT of the returned tree, and the "Author info at top" block — avatar, name/AgentByline,
 * ear badge, stance chip — is a DIRECT CHILD of that box. Asserting a class string on the box
 * would pass on a box that still wraps the byline (the box's own styling is not what's
 * changing); the only assertion that actually binds the layout is a DOM CONTAINMENT check:
 * `box.contains(bylineAnchor)` must become `false`.
 *
 * The byline has no `data-testid` of its own, so this file anchors on two elements that are
 * unambiguously PART of the byline row and always render when `author` is supplied: the
 * avatar (`data-testid="gravatar-avatar"`) and, per branch, either the agent name control
 * (`data-testid="agent-byline-name"`) or the human name control (found by its own text).
 *
 * Also required by the spec text: `onNameClick`/`onAuthorClick` must keep firing in EVERY
 * branch (agent and human) after the move — a card-layout change is exactly the kind of edit
 * that silently drops a handler off a re-parented element.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QuotedStory } from '@/app/components/social/point-card-with-links';
import type { Story } from '@/app/components/shared/prototype-types';

const AGENT_ID = 'agent-1';
const HUMAN_ID = 'human-1';

vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>();
  return {
    ...actual,
    useAgentAccountIds: () => ({
      isAgentAccountId: (id?: string | null) => id === AGENT_ID,
      operatorNameFor: () => 'ClarityPledge',
      isLoading: false,
    }),
  };
});

const STORY: Story = {
  id: 'story-1',
  authorId: AGENT_ID,
  text: 'Concentration of capability is the governance problem.',
  createdAt: '2026-09-01T00:00:00Z',
  understoodCount: 0,
  visibility: 'public',
  linkedPointIds: [],
};

const onAuthorClick = vi.fn();

function renderStory(authorId: string) {
  return render(
    <MemoryRouter>
      <QuotedStory
        story={{ ...STORY, authorId }}
        onClick={() => {}}
        onAuthorClick={onAuthorClick}
        getStoryAuthor={() => ({
          id: authorId,
          name: authorId === AGENT_ID ? 'Agent · Yann LeCun' : 'Jane Doe',
          slug: 'someone',
        } as never)}
      />
    </MemoryRouter>
  );
}

/** The box: the outer `<div role="button">` wrapping the quoted content. `div` excludes the
 *  avatar/name `<span role="button">` controls inside the byline, which would otherwise also
 *  match a bare `[role="button"]` selector. */
function getBox(container: HTMLElement): HTMLElement {
  const box = container.querySelector('div[role="button"]');
  if (!box) throw new Error('QuotedStory root box (div[role="button"]) not found');
  return box as HTMLElement;
}

beforeEach(() => {
  cleanup();
  onAuthorClick.mockClear();
});

describe('P1270 §5 — QuotedStory byline moves outside the bordered box', () => {
  it('the byline avatar is NOT contained by the box, for an agent story', () => {
    const { container } = renderStory(AGENT_ID);
    const box = getBox(container);
    const avatar = screen.getByTestId('gravatar-avatar');
    expect(
      box.contains(avatar),
      'the byline (avatar + name + stance) must sit ABOVE the box, matching QuotedPointCard — not nested inside it',
    ).toBe(false);
  });

  it('the byline name control is NOT contained by the box, for an agent story', () => {
    const { container } = renderStory(AGENT_ID);
    const box = getBox(container);
    const nameEl = screen.getByTestId('agent-byline-name');
    expect(box.contains(nameEl)).toBe(false);
  });

  it('the byline avatar is NOT contained by the box, for a human story', () => {
    const { container } = renderStory(HUMAN_ID);
    const box = getBox(container);
    const avatar = screen.getByTestId('gravatar-avatar');
    expect(box.contains(avatar)).toBe(false);
  });

  it('the byline name control is NOT contained by the box, for a human story', () => {
    const { container } = renderStory(HUMAN_ID);
    const box = getBox(container);
    const nameEl = screen.getByText('Jane Doe');
    expect(box.contains(nameEl)).toBe(false);
  });

  /**
   * Regression guard, not the defect itself: onAuthorClick already fires correctly in
   * today's (nested) layout. This assertion exists so a future re-parenting of the byline
   * cannot silently drop the handler while the containment assertions above happen to still
   * pass (e.g. a fix that moves the byline out but forgets to thread the click prop through).
   */
  it('onAuthorClick still fires from the moved byline — agent branch', () => {
    renderStory(AGENT_ID);
    fireEvent.click(screen.getByTestId('agent-byline-name'));
    expect(onAuthorClick).toHaveBeenCalledTimes(1);
  });

  it('onAuthorClick still fires from the moved byline — human branch', () => {
    renderStory(HUMAN_ID);
    fireEvent.click(screen.getByText('Jane Doe'));
    expect(onAuthorClick).toHaveBeenCalledTimes(1);
  });
});
