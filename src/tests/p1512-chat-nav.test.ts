/**
 * @file p1512-chat-nav.test.ts
 * @description P1512 — the chat's history rules, as three pure functions (chatNav, backPlan, leavePlan) and a
 * tiny history simulator that runs their plans. Every scenario is a finding from review: it starts from a real
 * stack of entries, performs the moves a person makes, and asserts what the stack looks like afterwards.
 */
import { describe, expect, it } from 'vitest';
import { backPlan, chatNav, chatPath, HOME, leavePlan, type NavIntent } from '@/app/pages/chat/chat-view-model';

type Entry = { pathname: string; state: unknown };

/** What react-router does with a plan, minus the browser. */
class History {
  entries: Entry[];
  at: number;
  constructor(...paths: Array<string | Entry>) {
    this.entries = paths.map((p) => (typeof p === 'string' ? { pathname: p, state: undefined } : p));
    this.at = this.entries.length - 1;
  }
  get cur() {
    return this.entries[this.at]!;
  }
  /** The paths from the bottom to the cursor: what Back can still reach. */
  get stack() {
    return this.entries.slice(0, this.at + 1).map((e) => e.pathname);
  }
  open(to: string, intent: NavIntent = 'open') {
    const plan = chatNav(this.cur, to, intent);
    if (plan.mode === 'none') return this;
    const next = { pathname: to.split('?')[0]!, state: plan.state };
    if (plan.mode === 'push') {
      this.entries = [...this.entries.slice(0, this.at + 1), next];
      this.at += 1;
    } else this.entries[this.at] = next;
    return this;
  }
  back() {
    const step = backPlan(this.cur.pathname, this.cur.state);
    if (step.kind === 'pop') this.at = Math.max(0, this.at - step.steps);
    else this.entries[this.at] = { pathname: step.to, state: step.state };
    return this;
  }
  leave() {
    const step = leavePlan(this.cur.pathname, this.cur.state);
    if (step.kind === 'replace') this.entries[this.at] = { pathname: step.to, state: undefined };
    else {
      this.at = Math.max(0, this.at - step.steps);
      if (step.kind === 'pop-replace') this.entries[this.at] = { pathname: step.to, state: undefined };
    }
    return this;
  }
  /** A browser back that is not ours: one entry down. */
  browserBack() {
    this.at = Math.max(0, this.at - 1);
    return this;
  }
}

const A = chatPath('A');
const B = chatPath('B');
const G = chatPath('G');
const MIRROR = chatPath('M');
const thread = (c: string, root: string, messageId?: string) => chatPath(c, { rootId: root, messageId });
const noChatBelow = (h: History) => h.stack.every((p) => !p.startsWith('/home/c/'));

describe('chatNav: which move, and what the new entry knows about what is below it', () => {
  const state = (below: string[]) => ({ below });
  const table: Array<{ name: string; from: Entry; to: string; intent?: NavIntent; expected: { mode: string; state?: unknown } }> = [
    { name: 'list -> chat pushes, list below', from: { pathname: HOME, state: undefined }, to: A, expected: { mode: 'push', state: state(['list']) } },
    { name: 'chat -> its thread pushes, the chat (and what it had) below', from: { pathname: A, state: state(['list']) }, to: thread('A', 'r'), expected: { mode: 'push', state: state(['conv', 'list']) } },
    { name: 'a cold chat -> thread pushes with only the chat below', from: { pathname: A, state: undefined }, to: thread('A', 'r'), expected: { mode: 'push', state: state(['conv']) } },
    { name: 'thread -> another thread of the chat replaces and keeps what is below', from: { pathname: thread('A', 'r'), state: state(['conv', 'list']) }, to: thread('A', 's'), expected: { mode: 'replace', state: state(['conv', 'list']) } },
    { name: 'the same entry again does nothing', from: { pathname: thread('A', 'r'), state: state(['conv', 'list']) }, to: thread('A', 'r'), expected: { mode: 'none' } },
    { name: 'chat -> another chat replaces; the first is no longer a way back', from: { pathname: A, state: state(['list']) }, to: B, expected: { mode: 'replace', state: state(['list']) } },
    { name: 'thread -> another chat replaces; the old chat below becomes stale', from: { pathname: thread('A', 'r'), state: state(['conv', 'list']) }, to: B, expected: { mode: 'replace', state: state(['skip', 'list']) } },
    { name: 'chat -> thread by a search hit replaces; no chat of its own below', from: { pathname: A, state: state(['list']) }, to: thread('A', 'r', 'm'), intent: 'redirect', expected: { mode: 'replace', state: state(['list']) } },
    { name: 'Clarify pushes the mirror on top of the chat', from: { pathname: A, state: state(['list']) }, to: MIRROR, intent: 'follow', expected: { mode: 'push', state: state(['conv', 'list']) } },
    { name: 'Clarify from a thread pushes the mirror on top of the thread', from: { pathname: thread('G', 'r'), state: state(['conv', 'list']) }, to: MIRROR, intent: 'follow', expected: { mode: 'push', state: state(['conv', 'conv', 'list']) } },
    { name: 'following a link into another chat pushes on top of this one', from: { pathname: A, state: state(['list']) }, to: B, intent: 'follow', expected: { mode: 'push', state: state(['conv', 'list']) } },
    { name: 'following a link into a thread of ANOTHER chat: this chat is where it came from, not its parent', from: { pathname: A, state: state(['list']) }, to: thread('B', 'r'), intent: 'follow', expected: { mode: 'push', state: state(['from', 'list']) } },
  ];
  it.each(table)('$name', ({ from, to, intent, expected }) => {
    const plan = chatNav(from, to, intent);
    expect(plan.mode).toBe(expected.mode);
    if (expected.mode !== 'none') expect(plan.state).toEqual(expected.state);
  });
});

