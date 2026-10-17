/**
 * @file p1509-v15-ui.test.tsx
 * @description P1509 v15 walkthrough: sidebar order (me, Home, Chats, Letters, Tools, Your groups, Browse groups),
 * the profile menu (Session History, Log Out, Admin only for an admin), the real groups' OrgPage tabs, an event's Back
 * to ITS OWN group (cm and online, history and deep link), the feed on Home, Letters' real tabs, Tools' 3 tabs, the
 * partner header states, the mirror agent (prefilled name, nickname, Clarify), production cards with positions, and
 * v14's kept behaviour (history Back, outside-click, right-click Edit/Delete, threads in 1:1, unread, growing composer).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act as rtlAct, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClarityChatV15 } from '@/app/prototypes/clarity-chat-v15/ClarityChatV15';
import { SIDEBAR_KEY } from '@/app/prototypes/clarity-chat-v15/mock-data';

/* The production cards read the signed-in session; a stable session so the cards' position controls render. */
vi.mock('@/auth', () => {
  const auth = { session: { user: { id: 'mock-bob' } }, user: { id: 'mock-bob' }, isLoading: false };
  return { useAuth: () => auth };
});

vi.setConfig({ testTimeout: 20_000 });

const BASE = '/tree/clarity-chat-v15';
const renderV15 = (url = BASE) => render(<MemoryRouter initialEntries={[url]}><ClarityChatV15 /></MemoryRouter>);
const openRow = (id: string) => fireEvent.click(within(document.querySelector<HTMLElement>(`[data-chat="${id}"]`)!).getAllByRole('button')[0]!);
const tab = (name: RegExp) => fireEvent.click(within(screen.getByTestId('folder-tabs')).getByRole('tab', { name }));
const chatView = () => screen.getByTestId('chat-view');
const msg = (text: string | RegExp) => within(within(chatView()).getByRole('list', { name: 'Messages' })).getAllByText(text)[0]!.closest('li')!;
const tool = (li: HTMLElement, name: string | RegExp) => fireEvent.click(within(within(li).getByRole('toolbar')).getByRole('button', { name }));
const toolNames = (li: HTMLElement) => within(within(li).getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
const back = () => fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]!);
const sidebar = () => screen.getByTestId('sidebar');
const place = (name: string) => fireEvent.click(within(within(sidebar()).getByRole('list', { name: 'Places' })).getByRole('button', { name: new RegExp(`^${name}`) }));
const rightClick = (li: HTMLElement) => fireEvent.contextMenu(li.firstElementChild!);
const menuItems = () => within(screen.getByTestId('message-menu')).getAllByRole('menuitem').map((b) => b.textContent);
/** Radix Tabs select on mousedown (left button). */
const radixTab = (el: HTMLElement) => fireEvent.mouseDown(el, { button: 0, ctrlKey: false });
const groupTab = (name: string) => radixTab(within(screen.getByTestId('group-tabs')).getByRole('tab', { name }));
const openEventFromGroup = (name: RegExp) => fireEvent.click(within(screen.getByTestId('group-events')).getByText(name));

afterEach(() => { try { window.localStorage.removeItem(SIDEBAR_KEY); } catch { /* ignore */ } });

