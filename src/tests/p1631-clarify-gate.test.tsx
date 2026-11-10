/**
 * P1631: the P955 gate checks (one primary, no dead disabled control, no overflow at 320, touch targets) over every state of the Clarify thread's drafts.
 * The states are the phases of the permanent fixture /tree/_gate/clarify-thread, DERIVED from its own nav links (a phase added later is swept without an
 * edit here); named members are asserted too, so a derivation that finds nothing cannot pass green. CONTROL: the same checks fail on a mutated copy.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { GateFixture } from '@/app/tree/_gate/clarify-thread/GateFixture';
import { assertNoDeadDisabled, assertNoOverflow320, assertOnePrimary, assertTouchTargets44 } from './p955-gate.test';

const mount = (phase: string | null) => {
  const url = `/tree/_gate/clarify-thread${phase ? `?phase=${phase}` : ''}`;
  return render(<MemoryRouter initialEntries={[url]}><GateFixture /></MemoryRouter>);
};
const phasesOf = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('nav a')).map((a) => new URL(a.getAttribute('href') ?? '', 'http://x').searchParams.get('phase')).filter((p): p is string => !!p);
const CHECKS: Array<[string, (c: HTMLElement) => void]> = [
  ['one primary', assertOnePrimary], ['no dead disabled', assertNoDeadDisabled], ['no overflow at 320', assertNoOverflow320], ['touch targets', assertTouchTargets44],
];

describe('P1631 clarify thread: P955 gate over every draft state', () => {
  afterEach(cleanup);
  const phases = (() => { const v = mount(null); const p = phasesOf(v.container); v.unmount(); return p; })();

  it('derives the phases and they include one per state the server can put a draft in', () => {
    expect(phases).toEqual(expect.arrayContaining(['loading', 'thinking', 'draft', 'draft-cited', 'refused', 'failed', 'capped', 'load-failed', 'two-drafts']));
  });
  it.each(phases)('phase %s passes every gate check', (phase) => {
    const { container } = mount(phase);
    for (const [name, check] of CHECKS) expect(() => check(container), `${phase}: ${name}`).not.toThrow();
  });
  it('the states draw what they say: a loading skeleton, a draft card with its pill, a load-failure line with a retry', () => {
    mount('loading');
    expect(screen.getByTestId('clarify-drafts-loading')).toBeTruthy();
    cleanup();
    mount('draft');
    expect(screen.getByTestId('clarify-draft-pill')).toBeTruthy();
    cleanup();
    mount('load-failed');
    expect(screen.getByTestId('clarify-load-failed')).toBeTruthy();
    expect(screen.getByTestId('clarify-reload')).toBeTruthy();
  });
  it('CONTROL: the touch-target check fires on a mutated copy of the real draft card (a 32px edit button)', () => {
    const { container } = mount('draft');
    const edit = container.querySelector<HTMLElement>('[aria-label="Edit this point"]')!;
    edit.className += ' h-8';
    expect(() => assertTouchTargets44(container)).toThrow(/touch-target-44/);
  });
});
