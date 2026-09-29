// @vitest-environment jsdom
/**
 * @file p1366-profile-story-menu.test.tsx
 * @description P1366 — the profile's own story card (`StoryCardFull`, private to
 * profile-page-v2.tsx, so rendered through the page). Its pencil and trash icons moved into the
 * card's `⋯` menu as `Edit` and a red `Delete`; everyone else gets `Share` only. Edit stays
 * inline (menu hidden, focus in the textarea); Delete keeps its confirmation, its
 * disabled-while-deleting state and both toasts. Harness pattern: p824-private-story-cta.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfilePageV2 } from '@/app/pages/profile-page-v2';
import * as auth from '@/auth';
import * as api from '@/app/data/api';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({
  getProfileBySlug: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  createProfile: vi.fn(),
}));

const deleteStory = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    getStoriesByAuthorWithPoints: vi.fn(async () => [
      {
        id: 'story-1',
        authorId: 'owner-1',
        authorName: 'Owner Person',
        authorSlug: 'owner',
        content: 'The owner wrote this story.',
        visibility: 'public',
        currentVersion: 1,
        understoodCount: 0,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        tags: [],
        systemTags: [],
        points: [],
      },
    ]),
    deleteStory,
    updateStory: vi.fn(),
  },
}));
vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointsForProfileDisplay: vi.fn(async () => []),
    getPointsByValidator: vi.fn(async () => []),
    getPointsWithUserPositions: vi.fn(async () => []),
    getPointWithUserPosition: vi.fn(async () => null),
  },
}));
vi.mock('@/app/data/calibration-service', () => ({
  calibrationService: {
    getCalibration: vi.fn(async () => ({ status: 'insufficient', sessionsCompleted: 0 })),
    getEarsCount: vi.fn(async () => 0),
  },
}));
vi.mock('@/app/data/agreements-service', () => ({ agreementsService: { getAgreementsForProfile: vi.fn(async () => []) } }));
vi.mock('@/app/data/badge-service', () => ({ badgeService: { getBadgeCount: vi.fn(async () => 0) } }));

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mixpanel', () => ({ analytics: { track } }));

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const OWNER = {
  id: 'owner-1', slug: 'owner', name: 'Owner Person', email: 'owner@example.com', role: 'Engineer',
  isVerified: true, hasPledged: true, witnesses: [], reciprocations: 0,
};

function signInAs(userId: string | null) {
  vi.mocked(auth.useAuth).mockReturnValue({
    user: userId ? ({ id: userId, name: 'Someone', slug: userId } as never) : null,
    session: userId ? ({ user: { id: userId, email: `${userId}@example.com` }, access_token: 't' } as never) : null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  } as never);
}

async function renderProfile() {
  render(
    <MemoryRouter initialEntries={['/p/owner']}>
      <Routes>
        <Route path="/p/:id" element={<ProfilePageV2 />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('The owner wrote this story.');
}

const menuTrigger = () => screen.getByRole('button', { name: 'More actions for this story' });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(api.getProfileBySlug).mockResolvedValue(OWNER as never);
  vi.mocked(api.getProfile).mockResolvedValue(null as never);
  mockFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  }));
});

describe("P1366 — the owner's story card on their own profile", () => {
  beforeEach(() => signInAs('owner-1'));

  it('the ⋯ holds Share, Edit and a red Delete; the old pencil and trash icons are gone', async () => {
    const user = userEvent.setup();
    await renderProfile();
    expect(screen.queryByRole('button', { name: 'Edit story' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete story' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open story' })).toBeNull();
    await user.click(menuTrigger());
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Share', 'Edit', 'Delete']);
    expect(items[2]!.className).toContain('text-red-600');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Edit opens the INLINE editor: focus in the textarea, the ⋯ hidden, no navigation', async () => {
    const user = userEvent.setup();
    await renderProfile();
    await user.click(menuTrigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const textarea = await screen.findByRole('textbox');
    expect((textarea as HTMLTextAreaElement).value).toBe('The owner wrote this story.');
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect(screen.queryByRole('button', { name: 'More actions for this story' })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    // the modal menu's inert <body> is released — the editor is usable
    expect(document.body.style.pointerEvents).not.toBe('none');
    await user.type(textarea, ' More.');
    expect((textarea as HTMLTextAreaElement).value).toBe('The owner wrote this story. More.');
    // Cancel brings the menu back
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(menuTrigger()).toBeTruthy();
  });

  it('Delete asks first; declining deletes nothing', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderProfile();
    await user.click(menuTrigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    // the confirmation is asked once the menu has closed
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Delete this story? This cannot be undone.'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(deleteStory).not.toHaveBeenCalled();
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(navigate).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('Delete, confirmed: the card leaves the list with a success toast — and nothing navigates', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteStory.mockResolvedValue(true);
    await renderProfile();
    await user.click(menuTrigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('The owner wrote this story.')).toBeNull());
    expect(deleteStory).toHaveBeenCalledWith('story-1');
    expect(toast.success).toHaveBeenCalledWith('Story deleted');
    expect(navigate).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('Delete that fails: error toast, the card stays, and Delete is usable again', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolveDelete: (ok: boolean) => void = () => {};
    deleteStory.mockImplementation(() => new Promise<boolean>((r) => { resolveDelete = r; }));
    await renderProfile();
    await user.click(menuTrigger());
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    // while the delete is in flight, Delete is disabled
    await user.click(menuTrigger());
    const inFlight = await screen.findByRole('menuitem', { name: 'Delete' });
    expect(inFlight.getAttribute('aria-disabled')).toBe('true');
    await user.keyboard('{Escape}');
    resolveDelete(false);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete story'));
    expect(screen.getByText('The owner wrote this story.')).toBeTruthy();
    await user.click(menuTrigger());
    expect((await screen.findByRole('menuitem', { name: 'Delete' })).getAttribute('aria-disabled')).toBeNull();
    confirm.mockRestore();
  });

  it('the card highlight recolours top/right/bottom only — the blue left marker bar is never repainted', async () => {
    await renderProfile();
    const tokens = screen.getByRole('button', { name: 'Story by Owner Person', exact: true }).className.split(/\s+/);
    expect(tokens).toContain('border-l-blue-500');
    expect(tokens).not.toContain('hover:border-blue-400');
    expect(tokens).not.toContain('focus-within:border-blue-400');
    for (const v of ['hover', 'focus-within']) {
      for (const side of ['t', 'r', 'b']) expect(tokens).toContain(`${v}:border-${side}-blue-400`);
      expect(tokens).toContain(`${v}:shadow-md`);
    }
    expect(tokens.filter((t) => /^(hover|focus-within):border-(?![trb]-)/.test(t))).toEqual([]);
  });

  it("the footer row starts at the card's left edge (px-4), mirroring Details → on the right", async () => {
    await renderProfile();
    const row = screen.getByRole('button', { name: 'Details for this story' }).closest('[role="presentation"]')!;
    expect(row.className).toBe('px-4 py-2.5 border-t border-border');
  });

  it('footer: "+ Add a point" (0 points, so alone) and Details → the story', async () => {
    const user = userEvent.setup();
    await renderProfile();
    expect(screen.queryByText('0 points')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add a point to this story' }));
    expect(navigate).toHaveBeenLastCalledWith('/story/story-1?addPoint=true');
    await user.click(screen.getByRole('button', { name: 'Details for this story' }));
    expect(navigate).toHaveBeenLastCalledWith('/story/story-1');
  });
});

describe("P1366 — someone else's story card on a profile", () => {
  beforeEach(() => signInAs('viewer-9'));

  it('the ⋯ holds Share only, and Share fires feed_card_shared with surface profile', async () => {
    const user = userEvent.setup();
    await renderProfile();
    await user.click(menuTrigger());
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Share']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Share' }));
    await screen.findByRole('dialog');
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'story', id: 'story-1', surface: 'profile' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('no + Add a point for a non-author; zero points reads "0 points"', async () => {
    await renderProfile();
    expect(screen.queryByRole('button', { name: 'Add a point to this story' })).toBeNull();
    expect(screen.getByText('0 points')).toBeTruthy();
  });
});
