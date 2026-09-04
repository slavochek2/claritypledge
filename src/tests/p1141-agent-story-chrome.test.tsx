/**
 * @file p1141-agent-story-chrome.test.tsx
 * @description DW-7 byline, machine chip and the RD-1 footer render with a
 * resolving RD-2 link; DW-12 no verified count and no Verify affordance on an
 * agent story, a human story unchanged, and the render HELD while the registry
 * is still loading.
 *
 * The identityPending half is the one a build gets wrong. useAgentAccountIds()
 * keeps isLoading true FOREVER on fetch failure — deliberately fail-closed — so
 * a consumer that reads isAgent while the registry loads renders an agent story
 * as a human one, complete with the count this spec removes.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentByline } from '@/app/components/shared/agent-byline';
import { MachineChip } from '@/app/components/shared/machine-chip';
import { AgentStoryFooter } from '@/app/components/shared/agent-story-footer';

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('p1141 DW-7 — attribution level 1: the byline and the machine chip', () => {
  /** UI Contract string amended by FOUNDER DECISION 2026-09-04 (P1212 §2): the marker is
   *  `AGENT`, the connective is `on`. The three-part shape is unchanged and is what these
   *  assertions actually protect — marker, connective, full name. */
  it('reads `[AGENT] on {Full Name}`, the UI Contract string verbatim', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    expect(screen.getByTestId('agent-byline').textContent).toContain('on');
    expect(screen.getByTestId('agent-byline-name').textContent).toBe('Jane Doe');
  });

  it('strips the baked-in "Agent · " prefix rather than printing it twice', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    expect(screen.getByTestId('agent-byline').textContent).not.toContain('Agent ·');
  });

  it('a name that merely STARTS with "agent" is not mangled', () => {
    wrap(<AgentByline name="Agentic Systems" />);
    expect(screen.getByTestId('agent-byline-name').textContent).toBe('Agentic Systems');
  });

  /** The TOKEN changed 2026-09-04 (`Machine` -> `Agent`, founder decision). The chip
   *  itself is unchanged and must stay a bordered pill: `index.css` counts it as one of
   *  three non-colour WCAG 1.4.1 channels, and on the feed story card it is the only
   *  non-avatar channel present. Renaming a channel must not delete it. */
  it('carries the disclosure chip beside it, always', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    expect(screen.getByTestId('machine-chip').textContent).toBe('Agent');
  });

  /**
   * THE RETIRED WORDS, asserted negatively — 2026-09-04. This is the assertion that
   * moved here out of `p1141-pipeline-rules.test.ts`'s source-grep table, which could
   * not do it: that table `toContain`s a literal over the FILE TEXT, so during this
   * rename its `'reading of'` case stayed green on the doc comment explaining the
   * change while the JSX had already stopped rendering it. A grep cannot separate a
   * rendered string from prose about that string. This can.
   */
  it('renders NEITHER retired word — the rename is on screen, not only in the source', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    const text = screen.getByTestId('agent-byline').textContent ?? '';
    expect(text).not.toContain('Machine');
    expect(text).not.toContain('reading of');
  });

  // Amendment 2026-08-24. The chip now LEADS the byline, so "the first span" is no longer
  // the name — this targets the name by testid instead of by DOM position, which is what
  // the assertion always meant.
  it('a very long name truncates but keeps the full name available on hover', () => {
    const long = 'Agent · Bartholomew Fitzwilliam Montgomery-Chesterfield III';
    wrap(<AgentByline name={long} />);
    const label = screen.getByTestId('agent-byline-name');
    expect(label.className).toContain('truncate');
    expect(label.getAttribute('title')).toBe('Bartholomew Fitzwilliam Montgomery-Chesterfield III');
  });

  // The defect this amendment exists to fix: every call site wrapped the whole byline in
  // the profile-navigation button, so the machine chip was a link.
  it('the machine chip is NOT inside the interactive element — a status marker must not navigate', () => {
    wrap(<AgentByline name="Agent · Jane Doe" onNameClick={() => {}} />);
    const nameButton = screen.getByTestId('agent-byline-name');
    expect(nameButton.tagName).toBe('BUTTON');
    expect(nameButton.querySelector('[data-testid="machine-chip"]')).toBeNull();
    expect(screen.getByTestId('machine-chip').closest('button')).toBeNull();
  });

  it('clicking the name calls the handler, and only the name is clickable', () => {
    const onNameClick = vi.fn();
    wrap(<AgentByline name="Agent · Jane Doe" onNameClick={onNameClick} />);
    fireEvent.click(screen.getByTestId('agent-byline-name'));
    expect(onNameClick).toHaveBeenCalledTimes(1);
    // Exactly one interactive element in the whole byline.
    expect(screen.getByTestId('agent-byline').querySelectorAll('button')).toHaveLength(1);
  });

  it('the chip stands alone as its own component, for card surfaces', () => {
    render(<MachineChip />);
    expect(screen.getByTestId('machine-chip')).toBeTruthy();
  });

  // Amendment 2026-08-24 — consistency pass. Before it, ten surfaces named an agent
  // account and only three used this component; the other seven (the profile header,
  // both point stance rows, four quoted-card rows) printed the raw stored
  // `Agent · {Name}`. Same account, two identities, decided by which page you were on.

  it('renders the name as a SPAN, not a dead button, when there is nothing to click', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    const label = screen.getByTestId('agent-byline-name');
    expect(label.tagName).toBe('SPAN');
    // A control rendered with no handler invites a click that does nothing and adds a
    // phantom tab stop — the dead-control defect the visual-QA checklist blocks by name.
    expect(screen.getByTestId('agent-byline').querySelectorAll('button')).toHaveLength(0);
  });

  it('says the SAME three things at every size — the connective is not trimmable', () => {
    // Dropped, the marker lands on the PERSON: `[Agent] Daniel Bar-Tal` reads as
    // *Daniel Bar-Tal, who is an agent*. Worst on the profile header, which is the
    // one surface `lg` exists for. The words changed 2026-09-04; the rule did not.
    for (const size of ['sm', 'lg'] as const) {
      const { unmount } = wrap(<AgentByline name="Agent · Jane Doe" size={size} />);
      const text = screen.getByTestId('agent-byline').textContent ?? '';
      expect(text).toContain('Agent');
      expect(text).toContain('on');
      expect(text).toContain('Jane Doe');
      expect(text).not.toContain('Agent ·');
      unmount();
    }
  });

  it('scales the chip WITH the byline, so the two sizes read as one marker', () => {
    const { unmount } = wrap(<AgentByline name="Agent · Jane Doe" size="lg" />);
    const chip = screen.getByTestId('machine-chip');
    expect(chip.getAttribute('data-chip-size')).toBe('lg');
    // Same border and palette at both sizes — a different-looking mark would read as a
    // different claim.
    expect(chip.className).toContain('border-gray-300');
    expect(chip.className).toContain('rounded-full');
    unmount();
    wrap(<AgentByline name="Agent · Jane Doe" />);
    expect(screen.getByTestId('machine-chip').getAttribute('data-chip-size')).toBe('sm');
  });
});

