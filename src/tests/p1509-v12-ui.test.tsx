/**
 * @file p1509-v12-ui.test.tsx
 * @description P1509 v12 walkthrough, one block per acceptance criterion that a DOM can decide: the list, the
 * folder rail + tabs and the ☰ drawer, member vs attendee folders, posting / thread replies / forwarding / picker
 * in the event channel, the transcript placeholder, the message toolbar (Reply, Forward on hover or tap),
 * "Forwarded from" + the stranger's profile (production's profile card), scoped search, Message, Invite as
 * partner in a 1:1, unread + archive, the three mock states, and that no cut v11 feature appears. Fictional
 * people only. The rail and the tabs are both in the DOM (CSS picks one per width), so tabs are read from the
 * phone tabs and ☰ from the first of its two buttons.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClarityChatV12 } from '@/app/prototypes/clarity-chat-v12/ClarityChatV12';

vi.setConfig({ testTimeout: 20_000 });

const renderV12 = (url = '/tree/clarity-chat') => render(<MemoryRouter initialEntries={[url]}><ClarityChatV12 /></MemoryRouter>);
const rows = () => screen.getByTestId('chat-rows');
const row = (id: string) => rows().querySelector<HTMLElement>(`[data-chat="${id}"]`);
const openRow = (id: string) => fireEvent.click(within(row(id)!).getAllByRole('button')[0]!);
const asDana = () => fireEvent.click(screen.getByRole('radio', { name: /Dana/ }));
const tabs = () => screen.getByTestId('folder-tabs');
const tab = (name: RegExp) => fireEvent.click(within(tabs()).getByRole('tab', { name }));
const openMenu = () => fireEvent.click(screen.getAllByRole('button', { name: 'Open menu' })[0]!);
const chatView = () => screen.getByTestId('chat-view');
const msg = (text: string | RegExp) => within(chatView()).getByText(text).closest('li')!;
/** A message's toolbar action (hover shows it on desktop, a tap on a phone; both are the same buttons). */
const act = (li: HTMLElement, name: 'Reply' | 'Forward') => fireEvent.click(within(within(li).getByRole('toolbar')).getByRole('button', { name }));
const MSG_BOX = /^Message /;
const typeAndSend = (root: HTMLElement, label: string | RegExp, text: string) => {
  fireEvent.change(within(root).getByRole('textbox', { name: label }), { target: { value: text } });
  fireEvent.click(within(root).getByRole('button', { name: 'Send' }));
};

