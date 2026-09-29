/**
 * @file p1372-same-row-intensity-pick.test.tsx
 * @description P1372 — picking the already-selected level in the intensity menu must NOT
 * remove the position. P847 Model C′ (docs/decisions.md 2026-05-20 [product]) makes the
 * "Clear position" row the only removal path; `handleIntensityClick` still forwarded the
 * current value to `onPositionClick`, and consumers toggle a repeated value to `null`.
 *
 * Two levels:
 *   1. `PositionButtons` unit — same-row pick is a no-op that closes the menu; a different
 *      row still selects; the Clear row still clears.
 *   2. `QuotedPointCard` consumer — a real toggling consumer (`handlePositionClick`:
 *      `userPosition === position ? null : position`). The same-row tap must not reach
 *      `onPositionSelect(null)`, and removal must remain possible via an explicit Clear row
 *      when the caller opts in with `onPositionClear`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared/PositionButton';
import { QuotedPointCard } from '@/app/components/shared/quoted-point-card';
import type { PointSummary } from '@/app/types';

const mixedCounts: SevenPointCounts = {
  strongly_agree: 2,
  agree: 5,
  somewhat_agree: 1,
  unsure: 3,
  somewhat_disagree: 1,
  disagree: 4,
  strongly_disagree: 2,
};

/** Menu rows are role="option"; the Clear row is one too, so match the level name exactly. */
const row = (name: string) => screen.getByRole('option', { name: new RegExp(`^${name}$`) });

describe('P1372: PositionButtons — same-row intensity pick is a no-op', () => {
  it('picking the already-selected level closes the menu and does NOT call onPositionClick', async () => {
    const user = userEvent.setup();
    const onPositionClick = vi.fn();
    const onClear = vi.fn();
    render(
      <PositionButtons
        userPosition="agree"
        counts={mixedCounts}
        onPositionClick={onPositionClick}
        onClear={onClear}
      />
    );

    await user.click(screen.getByText('Agree').closest('button')!); // open menu
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(row('Agree'));

    expect(onPositionClick).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('same-row no-op also holds for a non-default level (Strongly Disagree)', async () => {
    const user = userEvent.setup();
    const onPositionClick = vi.fn();
    render(
      <PositionButtons
        userPosition="strongly_disagree"
        counts={mixedCounts}
        onPositionClick={onPositionClick}
        onClear={vi.fn()}
      />
    );

    // Segment label is the short form for non-default levels; target the pressed segment.
    await user.click(screen.getByRole('button', { pressed: true }));
    await user.click(row('Strongly Disagree'));

    expect(onPositionClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('picking a different level still calls onPositionClick with that level and closes the menu', async () => {
    const user = userEvent.setup();
    const onPositionClick = vi.fn();
    render(
      <PositionButtons
        userPosition="agree"
        counts={mixedCounts}
        onPositionClick={onPositionClick}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getByText('Agree').closest('button')!);
    await user.click(row('Strongly Agree'));

    expect(onPositionClick).toHaveBeenCalledTimes(1);
    expect(onPositionClick).toHaveBeenCalledWith('strongly_agree');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('the Clear row still calls onClear (and never onPositionClick)', async () => {
    const user = userEvent.setup();
    const onPositionClick = vi.fn();
    const onClear = vi.fn();
    render(
      <PositionButtons
        userPosition="agree"
        counts={mixedCounts}
        onPositionClick={onPositionClick}
        onClear={onClear}
      />
    );

    await user.click(screen.getByText('Agree').closest('button')!);
    await user.click(screen.getByRole('option', { name: /Clear position/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onPositionClick).not.toHaveBeenCalled();
  });
});

describe('P1372: QuotedPointCard — consumer-level same-row pick and explicit Clear', () => {
  const point: PointSummary = {
    id: 'point-1',
    statement: 'Remote work is more productive than office work',
    tags: [],
    systemTags: [],
    visibility: 'public',
    userPosition: 'agree',
  };

  function renderCard(props: { onPositionSelect: (p: unknown) => void; onPositionClear?: () => void }) {
    return render(
      <MemoryRouter>
        <QuotedPointCard
          point={point}
          authorId="author-1"
          authorName="Test Author"
          authorHasPledged={false}
          currentUserId="reader-1"
          {...props}
        />
      </MemoryRouter>
    );
  }

  it('tapping the already-selected level does not remove the position', async () => {
    const user = userEvent.setup();
    const onPositionSelect = vi.fn();
    renderCard({ onPositionSelect, onPositionClear: vi.fn() });

    await user.click(screen.getByText('Agree').closest('button')!); // open menu
    await user.click(row('Agree'));

    expect(onPositionSelect).not.toHaveBeenCalledWith(null);
    expect(onPositionSelect).not.toHaveBeenCalled();
    // Selected segment still shows the reader's position
    expect(screen.getByText('Agree').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders a Clear position row when the caller opts in, and it routes to onPositionClear', async () => {
    const user = userEvent.setup();
    const onPositionSelect = vi.fn();
    const onPositionClear = vi.fn();
    renderCard({ onPositionSelect, onPositionClear });

    await user.click(screen.getByText('Agree').closest('button')!);
    await user.click(screen.getByRole('option', { name: /Clear position/i }));

    expect(onPositionClear).toHaveBeenCalledTimes(1);
    expect(onPositionSelect).not.toHaveBeenCalled();
  });

  it('renders NO Clear row when the caller does not opt in (feed: removal is not wired there)', async () => {
    const user = userEvent.setup();
    renderCard({ onPositionSelect: vi.fn() });

    await user.click(screen.getByText('Agree').closest('button')!);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Clear position/i })).not.toBeInTheDocument();
  });
});
