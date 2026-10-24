/**
 * @file p1560-chat-provider-keeps-page-on-pending.test.tsx
 * @description P1560: ChatProvider keys its inner tree by the signed-in person, and that tree holds
 * the whole app. A session/profile re-read flips Home readiness to `pending` while the same person
 * is still signed in; that must NOT remount the page the reader is using (slow connection: the feed
 * unmounted every few seconds, taking an open dialog with it). A different person, or signed-out,
 * still remounts, and identity comes from the SESSION, never from the cached profile.
 */
import { Suspense, startTransition, useContext, useEffect, useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Readiness = 'pending' | 'signed-in' | 'signed-out' | 'profile-error';
const state = vi.hoisted(() => ({
  readiness: 'signed-in' as Readiness,
  user: { id: 'u1' } as { id: string } | null,
  session: { user: { id: 'u1' } } as { user: { id: string } } | null,
  suspend: false,
}));
const svc = vi.hoisted(() => ({
  getMyChats: vi.fn(),
  listMirrorJobs: vi.fn(),
  getMirrorAvailability: vi.fn(),
  getMirrorProfile: vi.fn(),
  askMirror: vi.fn(),
  requestMirrorReply: vi.fn(),
  newMirrorFace: vi.fn(),
  setMirrorGender: vi.fn(),
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: state.user, session: state.session }) }));
vi.mock('@/app/routes/home-readiness', () => ({ useHomeReadiness: () => ({ state: state.readiness, retry: () => undefined }) }));
// The real MirrorProvider stays in: it switched its element tree on/off with the person and remounted the page.
vi.mock('@/app/data/mirror-service', () => ({
  askMirror: svc.askMirror,
  getMirrorAvailability: svc.getMirrorAvailability,
  getMirrorProfile: svc.getMirrorProfile,
  listMirrorJobs: svc.listMirrorJobs,
  newMirrorFace: svc.newMirrorFace,
  requestMirrorReply: svc.requestMirrorReply,
  setMirrorGender: svc.setMirrorGender,
}));
vi.mock('@/app/data/chat-service', () => ({
  getMyChats: svc.getMyChats,
  setChatState: vi.fn(),
  markRead: vi.fn(),
  sendMessage: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  subscribeToChat: vi.fn(() => () => undefined),
}));
vi.mock('@/app/data/chat-ui-helpers', () => ({ getChatAuthors: vi.fn().mockResolvedValue([]) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { ChatProvider } from '@/app/pages/chat/chat-provider';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { MirrorProvider } from '@/app/pages/chat/mirror-provider';
import { MirrorContext, type MirrorContextValue } from '@/app/pages/chat/mirror-state';

let mounts = 0;
function Page() {
  const chat = useContext(ChatContext);
  useEffect(() => {
    mounts++;
  }, []);
  if (state.suspend) throw new Promise(() => undefined);
  return <div data-testid="page">{chat ? `chats:${chat.chats.map((c) => c.conversationId).join(',')}` : 'no-chat'}</div>;
}
const tree = () => (
  <MemoryRouter initialEntries={['/feed']}>
    <Suspense fallback={null}>
      <ChatProvider>
        <Page />
      </ChatProvider>
    </Suspense>
  </MemoryRouter>
);
const set = (readiness: Readiness, userId: string | null, sessionId: string | null | undefined = userId) => {
  state.readiness = readiness;
  state.user = userId ? { id: userId } : null;
  state.session = sessionId ? { user: { id: sessionId } } : null;
};
const settle = () => act(async () => { await Promise.resolve(); });
async function mount() {
  const view = render(tree());
  await settle();
  return {
    update: async () => {
      view.rerender(tree());
      await settle();
    },
  };
}

beforeEach(() => {
  mounts = 0;
  state.suspend = false;
  set('signed-in', 'u1');
  svc.getMyChats.mockResolvedValue([]);
  svc.getMirrorAvailability.mockResolvedValue(false);
  svc.getMirrorProfile.mockResolvedValue(null);
  svc.listMirrorJobs.mockReset();
  svc.listMirrorJobs.mockResolvedValue(new Map());
});

describe('P1560 ChatProvider and a transient pending check', () => {
  it('keeps the page mounted when the same person goes signed-in -> pending -> signed-in', async () => {
    const v = await mount();
    expect(mounts).toBe(1);
    set('pending', null, 'u1'); // profile re-read: the session is still u1's
    await v.update();
    set('signed-in', 'u1');
    await v.update();
    expect(mounts).toBe(1);
  });

  it('keeps the page mounted when the session restores on a page load (nobody -> the first person)', async () => {
    set('pending', null, null);
    const v = await mount();
    set('signed-in', 'u1');
    await v.update();
    expect(mounts).toBe(1);
  });

  it('still remounts for a different person', async () => {
    const v = await mount();
    set('signed-in', 'u2');
    await v.update();
    expect(mounts).toBe(2);
  });

  it('remounts when the person signs out, and not again when someone signs in after', async () => {
    const v = await mount();
    set('signed-out', null, null);
    await v.update();
    expect(mounts).toBe(2);
    set('signed-in', 'u2');
    await v.update();
    expect(mounts).toBe(2);
  });

  it('(a) a new session while the cached profile is still the previous person: their chats are not shown', async () => {
    svc.getMyChats.mockResolvedValue([{ conversationId: 'chat-of-u1', kind: 'dm', unreadCount: 0, archived: false, manualUnread: false }]);
    const v = await mount();
    expect(screen.getByTestId('page').textContent).toContain('chat-of-u1');
    // AuthContext keeps u1's profile in `user` while it fetches u2's; the session is already u2's.
    state.readiness = 'pending';
    state.user = { id: 'u1' };
    state.session = { user: { id: 'u2' } };
    await v.update();
    expect(screen.getByTestId('page').textContent).not.toContain('chat-of-u1');
    expect(screen.getByTestId('page').textContent).toBe('no-chat');
    expect(mounts).toBe(2);
  });

  it('(d) a signed-in profile that does not match the session is not accepted', async () => {
    svc.getMyChats.mockResolvedValue([{ conversationId: 'chat-of-u1', kind: 'dm', unreadCount: 0, archived: false, manualUnread: false }]);
    const v = await mount();
    expect(screen.getByTestId('page').textContent).toContain('chat-of-u1');
    state.readiness = 'signed-in';
    state.user = { id: 'u1' };
    state.session = { user: { id: 'u2' } };
    await v.update();
    expect(screen.getByTestId('page').textContent).toBe('no-chat');
  });

  it('(e) the next person\'s profile fetch failing does not bring the previous person back', async () => {
    svc.getMyChats.mockResolvedValue([{ conversationId: 'chat-of-u1', kind: 'dm', unreadCount: 0, archived: false, manualUnread: false }]);
    const v = await mount();
    set('pending', 'u1', 'u2'); // u2's session, u1's profile still cached
    await v.update();
    expect(screen.getByTestId('page').textContent).toBe('no-chat');
    set('signed-in', 'u1', 'u2'); // the fetch failed: AuthContext keeps u1's profile and stops loading
    await v.update();
    expect(screen.getByTestId('page').textContent).toBe('no-chat');
    set('profile-error', 'u1', 'u2');
    await v.update();
    expect(screen.getByTestId('page').textContent).toBe('no-chat');
  });

  it('(b) a transition that suspends and is abandoned does not remount the page', async () => {
    function Host({ n }: { n: number }) {
      void n;
      return tree();
    }
    let setN: (n: number) => void = () => undefined;
    function Driver() {
      const [n, set_] = useState(0);
      setN = set_;
      return <Host n={n} />;
    }
    await act(async () => {
      render(<Driver />);
    });
    expect(mounts).toBe(1);
    // A transition to a different person whose page suspends: React renders it, then keeps the old UI.
    set('signed-in', 'u2');
    state.suspend = true;
    await act(async () => {
      startTransition(() => setN(1));
    });
    // The user goes back to the first person before it resolves.
    set('signed-in', 'u1');
    state.suspend = false;
    await act(async () => {
      startTransition(() => setN(2));
    });
    expect(mounts).toBe(1);
  });
});

describe('P1560 MirrorProvider turned off', () => {
  afterEach(() => vi.useRealTimers());

  const resync = vi.fn();
  const chatValue = { userId: 'u1', chats: [], subscribe: () => () => undefined, resync } as never;
  let api: MirrorContextValue | null = null;
  function Grab() {
    api = useContext(MirrorContext);
    return null;
  }
  const mirrorTree = (enabled: boolean) => (
    <ChatContext.Provider value={chatValue}>
      <MirrorProvider enabled={enabled}>
        <Grab />
      </MirrorProvider>
    </ChatContext.Provider>
  );
  const flush = (ms = 10) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  };
  async function mountMirror() {
    vi.useFakeTimers();
    svc.getMirrorAvailability.mockResolvedValue(true);
    svc.getMirrorProfile.mockResolvedValue({ gender: 'f', portraitUrl: null });
    const view = render(mirrorTree(true));
    await flush();
    const toggle = async (on: boolean) => {
      view.rerender(mirrorTree(on));
      await flush();
    };
    return toggle;
  }

  it('(c) disabling it while a job is running stops every further listMirrorJobs call', async () => {
    svc.listMirrorJobs.mockResolvedValue(new Map([['m1', { state: 'running', createdAt: new Date().toISOString() }]]));
    const toggle = await mountMirror();
    await act(async () => {
      api!.loadStatuses(['m1']);
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(svc.listMirrorJobs).toHaveBeenCalledTimes(1); // the job is running: a recheck is scheduled
    await toggle(false); // e.g. navigating to /live
    expect(api).toBeNull();
    await flush(120_000);
    expect(svc.listMirrorJobs).toHaveBeenCalledTimes(1);
  });

  it('an ask that resolves after disable and re-enable requests no reply', async () => {
    const d = deferred<{ id: string }>();
    svc.askMirror.mockReturnValue(d.promise);
    svc.requestMirrorReply.mockResolvedValue('done');
    const toggle = await mountMirror();
    let asked!: Promise<unknown>;
    act(() => { asked = api!.ask('channel', 'hello'); });
    await toggle(false);
    await toggle(true);
    await act(async () => { d.resolve({ id: 'r1' }); await asked; });
    await flush();
    expect(svc.requestMirrorReply).not.toHaveBeenCalled();
  });

  it('an old portrait request finishing after re-enable does not flip the new one from painting', async () => {
    const old = deferred<string>();
    const fresh = deferred<string>();
    svc.newMirrorFace.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const toggle = await mountMirror();
    act(() => { void api!.newFace(); });
    await toggle(false);
    await toggle(true);
    act(() => { void api!.newFace(); });
    await flush();
    expect(api!.portraitStatus).toBe('painting');
    await act(async () => { old.resolve('done'); });
    await flush();
    expect(api!.portraitStatus).toBe('painting');
    await act(async () => { fresh.resolve('failed'); });
    await flush();
    expect(api!.portraitStatus).toBe('failed');
  });

  it('an old setGender finishing after re-enable does not overwrite the new profile', async () => {
    const d = deferred<undefined>();
    svc.setMirrorGender.mockReturnValue(d.promise);
    const toggle = await mountMirror();
    expect(api!.profile).toMatchObject({ gender: 'f' });
    let pending!: Promise<unknown>;
    act(() => { pending = api!.setGender('m' as never); });
    await toggle(false);
    await toggle(true);
    await act(async () => { d.resolve(undefined); await pending; });
    await flush();
    expect(api!.profile).toMatchObject({ gender: 'f' });
  });

  // P1564: requests the mirror made after it was switched off (found in the P1560 review).
  it('a job poll in flight when the mirror is switched off asks for no resync', async () => {
    const toggle = await mountMirror();
    const poll = deferred<Map<string, unknown>>();
    svc.requestMirrorReply.mockResolvedValue('running');
    svc.listMirrorJobs.mockReturnValueOnce(poll.promise);
    await act(async () => { api!.requestReply('m1'); await vi.advanceTimersByTimeAsync(10); });
    await flush(20_000); // the recheck fires and its read is now in flight
    expect(svc.listMirrorJobs).toHaveBeenCalledTimes(1);
    resync.mockClear();
    await toggle(false);
    await act(async () => { poll.resolve(new Map([['m1', { state: 'done', createdAt: new Date().toISOString() }]])); });
    await flush();
    expect(resync).not.toHaveBeenCalled();
  });

  it('a portrait still being painted elsewhere is not re-read after the mirror is switched off', async () => {
    svc.newMirrorFace.mockResolvedValue('running');
    const toggle = await mountMirror();
    await act(async () => { await api!.newFace(); });
    svc.getMirrorProfile.mockClear();
    await toggle(false);
    await flush(60_000);
    expect(svc.getMirrorProfile).not.toHaveBeenCalled();
  });
});