describe('backPlan', () => {
  it.each([
    ['a chat opened from the list pops one', A, { below: ['list'] }, { kind: 'pop', steps: 1 }],
    ['a chat arrived at cold goes to the list with replace', A, undefined, { kind: 'replace', to: HOME, state: undefined }],
    ['a thread on its chat pops one', thread('A', 'r'), { below: ['conv', 'list'] }, { kind: 'pop', steps: 1 }],
    ['a thread with only the list below goes to ITS chat with replace', thread('A', 'r'), { below: ['list'] }, { kind: 'replace', to: A, state: { below: ['list'] } }],
    ['a cold thread goes to its chat with replace', thread('A', 'r'), undefined, { kind: 'replace', to: A, state: { below: [] } }],
    ['a chat that replaced a stale one pops over it, to the list', B, { below: ['skip', 'list'] }, { kind: 'pop', steps: 2 }],
    ['a mirror opened by Clarify pops back to the chat it came from', MIRROR, { below: ['conv', 'list'] }, { kind: 'pop', steps: 1 }],
    ['a thread followed into from another chat goes to ITS chat, not back to where it came from', thread('B', 'r'), { below: ['from', 'list'] }, { kind: 'replace', to: B, state: { below: ['from', 'list'] } }],
    ['a thread whose own chat is not directly below does not pop to a chat further down', thread('B', 'r'), { below: ['skip', 'conv', 'list'] }, { kind: 'replace', to: B, state: { below: ['skip', 'conv', 'list'] } }],
    ['a chat that was followed into pops back to where it came from', B, { below: ['from', 'list'] }, { kind: 'pop', steps: 1 }],
  ])('%s', (_name, pathname, state, expected) => {
    expect(backPlan(pathname as string, state)).toEqual(expected);
  });
});

describe('leavePlan', () => {
  it.each([
    ['a chat from the list pops to the list', A, { below: ['list'] }, { kind: 'pop', steps: 1 }],
    ['a thread from the list pops over the thread and its chat', thread('A', 'r'), { below: ['conv', 'list'] }, { kind: 'pop', steps: 2 }],
    ['a cold chat is replaced by the list', A, undefined, { kind: 'replace', to: HOME }],
    ['a cold chat\'s thread: back over the thread, then the chat is replaced', thread('A', 'r'), { below: ['conv'] }, { kind: 'pop-replace', steps: 1, to: HOME }],
    ['the list is found past stale entries', B, { below: ['skip', 'list'] }, { kind: 'pop', steps: 2 }],
  ])('%s', (_name, pathname, state, expected) => {
    expect(leavePlan(pathname as string, state)).toEqual(expected);
  });
});

