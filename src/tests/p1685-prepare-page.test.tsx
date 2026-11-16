// @vitest-environment jsdom
/**
 * P1685 — /prepare (standalone and join): the Listening Game is its own numbered step after the principle, required,
 * recorded once per person; the success screen embeds the manifesto film.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: null, isLoading: false, sessionChecked: true } }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/data/api', () => ({ getProfileBySlug: vi.fn(async () => null) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  markPrepPart: vi.fn(async () => undefined),
  getMyPrepParts: vi.fn(async () => []),
}));
vi.mock('@/app/pages/stake-page', () => ({ StakePage: ({ tag }: { tag: string }) => <div data-testid={`stake-${tag}`} /> }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({ loadTagPoints: vi.fn(async () => []) }));
const gate = vi.hoisted(() => ({ value: { kind: 'plain' } as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/prep/use-prepare-modes', () => ({ useJoinLearningGate: () => gate.value }));

import { PreparePage } from '@/app/prototypes/events/prep/PreparePage';
import { markLocalPart, readLocalParts } from '@/app/prototypes/events/prep/prep-local-parts';
import { stepMinutes } from '@/app/prototypes/events/prep/prep-plan';

function Location() { return <div data-testid="location">{useLocation().pathname}</div>; }
const page = () => render(<MemoryRouter initialEntries={['/prepare']}><PreparePage /><Location /></MemoryRouter>);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const joinGate = (onFinish = vi.fn()) => { gate.value = { kind: 'join', join: { groupName: 'G', onFinish, onExit: vi.fn() }, rows: [] }; return onFinish; };

beforeEach(() => { localStorage.clear(); gate.value = { kind: 'plain' }; });
afterEach(cleanup);

/** Plays the clip on the current step, then continues. */
async function watchAndContinue() {
  click('Play the video');
  await screen.findByRole('button', { name: 'Continue' });
  click('Continue');
}

/** Standalone: from the list, through the story, to the game screen. */
async function toGameStandalone() {
  fireEvent.click(within(await screen.findByTestId('agenda-step-story')).getByRole('button'));
  await watchAndContinue();
  return screen.findByTestId('listening-game');
}

/** Standalone: on through the game (played) to the principle's intro clip. */
async function gameToPrincipleStandalone() {
  await toGameStandalone();
  await watchAndContinue();
  return screen.findByTestId('principle-intro');
}

