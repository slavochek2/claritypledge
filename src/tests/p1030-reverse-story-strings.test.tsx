/**
 * @file p1030-reverse-story-strings.test.tsx
 * @description P1030: the two conditional strings that make a letter a reverse letter,
 * plus the marker predicate they both key off.
 *
 * A reverse story's experience belongs to the READER; the sender only wrote the text.
 * Two sentences change and nothing else. Both branches of the new conditional are
 * asserted here per `.claude/rules/tests.md` (UI Conditional Branch Coverage) — the
 * default branch is a regression guard, since every existing letter renders it.
 *
 * The rating-question string itself is asserted end-to-end in
 * `e2e/p1030-reverse-story-letter-ui.spec.ts`; it lives inline in letter-flow-content
 * rather than in a component, so there is no unit seam for it here.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalibrationVerdict } from '@/app/components/letters/calibration-verdict';
import { isReverseStorySnapshot } from '@/app/utils/letter-reading-utils';

const REVERSE_LINE = /estimated you would rate their capture of your meaning at a/;
const NORMAL_LINE = /estimated you understood their intended meaning at a/;

describe('P1030 CalibrationVerdict — reverse-story reveal line', () => {
  it('reverse: describes the capture of the reader\'s meaning, not the reader\'s comprehension', () => {
    render(<CalibrationVerdict authorName="Clarity" authorRating={7} gap={2} isReverseStory />);
    expect(screen.getByText(REVERSE_LINE)).toBeInTheDocument();
    // The measurement the founder did NOT make must not appear on the screen where
    // he interprets the number — a correct number under the wrong sentence is a misread.
    expect(screen.queryByText(NORMAL_LINE)).not.toBeInTheDocument();
    expect(screen.getByText('Clarity')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('default: the existing letter copy is unchanged when the flag is absent', () => {
    render(<CalibrationVerdict authorName="Maya" authorRating={5} gap={1} />);
    expect(screen.getByText(NORMAL_LINE)).toBeInTheDocument();
    expect(screen.queryByText(REVERSE_LINE)).not.toBeInTheDocument();
  });

  it('the gap/calibrated colour treatment is independent of the reverse flag', () => {
    const { container: gapBox } = render(
      <CalibrationVerdict authorName="Clarity" authorRating={4} gap={3} isReverseStory />
    );
    expect(gapBox.querySelector('.bg-blue-50')).toBeTruthy();
    expect(screen.getByText('3-point gap')).toBeInTheDocument();

    const { container: calibratedBox } = render(
      <CalibrationVerdict authorName="Clarity" authorRating={9} gap={0} isReverseStory />
    );
    expect(calibratedBox.querySelector('.bg-green-50')).toBeTruthy();
    expect(screen.getByText('Perfectly calibrated')).toBeInTheDocument();
  });
});

describe('P1030 isReverseStorySnapshot', () => {
  it('true only for a real boolean true', () => {
    expect(isReverseStorySnapshot({ reverseStory: true })).toBe(true);
  });

  it('false when the key is absent — every existing letter takes this path', () => {
    expect(isReverseStorySnapshot({ storyText: 'hi', lead_count: 1 })).toBe(false);
    expect(isReverseStorySnapshot({})).toBe(false);
  });

  it('false for null/undefined point_config rather than throwing', () => {
    expect(isReverseStorySnapshot(null)).toBe(false);
    expect(isReverseStorySnapshot(undefined)).toBe(false);
  });

  it('falls back to the ordinary letter for truthy non-boolean values', () => {
    // point_config is JSONB forwarded verbatim to anonymous token readers. A stray
    // string or number must NOT reframe the rating question — fail toward the
    // existing, correct rendering rather than toward the reverse one.
    expect(isReverseStorySnapshot({ reverseStory: 'true' })).toBe(false);
    expect(isReverseStorySnapshot({ reverseStory: 1 })).toBe(false);
    expect(isReverseStorySnapshot({ reverseStory: false })).toBe(false);
  });
});