describe('the review findings, as moves on a real history', () => {
  it('(1) a thread reply found by search: Back goes to the conversation, then to the list', () => {
    const h = new History('/feed', HOME, { pathname: A, state: { below: ['list'] } });
    h.open(thread('A', 'r', 'm'), 'redirect');
    expect(h.stack).toEqual(['/feed', HOME, thread('A', 'r')]);
    h.back();
    expect(h.cur.pathname).toBe(A);
    h.back();
    expect(h.cur.pathname).toBe(HOME);
  });

  it('(2) a cold-arrived channel -> thread -> archive or mark unread leaves no channel behind', () => {
    const h = new History('/feed', A);
    h.open(thread('A', 'r'));
    h.leave();
    expect(h.cur.pathname).toBe(HOME);
    expect(noChatBelow(h)).toBe(true);
    expect(h.stack).toEqual(['/feed', HOME]);
  });

  it('(3) list beside an open thread -> select another chat: Back goes to the list, not the first channel', () => {
    const h = new History('/feed', HOME);
    h.open(A);
    h.open(thread('A', 'r'));
    h.open(B);
    expect(h.cur.pathname).toBe(B);
    h.back();
    expect(h.cur.pathname).toBe(HOME);
    // leaving works the same
    const g = new History('/feed', HOME);
    g.open(A).open(thread('A', 'r')).open(B).leave();
    expect(g.cur.pathname).toBe(HOME);
  });

  it('(4) list -> chat -> Clarify -> mirror -> select another chat: Back goes to the list, not into the chat', () => {
    const h = new History('/feed', HOME);
    h.open(A).open(MIRROR, 'follow');
    expect(h.stack).toEqual(['/feed', HOME, A, MIRROR]);
    h.open(B);
    expect(h.stack).toEqual(['/feed', HOME, A, B]);
    h.back();
    expect(h.cur.pathname).toBe(HOME);
  });

  it('(7) list -> chat G -> its thread -> "Open original" into another chat\'s thread: Back goes to that chat (not G), and from there back to the thread', () => {
    const h = new History('/feed', HOME);
    h.open(G).open(thread('G', 'Y')).open(thread('C', 'r'), 'follow');
    expect(h.stack).toEqual(['/feed', HOME, G, thread('G', 'Y'), thread('C', 'r')]);
    h.back();
    expect(h.cur.pathname).toBe(chatPath('C'));
    expect(h.stack).toEqual(['/feed', HOME, G, thread('G', 'Y'), chatPath('C')]);
    h.back();
    expect(h.cur.pathname).toBe(thread('G', 'Y'));
  });

  it('(7b) list -> chat G -> thread 1 -> "Open original" into G\'s thread 2: closing it goes to G\'s chat, then back to thread 1', () => {
    const h = new History('/feed', HOME);
    h.open(G).open(thread('G', 'r1')).open(thread('G', 'r2'), 'follow');
    h.back();
    expect(h.cur.pathname).toBe(chatPath('G'));
    h.back();
    expect(h.cur.pathname).toBe(thread('G', 'r1'));
  });

  it('(8) list -> chat G -> Clarify -> mirror -> "Open original" in H\'s thread: closing it goes to H\'s chat, then back to the mirror', () => {
    const h = new History('/feed', HOME);
    h.open(G).open(MIRROR, 'follow').open(thread('H', 'r'), 'follow');
    h.back();
    expect(h.cur.pathname).toBe(chatPath('H'));
    h.back();
    expect(h.cur.pathname).toBe(MIRROR);
  });

  it('(4b) Back from the mirror itself returns to the chat that was clarified from', () => {
    const h = new History('/feed', HOME);
    h.open(A).open(MIRROR, 'follow').back();
    expect(h.cur.pathname).toBe(A);
  });

  it('(5) a chat reached from elsewhere (group page "Open chat") -> Clarify -> mirror: leaving leaves no chat behind', () => {
    const h = new History('/feed', '/groups/cm', G);
    h.open(MIRROR, 'follow');
    h.leave();
    expect(h.cur.pathname).toBe(HOME);
    expect(noChatBelow(h)).toBe(true);
    expect(h.stack).toEqual(['/feed', '/groups/cm', HOME]);
  });

  it('archiving from the list steps back to the list with nothing of the chat left, thread or not', () => {
    const h = new History('/feed', HOME);
    h.open(A).open(thread('A', 'r')).leave();
    expect(h.stack).toEqual(['/feed', HOME]);
    const g = new History('/feed', HOME);
    g.open(A).leave();
    expect(g.stack).toEqual(['/feed', HOME]);
  });

  it('opening another thread replaces the first, so closing the second goes to the chat', () => {
    const h = new History('/feed', HOME);
    h.open(A).open(thread('A', 'r')).open(thread('A', 's'));
    expect(h.stack).toEqual(['/feed', HOME, A, thread('A', 's')]);
    h.back();
    expect(h.cur.pathname).toBe(A);
  });

  it('Back out of a cold chat replaces it with the list and leaves no loop', () => {
    const h = new History('/feed', A);
    h.back();
    expect(h.stack).toEqual(['/feed', HOME]);
    h.browserBack();
    expect(h.cur.pathname).toBe('/feed');
  });
});
