/**
 * @file p1509-v16-state.test.ts
 * @description P1509 v14 rules: # general per group (members only), the single Groups folder, leave, the 📎 search
 * (words, multi #tag, kind, scope), forward with a note, voice notes (under 1 s dropped), the live transcript (speaker
 * is author, table lines go to the table's thread), the no-partners state and the new-chat opener's shared context.
 */
import { describe, expect, it } from 'vitest';
import type { Shareable } from '@/app/prototypes/clarity-chat-v16/mock-data';
import {
  archive, archivedUnreadCount, canSee, chatById, chatsInTab, comment, deleteMsg, editMsg, filterShareables, forward, groupSections, initialState, leaveGroup,
  liveLinesLeft, membersOnly, msgsOf, nextLiveLine, repliesOf, search, send, sendVoice, sharedWith, tabsFor, totalUnread, visibleChats, type State,
  acceptInvite, attendeesOf, channelMembers, claimMirror, clarify, groupActivity, groupOfEvent, isGoing, markUnread, mirrorLabel, openChat, renameMirror, toggleRsvp, invitePartner, isMember, joinGroup, mirrorName, myGroups, partnerState, positionOf, setPosition, unreadOf,
} from '@/app/prototypes/clarity-chat-v16/state';

const asDana = (st: State): State => ({ ...st, viewer: 'dana' });

