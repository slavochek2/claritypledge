// @vitest-environment jsdom
/**
 * P1337 walkthrough 9: the host sees each person's principle answer on the event page — In, Out,
 * or Undecided (no answer, or no preparation at all) — and the counts above the list.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OptInTag, optInLine, optInsByProfile } from '@/app/prototypes/events/prep/PrepMarks';
import type { HostPrepRow } from '@/app/data/event-prep-service';

const row = (profileId: string, optedIn: boolean | null): HostPrepRow =>
  ({ profileId, optedIn, completedAt: null, researchState: null, micSetup: null } as unknown as HostPrepRow);

describe('host opt-in tags', () => {
  it('reads In / Out from the answers, and counts no answer or no row as undecided', () => {
    const optIns = optInsByProfile([row('a', true), row('b', false), row('c', null)]);
    expect(optIns.get('a')).toBe('in');
    expect(optIns.get('b')).toBe('out');
    expect(optIns.has('c')).toBe(false);
    expect(optInLine(optIns, ['a', 'b', 'c', 'nobody'])).toBe('1 in · 1 out · 2 undecided');
  });

  it('labels each state', () => {
    render(<><OptInTag state="in" /><OptInTag state="out" /><OptInTag state="undecided" /></>);
    expect(screen.getAllByTestId('host-opt-in-tag').map(t => t.textContent)).toEqual(['In', 'Out', 'Undecided']);
  });
});
