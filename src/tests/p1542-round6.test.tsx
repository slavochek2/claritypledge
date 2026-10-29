// @vitest-environment jsdom
/**
 * P1542 founder UAT round 6 (decisions 39-46): smart offers (the group chat once opened), the room's ticks, the
 * centred CTA wrapper, the group-chat migration's shape, and Clarity Night left as it was.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/app/data/group-chat-opens-service', () => ({
  markGroupChatOpenedOnServer: (...a: unknown[]) => rpc('mark', ...a),
  readGroupChatOpenedOnServer: (...a: unknown[]) => rpc('read', ...a),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

import { RoomSteps } from '@/app/prototypes/events/rounds/RoomSteps';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { CLARITY_NIGHT_RECIPE, SOCIAL_HIKE_RECIPE } from '@/app/prototypes/events/series-recipes';
import {
  readPendingWrite,
  groupChatOpenedKey,
  normaliseChatLink,
  openedChatLabel,
  readLocalGroupChatOpened,
  useGroupChatOpened,
} from '@/app/prototypes/events/use-group-chat-opened';

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
const LINK = 'https://chat.whatsapp.com/AbCdEf123';

describe('round 6 recipes: what changes for a hike, and that Clarity Night does not', () => {
  it('a hike: no Transcribe bar, the shell Back to the event, smart offers, "Start now" and the finished state', () => {
    expect(SOCIAL_HIKE_RECIPE.room.transcribe).toBe(false);
    expect(SOCIAL_HIKE_RECIPE.room.backToEvent).toBe(true);
    expect(SOCIAL_HIKE_RECIPE.smartOffers).toBe(true);
    expect(SOCIAL_HIKE_RECIPE.roomClose.cta).toBe('Start now');
    expect(SOCIAL_HIKE_RECIPE.roomClose.finished).toBe('Thanks, your feedback is in.');
    expect(SOCIAL_HIKE_RECIPE.room.principleKicker).toBe('A commitment for this hike');
    expect(SOCIAL_HIKE_RECIPE.prepare.words!.roomEnd).toEqual({
      title: "You've learned the clarity principle", // founder round 9
      nextOptIn: 'Next: decide whether to try the principle on this hike.',
      nextFeedback: 'Next: tell us how the hike went (2 minutes).',
      toOptIn: 'Continue', // founder round 9
      toFeedback: 'Continue',
    });
  });
  it('Clarity Night keeps its Transcribe bar, its compact room header, its card and every offer', () => {
    expect(CLARITY_NIGHT_RECIPE.room.transcribe).toBe(true);
    expect(CLARITY_NIGHT_RECIPE.room.backToEvent).toBe(false);
    expect(CLARITY_NIGHT_RECIPE.smartOffers).toBe(false);
    expect(CLARITY_NIGHT_RECIPE.room.principleKicker).toBe('A commitment for this conversation');
    expect(CLARITY_NIGHT_RECIPE.roomClose).toEqual({ title: 'Thanks for coming', body: 'The evening has ended. Two minutes to tell us how it went?' });
  });
});

describe('RoomSteps: a tick means this person did it (round 6)', () => {
  const hikeBar = (done: { principle: boolean; close: boolean }, viewing: 'principle' | 'close' = 'close') =>
    render(
      <RoomSteps
        current="close"
        viewing={viewing}
        onSelect={() => {}}
        hidden={['ready', 'table', 'compare']}
        labels={{ principle: 'Opt in', close: 'Give feedback' }}
        done={done}
      />,
    );
  it('no tick on Opt in for someone who never answered, though the evening is past it', () => {
    hikeBar({ principle: false, close: false });
    expect(screen.queryByTestId('room-step-principle-check')).toBeNull();
    expect(screen.getByTestId('room-step-principle').getAttribute('data-state')).toBe('reached');
  });
  it('Opt in ticked once answered; Give feedback ticked once finished, even while it is the step on screen', () => {
    hikeBar({ principle: true, close: true });
    expect(screen.getByTestId('room-step-principle-check')).toBeTruthy();
    expect(screen.getByTestId('room-step-close-check')).toBeTruthy();
    expect(screen.getByTestId('room-step-close').getAttribute('aria-current')).toBe('step');
  });
  it('without the override the five-step bar keeps its rule (no tick on the step shown)', () => {
    render(<RoomSteps current="close" viewing="close" onSelect={() => {}} />);
    expect(screen.queryByTestId('room-step-close-check')).toBeNull();
  });
  it('the Learn step keeps its tick while the learning end is on screen', () => {
    render(<RoomSteps current="principle" viewing={null} onSelect={() => {}} labels={{ principle: 'Opt in' }} learn={{ done: true, active: true, onOpen: () => {} }} />);
    expect(screen.getByTestId('room-step-learn-check')).toBeTruthy();
    expect(screen.getByTestId('room-step-learn').textContent).toBe('Learn (optional)');
  });
});

describe('LetterPrimaryCta centres itself (decision 46)', () => {
  it('its max-w-sm wrapper carries mx-auto, so it is centred inside any wider container', () => {
    const { container } = render(<div style={{ width: 448 }}><LetterPrimaryCta label="Not now" variant="secondary" onClick={() => {}} /></div>);
    const wrapper = container.querySelector('button')!.parentElement!;
    expect(wrapper.className.split(' ')).toEqual(expect.arrayContaining(['mx-auto', 'w-full', 'max-w-sm']));
  });
});

describe('group chat opened (C): local first, the server as the record', () => {
  beforeEach(() => {
    localStorage.clear();
    rpc.mockReset();
  });
  afterEach(() => localStorage.clear());

  it('one key per link: trailing slashes, query strings and fragments do not split a group; case does (invite codes)', () => {
    expect(normaliseChatLink(` ${LINK}/?utm=x#y `)).toBe(LINK);
    expect(groupChatOpenedKey('u1', `${LINK}/`)).toBe(groupChatOpenedKey('u1', `${LINK}?a=1`));
    expect(groupChatOpenedKey('u1', LINK)).not.toBe(groupChatOpenedKey('u1', LINK.toLowerCase()));
    expect(groupChatOpenedKey('u1', LINK)).not.toBe(groupChatOpenedKey('u2', LINK));
    // The link itself is never stored.
    expect(groupChatOpenedKey('u1', LINK)).not.toContain('AbCdEf123');
  });

  it('round 7: Signal keeps its group code (in the fragment) — two Signal groups never share a key', () => {
    const a = 'https://signal.group/#CjQKIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const b = 'https://signal.group/#CjQKIBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    // The fragment (the group code) stays; only the slash before it goes — the server does the same.
    expect(normaliseChatLink(a)).toBe(a.replace('/#', '#'));
    expect(groupChatOpenedKey('u1', a)).not.toBe(groupChatOpenedKey('u1', b));
    // Unknown hosts keep their query too; only trailing slashes before it go.
    expect(normaliseChatLink('https://example.org/groups/x/?id=1')).toBe('https://example.org/groups/x?id=1');
  });

  it('round 7: WhatsApp / Telegram / Discord links differing only by ?utm or #… share a key (www. and host case ignored)', () => {
    expect(groupChatOpenedKey('u1', LINK)).toBe(groupChatOpenedKey('u1', `${LINK}?utm_source=x`));
    expect(normaliseChatLink('https://WWW.Chat.WhatsApp.com/AbCdEf123/#x')).toBe('https://WWW.Chat.WhatsApp.com/AbCdEf123');
    expect(normaliseChatLink('https://t.me/joinchat/Abc?x=1')).toBe('https://t.me/joinchat/Abc');
    expect(normaliseChatLink('https://discord.gg/abc#y')).toBe('https://discord.gg/abc');
  });

  it('round 7: only spaces, tabs and line breaks are trimmed — exactly what the server trims', () => {
    expect(normaliseChatLink(`\t${LINK}\r\n`)).toBe(LINK);
    expect(normaliseChatLink(`${LINK}\u00a0`)).toBe(`${LINK}\u00a0`); // a no-break space is not trimmed on either side
  });

  it('"Join WhatsApp group" reads "Open WhatsApp group" once opened', () => {
    expect(openedChatLabel('Join WhatsApp group')).toBe('Open WhatsApp group');
    expect(openedChatLabel('Join Discord server')).toBe('Open Discord server');
  });

  it('never opened, server unavailable (migration not applied): false, and the tap flips it at once and records it', async () => {
    rpc.mockImplementation(async (kind: string) => (kind === 'read' ? { ok: false, opened: false } : { ok: false }));
    const { result } = renderHook(() => useGroupChatOpened('ev1', LINK, 'u1'));
    await waitFor(() => expect(result.current.opened).toBe(false));
    act(() => result.current.markOpened('registration_thankyou'));
    expect(result.current.opened).toBe(true);
    expect(readLocalGroupChatOpened('u1', LINK)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('mark', 'ev1');
  });

  it('opened on another device: the server says so, and this browser remembers it', async () => {
    rpc.mockImplementation(async () => ({ ok: true, opened: true }));
    const { result } = renderHook(() => useGroupChatOpened('ev1', LINK, 'u1'));
    expect(result.current.opened).toBeUndefined(); // unknown while the read is out: no "Join" flash
    await waitFor(() => expect(result.current.opened).toBe(true));
    expect(readLocalGroupChatOpened('u1', LINK)).toBe(true);
  });

  it('opened in this browser: true at once, no server read needed', () => {
    localStorage.setItem(groupChatOpenedKey('u1', LINK), '1');
    const { result } = renderHook(() => useGroupChatOpened('ev2', `${LINK}/`, 'u1'));
    expect(result.current.opened).toBe(true);
    expect(rpc).not.toHaveBeenCalledWith('read', expect.anything());
  });

  it('round 6b: a tap whose server write failed stays pending, is retried on the next mount, and clears once it lands', async () => {
    rpc.mockImplementation(async (kind: string) => (kind === 'read' ? { ok: false, opened: false } : { ok: false }));
    const first = renderHook(() => useGroupChatOpened('ev1', LINK, 'u1'));
    await waitFor(() => expect(first.result.current.opened).toBe(false));
    await act(async () => { first.result.current.markOpened('feedback_thankyou'); });
    await waitFor(() => expect(readPendingWrite('u1', LINK)).toBe('ev1'));
    first.unmount();
    // Server reachable now (migration applied): the next mount sends the pending tap and clears the marker.
    rpc.mockReset();
    rpc.mockImplementation(async () => ({ ok: true, opened: true }));
    const second = renderHook(() => useGroupChatOpened('ev1', LINK, 'u1'));
    expect(second.result.current.opened).toBe(true); // a local positive still shows at once
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('mark', 'ev1'));
    await waitFor(() => expect(readPendingWrite('u1', LINK)).toBeNull());
  });

  it('a tap on one surface reaches every other surface on the page', async () => {
    rpc.mockImplementation(async () => ({ ok: false, opened: false }));
    const a = renderHook(() => useGroupChatOpened('ev1', LINK, 'u1'));
    const b = renderHook(() => useGroupChatOpened('ev3', LINK, 'u1'));
    await waitFor(() => expect(b.result.current.opened).toBe(false));
    act(() => a.result.current.markOpened('event_page'));
    expect(b.result.current.opened).toBe(true);
  });
});

describe('the group-chat migration (decision 43)', () => {
  const sql = read('supabase/migrations/20261027170000_p1542_group_chat_opens.sql');
  it('one row per person per chat link, read only by its owner, and NO client write policy', () => {
    expect(sql).toMatch(/PRIMARY KEY \(profile_id, chat_key\)/);
    expect(sql).toMatch(/FOR SELECT\s+TO authenticated\s+USING \(profile_id = \(SELECT auth\.uid\(\)\)\)/);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(sql).toMatch(/REVOKE ALL ON public\.group_chat_opens FROM PUBLIC, anon, authenticated;/);
  });
  it('the write takes an event id, hashes the link server-side, and refuses anyone not registered (or the host)', () => {
    const mark = sql.slice(sql.indexOf('FUNCTION public.mark_group_chat_opened'));
    expect(mark).toMatch(/SECURITY DEFINER/);
    expect(mark).toMatch(/RAISE EXCEPTION 'not registered for this event' USING ERRCODE = '42501'/);
    expect(mark).toMatch(/ON CONFLICT \(profile_id, chat_key\) DO NOTHING/);
    expect(sql).toMatch(/sha256\(convert_to\(/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.mark_group_chat_opened\(uuid\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.group_chat_key\(text\) FROM PUBLIC, anon, authenticated;/);
  });
});

describe('round 6 surfaces (source contract)', () => {
  const close = read('src/app/prototypes/events/close/EventClosePage.tsx');
  const room = read('src/app/prototypes/events/components/EventRoomMeet.tsx');
  const prep = read('src/app/prototypes/events/prep/EventPrepPage.tsx');
  it('the group terms opened from the thank-you: one Back (the shell bar\'s), to the thank-you, no refusal written', () => {
    // Round 6c (I): the pinned footer holds "Accept and join" alone; the top bar's "Back" is the way out.
    expect(close).toMatch(/secondary=\{startAtTerms \? undefined : <LetterPrimaryCta label="Not now"/);
    // Founder UAT round: the close's header moved to CloseHeader.tsx (EventClosePage.tsx may not grow).
    expect(read('src/app/prototypes/events/close/CloseHeader.tsx')).toMatch(/<FocusHeader onBack=\{p\.toEnd\} label="Back" aria-label="Back" \/>/);
    expect(close).toMatch(/toEnd=\{\(\) => go\('end'\)\}/);
    expect(close).toMatch(/onAnswer=\{\(\) => go\('end'\)\}/);
  });
  it('the hike thank-you offers the group chat only to someone who has not opened it', () => {
    expect(close).toMatch(/groupChatUrl && chat\.opened === false/);
  });
  it('the room reads finished feedback, hides the Transcribe bar for a hike, and Back always lands on the event', () => {
    expect(room).toMatch(/roomRecipe\.room\.transcribe && \(\s*<RoomTranscribeIdleBar/);
    // P1562 §2: the room's Back table lives in use-room-back.ts; Back to the event pops when the event page opened the
    // room, else replaces (useBackToEvent, past every room entry above it).
    expect(room).toMatch(/const roomBack = useRoomBack\(slug\);/);
    expect(read('src/app/prototypes/events/components/use-room-back.ts')).toMatch(/useBackToEvent\(slug, nav\.fromEvent, nav\.depth\)/);
    expect(room).toMatch(/done=\{shellBack \? \{ principle: answered, close: feedbackFinished === true \} : undefined\}/);
  });
  it('the learning in the room ends on its own screen, then replaces into the room', () => {
    expect(prep).toMatch(/data-testid="learn-room-end"/);
    expect(prep).toMatch(/navigate\(`\/events\/\$\{event\.slug\}\/room`, \{ replace: true, state: \{ roomStep, fromEvent: openedByEvent \} \}\)/);
    expect(prep).not.toMatch(/label="Back to the room"/);
  });
});

describe('round 6b fixes (source contract)', () => {
  const pieces = read('src/app/prototypes/events/prep/PrepPieces.tsx');
  const prepare = read('src/app/prototypes/events/prep/PreparePage.tsx');
  const close = read('src/app/prototypes/events/close/EventClosePage.tsx');
  const room = read('src/app/prototypes/events/components/EventRoomMeet.tsx');
  const steps = read('src/app/prototypes/events/rounds/RoomSteps.tsx');
  it('registration: once the chat was opened the link is gone; the caption sits directly under the link', () => {
    expect(pieces).toMatch(/const chat = groupChatUrl && opened === false;/);
    // Round 6c (F): the flow's one group-chat component, the same on the registration and both thank-yous.
    expect(pieces).toMatch(/<GroupChatOffer url=\{groupChatUrl\} caption="Last-minute changes, questions, lifts\." [\s\S]*?testId="registered-chat"/);
    expect(close).toMatch(/<GroupChatOffer url=\{groupChatUrl\} caption=\{recipe\.afterChatCaption\}/);
  });
  it('/prepare records the cmp7 part when its statements are finished (learned anywhere), and not on Skip', () => {
    expect(prepare).toMatch(/onContinue=\{\(\) => \{ if \(screen === 'cmp7'\) complete\('cmp7'\); go\(after\(screen\)\); \}\}/);
    expect(prepare).toMatch(/onSkip=\{\(\) => go\(after\(screen\)\)\}/);
    // complete() writes the account (markPrepPart) or, signed out, this browser (markLocalPart), at PART_VERSIONS.
    expect(prepare).toMatch(/markPrepPart\(viewerId, part, PART_VERSIONS\[part\], 'completed', now\)/);
    expect(prepare).toMatch(/setLocalRows\(localPartRows\(markLocalPart\(part, now\)\)\)/);
  });
  it('history: the room pushes the close marked fromRoom; the close returns by pop-or-replace, never a push', () => {
    // P1562 §2: the pushed close is still marked fromRoom, and now also carries the room's fromEvent and depth.
    // Founder UAT round: the room opens the close INSIDE itself (?view=feedback, one more room entry carrying the
    // room's marks), not by pushing /close (p1542-founder-uat-room.test.tsx exercises it).
    expect(room).toMatch(/onOpenFeedback=\{openFeedback\}/);
    expect(read('src/app/prototypes/events/components/use-room-views.ts')).toMatch(/navigate\(\{ search \}, \{ state: \{ \.\.\.roomState, \.\.\.extra, roomDepth: roomDepth \+ 1, pushedView: true \} \}\)/);
    expect(read('src/app/prototypes/events/components/use-room-back.ts')).toMatch(/closeState: \{ fromRoom: true, fromEvent: nav\.fromEvent, roomDepth: nav\.depth \}/);
    expect(read('src/app/prototypes/events/close/use-close-back.ts')).toMatch(/useReturnToParent\(`\/events\/\$\{slug\}\/room`, fromRoom, fromEvent \? \{ fromEvent: true \} : undefined\)/);
    expect(read('src/app/prototypes/events/close/CloseHeader.tsx')).toMatch(/<FocusHeader onBack=\{p\.backToEvent\} label="Back to the event"/);
    expect(close).toMatch(/backToEvent=\{backToEventPage\}/);
    expect(close).not.toMatch(/onBack=\{\(\) => navigate\(`\/events\/\$\{event\.slug\}`\)\}/);
  });
  it('the short step bar top-aligns its labels; the five-step bar keeps bottom-aligned labels', () => {
    expect(steps).toMatch(/labels \? 'justify-between' : 'justify-end'/);
  });
});

describe('round 6c (J): the registration learning invitation (source contract)', () => {
  const room = read('src/app/prototypes/events/prep/PrepRoom.tsx');
  const block = room.slice(room.indexOf('export function LearnInvitation'));
  it('subtitle in one constant (founder decision default), above the pill, then the blue "Learn more"', () => {
    expect(room).toMatch(/export const LEARN_INVITATION_SUBTITLE = 'How we talk across differences in opinions, interests and values\.';/);
    expect(block.indexOf('learn-card-reason')).toBeLessThan(block.indexOf('learn-card-minutes'));
    expect(block.indexOf('learn-card-minutes')).toBeLessThan(block.indexOf('learn-card-cta'));
    expect(block).toMatch(/\{started \? 'Continue' : 'Learn more'\}/);
    expect(block).toMatch(/bg-blue-600/);
    expect(block).not.toMatch(/variant="outline"/);
  });
});