describe('P1685 standalone', () => {
  it('the list has the game as its own numbered step before the principle, with its own minutes', async () => {
    page();
    const rows = (await screen.findAllByTestId(/^agenda-step-/)).map((r) => r.getAttribute('data-testid'));
    expect(rows).toEqual(['agenda-step-story', 'agenda-step-game', 'agenda-step-principle', 'agenda-step-cmp7', 'agenda-step-misunderstanding']);
    expect(screen.getByTestId('agenda-step-game')).toHaveTextContent(`${stepMinutes('game', { cmp7: 0, stake: 0 }, true)} min`);
    expect(screen.getByTestId('agenda-step-game')).toHaveTextContent(/^2/);
  });

  it('after the story: "Step 2 of 5", title and subtitle above the video, "The roles" below it, then the principle', async () => {
    page();
    await toGameStandalone();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByText('The Listening Game')).toBeInTheDocument();
    expect(screen.getByText('The roles')).toBeInTheDocument();
    // D3: only Play until it has played; no skip link.
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByText(/without video/i)).toBeNull();
    click('Play the video');
    click('Continue');
    expect(await screen.findByTestId('principle-intro')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('the opt-in path (try it now, rating, Confirm) ends the principle and the NEXT screen is the statements', async () => {
    page();
    await gameToPrincipleStandalone();
    await watchAndContinue();
    fireEvent.click(await screen.findByText('Opt in'));
    click('Try it now');
    fireEvent.click(await screen.findByRole('button', { name: 'Rate 8' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('playing it records the listening_game part once (this browser, signed out): the list then shows it done', async () => {
    page();
    await toGameStandalone();
    expect(readLocalParts().listening_game).toBeUndefined();
    click('Play the video');
    click('Continue');
    await screen.findByTestId('principle-intro');
    expect(readLocalParts().listening_game).toBeDefined();
    cleanup();
    page();
    expect((await screen.findByTestId('agenda-step-game')).getAttribute('data-done')).toBe('true');
  });

  it('standalone: Back from the principle\'s first screen returns to the agenda, like every other step', async () => {
    page();
    await gameToPrincipleStandalone();
    click('Back');
    expect(await screen.findByTestId('agenda')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('Back from the game (reached from the story) returns to the agenda', async () => {
    page();
    await toGameStandalone();
    click('Back');
    expect(await screen.findByTestId('agenda')).toBeInTheDocument();
  });

  it('Back from the game opened straight from the agenda returns to the agenda', async () => {
    page();
    fireEvent.click(within(await screen.findByTestId('agenda-step-game')).getByRole('button'));
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    click('Back');
    expect(await screen.findByTestId('agenda')).toBeInTheDocument();
  });

  it('a video that cannot load: Continue goes on, nothing is recorded, Try again remounts the player', async () => {
    page();
    const game = await toGameStandalone();
    click('Play the video');
    fireEvent.error(game.querySelector('video')!);
    expect(await screen.findByTestId('video-load-error')).toBeInTheDocument();
    click('Try the video again');
    await waitFor(() => expect(screen.queryByTestId('video-load-error')).toBeNull());
    expect(screen.getByTestId('listening-game').querySelector('video')).not.toBeNull(); // retry pressed Play on the fresh poster
    fireEvent.error(screen.getByTestId('listening-game').querySelector('video')!);
    click('Continue');
    // The pass moves on to the next step (the principle); the part is not recorded, so the step stays open on the list.
    expect(await screen.findByTestId('principle-intro')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
    expect(readLocalParts().listening_game).toBeUndefined();
  });
});

describe('P1685 join', () => {
  it('the game follows the story, before the principle; the header counts it (Step 2 of 5)', async () => {
    joinGate();
    page();
    await screen.findByTestId('learn-join-context');
    await watchAndContinue(); // story
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.queryByText(/without video/i)).toBeNull();
    click('Play the video');
    click('Continue');
    expect(await screen.findByTestId('join-principle-text')).toBeInTheDocument();
    await watchAndContinue(); // principle intro
    await waitFor(() => expect(screen.getByTestId('stake-cmp7')).toBeInTheDocument());
  });

  it('resumes: with the story already done it opens on the game, and still goes on to the principle', async () => {
    markLocalPart('cognitive_video');
    joinGate();
    page();
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    await watchAndContinue();
    expect(await screen.findByTestId('principle-intro')).toBeInTheDocument();
  });

  it('once per person: a member who already did the game goes from the story straight to the principle', async () => {
    markLocalPart('listening_game');
    joinGate();
    page();
    await screen.findByTestId('learn-join-context');
    await watchAndContinue(); // story
    expect(await screen.findByTestId('principle-intro')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('Back from the principle returns to the game, never a blank screen', async () => {
    markLocalPart('cognitive_video');
    joinGate();
    page();
    await screen.findByTestId('listening-game');
    await watchAndContinue();
    await screen.findByTestId('principle-intro');
    click('Back');
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
  });
});

describe('P1685 D4: the success screen', () => {
  async function toEnd() {
    // Everything done except the very last step; finishing it lands on the success screen.
    markLocalPart('cognitive_video');
    markLocalPart('listening_game');
    markLocalPart('cmp7');
    markLocalPart('principle_intro');
    page();
    fireEvent.click(await screen.findByText('Share how you think understanding works between people'));
    return screen;
  }

  it('shows the manifesto film, "Read the manifesto" as the one primary action and a plain "See upcoming events" link under it', async () => {
    await toEnd();
    // No statements are loaded in this harness, so the step has nothing to answer: its Skip goes to the end.
    const skip = await screen.findByText(/skip/i).catch(() => null);
    if (skip) fireEvent.click(skip);
    const end = await screen.findByTestId('prepare-end');
    expect(within(end).getByText('Introduction complete')).toBeInTheDocument();
    expect(within(end).getByText('You know how to listen for understanding and how to check it.')).toBeInTheDocument();
    const film = screen.getByRole('button', { name: /play the manifesto film/i });
    const cta = screen.getByRole('button', { name: 'Read the manifesto' });
    const link = screen.getByRole('link', { name: 'See upcoming events' });
    expect(end.contains(film) && end.contains(cta) && end.contains(link)).toBe(true);
    expect(link).toHaveAttribute('href', '/events');
    expect(cta.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(film.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One primary action: the film's play button is the poster's, the page has one LetterPrimaryCta.
    expect(screen.getAllByRole('button').filter((b) => /see upcoming events|read the manifesto/i.test(b.textContent ?? ''))).toHaveLength(1);
    // The primary action really goes to the manifesto.
    fireEvent.click(cta);
    expect(await screen.findByTestId('location')).toHaveTextContent('/manifesto');
  });
});