describe('P1509 v12 prototype', () => {
  it('AC1: opens on the chat list with ☰, search and folder tabs; opening a chat shows it and Back returns', () => {
    renderV12();
    expect(screen.getAllByRole('button', { name: 'Open menu' })).toHaveLength(2); // the phone header's and the rail's
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy();
    expect(within(tabs()).getByRole('tab', { name: /^All chats/ })).toBeTruthy();
    expect(within(tabs()).getByRole('tab', { name: /^Unread/ })).toBeTruthy();
    expect(screen.getByTestId('chat-list').className).toContain('flex w-full');
    openRow('dm-bob-alice');
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
    expect(screen.getByTestId('chat-list').className).toContain('hidden');
    fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('chat-list').className).toContain('flex w-full');
  });

  it('AC2: the ☰ drawer opens with my profile on top, then the app pages with the bottom nav\'s labels, then today\'s event', () => {
    renderV12();
    openMenu();
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(menu.textContent).toContain('Bob Keller');
    const items = within(within(menu).getByRole('list', { name: 'Menu items' })).getAllByRole('listitem').map((li) => li.textContent).filter(Boolean);
    expect(items).toEqual(['My Profile', 'Home', 'Letters', 'Partners', 'Groups', 'Tools', "Today's eventClarity Night, Oct 16"]);
    // every page carries an icon, as in the bottom nav
    for (const label of ['Home', 'Letters', 'Partners', 'Groups', 'Tools']) expect(within(menu).getByText(label).closest('a,button')!.querySelector('svg')).toBeTruthy();
    expect(within(menu).getByText('Home').closest('a')!.getAttribute('href')).toBe('/feed');
    // Invite partner lives in a 1:1 now, not in the menu
    expect(within(menu).queryByText('Invite partner')).toBeNull();
    fireEvent.click(within(menu).getByTestId('menu-profile'));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    expect(screen.getByTestId('compact-profile-card').textContent).toContain('Bob Keller');
  });

  it('desktop: a dark folder rail holds ☰ and one folder per tab, with unread badges', () => {
    renderV12();
    const rail = screen.getByTestId('folder-rail');
    expect(rail.className).toContain('bg-slate-800');
    expect(within(rail).getByRole('button', { name: 'Open menu' })).toBeTruthy();
    // every folder is a line icon, groups included (no initials badges)
    for (const t of within(rail).getAllByRole('tab')) expect(t.querySelector('svg')).toBeTruthy();
    expect(within(rail).getAllByRole('tab').map((t) => t.lastElementChild!.textContent)).toEqual(['All chats', 'Unread', 'Partners', 'Chiang Mai Clarity', 'Founders Circle', 'Berlin Clarity']);
    fireEvent.click(within(rail).getByRole('tab', { name: /Partners/ }));
    expect(within(rows()).getAllByRole('listitem').map((li) => li.getAttribute('data-chat'))).toEqual(['dm-bob-alice']);
  });

  it('AC3: Bob\'s group tab shows all its channels; Dana\'s shows only the event channel', () => {
    renderV12();
    tab(/^Chiang Mai Clarity/);
    expect(row('ch-night-oct16')).toBeTruthy();
    expect(row('ch-night-oct02')).toBeTruthy();
    asDana();
    tab(/^Chiang Mai Clarity/);
    expect(row('ch-night-oct16')).toBeTruthy();
    expect(row('ch-night-oct02')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Founders Circle/ })).toBeNull();
  });

  for (const who of ['Bob', 'Dana'] as const) {
    it(`AC4 + AC5 (${who}): post, comment, forward and share in the event channel; the transcript placeholder is there`, () => {
      renderV12();
      if (who === 'Dana') asDana();
      openRow('ch-night-oct16');
      expect(within(chatView()).getByTestId('transcript-post').textContent).toContain('Transcript posted');
      typeAndSend(chatView(), MSG_BOX, `${who} was here`);
      expect(msg(`${who} was here`)).toBeTruthy();
      // reply in a post's thread: "1 reply" opens it beside the channel
      fireEvent.click(within(msg('Bring one disagreement you would like to understand better.')).getByTestId('replies-link'));
      const thread = screen.getByTestId('thread-panel');
      typeAndSend(thread, 'Reply in thread', `${who} replies`);
      expect(within(thread).getByText(`${who} replies`)).toBeTruthy();
      fireEvent.click(within(thread).getByRole('button', { name: 'Close thread' }));
      expect(within(msg('Bring one disagreement you would like to understand better.')).getByTestId('replies-link').textContent).toMatch(/2 replies$/);
      // the picker posts one of my points or stories
      fireEvent.click(within(chatView()).getByRole('button', { name: 'Post a point or story' }));
      const pick = screen.getByRole('dialog', { name: 'Post a point or story' });
      const first = within(pick).getAllByRole('button').find((b) => b.textContent?.startsWith('Point'))!;
      const title = first.textContent!.replace(/^Point/, '');
      fireEvent.click(first);
      expect(within(chatView()).getAllByTestId('share-card').some((c) => c.textContent?.includes(title))).toBe(true);
      // forward a post
      act(msg(`${who} was here`), 'Forward');
      const fwd = screen.getByRole('dialog', { name: 'Forward to' });
      const target = who === 'Bob' ? 'dm-bob-alice' : 'dm-dana-alice';
      fireEvent.click(within(fwd).getAllByRole('button').find((b) => b.textContent?.includes('Alice Moreau'))!);
      expect(screen.queryByRole('dialog', { name: 'Forward to' })).toBeNull();
      fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
      openRow(target);
      const copy = msg(`${who} was here`);
      expect(within(copy).getByTestId('forwarded-label').textContent).toBe(`Forwarded from ${who === 'Bob' ? 'Bob Keller' : 'Dana Ortiz'}`);
    });
  }

  it('AC6: every message carries Reply and Forward; Reply quotes in a 1:1 and opens the thread in a channel', () => {
    renderV12();
    openRow('dm-bob-alice');
    const li = msg('This is the exercise I want to try.');
    expect(within(within(li).getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Reply', 'Forward']);
    // a tap selects the row and shows the same toolbar on its own line
    // a mouse click selects nothing (hover already shows the toolbar); a tap selects the row
    fireEvent.pointerUp(within(li).getByText('This is the exercise I want to try.'), { pointerType: 'mouse' });
    expect(li.querySelector('[data-selected]')).toBeNull();
    fireEvent.pointerUp(within(li).getByText('This is the exercise I want to try.'), { pointerType: 'touch' });
    expect(li.querySelector('[data-selected]')).toBeTruthy();
    act(li, 'Reply');
    expect(screen.getByTestId('reply-bar').textContent).toContain('This is the exercise');
    typeAndSend(chatView(), MSG_BOX, 'Count me in');
    expect(within(msg('Count me in')).getByTestId('reply-quote').textContent).toContain('This is the exercise');
    expect(screen.queryByTestId('reply-bar')).toBeNull();
    // in a channel, Reply opens the post's thread
    fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    openRow('ch-night-oct16');
    act(msg('Bring one disagreement you would like to understand better.'), 'Reply');
    expect(within(screen.getByTestId('thread-panel')).getByText('I will bring one about remote work.')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('thread-panel')).toBeNull();
  });

  it('AC7: "Forwarded from" the stranger opens a profile with no Message button', () => {
    renderV12();
    openRow('dm-bob-alice');
    const label = within(chatView()).getByTestId('forwarded-label');
    expect(label.textContent).toBe('Forwarded from Sam Rivera');
    fireEvent.click(within(label).getByRole('button', { name: 'Sam Rivera' }));
    const profile = screen.getByTestId('profile');
    expect(within(profile).getByTestId('compact-profile-card').textContent).toContain('Sam Rivera');
    expect(within(profile).queryByRole('button', { name: 'Message' })).toBeNull();
    expect(profile.textContent).not.toContain('sam@example.com');
  });

  it('AC8: search finds a shared person, not the stranger by name or exact email', () => {
    renderV12();
    const box = screen.getByRole('textbox', { name: 'Search' });
    fireEvent.change(box, { target: { value: 'Carol' } });
    expect(within(screen.getByRole('list', { name: 'People results' })).getByText('Carol Singh')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'Sam Rivera' } });
    expect(within(screen.getByRole('list', { name: 'People results' })).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByTestId('search-no-people')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'sam@example.com' } });
    expect(within(screen.getByRole('list', { name: 'People results' })).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('AC9: a shared person\'s profile shows Message, which opens the 1:1', () => {
    renderV12();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'Carol' } });
    fireEvent.click(within(screen.getByRole('list', { name: 'People results' })).getByRole('button'));
    fireEvent.click(within(screen.getByTestId('profile')).getByRole('button', { name: 'Message' }));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-carol');
  });

  it('AC10: unread on chats and tabs; archive moves a chat under Archived chats; a mock message brings it back', () => {
    renderV12();
    expect(within(row('dm-bob-alice')!).getByLabelText('2 unread')).toBeTruthy();
    expect(within(within(tabs()).getByRole('tab', { name: /^All/ })).getByLabelText('5 unread')).toBeTruthy();
    fireEvent.contextMenu(within(row('dm-bob-eli')!).getAllByRole('button')[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/ }));
    expect(row('dm-bob-eli')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Archived chats/ }));
    expect(row('dm-bob-eli')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock new message' }));
    expect(row('dm-bob-eli')).toBeTruthy();
    expect(within(row('dm-bob-eli')!).getByLabelText('1 unread')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Archived chats/ })).toBeNull();
  });

  it('AC10b: swiping a row left archives it (mobile)', () => {
    renderV12();
    const b = within(row('dm-bob-carol')!).getAllByRole('button')[0]!;
    fireEvent.touchStart(b, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(b, { changedTouches: [{ clientX: 200, clientY: 410 }] });
    expect(row('dm-bob-carol')).toBeNull();
  });

  it('AC10c: a mostly vertical drag (a scroll) never archives', () => {
    renderV12();
    const b = within(row('dm-bob-carol')!).getAllByRole('button')[0]!;
    fireEvent.touchStart(b, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(b, { changedTouches: [{ clientX: 235, clientY: 150 }] });
    expect(row('dm-bob-carol')).toBeTruthy();
  });

  it('review: pressing a name or "Show all" inside a message does not select the row', () => {
    renderV12();
    openRow('ch-night-oct16');
    const transcript = within(chatView()).getByTestId('transcript-post').closest('li')!;
    fireEvent.click(within(transcript).getByRole('button', { name: 'Show all' }));
    expect(within(chatView()).getByRole('button', { name: 'Show less' })).toBeTruthy();
    expect(transcript.querySelector('[data-selected]')).toBeNull();
    const post = msg('Bring one disagreement you would like to understand better.');
    fireEvent.click(within(post).getByRole('button', { name: 'Bob Keller' }));
    expect(screen.getByTestId('profile')).toBeTruthy();
  });

  it('review: profile and members keep a Back button on desktop', () => {
    renderV12();
    openRow('ch-night-oct16');
    fireEvent.click(screen.getByTestId('channel-header'));
    const back = within(screen.getByTestId('members')).getByRole('button', { name: 'Back' });
    expect(back.className).not.toContain('lg:hidden');
    fireEvent.click(within(screen.getByTestId('members')).getByRole('button', { name: /Fay Okafor/ }));
    expect(within(screen.getByTestId('profile')).getByRole('button', { name: 'Back' }).className).not.toContain('lg:hidden');
    fireEvent.click(within(screen.getByTestId('profile')).getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('members')).toBeTruthy();
  });

  it('review: Message on someone with no 1:1 yet starts a new empty chat', () => {
    renderV12();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'Fay' } });
    fireEvent.click(within(screen.getByRole('list', { name: 'People results' })).getByRole('button'));
    fireEvent.click(within(screen.getByTestId('profile')).getByRole('button', { name: 'Message' }));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-fay');
    expect(within(chatView()).getByText(/No messages yet/)).toBeTruthy();
    typeAndSend(chatView(), MSG_BOX, 'Hi Fay');
    expect(msg('Hi Fay')).toBeTruthy();
  });

  it('Invite as partner sits in a 1:1 with someone who is not a partner yet, and opens the existing new-partner flow', () => {
    renderV12();
    openRow('dm-bob-carol');
    expect(within(chatView()).getByTestId('invite-as-partner').getAttribute('href')).toBe('/agreements/new');
    fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    openRow('dm-bob-alice');
    expect(within(chatView()).queryByTestId('invite-as-partner')).toBeNull();
    expect(within(chatView()).getByTestId('partner-chip').textContent).toBe('Partner');
  });

  it('review: after the Archived view empties, archiving again stays on the main list', () => {
    renderV12();
    fireEvent.contextMenu(within(row('dm-bob-eli')!).getAllByRole('button')[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/ }));
    fireEvent.click(screen.getByRole('button', { name: /Archived chats/ }));
    fireEvent.contextMenu(within(row('dm-bob-eli')!).getAllByRole('button')[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Unarchive/ }));
    fireEvent.contextMenu(within(row('dm-bob-carol')!).getAllByRole('button')[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/ }));
    expect(within(tabs()).getByRole('tab', { name: /^All/ })).toBeTruthy();
    expect(row('dm-bob-eli')).toBeTruthy();
    expect(row('dm-bob-carol')).toBeNull();
  });

  it('review: Escape closes the point/story picker', () => {
    renderV12();
    openRow('ch-night-oct16');
    fireEvent.click(within(chatView()).getByRole('button', { name: 'Post a point or story' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Post a point or story' })).toBeNull();
  });

  it('review: Enter that confirms an input-method word (IME) does not send', () => {
    renderV12();
    openRow('dm-bob-alice');
    const box = within(chatView()).getByRole('textbox', { name: MSG_BOX });
    fireEvent.change(box, { target: { value: 'にほ' } });
    const before = within(chatView()).getAllByRole('listitem').length;
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(within(chatView()).getAllByRole('listitem').length).toBe(before);
    fireEvent.keyDown(box, { key: 'Enter' });
    window.matchMedia = mm;
    expect(msg('にほ')).toBeTruthy();
  });

  it('review: Escape closes the side menu', () => {
    renderV12();
    openMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
  });

  it('review: a message Dana sends un-archives and badges the chat for Bob', () => {
    renderV12();
    fireEvent.contextMenu(within(row('dm-bob-dana')!).getAllByRole('button')[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/ }));
    expect(row('dm-bob-dana')).toBeNull();
    asDana();
    openRow('dm-bob-dana');
    typeAndSend(chatView(), MSG_BOX, 'See you there');
    fireEvent.click(screen.getByRole('radio', { name: /Bob/ }));
    expect(within(row('dm-bob-dana')!).getByLabelText('2 unread')).toBeTruthy();
  });

  it('AC11: ?state=empty, ?state=loading and ?state=fail each show their state', () => {
    const a = renderV12('/tree/clarity-chat?state=empty');
    expect(screen.getByTestId('empty-list').textContent).toContain('No chats yet');
    expect(within(screen.getByTestId('empty-list')).getByRole('link', { name: 'Invite partner' }).getAttribute('href')).toBe('/agreements/new');
    a.unmount();
    const b = renderV12('/tree/clarity-chat?state=loading');
    expect(screen.getByTestId('list-skeleton')).toBeTruthy();
    b.unmount();
    renderV12('/tree/clarity-chat?state=fail');
    const failed = screen.getByTestId('send-failed');
    expect(failed.textContent).toContain('Not sent');
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    expect(screen.queryByTestId('send-failed')).toBeNull();
  });

  it('empty group tab shows its empty state', () => {
    renderV12();
    tab(/^Berlin Clarity/);
    expect(screen.getByTestId('empty-group').textContent).toContain('No event channel');
  });

  it('AC12: no cut v11 feature appears, on any screen, for either persona', () => {
    const CUT = ['WhatsApp', 'Telegram', 'LinkedIn', 'Mira', 'Clarify', 'Edit', 'Delete', 'Details', 'Ledger', 'New chat', 'Explore', 'Settings', 'About', 'Trip planning', 'Ask Mira', 'Ask panel', 'emoji'];
    const check = (where: string) => { const text = document.body.textContent ?? ''; for (const cut of CUT) expect(text, `${cut} on ${where}`).not.toContain(cut); };
    renderV12();
    for (const persona of ['Bob', 'Dana'] as const) {
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(persona) }));
      check(`${persona} list`);
      openMenu(); check(`${persona} menu`);
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Close menu' })); // the scrim
      openRow('ch-night-oct16'); check(`${persona} channel`);
      fireEvent.click(within(msg('Bring one disagreement you would like to understand better.')).getByTestId('replies-link')); check(`${persona} thread`);
      fireEvent.click(within(screen.getByTestId('thread-panel')).getByRole('button', { name: 'Close thread' }));
      fireEvent.click(screen.getByTestId('channel-header')); check(`${persona} members`);
      fireEvent.click(within(screen.getByTestId('members')).getByRole('button', { name: /Alice Moreau/ })); check(`${persona} profile`);
      fireEvent.click(within(screen.getByTestId('profile')).getByRole('button', { name: 'Back' }));
      fireEvent.click(within(screen.getByTestId('members')).getByRole('button', { name: 'Back' }));
      fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    }
  });
});
