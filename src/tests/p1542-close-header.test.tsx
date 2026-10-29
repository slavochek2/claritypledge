// @vitest-environment jsdom
/**
 * P1542 review round 3 (E): inside the room, the close's welcome draws no header row of its own — the room's head
 * already has "Back to the event", and the welcome's own "Continue" is its way back to the thank-you. A titled step
 * (a question, the group terms) still draws its row into the room's head.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CloseHeader, type CloseHeaderProps } from '@/app/prototypes/events/close/CloseHeader';

const base = (step: string, slot: HTMLElement): CloseHeaderProps => ({
  step, offer: true, embedded: true, slot, onBack: vi.fn(), toEnd: vi.fn(), backToEvent: vi.fn(),
  joinContext: null, title: 'How was the hike for you?', progress: { chapter: 0, total: 3, fraction: 0 },
  headerRef: () => undefined, headerHeight: 0,
});

function inSlot(step: string) {
  const slot = document.createElement('div');
  document.body.appendChild(slot);
  render(<MemoryRouter><CloseHeader {...base(step, slot)} /></MemoryRouter>);
  return slot;
}

describe('the close header inside the room', () => {
  it('welcome: nothing is drawn into the room\'s head (no untitled row, no second Back)', () => {
    expect(inSlot('welcome').childElementCount).toBe(0);
  });
  it('a question and the group terms: their titled row is drawn into the room\'s head', () => {
    expect(inSlot('score').querySelector('[data-testid="step-name"]')?.textContent).toBe('How was the hike for you?');
    expect(inSlot('join').querySelector('[data-testid="step-name"]')?.textContent).toBe('Group terms');
  });

  it('founder UAT (2): inside the room the first question draws no inner Back (the room\'s "Back to the event" is it); later questions keep theirs', () => {
    const first = document.createElement('div');
    document.body.appendChild(first);
    render(<MemoryRouter><CloseHeader {...base('score', first)} firstQuestion /></MemoryRouter>);
    expect(first.querySelector('[data-testid="header-back"]')).toBeNull();
    expect(first.querySelector('[data-testid="step-name"]')?.textContent).toBe('How was the hike for you?');
    const later = document.createElement('div');
    document.body.appendChild(later);
    render(<MemoryRouter><CloseHeader {...base('improve', later)} firstQuestion={false} /></MemoryRouter>);
    expect(later.querySelector('[data-testid="header-back"]')).not.toBeNull();
  });

  it('founder UAT (2): the standalone /close page keeps its first question\'s Back (only the room hides it)', () => {
    render(<MemoryRouter><CloseHeader {...base('score', null as never)} embedded={false} firstQuestion /></MemoryRouter>);
    expect(document.querySelector('[data-testid="step-header"] [data-testid="header-back"]')).not.toBeNull();
  });
});

