/**
 * @file p1509-v15-state.test.ts
 * @description P1509 v14 rules: # general per group (members only), the single Groups folder, leave, the 📎 search
 * (words, multi #tag, kind, scope), forward with a note, voice notes (under 1 s dropped), the live transcript (speaker
 * is author, table lines go to the table's thread), the no-partners state and the new-chat opener's shared context.
 */
import { describe, expect, it } from 'vitest';
import {
  archive, archivedUnreadCount, canSee, chatById, chatsInTab, comment, deleteMsg, editMsg, findShareable, forward, groupSections, initialState, leaveGroup,
  liveLinesLeft, membersOnly, msgsOf, nextLiveLine, repliesOf, search, sendVoice, sharedWith, tabsFor, totalUnread, visibleChats, type State,
  acceptInvite, attendeesOf, claimMirror, clarify, clarifyOrigin, contactsOf, groupOfEvent, isGoing, lettersIn, openChat, toggleRsvp, invitePartner, isMember, joinGroup, mirrorName, myGroups, partnerState, positionOf, setPosition,
} from '@/app/prototypes/clarity-chat-v15/state';

const asDana = (st: State): State => ({ ...st, viewer: 'dana' });

describe('P1509 v15 state (v14 rules kept)', () => {
  it('v14: threads work in a 1:1 too', () => {
    const st = comment(initialState(), 'm1', 'in a thread');
    expect(repliesOf(st, 'm1').map((x) => x.text)).toEqual(['in a thread']);
  });

  it('v14: I can edit and delete my own message, never someone else\'s', () => {
    let st = editMsg(initialState(), 'm1', 'Ready for tonight, Alice?');
    expect(msgsOf(st, 'dm-bob-alice').find((x) => x.id === 'm1')).toMatchObject({ text: 'Ready for tonight, Alice?', edited: true });
    expect(editMsg(st, 'm3', 'hacked')).toBe(st);
    st = deleteMsg(st, 'm1');
    expect(msgsOf(st, 'dm-bob-alice').some((x) => x.id === 'm1')).toBe(false);
    expect(deleteMsg(st, 'm3')).toBe(st);
  });

  it('v14: the Archived row counts archived chats with unread; the Chats badge sums the rest', () => {
    const st = archive(archive(initialState(), 'dm-bob-carol'), 'dm-bob-eli');
    expect(archivedUnreadCount(st)).toBe(1); // carol has 1 unread, eli none
    expect(totalUnread(st)).toBe(2 + 1 + 2 + 1); // alice, dana, oct16, gen-cm
  });

  it('v14: search reaches people I share nothing with, flagged apart', () => {
    const r = search(initialState(), 'sam');
    expect(r.people).toEqual([]);
    expect(r.others).toEqual(['sam']);
    expect(search(initialState(), 'fay').people).toEqual(['fay']);
  });

  it('v14: # general is the members-only channel; event channels are not', () => {
    expect(membersOnly(chatById(initialState(), 'gen-cm')!)).toBe(true);
    expect(membersOnly(chatById(initialState(), 'ch-night-oct16')!)).toBe(false);
  });

  it('# general is members only; an event channel adds that event\'s attendees', () => {
    const st = initialState();
    expect(canSee('bob', chatById(st, 'gen-cm')!)).toBe(true);
    expect(canSee('dana', chatById(st, 'gen-cm')!)).toBe(false);
    expect(canSee('dana', chatById(st, 'ch-night-oct16')!)).toBe(true);
  });

  it('four fixed folders: Groups replaces one folder per group; Partners always present', () => {
    expect(tabsFor(initialState()).map((t) => t.id)).toEqual(['all', 'unread', 'partners', 'groups']);
    expect(tabsFor(initialState({ empty: true })).map((t) => t.id)).toEqual(['all', 'unread', 'partners']);
  });

  it('Groups sections list # general first, then the group\'s event channels; an attendee sees only their event', () => {
    const cm = groupSections(initialState()).find((g) => g.groupId === 'cm')!;
    expect(cm.chats.map((c) => c.id)).toEqual(['gen-cm', 'ch-night-oct16', 'ch-night-oct02']);
    expect(groupSections(asDana(initialState())).map((g) => [g.groupId, g.chats.map((c) => c.id)])).toEqual([['cm', ['ch-night-oct16']]]);
    expect(chatsInTab(initialState(), 'groups').every((c) => c.kind === 'channel')).toBe(true);
  });

  it('leaving a group removes its channels for me only; an attendee cannot leave', () => {
    const st = leaveGroup(initialState(), 'cm');
    expect(visibleChats(st).some((c) => c.groupId === 'cm')).toBe(false);
    expect(visibleChats(asDana(st)).some((c) => c.id === 'ch-night-oct16')).toBe(true);
    const d = asDana(initialState());
    expect(leaveGroup(d, 'cm')).toBe(d);
  });

  it('📎 search: words, AND over #tags, kind filter, and nothing from people I share nothing with', () => {
    const st = initialState();
    expect(findShareable(st, '#work #conflict').map((x) => x.id)).toEqual(['pt-bob-1']);
    expect(findShareable(st, 'sister').map((x) => x.id)).toEqual(['st-dana-1']);
    expect(findShareable(st, '', 'story').every((x) => x.kind === 'story')).toBe(true);
    expect(findShareable(st, '#listening', 'point').map((x) => x.id)).toEqual(['pt-dana-1']);
    // Dana shares nothing with Carol: Carol's story never appears for her
    expect(findShareable(asDana(st), 'design').length).toBe(0);
  });

  it('forward with a note: the copy names the original author, the note follows it', () => {
    const st = forward(initialState(), 'm2', 'dm-bob-carol', 'thought of you');
    const msgs = msgsOf(st, 'dm-bob-carol').slice(-2);
    expect(msgs[0]!.fwdFrom).toBe('sam');
    expect(msgs[1]!.text).toBe('thought of you');
  });

  it('a voice note under one second is dropped; a longer one is sent', () => {
    const st = initialState();
    expect(sendVoice(st, 'dm-bob-alice', 0)).toBe(st);
    expect(msgsOf(sendVoice(st, 'dm-bob-alice', 4), 'dm-bob-alice').at(-1)!.voice).toBe(4);
  });

  it('the live transcript posts as the speaker; table lines land in the table thread, the rest in the channel', () => {
    let st = initialState();
    const before = repliesOf(st, 'm31').length;
    st = nextLiveLine(st, 'ch-night-oct16');
    const last = repliesOf(st, 'm31').at(-1)!;
    expect(repliesOf(st, 'm31').length).toBe(before + 1);
    expect(last.who).toBe('alice');
    expect(last.transcribed).toBe(true);
    st = nextLiveLine(nextLiveLine(nextLiveLine(st, 'ch-night-oct16'), 'ch-night-oct16'), 'ch-night-oct16');
    expect(msgsOf(st, 'ch-night-oct16').at(-1)!.text).toMatch(/moves one table/);
    expect(liveLinesLeft(st, 'ch-night-oct16')).toBe(0);
    expect(nextLiveLine(st, 'ch-night-oct16')).toBe(st);
  });

  it('no partners: the Partners folder is empty; the new-chat opener names what two people share', () => {
    expect(chatsInTab(initialState({ noPartners: true }), 'partners')).toEqual([]);
    expect(chatsInTab(initialState(), 'partners').map((c) => c.id)).toEqual(['dm-bob-alice']);
    expect(sharedWith('bob', 'fay')).toBe('attend Clarity Night, Oct 16');
    expect(sharedWith('bob', 'eli')).toBe('attend Online practice, Sept 28');
  });

  it('v15: the real groups, by slug; every event belongs to its own group (online is never folded into cm)', () => {
    expect(myGroups(initialState()).map((g) => [g.slug, g.name])).toEqual([['cm', 'Communication Activism Community · Chiang Mai']]);
    expect(groupOfEvent('online-sept')).toBe('online');
    expect(groupOfEvent('night-oct16')).toBe('cm');
  });

  it('v15: joining a group makes me a member and shows its # general', () => {
    const st = joinGroup(initialState(), 'online');
    expect(isMember(st, 'bob', 'online')).toBe(true);
    expect(visibleChats(st).some((c) => c.id === 'gen-online')).toBe(true);
    expect(joinGroup(st, 'online')).toBe(st);
  });

  it('v15: one mirror per viewer, pinned first, claimed by naming it; Clarify quotes into it and the mirror replies', () => {
    let st = initialState();
    expect(visibleChats(st)[0]!.id).toBe('mirror-bob');
    expect(visibleChats(st).filter((c) => c.kind === 'mirror')).toHaveLength(1);
    expect(mirrorName(st)).toBe('Your mirror');
    st = claimMirror(st, 'Echo');
    expect(mirrorName(st)).toBe('Echo');
    expect(claimMirror(st, 'Other')).toBe(st);
    st = clarify(st, 'm3');
    const [q, a] = msgsOf(st, 'mirror-bob').slice(-2);
    expect(q!.quote).toEqual({ who: 'alice', text: 'This is the exercise I want to try.' });
    expect(a!.agent && a!.text).toBe('I’ll help you clarify this — coming soon');
  });

  it('v15: partner invite goes none -> pending -> partner', () => {
    let st = initialState();
    expect(partnerState(st, 'carol')).toBe('none');
    st = invitePartner(st, 'carol');
    expect(partnerState(st, 'carol')).toBe('pending');
    st = acceptInvite(st, 'carol');
    expect(partnerState(st, 'carol')).toBe('partner');
  });

  it('v15: a position toggles off when taken twice', () => {
    let st = setPosition(initialState(), 'pt-bob-1', 'agree');
    expect(positionOf(st, 'pt-bob-1')).toBe('agree');
    st = setPosition(st, 'pt-bob-1', 'agree');
    expect(positionOf(st, 'pt-bob-1')).toBeNull();
  });
});

