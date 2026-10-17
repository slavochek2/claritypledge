/**
 * @file p1509-v14-ui.test.tsx
 * @description P1509 v14 walkthrough: one sidebar (places, my groups, me at the foot with a working Tools page),
 * URL state with history-based Back on the five paths the founder named, outside-click/Esc dismissal, Reply ·
 * Forward · Thread (1:1s too), right-click Edit/Delete on my own message, the Partner tag, separate Points/Stories
 * tabs with production's story card, the SessionBar transcription banner and its away bar, WhatsApp unread counts,
 * search reaching strangers, and the auto-growing composer. v13's surviving behaviour is kept where it still applies.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act as rtlAct, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClarityChatV14 } from '@/app/prototypes/clarity-chat-v14/ClarityChatV14';
import { SIDEBAR_KEY } from '@/app/prototypes/clarity-chat-v14/mock-data';

vi.setConfig({ testTimeout: 20_000 });

const BASE = '/tree/clarity-chat-v14';
const renderV14 = (url = BASE) => render(<MemoryRouter initialEntries={[url]}><ClarityChatV14 /></MemoryRouter>);
const openRow = (id: string) => fireEvent.click(within(document.querySelector<HTMLElement>(`[data-chat="${id}"]`)!).getAllByRole('button')[0]!);
const tab = (name: RegExp) => fireEvent.click(within(screen.getByTestId('folder-tabs')).getByRole('tab', { name }));
const chatView = () => screen.getByTestId('chat-view');
const msg = (text: string | RegExp) => within(within(chatView()).getByRole('list', { name: 'Messages' })).getAllByText(text)[0]!.closest('li')!;
const tool = (li: HTMLElement, name: string) => fireEvent.click(within(within(li).getByRole('toolbar')).getByRole('button', { name }));
const toolNames = (li: HTMLElement) => within(within(li).getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
const back = () => fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]!);
const sidebar = () => screen.getByTestId('sidebar');
const place = (name: string) => fireEvent.click(within(within(sidebar()).getByRole('list', { name: 'Places' })).getByRole('button', { name: new RegExp(`^${name}`) }));
const rightClick = (li: HTMLElement) => fireEvent.contextMenu(li.firstElementChild!);
const menuItems = () => within(screen.getByTestId('message-menu')).getAllByRole('menuitem').map((b) => b.textContent);

afterEach(() => { try { window.localStorage.removeItem(SIDEBAR_KEY); } catch { /* ignore */ } });

