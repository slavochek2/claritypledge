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
 * P1270 §3 REVERSED THE COLOUR HALF OF THIS FILE. The assertions were re-aimed, not
 * deleted, and the original reasoning is kept below because knowing WHY it was wrong is
 * what stops it being re-derived.
 *
 * WHAT THIS FILE USED TO ASSERT, and the spec text it quoted:
 *   "An agent card's chrome renders with its colour drained; the avatar is exempt. The new
 *    stance chip must live inside `.agent-drained-chrome` and therefore render grey. A
 *    coloured stance badge is precisely the discriminator that marks a card as
 *    *human-authored* … Colouring the agent's stance chip to make it legible would delete
 *    the strongest disclosure marker on public readings of four real people who never
 *    consented."
 *
 * BOTH LOAD-BEARING CLAIMS IN THAT PARAGRAPH ARE FALSE, and each was checked by command
 * before the founder ruled (P1270 §3, 2026-09-08):
 *
 *   1. "a coloured stance badge is the discriminator that marks a card as human-authored."
 *      `PositionBadge.tsx:70` is a single hardcoded `bg-blue-100 text-blue-700` for EVERY
 *      human — identical for a founding pledger with 40 ear-verifications and an account
 *      created this morning. Colour never encoded standing on the human side, so draining it
 *      removed no signal an agent was falsely claiming. It invented a distinction instead.
 *
 *   2. "the avatar is exempt, so the card keeps a colour channel." True of the FIXTURE only.
 *      `e2e/helpers/test-agent-account.ts:68-72` seeds a deliberately saturated `#0044CC`
 *      avatar colour and no photo, so the exemption assertion measures a coloured initials
 *      block. `e2e/p1104-agent-marker.spec.ts:97-98` records the production number:
 *      "Measured mean saturation on a real product photo: 0.00." Production agent avatars
 *      are black-and-white portraits. The badge was the only coloured pixel being drained.
 *
 * So the drain cost the reader the one marker carrying CONTENT — whether the machine read
 * the subject as agreeing or disagreeing — and bought no disclosure that the square
 * black-and-white photo and the word `AGENT` were not already carrying.
 *
 * WHAT THIS FILE GUARDS NOW: that the two channels which DO carry the disclosure are both
 * present on an agent card, and that the stance chip is NOT drained. Two channels is the
 * floor, and P1270 §6 ships in the same change because one render branch was at zero.
 *
 * WHAT THIS FIXTURE STILL CANNOT REACH (epistemic gate 7b): jsdom computes no filters, so
 * everything here is structural — which classes and elements are present. The pixel claim
 * lives in `e2e/p1104-agent-marker.spec.ts`, in a real browser. Neither is redundant.
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
   * THE INVARIANT, P1270 §3 — INVERTED FROM ITS PREDECESSOR. The chip must NOT be drained.
   *
   * Asserted on the chip element ITSELF rather than "no drained element exists anywhere" —
   * the card legitimately carries `agent-card-drained` as its identification hook, and a
   * subtree-absence check would fail on that even with the chip correctly undrained.
   */
  it('an agent story renders the stance chip UNDRAINED', () => {
    renderStory({ authorPosition: 'disagree' }, AGENT_ID);
    const chip = screen.getByTestId('story-author-stance');
    expect(
      chip.className,
      'P1270 §3: the stance chip carries CONTENT (how the machine read the subject), not a ' +
        'standing claim. Draining it made the one informative marker the hardest to read while ' +
        'the photo and the word already carried the disclosure.',
    ).not.toContain('agent-drained-chrome');
  });

  /**
   * THE RE-AIMED GUARD — and the reason §3 is safe rather than merely defensible.
   *
   * Removing the drain is only acceptable while the two NON-COLOUR channels are both
   * present, so this asserts them directly instead of inferring them from a filter. These
   * are the channels WCAG 1.4.1 actually counts: shape and text, neither of which depends on
   * a reader distinguishing grey from blue.
   *
   * If a future change deletes either one, this fails and §3's premise is gone with it —
   * which is exactly the coupling the old saturation assertion could not express.
   */
  it('an agent card carries BOTH non-colour channels: the square avatar and the AGENT word', () => {
    renderStory({ authorPosition: 'disagree' }, AGENT_ID);

    const avatar = screen.getByTestId('gravatar-avatar');
    expect(
      avatar.className,
      'the square silhouette is the channel that survives at 20px and in greyscale',
    ).toContain('rounded-sm');
    expect(avatar.className).not.toContain('rounded-full');

    // `AgentByline` renders the MachineChip + the connective. The WORD is the second channel
    // and it is the only one that reaches a screen reader.
    const byline = screen.getByTestId('agent-byline');
    expect(byline.textContent?.toUpperCase()).toContain('AGENT');
  });

  /**
   * THE NEGATIVE CONTROL, ALSO RE-AIMED — and it had to be, which is the whole lesson.
   *
   * Its predecessor asserted a human chip is NOT drained. Under §3 no chip is drained on
   * either side, so that assertion now passes unconditionally: it would go green against a
   * build that stamped the agent markers onto every human card in the product. A control
   * that cannot fail is not a control.
   *
   * So it is re-aimed at what still genuinely discriminates: a human card must carry
   * NEITHER non-colour channel. Without this, the assertions above would pass on a component
   * that rendered the square avatar and the AGENT word for everyone — destroying the
   * distinction from the other side, exactly as the original control feared, just via a
   * different mechanism.
   */
  it('a human story carries NEITHER agent channel — round avatar, no agent byline', () => {
    renderStory({ authorPosition: 'disagree' }, HUMAN_ID);

    const avatar = screen.getByTestId('gravatar-avatar');
    expect(
      avatar.className,
      'a square avatar on a human card asserts machine authorship of a person\'s own words',
    ).toContain('rounded-full');
    expect(avatar.className).not.toContain('rounded-sm');

    expect(screen.queryByTestId('agent-byline')).toBeNull();

    // And the chip stays coloured for a human, as it always did.
    expect(screen.getByTestId('story-author-stance').className).not.toContain('agent-drained-chrome');
  });
});
