/**
 * @file p1364-story-back-guard.test.tsx
 * @description P1364 §4 + D3 — story Back goes back, and the unsaved-edits guard still holds.
 *
 * Rendered in a real BrowserRouter over jsdom's window.history, because the guard is a
 * `popstate` listener (decisions.md 2026-02-25: no `useBlocker` under BrowserRouter) and only a
 * real history exercises it: the re-pushed entry, the capture-phase listener, its removal.
 *
 * What the capture flag on REMOVAL can and cannot show here (review finding 6, measured by
 * mutation on 2026-09-28):
 *   - Dropping `{ capture: true }` from the effect CLEANUP's removal fails 4 of these tests
 *     (the guard outlives Leave and Stay, and re-prompts or re-pushes).
 *   - Dropping it from the two `popstateHandlerRef` removals (Leave's handler, and the top of
 *     the effect) fails none, and cannot: both are always followed by that cleanup before the
 *     next popstate can arrive. Leave's click is a discrete React event, so `setIsEditMode(false)`
 *     commits — and the cleanup runs — at the end of the click, while the pop that `goBack()`
 *     starts is delivered as a later task. Those two removals are kept correct (same flag as the
 *     add) as belt and braces, not because any path depends on them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { StoryDetailPage } from '@/app/pages/story-detail-page';

const STORY_ID = '11111111-2222-3333-4444-555555555555';
const AUTHOR = 'author-1';

vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: { id: AUTHOR },
    session: { access_token: 't', user: { id: AUTHOR } },
    isLoading: false,
  }),
}));
vi.mock('@/app/hooks/useVerificationGate', () => ({ useVerificationGate: () => ({ checkVerified: () => true }) }));
vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    getStoryWithPoints: vi.fn(async () => ({
      id: STORY_ID,
      authorId: AUTHOR,
      authorSlug: 'the-author',
      authorName: 'The Author',
      content: 'original text',
      points: [],
      tags: [],
      visibility: 'public',
    })),
    getStoriesForPoints: vi.fn(async () => new Map()),
  },
}));
vi.mock('@/app/data/stories-service-real', () => ({ resolveStorySlug: vi.fn(async (id: string) => id) }));
vi.mock('@/app/data/points-service', () => ({ pointsService: {} }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/components/social/StoryCardDetail', () => ({ StoryCardDetail: () => <div data-testid="story-card-detail" /> }));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: vi.fn() }),
}));

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}

/** /feed → (push) /story/:id?edit=true, then make the edit dirty. */
async function openDirtyStoryFromFeed() {
  window.history.replaceState(null, '', '/feed');
  render(
    <BrowserRouter>
      <NavGrab />
      <Routes>
        <Route path="/feed" element={<div data-testid="feed-page" />} />
        <Route path="/p/:slug" element={<div data-testid="profile-page" />} />
        <Route path="/story/:id" element={<StoryDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
  act(() => nav(`/story/${STORY_ID}?edit=true`));
  const textarea = await screen.findByDisplayValue('original text');
  fireEvent.change(textarea, { target: { value: 'edited, not saved' } });
}

const prompt = () => screen.queryByText(/you have unsaved changes/i);
const path = () => window.location.pathname;

async function browserBack() {
  await act(async () => {
    const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.back();
    // jsdom traverses history asynchronously: wait for the popstate itself, not a fixed delay
    // (a 20ms sleep lost the race under a loaded parallel run).
    await Promise.race([popped, new Promise(r => setTimeout(r, 2000))]);
  });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('P1364 D3 — story Back returns to the previous page', () => {
  it('with no edits, the top Back and the bottom pill both pop to the page the reader came from (not the author profile)', async () => {
    window.history.replaceState(null, '', '/feed');
    render(
      <BrowserRouter>
        <NavGrab />
        <Routes>
          <Route path="/feed" element={<div data-testid="feed-page" />} />
          <Route path="/story/:id" element={<StoryDetailPage />} />
        </Routes>
      </BrowserRouter>
    );
    act(() => nav(`/story/${STORY_ID}`));
    await screen.findByTestId('story-card-detail');
    fireEvent.click(screen.getByRole('button', { name: 'Go back from the end of the page' }));
    await waitFor(() => expect(path()).toBe('/feed'));
    await screen.findByTestId('feed-page');

    act(() => nav(`/story/${STORY_ID}`));
    await screen.findByTestId('story-card-detail');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(path()).toBe('/feed'));
  });
});

describe('P1364 §4 — the unsaved-edits guard', () => {
  it('Back tap → prompt; Leave → the previous page', async () => {
    await openDirtyStoryFromFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(prompt()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(path()).toBe('/feed'));
    expect(await screen.findByTestId('feed-page')).toBeTruthy();
    expect(prompt()).toBeNull();
  });

  it('the bottom pill goes through the same guard', async () => {
    await openDirtyStoryFromFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Go back from the end of the page' }));
    expect(prompt()).toBeTruthy();
  });

  it('browser back → prompt (still on the story); Leave → the previous page, not a duplicate story entry, and no second prompt', async () => {
    await openDirtyStoryFromFeed();
    await browserBack();
    expect(prompt()).toBeTruthy();
    expect(path()).toBe(`/story/${STORY_ID}`); // the guard kept the reader here
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(path()).toBe('/feed'));
    expect(await screen.findByTestId('feed-page')).toBeTruthy();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(prompt()).toBeNull();
    expect(path()).toBe('/feed');
  });

  it('review 2, D5: browser back TWICE while the prompt shows, then Leave → the previous page (no stacked duplicates)', async () => {
    await openDirtyStoryFromFeed();
    const lengthBefore = window.history.length;
    await browserBack();
    expect(prompt()).toBeTruthy();
    await browserBack(); // again, with the prompt still open
    expect(prompt()).toBeTruthy();
    expect(path()).toBe(`/story/${STORY_ID}`);
    // pushState from an earlier position truncates the forward entries, so the re-pushed
    // story entries replace each other instead of stacking.
    expect(window.history.length).toBe(lengthBefore);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(path()).toBe('/feed'));
    expect(await screen.findByTestId('feed-page')).toBeTruthy();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(path()).toBe('/feed');
    expect(prompt()).toBeNull();
  });

  it('after Leave the guard is gone: browser back from the next page is not intercepted', async () => {
    await openDirtyStoryFromFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await screen.findByTestId('feed-page');
    act(() => nav('/p/someone'));
    await screen.findByTestId('profile-page');
    await browserBack();
    expect(path()).toBe('/feed');
    expect(prompt()).toBeNull();
  });

  it('Stay keeps editing, on the story, with the draft intact', async () => {
    await openDirtyStoryFromFeed();
    await browserBack();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(prompt()).toBeNull();
    expect(path()).toBe(`/story/${STORY_ID}`);
    expect(screen.getByDisplayValue('edited, not saved')).toBeTruthy();
  });
});
