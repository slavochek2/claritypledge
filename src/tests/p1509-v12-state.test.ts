/**
 * @file p1509-v12-state.test.ts
 * @description P1509 v12 rules the backend spec will enforce: channel visibility (member vs attendee), the
 * messaging rule, search scope (never the stranger, email only on exact match), archive/unarchive on a new
 * message, forward keeps the original author, failed send + retry. Fictional people only.
 */
import { describe, expect, it } from 'vitest';
import {
  archive, archivedChats, canMessage, canSee, chatById, chatsInTab, comment, dmWith, forward, incoming, initialState, isArchived, mockIncoming,
  openChat, retry, search, send, tabsFor, unreadOf, visibleChats,
} from '@/app/prototypes/clarity-chat-v12/state';

const ids = (cs: { id: string }[]) => cs.map((c) => c.id).sort();

describe('P1509 v12 visibility', () => {
  it('Bob (member) sees every channel of his group; Dana (attendee) only her event channel', () => {
    const bob = initialState();
    expect(ids(chatsInTab(bob, 'cm'))).toEqual(['ch-night-oct02', 'ch-night-oct16']);
    const dana = initialState({ viewer: 'dana' });
    expect(ids(chatsInTab(dana, 'cm'))).toEqual(['ch-night-oct16']);
    expect(canSee('dana', chatById(dana, 'ch-fc-sept')!)).toBe(false);
  });

  it('Dana gets a tab only for the group whose channel she sees; Bob gets one per group, including one with no channel', () => {
    expect(tabsFor(initialState({ viewer: 'dana' })).map((t) => t.id)).toEqual(['all', 'unread', 'cm']);
    expect(tabsFor(initialState()).map((t) => t.id)).toEqual(['all', 'unread', 'cm', 'fc', 'bc']);
    expect(chatsInTab(initialState(), 'bc')).toEqual([]);
  });

  it('All holds every 1:1 and every channel I can see; nobody sees another pair\'s 1:1', () => {
    const dana = initialState({ viewer: 'dana' });
    expect(ids(chatsInTab(dana, 'all'))).toEqual(['ch-night-oct16', 'dm-bob-dana', 'dm-dana-alice']);
  });
});

describe('P1509 v12 list order', () => {
  it('newest message first; a new message moves its chat to the top', () => {
    const st = initialState();
    expect(visibleChats(st).map((c) => c.id).slice(0, 2)).toEqual(['dm-bob-alice', 'dm-bob-dana']);
    expect(visibleChats(st).at(-1)!.id).toBe('ch-fc-sept');
    expect(visibleChats(send(st, 'ch-fc-sept', 'hi'))[0]!.id).toBe('ch-fc-sept');
  });
});

describe('P1509 v12 messaging rule', () => {
  it('shares a group as members, or shares an event, or nothing', () => {
    expect(canMessage('bob', 'carol')).toBe(true); // group members
    expect(canMessage('bob', 'dana')).toBe(true); // same event
    expect(canMessage('dana', 'carol')).toBe(false); // carol is a member, dana only an attendee: no shared group, no shared event
    expect(canMessage('bob', 'sam')).toBe(false); // the stranger
    expect(canMessage('bob', 'bob')).toBe(false);
  });

  it('dmWith opens the existing 1:1, creates a new one when allowed, and refuses otherwise', () => {
    const st = initialState();
    expect(dmWith(st, 'alice')?.chatId).toBe('dm-bob-alice');
    const dana = initialState({ viewer: 'dana' });
    expect(dmWith(dana, 'carol')).toBeNull();
    expect(dmWith(dana, 'sam')).toBeNull();
    expect(dmWith(st, 'sam')).toBeNull();
  });
});

describe('P1509 v12 search', () => {
  const st = initialState();
  it('finds shared people by name and nickname, never the stranger', () => {
    expect(search(st, 'carol').people).toEqual(['carol']);
    expect(search(st, 'alicem').people).toEqual(['alice']);
    expect(search(st, 'sam').people).toEqual([]);
    expect(search(st, 'Rivera').people).toEqual([]);
  });
  it('email matches only exactly, and never for the stranger', () => {
    expect(search(st, 'carol@example.com').people).toEqual(['carol']);
    expect(search(st, 'carol@example').people).toEqual([]);
    expect(search(st, 'sam@example.com').people).toEqual([]);
  });
  it('does not search message text', () => {
    expect(search(st, 'slides').chats).toEqual([]);
  });
  it('matches chat names', () => {
    expect(ids(search(st, 'clarity night').chats)).toEqual(['ch-night-oct02', 'ch-night-oct16']);
  });
});

