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

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentByline } from '@/app/components/shared/agent-byline';
import { MachineChip } from '@/app/components/shared/machine-chip';
import { AgentStoryFooter } from '@/app/components/shared/agent-story-footer';

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('p1141 DW-7 — attribution level 1: the byline and the machine chip', () => {
  it('reads `Reading of {Full Name}`, the UI Contract string verbatim', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    expect(screen.getByTestId('agent-byline').textContent).toContain('Reading of Jane Doe');
  });

  it('strips the baked-in "Agent · " prefix rather than printing it twice', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    expect(screen.getByTestId('agent-byline').textContent).not.toContain('Agent ·');
  });

  it('a name that merely STARTS with "agent" is not mangled', () => {
    wrap(<AgentByline name="Agentic Systems" />);
    expect(screen.getByTestId('agent-byline').textContent).toContain('Reading of Agentic Systems');
  });

  it('carries the machine chip beside it, always', () => {
    wrap(<AgentByline name="Agent · Jane Doe" />);
    expect(screen.getByTestId('machine-chip').textContent).toBe('Machine');
  });

  it('a very long name truncates but keeps the full name available on hover', () => {
    const long = 'Agent · Bartholomew Fitzwilliam Montgomery-Chesterfield III';
    wrap(<AgentByline name={long} />);
    const label = screen.getByTestId('agent-byline').querySelector('span');
    expect(label?.className).toContain('truncate');
    expect(label?.getAttribute('title')).toBe('Bartholomew Fitzwilliam Montgomery-Chesterfield III');
  });

  it('the chip stands alone as its own component, for card surfaces', () => {
    render(<MachineChip />);
    expect(screen.getByTestId('machine-chip')).toBeTruthy();
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
