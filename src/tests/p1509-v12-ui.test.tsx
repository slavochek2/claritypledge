/**
 * @file p1509-v12-ui.test.tsx
 * @description P1509 v12 walkthrough, one block per acceptance criterion that a DOM can decide: the list +
 * menu, member vs attendee tabs, posting/commenting/forwarding/picker in the event channel, the transcript
 * placeholder, the one message menu, "Forwarded from" + the stranger's profile, scoped search, Message, unread +
 * archive, the three mock states, and that no cut v11 feature appears. Fictional people only.
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
const tab = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }));
const chatView = () => screen.getByTestId('chat-view');
const msg = (text: string | RegExp) => within(chatView()).getByText(text).closest('li')!;
/** Radix opens its menus on pointerdown. */
const openMenuOn = (li: HTMLElement) => fireEvent.pointerDown(within(li).getByRole('button', { name: 'Message' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
const typeAndSend = (root: HTMLElement, label: string, text: string) => {
  fireEvent.change(within(root).getByRole('textbox', { name: label }), { target: { value: text } });
  fireEvent.click(within(root).getByRole('button', { name: 'Send' }));
};

describe('P1509 v12 prototype', () => {
  it('AC1: opens on the chat list with ☰, search and folder tabs; opening a chat shows it and Back returns', () => {
    renderV12();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^All/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Unread/ })).toBeTruthy();
    expect(screen.getByTestId('chat-list').className).toContain('flex w-full');
    openRow('dm-bob-alice');
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
    expect(screen.getByTestId('chat-list').className).toContain('hidden');
    fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('chat-list').className).toContain('flex w-full');
  });

  it('AC2: the side menu lists the pages, today\'s event and Invite partner, profile at the bottom', () => {
    renderV12();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    for (const label of ['Feed', 'Letters', 'Partners', 'Groups', 'Tools', 'Invite partner']) expect(within(menu).getByText(label)).toBeTruthy();
    expect(within(menu).getByText("Today's event")).toBeTruthy();
    const profile = within(menu).getByTestId('menu-profile');
    expect(profile.textContent).toContain('Bob Keller');
    // the profile sits after the list
    expect(menu.querySelector('ul')!.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      typeAndSend(chatView(), 'Post to the channel', `${who} was here`);
      expect(msg(`${who} was here`)).toBeTruthy();
      // comment under a post
      fireEvent.click(within(msg('Bring one disagreement you would like to understand better.')).getByRole('button', { name: /comment/i }));
      const thread = screen.getByTestId('comments');
      typeAndSend(thread, 'Comment', `${who} comments`);
      expect(within(thread).getByText(`${who} comments`)).toBeTruthy();
      fireEvent.click(within(thread).getAllByRole('button', { name: 'Back' })[0]!);
      // the picker posts one of my points or stories
      fireEvent.click(within(chatView()).getByRole('button', { name: 'Post a point or story' }));
      const pick = screen.getByRole('dialog', { name: 'Post a point or story' });
      const first = within(pick).getAllByRole('button').find((b) => b.textContent?.startsWith('Point'))!;
      const title = first.textContent!.replace(/^Point/, '');
      fireEvent.click(first);
      expect(within(chatView()).getAllByTestId('share-card').some((c) => c.textContent?.includes(title))).toBe(true);
      // forward a post
      openMenuOn(msg(`${who} was here`));
      fireEvent.click(screen.getByRole('menuitem', { name: /Forward/ }));
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

  it('AC6: one menu with Reply and Forward; Reply quotes in a 1:1 and opens comments in a channel', () => {
    renderV12();
    openRow('dm-bob-alice');
    openMenuOn(msg('This is the exercise I want to try.'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Reply', 'Forward']);
    fireEvent.click(screen.getByRole('menuitem', { name: /Reply/ }));
    expect(screen.getByTestId('reply-bar').textContent).toContain('This is the exercise');
    typeAndSend(chatView(), 'Message', 'Count me in');
    expect(within(msg('Count me in')).getByTestId('reply-quote').textContent).toContain('This is the exercise');
    // in a channel, Reply opens the post's comments
    fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    openRow('ch-night-oct16');
    openMenuOn(msg('Bring one disagreement you would like to understand better.'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Reply/ }));
    expect(screen.getByTestId('comments')).toBeTruthy();
  });

  it('AC7: "Forwarded from" the stranger opens a profile with no Message button', () => {
    renderV12();
    openRow('dm-bob-alice');
    const label = within(chatView()).getByTestId('forwarded-label');
    expect(label.textContent).toBe('Forwarded from Sam Rivera');
    fireEvent.click(within(label).getByRole('button', { name: 'Sam Rivera' }));
    const profile = screen.getByTestId('profile');
    expect(within(profile).getByText('Sam Rivera')).toBeTruthy();
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
    expect(within(screen.getByRole('tab', { name: /^All/ })).getByLabelText('5 unread')).toBeTruthy();
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

  it('review: pressing a name or "Show all" inside a bubble does not open the bubble menu', () => {
    renderV12();
    openRow('ch-night-oct16');
    const showAll = within(chatView()).getByRole('button', { name: 'Show all' });
    fireEvent.pointerDown(showAll, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(showAll);
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(within(chatView()).getByRole('button', { name: 'Show less' })).toBeTruthy();
    const name = within(msg('Bring one disagreement you would like to understand better.')).getByRole('button', { name: 'Bob Keller' });
    fireEvent.pointerDown(name, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('review: profile, members and invite keep a Back button on desktop', () => {
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
    typeAndSend(chatView(), 'Message', 'Hi Fay');
    expect(msg('Hi Fay')).toBeTruthy();
  });

  it('review: Invite partner opens the existing new-partner flow', () => {
    renderV12();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Invite partner' }));
    expect(within(screen.getByTestId('invite')).getByRole('link').getAttribute('href')).toBe('/agreements/new');
  });

  it('review: Escape closes the side menu', () => {
    renderV12();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
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
    typeAndSend(chatView(), 'Message', 'See you there');
    fireEvent.click(screen.getByRole('radio', { name: /Bob/ }));
    expect(within(row('dm-bob-dana')!).getByLabelText('2 unread')).toBeTruthy();
  });

  it('AC11: ?state=empty, ?state=loading and ?state=fail each show their state', () => {
    const a = renderV12('/tree/clarity-chat?state=empty');
    expect(screen.getByTestId('empty-list').textContent).toContain('No chats yet');
    expect(within(screen.getByTestId('empty-list')).getByRole('button', { name: 'Invite partner' })).toBeTruthy();
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
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' })); check(`${persona} menu`);
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Close menu' }));
      openRow('ch-night-oct16'); check(`${persona} channel`);
      fireEvent.click(within(msg('Bring one disagreement you would like to understand better.')).getByRole('button', { name: /comment/i })); check(`${persona} comments`);
      fireEvent.click(within(screen.getByTestId('comments')).getAllByRole('button', { name: 'Back' })[0]!);
      fireEvent.click(screen.getByTestId('channel-header')); check(`${persona} members`);
      fireEvent.click(within(screen.getByTestId('members')).getByRole('button', { name: /Alice Moreau/ })); check(`${persona} profile`);
      fireEvent.click(within(screen.getByTestId('profile')).getByRole('button', { name: 'Back' }));
      fireEvent.click(within(screen.getByTestId('members')).getByRole('button', { name: 'Back' }));
      fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    }
  });
});
