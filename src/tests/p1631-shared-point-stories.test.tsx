/**
 * P1631 shared-point stories (client): the published card offers "Add a story" to a verified, signed-in viewer, loads the linked stories (one read for all cards of a tick),
 * saves through point_chat_add_story with the card's message id, and offers nothing to an unverified or signed-out viewer or after a failed read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type Viewer = { session: { user: { id: string } } | null; user: { isVerified: boolean } | null };
const h = vi.hoisted(() => ({
  viewer: { current: null as unknown as Viewer },
  stories: vi.fn(),
  add: vi.fn(),
}));
vi.mock('@/auth', () => ({ useAuth: () => h.viewer.current }));
vi.mock('@/app/data/stories-service', () => ({ storiesService: { getStoriesForPoints: h.stories } }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPositionsForPoint: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/app/data/chat-point-stories-service', () => ({ addChatPointStory: h.add }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({
  CanvasAddStoryDialog: ({ state, onSave }: { state: { pointId: string } | null; onSave: (p: string, c: string) => Promise<void> }) =>
    state ? <button data-testid="story-dialog" onClick={() => void onSave(state.pointId, 'my story')}>{state.pointId}</button> : null,
}));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point, linkedStories, onAddStory }: { point: { id: string }; linkedStories?: unknown[]; onAddStory?: () => void }) => (
    <div data-testid={`feed-point-${point.id}`}>
      {linkedStories !== undefined && <span data-testid={`story-count-${point.id}`}>{linkedStories.length}</span>}
      {onAddStory && <button onClick={onAddStory}>Add a story</button>}
    </div>
  ),
}));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { PrivatePointAttachment } from '@/app/pages/chat/PrivatePointAttachment';
import type { PointWithUserPosition } from '@/app/types';

const mkPoint = (id: string) => ({ id, visibility: 'private', statement: 'a private point' }) as unknown as PointWithUserPosition;
const mount = (...ids: string[]) => render(
  <MemoryRouter>
    <ChatContext.Provider value={{ chats: [] } as unknown as ChatContextValue}>
      {ids.map((id) => <PrivatePointAttachment key={id} point={mkPoint(id)} conversationId="c-group" messageId={`msg-${id}`} />)}
    </ChatContext.Provider>
  </MemoryRouter>,
);
const verified = (): Viewer => ({ session: { user: { id: 'user-id-1234' } }, user: { isVerified: true } });

describe('PrivatePointAttachment: Add a story', () => {
  beforeEach(() => {
    h.stories.mockReset();
    h.add.mockReset().mockResolvedValue('story-id-1');
    h.viewer.current = verified();
  });

  it('a verified viewer reads the linked stories, sees Add a story, and it saves through point_chat_add_story with the card message id', async () => {
    h.stories.mockResolvedValue(new Map([['p1', [{ id: 's1' }, { id: 's2' }]]]));
    mount('p1');
    expect((await screen.findByTestId('story-count-p1')).textContent).toBe('2');
    fireEvent.click(screen.getByText('Add a story'));
    const dlg = await screen.findByTestId('story-dialog');
    expect(dlg.textContent).toBe('p1');
    fireEvent.click(dlg);
    await waitFor(() => expect(h.add).toHaveBeenCalledWith('p1', 'msg-p1', 'my story'));
  });

  it('several cards rendered together cost ONE getStoriesForPoints call, and each card gets its own stories', async () => {
    h.stories.mockResolvedValue(new Map([['p1', [{ id: 's1' }]], ['p2', [{ id: 's2' }, { id: 's3' }]]]));
    mount('p1', 'p2', 'p3');
    expect((await screen.findByTestId('story-count-p2')).textContent).toBe('2');
    expect(screen.getByTestId('story-count-p1').textContent).toBe('1');
    expect(screen.getByTestId('story-count-p3').textContent).toBe('0');
    expect(h.stories).toHaveBeenCalledTimes(1);
    expect((h.stories.mock.calls[0]![0] as string[]).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('a failed read shows neither a story row nor Add a story (never a false empty state)', async () => {
    h.stories.mockRejectedValue(new Error('boom'));
    mount('p1');
    await waitFor(() => expect(h.stories).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('feed-point-p1')).toBeTruthy());
    expect(screen.queryByTestId('story-count-p1')).toBeNull();
    expect(screen.queryByText('Add a story')).toBeNull();
    expect(await screen.findByRole('alert')).toBeTruthy(); // the inline retry line
  });

  it('Retry reads again, and a successful read brings the stories and Add a story back', async () => {
    h.stories.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(new Map([['p1', [{ id: 's1' }]]]));
    mount('p1');
    fireEvent.click(await screen.findByText('Retry'));
    expect((await screen.findByTestId('story-count-p1')).textContent).toBe('1');
    expect(screen.getByText('Add a story')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(h.stories).toHaveBeenCalledTimes(2);
  });

  it('an unverified viewer still READS the stories on the card but is offered no Add a story', async () => {
    h.viewer.current = { session: { user: { id: 'user-id-1234' } }, user: { isVerified: false } };
    h.stories.mockResolvedValue(new Map([['p1', [{ id: 's1' }, { id: 's2' }]]]));
    mount('p1');
    expect((await screen.findByTestId('story-count-p1')).textContent).toBe('2');
    expect(screen.queryByText('Add a story')).toBeNull();
  });

  it('a viewer without a session is offered no story and nothing is read', async () => {
    h.viewer.current = { session: null, user: null };
    mount('p1');
    await waitFor(() => expect(screen.getByTestId('feed-point-p1')).toBeTruthy());
    expect(screen.queryByText('Add a story')).toBeNull();
    expect(h.stories).not.toHaveBeenCalled();
  });
});
