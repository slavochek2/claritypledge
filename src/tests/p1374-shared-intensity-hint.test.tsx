/**
 * @file p1374-shared-intensity-hint.test.tsx
 * @description P1374 — the shared PositionButtons (/stake, feed, point, story, profile,
 * onboarding) shows "Tap again if you <group> only Somewhat, or Strongly" right after a
 * plain Agree/Disagree pick, until the reader has picked a level anywhere. The site-wide
 * flag is the same one letters read.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared/PositionButton';
import type { PositionType } from '@/app/types';

const LEARNED_KEY = 'intensity_learned_at_v1';
const SEEN_KEY = 'letter_intensity_preview_seen_at_v2';
const zero: SevenPointCounts = {
  strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0,
  somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
};

/** Stateful consumer, like the feed card: the pick becomes the new userPosition. */
function Harness(props: { intensityHint?: boolean; controlledOpenGroup?: null }) {
  const [pos, setPos] = useState<PositionType | null>(null);
  return (
    <PositionButtons
      userPosition={pos}
      counts={zero}
      onPositionClick={(p) => setPos(p as PositionType)}
      onClear={() => setPos(null)}
      {...props}
    />
  );
}

const segment = (name: RegExp) => screen.getAllByRole('button').find((b) => name.test(b.textContent ?? ''))!;
const hint = () => screen.queryByText(/Tap again if you/);

describe('P1374: shared intensity hint', () => {
  // The pop-up is lazy-loaded; preload it so "no pop-up" assertions are not vacuously true
  // on a cold module (review finding: absence was only proven because an earlier test
  // happened to load the chunk).
  beforeAll(async () => {
    await import('@/app/components/letters/intensity-tutorial-modal');
  });
  beforeEach(() => localStorage.clear());

  it('plain Disagree pick shows the disagree hint; Agree swaps the verb', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(segment(/^Disagree/));
    expect(hint()).toHaveTextContent('Tap again if you disagree only Somewhat, or Strongly');
    await user.click(segment(/^Agree/));
    expect(hint()).toHaveTextContent('Tap again if you agree only Somewhat, or Strongly');
  });

  it('Unsure shows no hint', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(segment(/^Unsure/));
    expect(hint()).toBeNull();
  });

  it('picking a level hides the hint and sets the site-wide learned flag', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(segment(/^Disagree/));
    expect(hint()).not.toBeNull();
    await user.click(segment(/^Disagree/)); // opens the menu
    expect(hint()).toBeNull();
    await user.click(screen.getByRole('option', { name: /^Somewhat Disagree$/ }));
    expect(localStorage.getItem(LEARNED_KEY)).not.toBeNull();
  });

  it('picking the default level from the menu also counts as learned (they found the gesture)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(segment(/^Disagree/));
    await user.click(segment(/^Disagree/));
    await user.click(screen.getByRole('option', { name: /^Disagree$/ }));
    expect(localStorage.getItem(LEARNED_KEY)).not.toBeNull();
  });

  it('two cards: only the card just tapped shows the hint; a level on either stops both', async () => {
    const user = userEvent.setup();
    render(<><div data-testid="a"><Harness /></div><div data-testid="b"><Harness /></div></>);
    const a = within(screen.getByTestId('a'));
    const b = within(screen.getByTestId('b'));
    await user.click(a.getAllByRole('button').find((x) => /^Disagree/.test(x.textContent ?? ''))!);
    expect(a.queryByText(/Tap again if you/)).not.toBeNull();
    await user.click(b.getAllByRole('button').find((x) => /^Agree/.test(x.textContent ?? ''))!);
    expect(a.queryByText(/Tap again if you/)).toBeNull();
    expect(b.queryByText(/Tap again if you/)).not.toBeNull();
    await user.click(b.getAllByRole('button').find((x) => /^Agree/.test(x.textContent ?? ''))!);
    await user.click(screen.getByRole('option', { name: /^Strongly Agree$/ }));
    expect(screen.queryAllByText(/Tap again if you/)).toHaveLength(0);
    await user.click(a.getAllByRole('button').find((x) => /^Agree/.test(x.textContent ?? ''))!);
    expect(screen.queryAllByText(/Tap again if you/)).toHaveLength(0);
  });

  it('the controlled tutorial demo never sets the learned flag or bumps the counter', () => {
    render(
      <PositionButtons userPosition="disagree" counts={zero} onPositionClick={() => {}} controlledOpenGroup="disagree" />
    );
    fireEvent.click(screen.getByRole('option', { name: /^Somewhat Disagree$/, hidden: true }));
    expect(localStorage.getItem(LEARNED_KEY)).toBeNull();
    expect(localStorage.getItem('intensity_plain_picks_v1')).toBeNull();
  });

  it('outside letters the pop-up is dismissible (ESC closes it and marks it seen)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(segment(/^Disagree/));
    await user.click(screen.getByRole('button', { name: 'Show the intensity tutorial' }));
    expect(await screen.findByRole('dialog', {}, { timeout: 5000 })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(SEEN_KEY)).not.toBeNull();
  });

  it('already learned (e.g. in a letter): no hint', async () => {
    localStorage.setItem(LEARNED_KEY, '1');
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(segment(/^Disagree/));
    expect(hint()).toBeNull();
  });

  it('the hint\'s "?" opens the tutorial pop-up; Continue marks it seen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(segment(/^Disagree/));
    await user.click(screen.getByRole('button', { name: 'Show the intensity tutorial' }));
    expect(await screen.findByRole('dialog', {}, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(SEEN_KEY)).not.toBeNull();
  });

  it('5 plain picks with no level: the pop-up opens once (not on the 4th)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    for (let i = 1; i <= 4; i++) await user.click(segment(i % 2 ? /^Disagree/ : /^Agree/));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(segment(/^Disagree/)); // 5th: currently Agree after 4 picks
    expect(await screen.findByRole('dialog', {}, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(segment(/^Agree/)); // 6th: already seen → no second pop-up
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('5 plain picks after the pop-up was already seen (e.g. in a letter): no pop-up', async () => {
    localStorage.setItem(SEEN_KEY, '1');
    const user = userEvent.setup();
    render(<Harness />);
    for (let i = 1; i <= 5; i++) await user.click(segment(i % 2 ? /^Disagree/ : /^Agree/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('intensityHint={false} (letter engage phases): no hint', async () => {
    const user = userEvent.setup();
    render(<Harness intensityHint={false} />);
    await user.click(segment(/^Disagree/));
    expect(hint()).toBeNull();
  });
});