describe('P1509 v12 unread and archive', () => {
  it('opening a chat clears its unread; tabs sum their chats', () => {
    let st = initialState();
    expect(tabsFor(st)[0]!.unread).toBe(5);
    st = openChat(st, 'dm-bob-alice');
    expect(unreadOf(st, 'dm-bob-alice')).toBe(0);
    expect(tabsFor(st)[0]!.unread).toBe(3);
  });

  it('archive moves a chat out of All into Archived; a new message brings it back, unread', () => {
    let st = archive(openChat(initialState(), 'dm-bob-eli'), 'dm-bob-eli');
    expect(ids(chatsInTab(st, 'all'))).not.toContain('dm-bob-eli');
    expect(ids(archivedChats(st))).toEqual(['dm-bob-eli']);
    const r = mockIncoming(st)!;
    expect(r.chatId).toBe('dm-bob-eli');
    st = r.next;
    expect(isArchived(st, 'dm-bob-eli')).toBe(false);
    expect(unreadOf(st, 'dm-bob-eli')).toBe(1);
  });

  it('incoming un-archives for the receiver only, never counts as unread for the sender', () => {
    let st = archive(initialState(), 'dm-bob-dana');
    st = incoming(st, 'dm-bob-dana', 'bob', 'hi');
    expect(st.unread.bob['dm-bob-dana']).toBe(1); // unchanged seed
    expect(st.unread.dana['dm-bob-dana']).toBe(1);
  });
});

describe('P1509 v12 rule leaks the backend must not copy', () => {
  it('forward refuses a SOURCE message the viewer cannot read', () => {
    const dana = initialState({ viewer: 'dana' });
    expect(forward(dana, 'm11', 'dm-bob-dana')).toBe(dana); // m11 is in Oct 2, Dana was not there
    expect(forward(dana, 'm6', 'dm-bob-dana')).toBe(dana); // m6 is Bob and Eli's 1:1
  });
  it('comment refuses a post the viewer cannot read', () => {
    const dana = initialState({ viewer: 'dana' });
    expect(comment(dana, 'm11', 'leak')).toBe(dana);
  });
  it('send refuses a chat the viewer cannot see', () => {
    const dana = initialState({ viewer: 'dana' });
    expect(send(dana, 'ch-fc-sept', 'leak')).toBe(dana);
  });
});

describe('P1509 v12 delivery', () => {
  it('a send reaches the other persona: unread, and out of the archive', () => {
    let st = archive(initialState(), 'dm-bob-dana');
    st = send({ ...st, viewer: 'dana' }, 'dm-bob-dana', 'hi');
    expect(st.unread.bob['dm-bob-dana']).toBe(2);
    expect(st.archived.bob).not.toContain('dm-bob-dana');
    expect(st.unread.dana['dm-bob-dana'] ?? 0).toBe(0); // never unread for the author
  });
  it('forwarding into an archived chat brings it back', () => {
    const st = forward(archive(initialState(), 'dm-bob-carol'), 'm3', 'dm-bob-carol');
    expect(isArchived(st, 'dm-bob-carol')).toBe(false);
  });
  it('a failed send reaches nobody until Retry', () => {
    let st = send(initialState({ fail: true, viewer: 'dana' }), 'dm-bob-dana', 'hi');
    expect(st.unread.bob['dm-bob-dana']).toBe(1);
    st = retry(st, st.msgs.at(-1)!.id);
    expect(st.unread.bob['dm-bob-dana']).toBe(2);
  });
  it('a new 1:1 gets one id per pair, whoever starts it', () => {
    const a = dmWith(initialState(), 'fay')!;
    expect(a.chatId).toBe('dm-bob-fay');
    expect(dmWith({ ...a.next, viewer: 'dana' }, 'fay')!.chatId).toBe('dm-dana-fay');
  });
  it('?state=fail: a comment fails too, and Retry fixes it', () => {
    let st = comment(initialState({ fail: true }), 'm9', 'x');
    const c = st.comments.m9!.at(-1)!;
    expect(c.failed).toBe(true);
    st = retry(st, c.id);
    expect(st.comments.m9!.at(-1)!.failed).toBeUndefined();
  });
});

describe('P1509 v12 writing', () => {
  it('forward names the original author through re-forwards, and only into a chat I can see', () => {
    let st = forward(initialState(), 'm2', 'dm-bob-carol');
    const copy = st.msgs.at(-1)!;
    expect(copy).toMatchObject({ chatId: 'dm-bob-carol', who: 'bob', fwdFrom: 'sam' });
    st = forward(st, copy.id, 'dm-bob-eli');
    expect(st.msgs.at(-1)!.fwdFrom).toBe('sam');
    const dana = initialState({ viewer: 'dana' });
    expect(forward(dana, 'm7', 'dm-bob-alice')).toBe(dana);
  });

  it('a comment can be forwarded too', () => {
    const st = forward(initialState(), 'c1', 'dm-bob-alice');
    expect(st.msgs.at(-1)).toMatchObject({ fwdFrom: 'carol', text: 'I will bring one about remote work.' });
  });

  it('comments hang under their post', () => {
    const st = comment(initialState({ viewer: 'dana' }), 'm10', 'Great evening');
    expect(st.comments.m10).toHaveLength(1);
    expect(st.comments.m10![0]!.who).toBe('dana');
  });

  it('?state=fail: a send fails, Retry sends it', () => {
    let st = send(initialState({ fail: true }), 'dm-bob-alice', 'hello');
    const sent = st.msgs.at(-1)!;
    expect(sent.failed).toBe(true);
    st = retry(st, sent.id);
    expect(st.msgs.find((x) => x.id === sent.id)!.failed).toBeUndefined();
  });
});