describe('P1509 v15 sidebar and profile menu', () => {
  it('sidebar order: me at the top, Home, Chats, Letters, Tools, then Your groups and Browse groups', () => {
    renderV15();
    const top = screen.getByTestId('sidebar-top');
    expect(within(top).getByTestId('sidebar-me').textContent).toContain('Bob Keller');
    const places = within(within(sidebar()).getByRole('list', { name: 'Places' })).getAllByRole('button');
    expect(places.map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual(['Home', 'Chats', 'Letters', 'Tools']);
    expect(within(sidebar()).queryByRole('button', { name: /^Groups$/ })).toBeNull(); // no separate Groups place
    const groups = within(sidebar()).getByRole('list', { name: 'Your groups' });
    expect(within(groups).getAllByRole('button').map((b) => b.textContent)).toEqual(['Communication Activism Community · Chiang Mai3']);
    // DOM order: top (me) before places before groups before Browse
    const order = [top, places[0]!, groups, screen.getByTestId('browse-groups')];
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByTestId('sidebar-groups-toggle'));
    expect(within(sidebar()).queryByRole('list', { name: 'Your groups' })).toBeNull();
  });

  it('phone tabs are Home, Chats, Letters, Groups, Profile', () => {
    renderV15();
    expect(within(screen.getByTestId('bottom-tabs')).getAllByRole('button').map((b) => b.textContent?.replace(/\d+/g, '').replace(/^BK/, ''))).toEqual(['Home', 'Chats', 'Letters', 'Groups', 'Profile']); // BK: the Profile tab shows my avatar's initials
  });

  it('profile menu holds My Profile, Partners, Session History, Settings, Use cases, Learn, Events, Pledgers, Admin and Log Out', () => {
    renderV15();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    const m = screen.getByTestId('me-menu');
    const text = m.textContent ?? '';
    for (const s of ['My Profile', 'Partners', 'Session History', 'Settings', 'For builders', 'For hiring', 'For co-founders', 'For coaches', 'Manifesto', 'About', 'Events', 'Pledgers', 'Admin', 'Log Out']) expect(text).toContain(s);
    expect(within(m).getByText('Session History').closest('a')!.getAttribute('href')).toBe('/sessions');
    expect(within(m).getByText('Users').closest('a')!.getAttribute('href')).toBe('/admin/users');
    expect(within(m).getByText('Topics').closest('a')!.getAttribute('href')).toBe('/admin/topics');
    fireEvent.click(screen.getByTestId('log-out'));
    expect(screen.getByTestId('signed-out')).toBeTruthy();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(screen.getByTestId('home-page')).toBeTruthy();
  });

  it('Admin is hidden for a non-admin viewer', () => {
    renderV15();
    fireEvent.click(screen.getByRole('radio', { name: /Dana/ }));
    fireEvent.click(screen.getByTestId('sidebar-me'));
    expect(screen.getByTestId('me-menu').textContent).toContain('Log Out');
    expect(screen.queryByTestId('admin-group')).toBeNull();
    expect(screen.getByTestId('me-menu').textContent).not.toContain('Admin');
  });

  it('Partners page: production AgreementRow; a row opens that 1:1', () => {
    renderV15();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.click(within(screen.getByTestId('me-menu')).getByText('Partners'));
    const page = screen.getByTestId('partners-page');
    expect(page.textContent).toContain('My Partners');
    expect(page.textContent).toContain('Active (1)');
    fireEvent.click(within(page).getByText('Alice Moreau'));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
  });
});