describe('p1141 DW-7 / RD-1 — attribution level 2: the footer, verbatim', () => {
  it('leads with the machine and names the quote exception second', () => {
    wrap(<AgentStoryFooter name="Agent · Jane Doe" />);
    const text = screen.getByTestId('agent-story-footer').textContent ?? '';
    expect(text).toContain(
      'A machine account operated by ClarityPledge wrote this reading of Jane Doe.'
    );
    expect(text).toContain(
      "Nothing here is Jane Doe's own words except the quotes, which come from the linked video."
    );
  });

  it('interpolates the SAME full name the byline uses', () => {
    wrap(
      <>
        <AgentByline name="Agent · Jane Doe" />
        <AgentStoryFooter name="Agent · Jane Doe" />
      </>
    );
    expect(screen.getByTestId('agent-byline').textContent).toContain('Jane Doe');
    expect(screen.getByTestId('agent-story-footer').textContent).toContain('Jane Doe');
  });

  it('a story with NO quotes does not claim quotes exist', () => {
    // Blind review round 3, defect 1. RD-1 fixes the two sentences verbatim and
    // the second says "except the quotes". On a no-quotes story that clause
    // points at nothing — a false claim on the one surface whose job is telling
    // a reader which words the machine wrote.
    wrap(<AgentStoryFooter name="Agent · Jane Doe" hasQuotes={false} />);
    const text = screen.getByTestId('agent-story-footer').textContent ?? '';
    expect(text).toContain("Nothing here is Jane Doe's own words.");
    expect(text).not.toContain('except the quotes');
    expect(text).not.toContain('linked video');
  });

  it('the machine sentence is unchanged either way', () => {
    for (const hasQuotes of [true, false]) {
      const view = wrap(<AgentStoryFooter name="Agent · Jane Doe" hasQuotes={hasQuotes} />);
      expect(view.getByTestId('agent-story-footer').textContent).toContain(
        'A machine account operated by ClarityPledge wrote this reading of Jane Doe.'
      );
      view.unmount();
    }
  });

  it('the detail surface passes hasQuotes from the story, not a hardcoded true', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(__dirname, '..', 'app/components/social/StoryCardDetail.tsx'),
      'utf8'
    );
    expect(src).toMatch(/hasQuotes=\{videoQuotes\.quotes\.length > 0\}/);
  });

  it('the operator name is ClarityPledge — a founder decision already taken', () => {
    wrap(<AgentStoryFooter name="Agent · Jane Doe" />);
    expect(screen.getByTestId('agent-story-footer').textContent).toContain('ClarityPledge');
  });
});