describe('P1509 v16 state (v14 rules kept)', () => {
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

  it('v16: leaving a group removes its General channel for me only (event channels follow my RSVPs); an attendee cannot leave', () => {
    const st = leaveGroup(initialState(), 'cm');
    expect(visibleChats(st).some((c) => c.id === 'gen-cm')).toBe(false);
    expect(visibleChats(st).some((c) => c.id === 'ch-night-oct16')).toBe(true); // Bob still has a seat
    expect(visibleChats(asDana(st)).some((c) => c.id === 'ch-night-oct16')).toBe(true);
    const d = asDana(initialState());
    expect(leaveGroup(d, 'cm')).toBe(d);
  });

  it('📎 search over MY real items: words, AND over #tags, kind filter', () => {
    const item = (id: string, kind: 'point' | 'story', title: string, tags: string[]): Shareable => ({ id, kind, title, tags, real: {} });
    const mine = [
      item('pt-bob-1', 'point', 'Disagreement is information, not a threat', ['conflict', 'work']),
      item('st-bob-1', 'story', 'The hike where we got lost on purpose', ['trust', 'outdoors']),
      item('pt-bob-2', 'point', 'Repeat back before you reply', ['listening', 'work']),
    ];
    expect(filterShareables(mine, '#work #conflict').map((x) => x.id)).toEqual(['pt-bob-1']);
    expect(filterShareables(mine, 'hike').map((x) => x.id)).toEqual(['st-bob-1']);
    expect(filterShareables(mine, '', 'story').every((x) => x.kind === 'story')).toBe(true);
    expect(filterShareables(mine, '#listening', 'point').map((x) => x.id)).toEqual(['pt-bob-2']);
    expect(filterShareables(mine, '#work #outdoors')).toEqual([]);
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

  it('v16: a position is a local overlay on the real one: the real position shows until I change it, and taking the same one clears it', () => {
    let st = initialState();
    expect(positionOf(st, 'pt-x', 'unsure')).toBe('unsure'); // the service said unsure; nothing changed here
    st = setPosition(st, 'pt-x', 'agree', 'unsure'); // I take another position
    expect(positionOf(st, 'pt-x', 'unsure')).toBe('agree');
    st = setPosition(st, 'pt-x', 'agree', 'unsure'); // the same one again clears it, even though the server still says unsure
    expect(positionOf(st, 'pt-x', 'unsure')).toBeNull();
    const same = setPosition(initialState(), 'pt-y', 'unsure', 'unsure'); // clicking the real position clears it
    expect(positionOf(same, 'pt-y', 'unsure')).toBeNull();
  });

  it('v16: join and leave take the real membership from the caller (a local overlay, never a write)', () => {
    const joined = joinGroup(initialState(), 'some-real-group', false);
    expect(isMember(joined, 'bob', 'some-real-group')).toBe(true);
    expect(joinGroup(joined, 'some-real-group', true)).toBe(joined);
    const left = leaveGroup(initialState(), 'some-real-group', true);
    expect(left.left.bob).toContain('some-real-group');
    const d = asDana(initialState());
    expect(leaveGroup(d, 'some-real-group', false)).toBe(d);
  });
});

describe('P1509 v16 review fixes (state)', () => {
  it('#2 a seeded attendee can Cancel RSVP (and reserve again); cancelling closes the event channel', () => {
    let st = asDana(initialState());
    expect(isGoing(st, 'night-oct16')).toBe(true);
    st = toggleRsvp(st, 'night-oct16');
    expect(isGoing(st, 'night-oct16')).toBe(false);
    expect(attendeesOf(st, 'night-oct16')).not.toContain('dana');
    expect(visibleChats(st).some((c) => c.id === 'ch-night-oct16')).toBe(false);
    st = toggleRsvp(st, 'night-oct16');
    expect(isGoing(st, 'night-oct16')).toBe(true);
    expect(visibleChats(st).some((c) => c.id === 'ch-night-oct16')).toBe(true);
    /* v16: an event channel IS that event's RSVPs, so a group member loses it too when they cancel, and is never let in without a seat. */
    const bob = toggleRsvp(initialState(), 'night-oct16');
    expect(isGoing(bob, 'night-oct16')).toBe(false);
    expect(visibleChats(bob).some((c) => c.id === 'ch-night-oct16')).toBe(false);
    expect(visibleChats(initialState()).some((c) => c.id === 'ch-online-sept')).toBe(true); // Bob RSVPd to the online one without being in that group
    expect(visibleChats(initialState()).some((c) => c.id === 'ch-online-oct23')).toBe(false); // member of nothing there, no seat
    expect(canSee('carol', chatById(initialState(), 'ch-night-oct16')!)).toBe(false); // Carol is in the cm group but has no seat tonight
  });

  it('#6 Clarify on an unclaimed mirror claims it with the default name and the card remembers where it came from (it links there, there is no Back bar)', () => {
    const st = clarify(initialState(), 'm3');
    expect(mirrorName(st)).toBe("Bob's mirror");
    expect(msgsOf(st, 'mirror-bob').map((x) => x.quote?.text ?? x.text)).toEqual(['This is the exercise I want to try.', expect.any(String)]);
    expect(msgsOf(st, 'mirror-bob').find((x) => x.quote)?.from).toBe('dm-bob-alice');
    /* A claimed name is never overwritten. */
    expect(mirrorName(clarify(claimMirror(initialState(), 'Echo'), 'm3'))).toBe('Echo');
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

describe('P1509 v16 iteration (state)', () => {
  it('General is the group\'s members; an event channel is exactly that event\'s RSVPs', () => {
    const st = initialState();
    expect(channelMembers(chatById(st, 'gen-cm')!)).toEqual(['bob', 'alice', 'carol']);
    expect(channelMembers(chatById(st, 'ch-night-oct16')!)).toEqual(['bob', 'alice', 'dana', 'fay']);
    expect(membersOnly(chatById(st, 'gen-cm')!)).toBe(true);
  });

  it('the mirror shows its role wherever its name shows: "<Name> · <First>\'s mirror"; the default name is not doubled; unclaimed stays "Your mirror"', () => {
    const st = initialState();
    expect(mirrorLabel(st)).toBe('Your mirror');
    expect(mirrorLabel(claimMirror(st, "Bob's mirror"))).toBe("Bob's mirror");
    expect(mirrorLabel(claimMirror(st, 'Echo'))).toBe("Echo · Bob's mirror");
    expect(mirrorLabel(asDana(claimMirror(asDana(st), 'Echo')))).toBe("Echo · Dana's mirror");
    expect(visibleChats(claimMirror(st, 'Echo'))[0]!.id).toBe('mirror-bob');
  });

  it('Rename works on a claimed and an unclaimed mirror; an empty or unchanged name is not a rename', () => {
    let st = renameMirror(initialState(), 'Echo');
    expect(mirrorName(st)).toBe('Echo');
    st = renameMirror(st, 'Narwhal');
    expect(mirrorName(st)).toBe('Narwhal');
    expect(renameMirror(st, '   ')).toBe(st);
    expect(renameMirror(st, 'Narwhal')).toBe(st);
  });

  it('forwarding a post that has a thread arrives as ONE card holding a copy of every reply; a post without one is a plain forward', () => {
    const st = forward(initialState(), 'm31', 'dm-bob-carol');
    const card = msgsOf(st, 'dm-bob-carol').at(-1)!;
    expect(card).toMatchObject({ threadCard: true, fwdFrom: 'alice', text: 'Table 1 · round 1' });
    const replies = repliesOf(st, card.id);
    expect(replies.map((r) => r.text)).toEqual(repliesOf(initialState(), 'm31').map((r) => r.text));
    expect(replies.map((r) => r.who)).toEqual(['bob', 'dana', 'bob']);
    expect(replies.every((r) => r.chatId === 'dm-bob-carol')).toBe(true);
    expect(new Set(replies.map((r) => r.id)).size).toBe(3); // distinct ids: the copy is its own thread
    expect(repliesOf(st, 'm31')).toHaveLength(3); // the original is untouched
    expect(msgsOf(forward(initialState(), 'm1', 'dm-bob-carol'), 'dm-bob-carol').at(-1)!.threadCard).toBeUndefined();
  });

  it('sending a post with a thread to the mirror (Clarify) is one card with the thread too, and a message already in the mirror can be clarified', () => {
    const st = clarify(initialState(), 'm9');
    const card = msgsOf(st, 'mirror-bob').find((x) => x.threadCard)!;
    expect(card.from).toBe('ch-night-oct16');
    expect(repliesOf(st, card.id)).toHaveLength(1);
    const again = clarify(st, card.id);
    expect(msgsOf(again, 'mirror-bob').filter((x) => x.quote).length).toBe(2);
    expect(msgsOf(again, 'mirror-bob').filter((x) => x.quote).at(-1)!.from).toBeUndefined(); // already in the mirror: nothing to link back to
  });

  it('Mark as unread: the chat shows unread again from that message on, never lowers a count, and ignores what I cannot read', () => {
    let st = openChat(initialState(), 'dm-bob-alice');
    expect(unreadOf(st, 'dm-bob-alice')).toBe(0);
    st = markUnread(st, 'm1'); // Bob's own first message; Alice wrote two after it
    expect(unreadOf(st, 'dm-bob-alice')).toBe(2);
    expect(unreadOf(markUnread(st, 'm3'), 'dm-bob-alice')).toBe(2); // marking a later one never lowers it
    const fromLast = markUnread(openChat(initialState(), 'dm-bob-alice'), 'm3');
    expect(unreadOf(fromLast, 'dm-bob-alice')).toBe(1);
    expect(totalUnread(fromLast)).toBe(totalUnread(initialState()) - 2 + 1);
    expect(markUnread(initialState(), 'no-such-message')).toEqual(initialState());
    expect(unreadOf(markUnread(initialState(), 'm5'), 'dm-bob-dana')).toBe(1); // already unread: unchanged
  });

  it('groups sort by latest activity, a group with no chat yet last', () => {
    const joined = joinGroup(initialState(), 'online');
    expect(groupActivity(joined, 'cm')).toBeGreaterThan(groupActivity(joined, 'online')); // cm talked more recently
    expect(groupActivity(joined, 'nobody')).toBe(-1);
    const talked = send(joined, 'gen-online', 'Hello online');
    expect(groupActivity(talked, 'online')).toBeGreaterThan(groupActivity(talked, 'cm'));
  });

  it('partner states: the chat mock\'s accepted partners first, then what the agreements service reported, then an invite sent this visit', () => {
    let st = initialState();
    expect(partnerState(st, 'carol')).toBe('none');
    st = { ...st, realPartners: { carol: 'pending', eli: 'partner' } };
    expect(partnerState(st, 'carol')).toBe('pending');
    expect(partnerState(st, 'eli')).toBe('partner');
    expect(partnerState(st, 'alice')).toBe('none'); // the old mock pair is not consulted once the service has spoken
    st = invitePartner(initialState(), 'fay');
    expect(partnerState(st, 'fay')).toBe('pending');
    expect(partnerState({ ...st, realPartners: { fay: 'partner' } }, 'fay')).toBe('partner');
  });

  it('one source of truth for partners: the folder, the badge and the header all follow realPartners (and the strip\'s accept), never a hardcoded pair', () => {
    const st = { ...initialState({ seedPartners: false }), realPartners: { carol: 'partner' as const, eli: 'pending' as const } };
    expect(chatsInTab(st, 'partners').map((c) => c.id)).toEqual(['dm-bob-carol']);
    expect(partnerState(st, 'carol')).toBe('partner');
    expect(partnerState(st, 'alice')).toBe('none'); // the old mock pair is not consulted
    expect(partnerState(st, 'eli')).toBe('pending');
    expect(chatsInTab(initialState({ seedPartners: false }), 'partners')).toEqual([]);
    expect(chatsInTab(acceptInvite(invitePartner(initialState({ seedPartners: false }), 'carol'), 'carol'), 'partners').map((c) => c.id)).toEqual(['dm-bob-carol']);
  });

  it('event seats start from the viewer\'s real RSVPs when they are known, and an action still works on top', () => {
    let st: State = { ...initialState(), realGoing: { 'night-oct16': false, 'online-oct23': true } };
    expect(isGoing(st, 'night-oct16')).toBe(false); // the roster says Bob goes; the real RSVP says he cancelled
    expect(visibleChats(st).some((c) => c.id === 'ch-night-oct16')).toBe(false);
    expect(visibleChats(st).some((c) => c.id === 'ch-online-oct23')).toBe(true); // reserved earlier
    expect(isGoing(st, 'night-oct02')).toBe(true); // not in realGoing: the roster stands in
    st = toggleRsvp(st, 'night-oct16'); // reserve again
    expect(isGoing(st, 'night-oct16')).toBe(true);
    st = toggleRsvp(st, 'night-oct16');
    expect(isGoing(st, 'night-oct16')).toBe(false);
    st = toggleRsvp(st, 'online-oct23'); // cancel a seat that was reserved earlier
    expect(isGoing(st, 'online-oct23')).toBe(false);
  });
});