describe('P1509 v15 review fixes (state)', () => {
  it('#2 a seeded attendee can Cancel RSVP (and reserve again); cancelling closes the event channel to a non-member', () => {
    let st = asDana(initialState());
    expect(isGoing(st, 'night-oct16')).toBe(true);
    st = toggleRsvp(st, 'night-oct16');
    expect(isGoing(st, 'night-oct16')).toBe(false);
    expect(attendeesOf(st, 'night-oct16')).not.toContain('dana');
    expect(visibleChats(st).some((c) => c.id === 'ch-night-oct16')).toBe(false);
    st = toggleRsvp(st, 'night-oct16');
    expect(isGoing(st, 'night-oct16')).toBe(true);
    expect(visibleChats(st).some((c) => c.id === 'ch-night-oct16')).toBe(true);
    /* A member keeps the channel when they cancel: it is the group's. */
    const bob = toggleRsvp(initialState(), 'night-oct16');
    expect(isGoing(bob, 'night-oct16')).toBe(false);
    expect(visibleChats(bob).some((c) => c.id === 'ch-night-oct16')).toBe(true);
  });

  it('#6 Clarify on an unclaimed mirror claims it with the default name and remembers where it came from', () => {
    const st = clarify(initialState(), 'm3');
    expect(mirrorName(st)).toBe("Bob's mirror");
    expect(msgsOf(st, 'mirror-bob').map((x) => x.quote?.text ?? x.text)).toEqual(['This is the exercise I want to try.', expect.any(String)]);
    expect(clarifyOrigin(st)?.id).toBe('dm-bob-alice');
    /* A claimed name is never overwritten. */
    expect(mirrorName(clarify(claimMirror(initialState(), 'Echo'), 'm3'))).toBe('Echo');
  });

  it('#8 Drafts and Published are the viewer\'s own; an empty viewer has no letters and no contacts', () => {
    const bob = initialState();
    const dana = asDana(bob);
    expect(lettersIn(bob, 'drafts').map((l) => l.id)).toEqual(['l-bob-draft']);
    expect(lettersIn(bob, 'sent').map((l) => l.id)).toEqual(['l-bob-sent']);
    expect(lettersIn(dana, 'drafts')).toEqual([]);
    expect(lettersIn(dana, 'sent')).toEqual([]);
    expect(lettersIn(dana, 'inbox').length).toBe(2);
    expect(contactsOf(bob).length).toBeGreaterThan(0);
    const empty = initialState({ empty: true });
    expect(contactsOf(empty)).toEqual([]);
    (['inbox', 'drafts', 'sent'] as const).forEach((b) => expect(lettersIn(empty, b)).toEqual([]));
  });

  it('#9 one source of truth: the badge total equals the All folder, the sum of rows, and drops by exactly what opening a chat reads', () => {
    let st = initialState();
    const rows = () => chatsInTab(st, 'all').reduce((n, c) => n + (st.unread[st.viewer][c.id] ?? 0), 0);
    expect(totalUnread(st)).toBe(7);
    expect(tabsFor(st)[0]!.unread).toBe(7);
    expect(rows()).toBe(7);
    st = openChat(st, 'dm-bob-alice');
    expect([totalUnread(st), tabsFor(st)[0]!.unread, rows()]).toEqual([5, 5, 5]);
  });
});
