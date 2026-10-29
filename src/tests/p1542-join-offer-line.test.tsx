// @vitest-environment jsdom
/**
 * P1542 founder (2026-10-29): on the feedback thank-you, the line under "Join <community>" — "Starts with a 6-minute
 * introduction to how we meet." — shows ONLY for someone who has not done the introduction. Someone who has (the join
 * flow's own "learned" signal, hasLearned: this preparation completed, or the video and the statements done) sees
 * nothing there.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { JoinOffer } from '@/app/prototypes/events/prep/PrepPieces';
import { hasLearned } from '@/app/prototypes/events/prep/prep-plan';

const offer = (learned: boolean) => render(
  <MemoryRouter><JoinOffer community="Clarity Practice Community" learned={learned} started={false} minutes={6} onJoin={vi.fn()} /></MemoryRouter>,
);

describe('the thank-you Join line', () => {
  it('not learned: "Starts with a 6-minute introduction to how we meet." under the Join', () => {
    offer(false);
    expect(screen.getByRole('button', { name: 'Join Clarity Practice Community' })).toBeInTheDocument();
    expect(screen.getByTestId('end-join-learn-first')).toHaveTextContent('Starts with a 6-minute introduction to how we meet.');
  });

  it('learned: the Join alone, nothing in that spot', () => {
    offer(true);
    expect(screen.getByRole('button', { name: 'Join Clarity Practice Community' })).toBeInTheDocument();
    expect(screen.queryByTestId('end-join-learn-first')).toBeNull();
  });

  it('"learned" is the join flow\'s signal: this preparation completed, or the video and the statements done', () => {
    const done = (part: string) => ({ part, contentVersion: 99, completedAt: '2026-10-01T00:00:00Z', skippedAt: null }) as never;
    expect(hasLearned([], '2026-10-29T10:00:00Z')).toBe(true);
    expect(hasLearned([done('cognitive_video'), done('cmp7')], null)).toBe(true);
    expect(hasLearned([done('cognitive_video')], null)).toBe(false);
    expect(hasLearned([], null)).toBe(false);
  });
});
