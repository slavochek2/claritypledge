/**
 * @file p1259-stance-chip-in-feed.test.tsx
 * @description P1259 change 4 — in the feed, each story under a point shows its author's stance.
 *
 * THE LEAK. "a point with two opposed stories under it gives the reader no indication that
 * the two authors disagree" (spec, Problem). The feed point card is the only surface where a
 * point carries several stories at once, so it is the only one where that can happen in
 * front of a reader. Founder: "missing here to see position directly!" · "we need this in
 * feed too!" · "here we can put the positions above each story?"
 *
 * THE INVARIANT THIS TEST GUARDS HARDEST is not the chip's presence — it is its COLOUR.
 * From the spec: "An agent card's chrome renders with its colour drained; the avatar is
 * exempt. The new stance chip must live inside `.agent-drained-chrome` and therefore render
 * grey. A coloured stance badge is precisely the discriminator that marks a card as
 * *human-authored* … Colouring the agent's stance chip to make it legible would delete the
 * strongest disclosure marker on public readings of four real people who never consented."
 *
 * WHAT THIS FIXTURE CANNOT REACH (epistemic gate 7b): jsdom computes no filters, so the
 * assertion below is that the chip is INSIDE an `.agent-drained-chrome` subtree — the
 * structural precondition — and NOT that its rendered pixels are grey. The pixel claim is
 * `e2e/p1104-agent-marker.spec.ts` (`meanSaturation < 0.05`), which runs in a real browser,
 * and it is the one that would actually catch a CSS regression. Neither is redundant: this
 * file fails if the chip is moved out of the drained wrapper, that one fails if the drain
 * stops working.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

function renderStory(props: Partial<React.ComponentProps<typeof QuotedStory>> = {}, authorId = AGENT_ID) {
  return render(
    <MemoryRouter>
      <QuotedStory
        story={{ ...STORY, authorId }}
        onClick={() => {}}
        getStoryAuthor={() => ({
          id: authorId,
          name: authorId === AGENT_ID ? 'Agent · Yann LeCun' : 'Jane Doe',
          slug: 'someone',
        } as never)}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => cleanup());

describe('P1259 change 4 — the stance chip beside the story byline', () => {
  it('renders the author position when there is one', () => {
    renderStory({ authorPosition: 'strongly_agree' });
    const chip = screen.getByTestId('story-author-stance');
    // The label PositionBadge renders for this position — asserting the text, not merely the
    // wrapper, so an empty chip cannot satisfy the test the empty-chip rule forbids.
    expect(chip.textContent?.trim()).toBeTruthy();
    expect(chip.textContent).toContain('Agrees');
  });

  /**
   * The silent hole, made explicit. A story whose author holds no position on the point
   * renders NO chip — never an empty one and never "unknown", which would publish a stance
   * nobody took. There is no completeness constraint requiring a filed story to carry a
   * position (spec, UX Notes); the gap is reported in `getStoriesForPoints`'s log instead.
   */
  it.each([
    ['a fetched-but-absent position (null)', null],
    ['a never-fetched position (undefined)', undefined],
  ])('renders no chip for %s', (_label, authorPosition) => {
    renderStory({ authorPosition });
    expect(screen.queryByTestId('story-author-stance')).toBeNull();
  });

  /**
   * THE INVARIANT. The chip must sit inside `.agent-drained-chrome` on an agent story, which
   * is what makes it render grey and keeps colour as the human/machine discriminator.
   */
  it('an agent story renders the chip inside the drained-chrome subtree', () => {
    renderStory({ authorPosition: 'disagree' }, AGENT_ID);
    const chip = screen.getByTestId('story-author-stance');
    // Asserted on the chip element ITSELF rather than "somewhere a drained element exists" —
    // the card already carries `agent-card-drained` elsewhere, so a subtree-existence check
    // would pass with the chip entirely outside the filtered box.
    expect(
      chip.className,
      'a coloured stance chip on an agent card would delete the strongest disclosure marker there is',
    ).toContain('agent-drained-chrome');
  });

  /**
   * The negative control. Without it the wrapper could be applied unconditionally and the
   * assertion above would still pass, while every HUMAN's stance chip rendered grey — which
   * destroys the discriminator just as effectively, from the other side.
   */
  it('a human story renders the chip with no drained wrapper', () => {
    renderStory({ authorPosition: 'disagree' }, HUMAN_ID);
    const chip = screen.getByTestId('story-author-stance');
    expect(
      chip.className,
      'draining a human stance chip would erase the same discriminator from the other side',
    ).not.toContain('agent-drained-chrome');
  });
});
