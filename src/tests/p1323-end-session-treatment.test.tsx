/**
 * @file p1323-end-session-treatment.test.tsx
 * @description P1323 R7 / AC-12 — the four End Session controls share ONE resting treatment:
 * neutral at rest, destructive only on hover/focus.
 *
 * Why this file exists: the browser suite (e2e/p1323-links-menu-surfaces.spec.ts) measures two
 * of the four in a running session — the room page header and the capture bar on /feed. The
 * other two (/live's in-session banner, and ActiveSessionBanner, the cross-page /live bar) need a
 * two-party live session to reach, so without this file AC-12 would rest on reasoning for half
 * its controls. Two are pinned by RENDERING the shared component; two by their source, which is
 * how this repo's design-system suites already pin class contracts.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SessionBar } from '@/app/components/session/session-bar';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** A class list's tokens, so `hover:text-destructive` never satisfies a `text-destructive` check. */
const tokens = (cls: string) => cls.split(/\s+/).filter(Boolean);

function assertNeutralAtRest(cls: string, where: string) {
  const t = tokens(cls);
  expect(t, `${where}: red AT REST — the P1323 defect`).not.toContain('text-destructive');
  expect(t, `${where}: neutral resting colour`).toContain('text-muted-foreground');
  expect(t, `${where}: destructive on hover`).toContain('hover:text-destructive');
  // Keyboard users get the same signal: a first version gave focus-visible to SessionBar only
  // (adversarial review, Codex Sol).
  expect(t, `${where}: destructive on keyboard focus`).toContain('focus-visible:text-destructive');
}

describe('P1323 AC-12 — one End Session treatment across four controls', () => {
  it('SessionBar (the room-capture bar AND ActiveSessionBanner) is neutral at rest', () => {
    render(
      <SessionBar
        testId="bar"
        ariaLabel="bar"
        text="Transcribing"
        primary={{ label: 'Open', onClick: () => {}, testId: 'open' }}
        secondary={{ label: 'End session', onClick: () => {}, testId: 'end' }}
      />
    );
    assertNeutralAtRest(screen.getByTestId('end').className, 'SessionBar');
    // Same height token as the other two controls (h-9), and not the old h-8.
    expect(tokens(screen.getByTestId('end').className)).toContain('h-9');
  });

  it('both SessionBar consumers really render SessionBar — so the render above covers them', () => {
    // If either stopped using the shared component, the test above would silently stop covering
    // it. This is the dependency check that makes "two controls from one render" true.
    expect(read('src/app/components/session/room-capture-bar.tsx')).toMatch(/<SessionBar\b/);
    expect(read('src/app/components/session/live-session-bar.tsx')).toMatch(/<SessionBar\b/);
    expect(read('src/app/components/session/active-session-banner.tsx')).toMatch(/live-session-bar/);
  });

  it("/live's in-session banner End control is neutral at rest", () => {
    const src = read('src/app/components/partners/live-session-banner.tsx');
    const m = src.match(/className="([^"]*hover:text-destructive[^"]*)"/);
    expect(m, 'live-session-banner.tsx no longer has an End control with a hover-destructive treatment').not.toBeNull();
    assertNeutralAtRest(m![1]!, 'live-session-banner');
  });

  it("/transcribe/:code's header End Session is neutral at rest", () => {
    const src = read('src/app/pages/transcribe-room-page.tsx');
    const at = src.indexOf('data-testid="transcribe-end-session-button"');
    expect(at, 'transcribe-end-session-button not found').toBeGreaterThan(-1);
    const openTag = src.slice(src.lastIndexOf('<button', at), at);
    const m = openTag.match(/className="([^"]*)"/);
    expect(m, 'header End Session has no static className').not.toBeNull();
    assertNeutralAtRest(m![1]!, 'transcribe header');
  });
});