describe('p1141 DW-7 / RD-2 — attribution level 3: the link resolves', () => {
  it('carries the UI Contract label and points at /machines', () => {
    wrap(<AgentStoryFooter name="Agent · Jane Doe" />);
    const link = screen.getByTestId('agent-story-footer-link');
    expect(link.textContent).toBe('How machine accounts work →');
    expect(link.getAttribute('href')).toBe('/machines');
  });

  it('does NOT point at /about — a link that works and misleads', () => {
    wrap(<AgentStoryFooter name="Agent · Jane Doe" />);
    expect(screen.getByTestId('agent-story-footer-link').getAttribute('href')).not.toBe('/about');
  });

  it('/machines is a real route in App.tsx, so the link actually resolves', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('path="/machines"');
  });
});

/**
 * DW-12 is a GATING rule, and the gate is what is tested here: the shape
 * `!isAgent && !identityPending && <X/>`. Asserting it against the source is
 * deliberate — a component-level render fed mock props cannot reach the
 * still-loading registry state, which is exactly where the defect lives.
 */
describe('p1141 DW-12 — no verified count, no Verify, and the render holds while loading', () => {
  const SURFACES = [
    'app/components/social/StoryCardDetail.tsx',
    'app/components/social/story-card-with-links.tsx',
    'app/components/feed/feed-story-card.tsx',
    'app/pages/profile-page-v2.tsx',
  ];

  async function read(rel: string) {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    return readFileSync(join(__dirname, '..', rel), 'utf8');
  }

  it.each(SURFACES)('%s gates UnderstoodBadge on BOTH isAgent and identityPending', async (rel) => {
    const src = await read(rel);
    const renders = src.match(/<UnderstoodBadge[\s\S]{0,120}?\/>/g) ?? [];
    expect(renders.length, `${rel} renders no UnderstoodBadge — did the surface move?`).toBeGreaterThan(0);
    for (const site of renders) {
      const index = src.indexOf(site);
      const preceding = src.slice(Math.max(0, index - 300), index);
      // The gate is matched on SHAPE, not on one literal name: profile-page-v2
      // scopes its own copies as storyIsAgent / storyIdentityPending because the
      // page already binds isAgent to the PROFILE owner higher up. Both halves
      // must still be present and both must be negated.
      expect(
        /!\w*[iI]sAgent\s*&&\s*!\w*[iI]dentityPending\s*&&\s*$/.test(preceding.trimEnd() + ' '),
        `${rel}: an UnderstoodBadge render site is not gated on !isAgent && !identityPending. ` +
          `Gating on isAgent alone renders an agent story as a human one while the registry loads.`
      ).toBe(true);
    }
  });

  it.each(SURFACES.slice(0, 2))('%s gates the inline Verify button the same way', async (rel) => {
    const src = await read(rel);
    expect(src).toContain('showVerifyButton');
    const gated = src.match(/showVerifyButton[^\n]*!isAgent\s*&&\s*!identityPending/g) ?? [];
    expect(
      gated.length,
      `${rel}: the Verify affordance is offered from the same row as the count and is equally ` +
        `unreachable for an agent account — it must carry the same gate.`
    ).toBeGreaterThan(0);
  });

  it('every surface reads identityPending from the fail-closed registry hook', async () => {
    for (const rel of SURFACES) {
      const src = await read(rel);
      expect(src, rel).toContain('isLoading: identityPending');
    }
  });

  it('a human story is unchanged — the gate is the ONLY thing added', async () => {
    const src = await read('app/components/feed/feed-story-card.tsx');
    // The badge itself still renders with the same props for a human author.
    expect(src).toContain('<UnderstoodBadge count={story.understoodCount} size="xs" />');
  });
});