describe('P1509 v15 groups and events', () => {
  it('a group from the sidebar opens its OrgPage: Events, Members, About, Chats tabs in ?tab=; # general has no lock', () => {
    renderV15();
    fireEvent.click(within(within(sidebar()).getByRole('list', { name: 'Your groups' })).getByText(/Chiang Mai/));
    const page = screen.getByTestId('group-page');
    expect(page.getAttribute('data-testid')).toBe('group-page');
    expect(within(screen.getByTestId('group-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Events', 'Members', 'About', 'Chats']);
    expect(screen.getByTestId('group-events').textContent).toContain('Clarity Night, Oct 16');
    groupTab('Members');
    expect(screen.getByTestId('group-members').textContent).toContain('Alice Moreau');
    groupTab('About');
    expect(screen.getByTestId('group-about').textContent).toContain('Ask a colleague what they understood');
    groupTab('Chats');
    const chats = screen.getByTestId('group-chats');
    expect(chats.textContent).toContain('# general');
    expect(document.querySelector('[data-testid="members-only"]')).toBeNull();
    fireEvent.click(within(chats).getByText('# general'));
    expect(chatView().getAttribute('data-chat-open')).toBe('gen-cm');
    back();
    expect(screen.getByTestId('group-chats')).toBeTruthy(); // Back returns to the same tab
  });

  it('Browse groups: the directory lists both real groups; one I have not joined opens its Join page and joining works', () => {
    renderV15();
    fireEvent.click(screen.getByTestId('browse-groups'));
    const dir = screen.getByTestId('directory-page');
    expect(within(dir).getAllByTestId('org-card').map((c) => c.textContent)).toEqual([expect.stringContaining('Communication Activism Community · Chiang Mai'), expect.stringContaining('Clarity Practice Community · Online')]);
    fireEvent.click(within(dir).getByText('Clarity Practice Community · Online'));
    fireEvent.click(within(screen.getByTestId('group-page')).getAllByRole('button', { name: /Join/ })[0]!);
    expect(screen.getByTestId('join-page').textContent).toContain('Join Clarity Practice Community · Online');
    fireEvent.click(screen.getByTestId('accept-join'));
    expect(screen.getByTestId('group-page')).toBeTruthy();
    expect(within(within(sidebar()).getByRole('list', { name: 'Your groups' })).getByText(/Online/)).toBeTruthy();
  });

  it('Back from an event goes to ITS group: cm, by history', () => {
    renderV15(`${BASE}?view=group&group=cm`);
    openEventFromGroup(/Clarity Night, Oct 2/);
    expect(screen.getByTestId('event-page').getAttribute('data-group')).toBe('cm');
    back();
    expect(screen.getByTestId('group-page').querySelector('[data-group]')!.getAttribute('data-group')).toBe('cm');
  });

  it('Back from an event goes to ITS group: online, by history', () => {
    renderV15(`${BASE}?view=group&group=online`);
    openEventFromGroup(/Online practice, Sept 28/);
    back();
    expect(screen.getByTestId('group-page').querySelector('[data-group]')!.getAttribute('data-group')).toBe('online');
  });

  it('Back from a deep-linked event falls back to its own group, for cm and for online (never cm for online)', () => {
    const a = renderV15(`${BASE}?view=event&event=night-oct02`);
    back();
    expect(screen.getByTestId('group-page').querySelector('[data-group]')!.getAttribute('data-group')).toBe('cm');
    a.unmount();
    renderV15(`${BASE}?view=event&event=online-oct23`);
    expect(screen.getByTestId('event-back-link').textContent).toContain('Clarity Practice Community · Online');
    back();
    expect(screen.getByTestId('group-page').querySelector('[data-group]')!.getAttribute('data-group')).toBe('online');
  });

  it('event page: banner, Reserve a seat, participants, topic vote area, Open event chat', () => {
    renderV15(`${BASE}?view=group&group=online`);
    openEventFromGroup(/Online practice, Oct 23/);
    expect(screen.getByTestId('topic-vote')).toBeTruthy();
    expect(screen.getByTestId('participants').textContent).toContain('Participants (2)');
    fireEvent.click(screen.getByTestId('rsvp-button'));
    expect(screen.getByTestId('rsvp-going').textContent).toContain("You're going!");
    expect(screen.getByTestId('participants').textContent).toContain('Participants (3)');
    back();
    openEventFromGroup(/Online practice, Sept 28/);
    fireEvent.click(screen.getByTestId('open-event-chat'));
    expect(chatView().getAttribute('data-chat-open')).toBe('ch-online-sept');
  });
});

describe('P1509 v15 Home, Letters, Tools', () => {
  it('Home is the feed: Stories (default) and Points tabs with production cards', () => {
    renderV15();
    place('Home');
    expect(within(screen.getByTestId('feed-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Stories (3)', 'Points (3)']);
    expect(within(screen.getByTestId('feed-stories')).getAllByTestId('share-story')).toHaveLength(3);
    fireEvent.click(within(screen.getByTestId('feed-tabs')).getByRole('tab', { name: /Points/ }));
    expect(within(screen.getByTestId('feed-points')).getAllByTestId(/^feed-point-card-/)).toHaveLength(3);
  });

  it('Letters: Inbox, Drafts, Published tabs; a letter has no "Open chat with author"', () => {
    renderV15();
    place('Letters');
    expect(within(screen.getByTestId('letter-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Inbox (2)', 'Drafts', 'Published']);
    radixTab(within(screen.getByTestId('letter-tabs')).getByRole('tab', { name: 'Drafts' }));
    expect(screen.getAllByTestId('letter-row').map((r) => r.textContent)).toEqual([expect.stringContaining('Why I run the Chiang Mai circle')]);
    fireEvent.click(screen.getByText('Why I run the Chiang Mai circle'));
    expect(screen.getByTestId('letter-view').textContent).not.toMatch(/Open chat/);
    back();
    expect(screen.getByTestId('letters-page')).toBeTruthy();
  });

  it('Tools has the 3 tabs Tools, Points, Letters with production entries', () => {
    renderV15();
    place('Tools');
    const tabs = within(screen.getByTestId('event-links-tabs')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Tools', 'Points', 'Letters']);
    expect(screen.getByTestId('event-links-panel-tools').textContent).toContain('Transcribe');
    radixTab(tabs[2]!);
    expect(within(screen.getByTestId('event-links-panel-letters')).getAllByTestId('event-links-entry').length).toBeGreaterThan(0);
  });
});

describe('P1509 v15 mirror agent', () => {
  const openMirror = () => openRow('mirror-bob');

  it('pinned first as "Your mirror"; the name is prefilled; Keep claims it with the default', () => {
    renderV15();
    const first = within(screen.getByTestId('chat-rows')).getAllByRole('listitem')[0]!;
    expect(first.getAttribute('data-chat')).toBe('mirror-bob');
    expect(within(first).getByTestId('row-title').textContent).toBe('Your mirror');
    expect(within(first).getByTestId('mirror-avatar').getAttribute('data-placeholder')).toBe('generated-image');
    openMirror();
    expect(chatView().textContent).toContain('Give me a name');
    const field = within(screen.getByTestId('mirror-claim')).getByRole('textbox') as HTMLInputElement;
    expect(field.value).toBe("Bob's mirror");
    fireEvent.click(screen.getByTestId('mirror-keep'));
    expect(screen.getByTestId('mirror-header').textContent).toContain("Bob's mirror");
    expect(within(document.querySelector<HTMLElement>('[data-chat="mirror-bob"]')!).getByTestId('row-title').textContent).toBe("Bob's mirror");
  });

  it('typing a nickname claims it with that name; Clarify forwards a message into the mirror chat and names it', () => {
    renderV15();
    openMirror();
    fireEvent.change(within(screen.getByTestId('mirror-claim')).getByRole('textbox'), { target: { value: 'Echo' } });
    fireEvent.click(screen.getByTestId('mirror-keep'));
    expect(screen.getByTestId('mirror-header').textContent).toContain('Echo');
    expect(screen.queryByTestId('mirror-claim')).toBeNull();
    openRow('dm-bob-alice');
    const li = msg(/This is the exercise/);
    expect(toolNames(li)).toEqual(['Reply', 'Forward', 'Thread', 'Clarify with Echo']);
    tool(li, 'Clarify with Echo');
    expect(chatView().getAttribute('data-chat-open')).toBe('mirror-bob');
    expect(within(chatView()).getByTestId('clarify-label').textContent).toBe('Sent to Echo to clarify');
    expect(within(chatView()).getAllByTestId('reply-quote').at(-1)!.textContent).toContain('This is the exercise I want to try.');
    expect(within(chatView()).getByText('I’ll help you clarify this — coming soon')).toBeTruthy();
  });
});

describe('P1509 v15 cards, composer, partners', () => {
  it('a shared point is production FeedPointCard with positions; taking one updates its count', () => {
    renderV15();
    openRow('dm-bob-alice');
    fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
    const dlg = screen.getByRole('dialog', { name: 'Share a point or story' });
    fireEvent.click(within(dlg).getByRole('button', { name: /^Share Disagreement is information/ }));
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    const card = within(within(chatView()).getByRole('list', { name: 'Messages' })).getByTestId('share-point');
    const agree = within(card).getByTestId('agree-group');
    expect(agree.getAttribute('aria-pressed')).toBe('false');
    expect(within(card).getByTestId('disagree-group')).toBeTruthy();
    expect(within(card).getByTestId('unsure-group')).toBeTruthy();
    fireEvent.click(agree);
    expect(within(within(within(chatView()).getByRole('list', { name: 'Messages' })).getByTestId('share-point')).getByTestId('agree-group').getAttribute('aria-pressed')).toBe('true');
  });

  it('a shared story is production FeedStoryCard: its point with positions and Details →', () => {
    renderV15();
    place('Home');
    const story = screen.getAllByTestId('share-story')[0]!;
    expect(within(story).getByRole('button', { name: /Details/ })).toBeTruthy();
    fireEvent.click(within(story).getByTestId('feed-story-point-expander'));
    expect(within(story).getByTestId('agree-group')).toBeTruthy();
  });

  it('1:1 header: Invite as partner -> in-app certificate -> Partner invite pending -> Partner', () => {
    renderV15();
    openRow('dm-bob-carol');
    fireEvent.click(screen.getByTestId('invite-as-partner'));
    const page = screen.getByTestId('partner-invite-page');
    expect(within(page).getByTestId('certificate-page-shell')).toBeTruthy();
    fireEvent.click(screen.getByTestId('seal-and-send'));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-carol');
    expect(screen.getByTestId('partner-pending').textContent).toBe('Partner invite pending');
    expect(screen.queryByTestId('invite-as-partner')).toBeNull();
    fireEvent.click(screen.getByTestId('strip-accept'));
    expect(screen.getByTestId('partner-tag').textContent).toBe('Partner');
  });

  it('+ New offers New chat and New partner', () => {
    renderV15();
    const trigger = screen.getByTestId('new-menu');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const items = screen.getAllByRole('menuitem').map((x) => x.textContent);
    expect(items).toEqual(expect.arrayContaining(['New chat', 'New partner']));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New partner' }));
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy();
  });

  it('composer: Share left, mic while empty; message actions sit in a hover-only toolbar', () => {
    vi.useFakeTimers();
    renderV15();
    openRow('dm-bob-alice');
    const composer = screen.getByTestId('composer');
    expect(within(composer).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Share a point or story', 'Record a voice message']);
    const bar = within(msg('Ready for tonight?')).getByRole('toolbar');
    expect(bar.className).toContain('opacity-0');
    expect(bar.className).toContain('group-hover:opacity-100');
    fireEvent.click(within(composer).getByRole('button', { name: 'Record a voice message' }));
    rtlAct(() => { vi.advanceTimersByTime(3000); });
    fireEvent.click(within(composer).getByRole('button', { name: 'Send voice message' }));
    expect(within(chatView()).getAllByTestId('voice-note')).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('P1509 v15 kept from v14', () => {
  it('chat -> profile -> Back returns to the chat; a deep-linked chat goes Back to the list', () => {
    const a = renderV15();
    openRow('dm-bob-alice');
    fireEvent.click(within(chatView()).getAllByText('Alice Moreau')[0]!.closest('button')!);
    expect(screen.getByTestId('profile')).toBeTruthy();
    back();
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
    a.unmount();
    renderV15(`${BASE}?view=chats&chat=dm-bob-carol`);
    back();
    expect(screen.queryByTestId('chat-view')).toBeNull();
  });

  it('menus close on an outside press and on Esc', () => {
    renderV15();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.mouseDown(screen.getByTestId('main-area'));
    expect(screen.queryByTestId('me-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('me-menu')).toBeNull();
    openRow('ch-night-oct16');
    rightClick(msg(/Bring one disagreement/));
    expect(screen.getByTestId('message-menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('right-click Edit/Delete on my own; threads in a 1:1', () => {
    renderV15();
    openRow('dm-bob-alice');
    rightClick(msg('Ready for tonight?'));
    expect(menuItems()).toEqual(['Reply', 'Forward', 'Thread', 'Edit', 'Delete']);
    fireEvent.click(within(screen.getByTestId('message-menu')).getByText('Edit'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'Ready, Alice?' } });
    fireEvent.click(within(screen.getByTestId('edit-message')).getByRole('button', { name: 'Save' }));
    expect(within(msg('Ready, Alice?')).getByTestId('edited-mark')).toBeTruthy();
    tool(msg('Ready, Alice?'), 'Thread');
    fireEvent.change(within(screen.getByTestId('thread-panel')).getByRole('textbox'), { target: { value: 'threaded' } });
    fireEvent.click(within(screen.getByTestId('thread-panel')).getByRole('button', { name: 'Send' }));
    expect(within(screen.getByTestId('thread-panel')).getByText('threaded')).toBeTruthy();
  });

  it('unread counts, Channels folder, composer growth', () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get(this: HTMLElement) { return this instanceof HTMLTextAreaElement ? this.value.split('\n').length * 24 + 16 : 0; } });
    try {
      renderV15();
      expect(within(document.querySelector<HTMLElement>('[data-chat="dm-bob-alice"]')!).getByTestId('row-unread').textContent).toBe('2');
      tab(/^Channels/);
      expect(within(screen.getByTestId('group-sections')).getAllByTestId('group-section-header')[0]!.textContent).toContain('Communication Activism Community · Chiang Mai');
      tab(/^All/);
      openRow('dm-bob-alice');
      const field = within(screen.getByTestId('composer')).getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(field, { target: { value: '1\n2\n3\n4\n5\n6\n7' } });
      expect(field.style.height).toBe('136px');
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc);
    }
  });

  it('live bar away from the event channel is the CompactCaptureBar copy: status, meter, ⓘ, Pause, Stop, Open room', () => {
    renderV15();
    openRow('ch-night-oct16');
    fireEvent.click(within(screen.getByTestId('live-banner')).getByRole('button', { name: 'Transcribe' }));
    place('Home');
    const bar = screen.getByTestId('room-capture-bar');
    expect(bar.textContent).toContain('● Recording');
    expect(within(bar).getByTestId('capture-level-meter')).toBeTruthy();
    expect(within(bar).getByTestId('capture-info')).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Pause' }));
    expect(screen.getByTestId('room-capture-bar').textContent).toContain('Paused');
    fireEvent.click(screen.getByTestId('room-capture-bar-open'));
    expect(chatView().getAttribute('data-chat-open')).toBe('ch-night-oct16');
    expect(screen.queryByTestId('room-capture-bar')).toBeNull();
  });
});

describe('P1509 v15 review fixes (UI)', () => {
  const asDana = () => fireEvent.click(screen.getByRole('radio', { name: 'Dana (attendee)' }));
  const groupOf = () => screen.getByTestId('group-page').querySelector('[data-group]')!.getAttribute('data-group');

  it('#3 an event channel opens its event page from the header and the ⋯ menu; #2 "Back to {group}" goes to ITS group, the arrow is history', () => {
    renderV15();
    openRow('ch-night-oct16');
    fireEvent.click(screen.getByTestId('event-details'));
    expect(screen.getByTestId('event-page').getAttribute('data-group')).toBe('cm');
    back(); // the header arrow: history, so back to the channel
    expect(chatView().getAttribute('data-chat-open')).toBe('ch-night-oct16');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByTestId('channel-menu')).getByRole('menuitem', { name: /Event details/ }));
    fireEvent.click(screen.getByTestId('event-back-link')); // explicit: the group, not the channel we came from
    expect(groupOf()).toBe('cm');
  });

  it('#2 a seeded attendee (Dana, tonight) sees Cancel RSVP, and it works; the ear badge "0" is gone', () => {
    renderV15();
    asDana();
    openRow('ch-night-oct16');
    fireEvent.click(screen.getByTestId('event-details'));
    expect(screen.getByTestId('rsvp-going')).toBeTruthy();
    expect(screen.getByTestId('participants').textContent).not.toMatch(/0/);
    fireEvent.click(screen.getByTestId('cancel-rsvp'));
    expect(screen.getByTestId('rsvp-button').textContent).toBe('Reserve a seat');
    expect(screen.getByTestId('participants').textContent).toContain('Participants (3)');
  });

  it('#4 the Partner tag opens the in-app Partners page; Search "Invite" opens New partner', () => {
    renderV15();
    openRow('dm-bob-alice');
    const tag = screen.getByTestId('partner-tag');
    expect(tag.tagName).toBe('BUTTON');
    fireEvent.click(tag);
    expect(screen.getByTestId('partners-page')).toBeTruthy();
    place('Chats');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'zzzz' } });
    fireEvent.click(within(screen.getByTestId('search-no-people')).getByTestId('invite-link'));
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy();
  });

  it('#5 New partner: pick from the people list; no Seal & Send until someone is picked; sending creates the invite', () => {
    renderV15(`${BASE}?view=newpartner`);
    expect(screen.queryByTestId('seal-and-send')).toBeNull();
    const picker = screen.getByTestId('partner-picker');
    expect(within(picker).queryByText('Alice Moreau')).toBeNull(); // already a partner
    fireEvent.change(within(picker).getByRole('textbox', { name: 'Search people' }), { target: { value: 'fay' } });
    expect(within(picker).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringContaining('Fay Okafor')]);
    fireEvent.click(within(picker).getByRole('button', { name: /Fay Okafor/ }));
    fireEvent.click(screen.getByTestId('seal-and-send'));
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.click(within(screen.getByTestId('me-menu')).getByRole('menuitem', { name: 'Partners' }));
    expect(screen.getByTestId('partners-page').textContent).toContain('Pending invitation (1)');
    expect(screen.getByTestId('partners-page').textContent).toContain('Fay Okafor');
  });

  it('#6 unclaimed mirror explains itself; Clarify auto-claims with the default name; "Back to" returns to the source chat', () => {
    renderV15();
    openRow('mirror-bob');
    expect(screen.getByTestId('mirror-explainer').textContent).toBe('Your mirror helps you check what you meant before you send it. Forward any message here with Clarify.');
    expect(screen.queryByTestId('mirror-back-link')).toBeNull();
    openRow('dm-bob-alice');
    tool(msg(/This is the exercise/), 'Clarify with Your mirror');
    expect(chatView().getAttribute('data-chat-open')).toBe('mirror-bob');
    expect(screen.queryByTestId('mirror-claim')).toBeNull();
    expect(screen.getByTestId('mirror-header').textContent).toContain("Bob's mirror");
    expect(screen.getByTestId('mirror-back-link').textContent).toBe('Back to Alice Moreau');
    fireEvent.click(screen.getByTestId('mirror-back-link'));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
  });

  it('#7 a short swipe does not archive, a 100px+ swipe does; Undo in the toast brings it back', async () => {
    renderV15();
    const btn = () => within(document.querySelector<HTMLElement>('[data-chat="dm-bob-carol"]')!).getAllByRole('button')[0]!;
    const swipe = (dx: number) => { fireEvent.touchStart(btn(), { touches: [{ clientX: 300, clientY: 100 }] }); fireEvent.touchEnd(btn(), { changedTouches: [{ clientX: 300 - dx, clientY: 100 }] }); };
    swipe(80);
    expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeTruthy();
    swipe(120);
    expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeTruthy();
  });

  it('#8 Letters: Drafts and Published are mine (Dana has none, with an empty state); empty Home and New chat point to Browse groups', () => {
    const a = renderV15();
    asDana();
    place('Letters');
    radixTab(within(screen.getByTestId('letter-tabs')).getByRole('tab', { name: 'Drafts' }));
    expect(screen.getByTestId('letters-empty-drafts').textContent).toBe('No drafts yet.');
    radixTab(within(screen.getByTestId('letter-tabs')).getByRole('tab', { name: 'Published' }));
    expect(screen.getByTestId('letters-empty-sent')).toBeTruthy();
    a.unmount();
    const b = renderV15(`${BASE}?state=empty&view=home`);
    expect(screen.getByTestId('home-empty')).toBeTruthy();
    b.unmount();
    renderV15(`${BASE}?state=empty&view=newchat`);
    fireEvent.click(within(screen.getByTestId('no-contacts')).getByRole('button', { name: /Browse groups/ }));
    expect(screen.getByTestId('directory-page')).toBeTruthy();
  });

  it('#9 the sidebar badge, the phone tab badge, the All chats folder and the row badges agree, before and after opening a chat', () => {
    renderV15();
    const sidebarN = () => within(within(sidebar()).getByRole('list', { name: 'Places' })).getByRole('button', { name: /^Chats/ }).querySelector('[aria-label$="unread"]')?.textContent;
    const folderN = () => within(within(screen.getByTestId('folder-tabs')).getByRole('tab', { name: /All chats/ })).queryByLabelText(/unread/)?.textContent;
    const rowsN = () => String(screen.getAllByTestId('row-unread').reduce((n, el) => n + Number(el.textContent), 0));
    const phoneN = () => within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Chats/ }).querySelector('[aria-label$="unread"]')?.textContent;
    expect([sidebarN(), phoneN(), folderN(), rowsN()]).toEqual(['7', '7', '7', '7']);
    openRow('dm-bob-alice'); // opening a chat reads it: Alice 2 -> 0, so 7 -> 5 everywhere at once
    expect([sidebarN(), folderN(), rowsN()]).toEqual(['5', '5', '5']);
  });

  it('#11 the composer shows Send once there is text; #13 the phone Profile menu reaches Tools', () => {
    renderV15();
    openRow('dm-bob-alice');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Alice' }), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    back();
    fireEvent.click(within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Profile/ }));
    fireEvent.click(screen.getByTestId('menu-tools'));
    expect(screen.getByTestId('tools-page')).toBeTruthy();
  });
});
