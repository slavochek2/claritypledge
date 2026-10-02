/**
 * P1336 round 12 C: LetterProgressBar's opt-in `tone="subtle"` draws a lighter fill for a
 * second bar on a screen; without the prop the letter's own blue is unchanged.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';

const ticks = () =>
  Array.from(screen.getByRole('progressbar').querySelectorAll('[role="presentation"] > div'));

describe('LetterProgressBar tone', () => {
  it('default: filled ticks use the letter blue on the gray-300 track', () => {
    render(<LetterProgressBar currentChapter={0} totalChapters={1} stepCount={3} committedSteps={1} />);
    const [filled, empty] = ticks();
    expect(filled).toHaveClass('bg-blue-600');
    expect(empty).toHaveClass('bg-gray-300');
    expect(filled).not.toHaveClass('bg-blue-400');
  });

  it('subtle: filled ticks use blue-400 on the lighter gray-200 track', () => {
    render(
      <LetterProgressBar currentChapter={0} totalChapters={1} stepCount={3} committedSteps={1} tone="subtle" />,
    );
    const [filled, empty] = ticks();
    expect(filled).toHaveClass('bg-blue-400');
    expect(filled).not.toHaveClass('bg-blue-600');
    expect(empty).toHaveClass('bg-gray-200');
  });

  it('default: completed chapters stay the letter blue', () => {
    render(<LetterProgressBar currentChapter={1} totalChapters={2} />);
    const completed = screen.getByRole('progressbar').querySelector('.flex.gap-1 > div');
    expect(completed).toHaveClass('bg-blue-600');
  });
});