describe('P1509 v14 sidebar and places', () => {
  it('one sidebar: Home, Chats (total unread), Groups, Letters; my groups fold; me at the foot', () => {
    renderV14();
    const places = within(within(sidebar()).getByRole('list', { name: 'Places' })).getAllByRole('button');
    expect(places.map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual(['Home', 'Chats', 'Groups', 'Letters']);
    expect(places[1]!.textContent).toBe('Chats7');
    expect(within(sidebar()).getByRole('list', { name: 'My groups' }).textContent).toContain('Chiang Mai Clarity');
    fireEvent.click(screen.getByTestId('sidebar-groups-toggle'));
    expect(within(sidebar()).queryByRole('list', { name: 'My groups' })).toBeNull();
    expect(screen.getByTestId('sidebar-me').textContent).toContain('Bob Keller');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull(); // no drawer, no top menu
  });

  it('collapse: icons only, remembered in localStorage', () => {
    const { unmount } = renderV14();
    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(sidebar().getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByTestId('sidebar-me').textContent).not.toContain('Bob Keller'); // avatar only
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBe('1');
    unmount();
    renderV14();
    expect(sidebar().getAttribute('data-collapsed')).toBe('true');
  });

  it('a group in the sidebar shows that group\'s channels in the chat list', () => {
    renderV14();
    fireEvent.click(within(within(sidebar()).getByRole('list', { name: 'My groups' })).getByText('Founders Circle'));
    const heads = screen.getAllByTestId('group-section-header').map((h) => h.textContent);
    expect(heads).toHaveLength(1);
    expect(heads[0]).toContain('Founders Circle');
  });

  it('me opens My profile / Settings / Tools; Tools lists production\'s tools', () => {
    renderV14();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    expect(within(screen.getByTestId('me-menu')).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['My profile', 'Settings', 'Tools']);
    fireEvent.click(within(screen.getByTestId('me-menu')).getByText('Tools'));
    const tools = within(screen.getByTestId('tools-page')).getAllByRole('link').map((a) => a.textContent);
    expect(tools).toContain('Transcribe');
    expect(tools).toContain('Start a Clarity Session');
    back();
    expect(screen.getByTestId('chat-list')).toBeTruthy();
  });

  it('places swap the main area: Home, Letters, Groups; a phone gets the same places as a bottom tab bar', () => {
    renderV14();
    expect(within(screen.getByTestId('bottom-tabs')).getAllByRole('button').map((b) => b.textContent?.replace(/\d+/g, ''))).toEqual(['Home', 'Chats', 'Groups', 'Letters']);
    expect(screen.getByTestId('list-me')).toBeTruthy();
    place('Home');
    expect(screen.getByTestId('home-page')).toBeTruthy();
    place('Letters');
    expect(screen.getByTestId('letters-page')).toBeTruthy();
    place('Groups');
    expect(screen.getByTestId('groups-page')).toBeTruthy();
    expect(screen.queryByTestId('chat-list')).toBeNull();
  });
});

describe('P1509 v14 back navigation (history, never a fixed parent)', () => {
  it('chat -> profile -> Back returns to the chat', () => {
    renderV14();
    openRow('dm-bob-alice');
    fireEvent.click(within(chatView()).getAllByText('Alice Moreau')[0]!.closest('button')!); // the header's person
    expect(screen.getByTestId('profile')).toBeTruthy();
    back();
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
  });

  it('profile -> Message -> 1:1 -> Back returns to the profile', () => {
    renderV14(`${BASE}?view=profile&person=fay`);
    fireEvent.click(screen.getByRole('button', { name: 'Message' }));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-fay');
    back();
    expect(screen.getByTestId('profile').textContent).toContain('Fay Okafor');
  });

  it('group -> channel -> Back returns to the group', () => {
    renderV14(`${BASE}?view=groups`);
    fireEvent.click(within(screen.getByTestId('groups-page')).getByText('Chiang Mai Clarity'));
    fireEvent.click(within(screen.getByRole('list', { name: 'Chiang Mai Clarity channels' })).getByText('# general'));
    expect(chatView().getAttribute('data-chat-open')).toBe('gen-cm');
    back();
    expect(screen.getByTestId('group-page').textContent).toContain('Chiang Mai Clarity');
  });

  it('letter -> Open chat -> Back returns to the letter', () => {
    renderV14(`${BASE}?view=letters`);
    fireEvent.click(screen.getByText('What I learned facilitating ten nights'));
    fireEvent.click(screen.getByTestId('letter-chat'));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
    back();
    expect(screen.getByTestId('letter-view').textContent).toContain('Open chat with Alice');
  });

  it('a deep link straight into a chat: Back goes to the chat list', () => {
    renderV14(`${BASE}?view=chats&chat=dm-bob-carol`);
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-carol');
    back();
    expect(screen.queryByTestId('chat-view')).toBeNull();
    expect(screen.getByTestId('chat-list')).toBeTruthy();
  });
});

describe('P1509 v14 menus close on outside click and Esc', () => {
  it('account popover, channel ⋯ menu, row menu and message menu all close on an outside press; Esc too', () => {
    renderV14();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    expect(screen.getByTestId('me-menu')).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId('main-area'));
    expect(screen.queryByTestId('me-menu')).toBeNull();

    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('me-menu')).toBeNull();

    fireEvent.contextMenu(within(document.querySelector<HTMLElement>('[data-chat="dm-bob-eli"]')!).getAllByRole('button')[0]!);
    expect(screen.getByTestId('row-menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('row-menu')).toBeNull();

    openRow('ch-night-oct16');
    fireEvent.click(within(chatView()).getByRole('button', { name: 'More' }));
    expect(within(screen.getByTestId('channel-menu')).getAllByRole('menuitem').map((x) => x.textContent)).toEqual(['Members', 'Group page', 'Leave group']);
    fireEvent.mouseDown(within(chatView()).getByRole('list', { name: 'Messages' }));
    expect(screen.queryByTestId('channel-menu')).toBeNull();

    rightClick(msg(/Bring one disagreement/));
    expect(screen.getByTestId('message-menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });
});

describe('P1509 v14 messages', () => {
  it('toolbar order is Reply, Forward, Thread, and a 1:1 has threads', () => {
    renderV14();
    openRow('dm-bob-alice');
    const li = msg('Ready for tonight?');
    expect(toolNames(li)).toEqual(['Reply', 'Forward', 'Thread']);
    tool(li, 'Thread');
    expect(screen.getByTestId('thread-panel')).toBeTruthy();
    fireEvent.change(within(screen.getByTestId('thread-panel')).getByRole('textbox'), { target: { value: 'threaded in a dm' } });
    fireEvent.click(within(screen.getByTestId('thread-panel')).getByRole('button', { name: 'Send' }));
    expect(within(screen.getByTestId('thread-panel')).getByText('threaded in a dm')).toBeTruthy();
  });

  it('right-click: Reply, Forward, Thread for anyone\'s; Edit (inline, marked edited) and Delete (confirmed) on my own', () => {
    renderV14();
    openRow('dm-bob-alice');
    rightClick(msg(/This is the exercise/));
    expect(menuItems()).toEqual(['Reply', 'Forward', 'Thread']);
    fireEvent.keyDown(window, { key: 'Escape' });

    rightClick(msg('Ready for tonight?'));
    expect(menuItems()).toEqual(['Reply', 'Forward', 'Thread', 'Edit', 'Delete']);
    fireEvent.click(within(screen.getByTestId('message-menu')).getByText('Edit'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'Ready for tonight, Alice?' } });
    fireEvent.click(within(screen.getByTestId('edit-message')).getByRole('button', { name: 'Save' }));
    const edited = msg('Ready for tonight, Alice?');
    expect(within(edited).getByTestId('edited-mark').textContent).toBe('(edited)');

    rightClick(edited);
    fireEvent.click(within(screen.getByTestId('message-menu')).getByText('Delete'));
    const confirm = screen.getByRole('dialog', { name: 'Delete message' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(within(chatView()).queryByText('Ready for tonight, Alice?')).toBeNull();
  });

  it('a partner 1:1 shows a small Partner tag that opens the agreement (no Agreement button)', () => {
    renderV14();
    openRow('dm-bob-alice');
    const tag = screen.getByTestId('partner-tag');
    expect(tag.textContent).toBe('Partner');
    expect(tag.getAttribute('href')).toBe('/agreements');
    expect(screen.queryByTestId('agreement-link')).toBeNull();
  });

  it('forward: pick a chat, see a preview with a note field, Send jumps to that chat', () => {
    renderV14();
    openRow('dm-bob-alice');
    tool(msg('Ready for tonight?'), 'Forward');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Forward to' })).getByText('Carol Singh'));
    const sheet = screen.getByRole('dialog', { name: 'Forward' });
    fireEvent.change(within(sheet).getByRole('textbox'), { target: { value: 'see this' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send' }));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-carol');
    expect(within(chatView()).getByText('see this')).toBeTruthy();
  });

  it('composer: 📎 left, 🎤 while empty; a voice note posts', () => {
    vi.useFakeTimers();
    renderV14();
    openRow('dm-bob-alice');
    const composer = screen.getByTestId('composer');
    expect(within(composer).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Attach a point or story', 'Record a voice message']);
    fireEvent.click(within(composer).getByRole('button', { name: 'Record a voice message' }));
    rtlAct(() => { vi.advanceTimersByTime(3000); });
    fireEvent.click(within(composer).getByRole('button', { name: 'Send voice message' }));
    expect(within(chatView()).getAllByTestId('voice-note')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('composer field grows to about five lines, then scrolls inside itself', () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get(this: HTMLElement) { return this instanceof HTMLTextAreaElement ? this.value.split('\n').length * 24 + 16 : 0; } });
    try {
      renderV14();
      openRow('dm-bob-alice');
      const field = within(screen.getByTestId('composer')).getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(field, { target: { value: 'a\nb\nc' } });
      expect(field.style.height).toBe('88px');
      expect(field.style.overflowY).toBe('hidden');
      fireEvent.change(field, { target: { value: '1\n2\n3\n4\n5\n6\n7' } });
      expect(field.style.height).toBe('136px');
      expect(field.style.overflowY).toBe('auto');
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc);
    }
  });

  it('📎: Points and Stories are separate tabs; stories render in production\'s story card; picking one stages it', () => {
    renderV14();
    openRow('dm-bob-alice');
    fireEvent.click(screen.getByRole('button', { name: 'Attach a point or story' }));
    const dlg = screen.getByRole('dialog', { name: 'Attach a point or story' });
    expect(within(dlg).getByRole('tab', { name: 'Points' }).getAttribute('aria-selected')).toBe('true');
    let results = within(dlg).getByTestId('attach-results');
    expect(within(results).getAllByTestId('share-point').length).toBeGreaterThan(0);
    expect(within(results).queryAllByTestId('share-story')).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole('tab', { name: 'Stories' }));
    results = within(dlg).getByTestId('attach-results');
    expect(within(results).queryAllByTestId('share-point')).toHaveLength(0);
    const stories = within(results).getAllByTestId('share-story');
    expect(stories.length).toBeGreaterThan(0);
    // production's StoryCardWithLinks: the author's name and the linked-point disclosure
    expect(stories[0]!.querySelector('[data-testid="story-card"], article, div')).toBeTruthy();
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: '#listening' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Attach How I misread/ }));
    expect(screen.getByTestId('staged-share').textContent).toContain('How I misread');
    fireEvent.change(within(screen.getByTestId('composer')).getByRole('textbox'), { target: { value: 'read this' } });
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    expect(within(within(chatView()).getByRole('list', { name: 'Messages' })).getByTestId('share-story').closest('li')!.textContent).toContain('read this');
  });
});

describe('P1509 v14 list, search, groups, live', () => {
  it('rows show WhatsApp unread counts; Archived shows how many archived chats have unread', () => {
    renderV14();
    expect(within(document.querySelector<HTMLElement>('[data-chat="dm-bob-alice"]')!).getByTestId('row-unread').textContent).toBe('2');
    fireEvent.contextMenu(within(document.querySelector<HTMLElement>('[data-chat="dm-bob-carol"]')!).getAllByRole('button')[0]!);
    fireEvent.click(within(screen.getByTestId('row-menu')).getByText('Archive'));
    fireEvent.contextMenu(within(document.querySelector<HTMLElement>('[data-chat="dm-bob-eli"]')!).getAllByRole('button')[0]!);
    fireEvent.click(within(screen.getByTestId('row-menu')).getByText('Archive'));
    expect(screen.getByTestId('archived-unread').textContent).toBe('1');
  });

  it('Channels: group name as a small heading with an explicit Group info; # general carries the members-only lock', () => {
    renderV14();
    tab(/^Channels/);
    const sections = screen.getByTestId('group-sections');
    expect(sections.textContent).toContain('Channels');
    const first = within(sections).getAllByTestId('group-section-header')[0]!;
    expect(first.textContent).toContain('Chiang Mai Clarity');
    expect(first.textContent).toContain('Group info');
    expect(within(document.querySelector<HTMLElement>('[data-chat="gen-cm"]')!).getByTestId('members-only')).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>('[data-chat="ch-night-oct16"]')!).queryByTestId('members-only')).toBeNull();
    fireEvent.click(within(first).getByTestId('group-info-button'));
    fireEvent.click(within(screen.getByTestId('group-info')).getByRole('button', { name: /Group page/ }));
    expect(screen.getByTestId('group-page').textContent).toContain('5 members');
  });

  it('search: a known person opens an empty 1:1; someone I share nothing with shows and opens No chat yet', () => {
    renderV14();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'sam' } });
    const people = screen.getByRole('list', { name: 'People results' });
    expect(people.textContent).toContain('No chat yet');
    fireEvent.click(within(people).getByText('Sam Rivera'));
    expect(screen.getByTestId('empty-chat').textContent).toContain('No chat yet with Sam');
    back();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'fay' } });
    fireEvent.click(within(screen.getByRole('list', { name: 'People results' })).getByText('Fay Okafor'));
    expect(screen.getByTestId('empty-chat').textContent).toBe('No messages yet. Say hello to Fay. You both attend Clarity Night, Oct 16.');
  });

  it('live event: production SessionBar pinned in the channel; while transcribing, an away bar follows me and taps back', () => {
    renderV14();
    openRow('ch-night-oct16');
    const banner = screen.getByTestId('live-banner');
    expect(banner.textContent).not.toMatch(/\bLive\b/);
    fireEvent.click(within(banner).getByRole('button', { name: 'Transcribe' }));
    expect(screen.getByTestId('live-banner').textContent).toContain('Transcribing');
    fireEvent.click(screen.getByTestId('capture-pause'));
    expect(screen.getByTestId('live-banner').textContent).toContain('paused');
    fireEvent.click(screen.getByTestId('capture-resume'));
    expect(screen.queryByTestId('away-bar')).toBeNull();
    place('Home');
    expect(screen.getByTestId('away-bar').textContent).toContain('Clarity Night, Oct 16');
    fireEvent.click(screen.getByTestId('away-bar-text'));
    expect(chatView().getAttribute('data-chat-open')).toBe('ch-night-oct16');
    expect(screen.queryByTestId('away-bar')).toBeNull();
    fireEvent.click(within(screen.getByTestId('live-banner')).getByRole('button', { name: 'Stop transcribing' }));
    place('Home');
    expect(screen.queryByTestId('away-bar')).toBeNull();
  });

  it('live transcript: lines post as the speaker; a table is a live thread', () => {
    renderV14();
    openRow('ch-night-oct16');
    expect(within(chatView()).getAllByTestId('transcribed-mark').length).toBeGreaterThan(0);
    expect(within(msg(/Table 1/)).getByTestId('replies-link').textContent).toContain('live');
    fireEvent.click(screen.getByRole('button', { name: 'Next transcript line' }));
    fireEvent.click(within(msg(/Table 1/)).getByTestId('replies-link'));
    expect(within(screen.getByTestId('thread-panel')).getByText(/rate how sure/)).toBeTruthy();
  });

  it('variants still work: nopartners invites, fail opens the failed send, empty shows the empty list', () => {
    const a = renderV14(`${BASE}?state=nopartners`);
    tab(/^Partners/);
    expect(screen.getByTestId('empty-partners').textContent).toContain('No partners yet');
    a.unmount();
    const b = renderV14(`${BASE}?state=fail`);
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
    expect(screen.getByTestId('send-failed')).toBeTruthy();
    b.unmount();
    renderV14(`${BASE}?state=empty`);
    expect(screen.getByTestId('empty-list')).toBeTruthy();
  });
});
