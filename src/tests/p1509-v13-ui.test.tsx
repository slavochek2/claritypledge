/**
 * @file p1509-v13-ui.test.tsx
 * @description P1509 v13 walkthrough of the founder's v12 review: me at the rail's foot, drawer without Partners and
 * with Settings/Tools at the foot, composer 📎-left + 🎤, toolbar Reply/Thread/Forward, reply quoting in place in a
 * channel, forward confirm + jump, Groups folder sections + group info + ⋯ menu + Leave, partner Agreement link and
 * the no-partners invite, search → new chat with its opener, 📎 dialog with real card frames, the live transcript.
 */
import { describe, expect, it, vi } from 'vitest';
import { act as rtlAct, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClarityChatV13 } from '@/app/prototypes/clarity-chat-v13/ClarityChatV13';

vi.setConfig({ testTimeout: 20_000 });

const renderV13 = (url = '/tree/clarity-chat-v13') => render(<MemoryRouter initialEntries={[url]}><ClarityChatV13 /></MemoryRouter>);
const openRow = (id: string) => fireEvent.click(within(document.querySelector<HTMLElement>(`[data-chat="${id}"]`)!).getAllByRole('button')[0]!);
const tab = (name: RegExp) => fireEvent.click(within(screen.getByTestId('folder-tabs')).getByRole('tab', { name }));
const chatView = () => screen.getByTestId('chat-view');
const msg = (text: string | RegExp) => within(within(chatView()).getByRole('list', { name: 'Messages' })).getAllByText(text)[0]!.closest('li')!;
const tool = (li: HTMLElement, name: string) => fireEvent.click(within(within(li).getByRole('toolbar')).getByRole('button', { name }));
const toolNames = (li: HTMLElement) => within(within(li).getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));

describe('P1509 v13 prototype', () => {
  it('me sits at the foot of the rail and opens My profile / Settings / Tools', () => {
    renderV13();
    fireEvent.click(screen.getByTestId('rail-me'));
    const menu = screen.getByTestId('me-menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['My profile', 'Settings', 'Tools']);
    fireEvent.click(within(menu).getByText('My profile'));
    expect(screen.getByTestId('profile').textContent).toContain('My profile');
  });

  it('the drawer has no Partners (it is a folder) and puts Settings and Tools at the foot', () => {
    renderV13();
    fireEvent.click(screen.getAllByRole('button', { name: 'Open menu' })[0]!);
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    const pages = within(within(menu).getByRole('list', { name: 'Menu items' })).getAllByRole('listitem').map((li) => li.textContent).filter(Boolean);
    expect(pages.slice(0, 3)).toEqual(['Home', 'Letters', 'Groups']);
    expect(pages.join()).not.toContain('Partners');
    expect(within(within(menu).getByRole('list', { name: 'Account' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Settings', 'Tools']);
  });

  it('composer: 📎 is left of the field, 🎤 shows while empty and becomes Send with text; a voice note posts', () => {
    vi.useFakeTimers();
    renderV13();
    openRow('dm-bob-alice');
    const composer = screen.getByTestId('composer');
    const buttons = within(composer).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Attach a point or story', 'Record a voice message']);
    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: 'hi' } });
    expect(within(composer).getByRole('button', { name: 'Send' })).toBeTruthy();
    fireEvent.change(within(composer).getByRole('textbox'), { target: { value: '' } });
    fireEvent.click(within(composer).getByRole('button', { name: 'Record a voice message' }));
    rtlAct(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId('recording').textContent).toContain('0:03');
    fireEvent.click(within(composer).getByRole('button', { name: 'Send voice message' }));
    expect(within(chatView()).getAllByTestId('voice-note')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('toolbar: a 1:1 offers Reply and Forward; a channel post adds Thread; Reply in a channel quotes in place', () => {
    renderV13();
    openRow('dm-bob-alice');
    expect(toolNames(msg('Ready for tonight?'))).toEqual(['Reply', 'Forward']);
    fireEvent.click(within(chatView()).getByRole('button', { name: 'Back' }));
    openRow('ch-night-oct16');
    const li = msg(/Bring one disagreement/);
    expect(toolNames(li)).toEqual(['Reply', 'Thread', 'Forward']);
    tool(li, 'Reply');
    expect(screen.queryByTestId('thread-panel')).toBeNull();
    expect(screen.getByTestId('reply-bar').textContent).toContain('Bring one disagreement');
    tool(msg(/Bring one disagreement/), 'Thread');
    expect(screen.getByTestId('thread-panel')).toBeTruthy();
  });

  it('forward: pick a chat, see a preview with a note field, Send jumps to that chat', () => {
    renderV13();
    openRow('dm-bob-alice');
    tool(msg('Ready for tonight?'), 'Forward');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Forward to' })).getByText('Carol Singh'));
    const sheet = screen.getByRole('dialog', { name: 'Forward' });
    expect(within(sheet).getByTestId('forward-preview').textContent).toContain('Ready for tonight?');
    fireEvent.change(within(sheet).getByRole('textbox'), { target: { value: 'see this' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send' }));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-carol');
    expect(within(chatView()).getByText('see this')).toBeTruthy();
  });

  it('Groups folder: one section per group, # general first; group info and the ⋯ menu; Leave removes it', () => {
    renderV13();
    tab(/^Groups/);
    const sections = screen.getByTestId('group-sections');
    const heads = within(sections).getAllByTestId('group-section-header').map((h) => h.textContent ?? '');
    expect(heads.map((h) => h.split(/\d/)[0])).toEqual(['Chiang Mai Clarity', 'Founders Circle', 'Berlin Clarity']);
    expect(within(within(sections).getByRole('list', { name: 'Chiang Mai Clarity channels' })).getAllByRole('listitem')[0]!.textContent).toContain('# general');
    fireEvent.click(within(sections).getAllByTestId('group-section-header')[0]!);
    const info = screen.getByTestId('group-info');
    expect(info.textContent).toContain('Members');
    expect(info.textContent).toContain('Group page');
    fireEvent.click(within(info).getByRole('button', { name: /Leave/ }));
    expect(screen.queryByTestId('group-info')).toBeNull();
    // Leave asks first
    expect(document.querySelector('[data-chat="gen-cm"]')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Leave group' })).getByRole('button', { name: 'Leave' }));
    expect(document.querySelector('[data-chat="gen-cm"]')).toBeNull();
  });

  it('channel header: ⋯ opens Members, Group page and Leave group', () => {
    renderV13();
    openRow('ch-night-oct16');
    fireEvent.click(within(chatView()).getByRole('button', { name: 'More' }));
    expect(within(screen.getByTestId('channel-menu')).getAllByRole('menuitem').map((x) => x.textContent)).toEqual(['Members', 'Group page', 'Leave group']);
  });

  it('a partner 1:1 links to the agreement; with no partners the folder invites', () => {
    renderV13();
    openRow('dm-bob-alice');
    expect(screen.getByTestId('agreement-link').textContent).toContain('Agreement');
  });
  it('no partners: Partners folder shows the invite empty state', () => {
    renderV13('/tree/clarity-chat-v13?state=nopartners');
    tab(/^Partners/);
    expect(screen.getByTestId('empty-partners').textContent).toContain('No partners yet');
  });

  it('search a new person: the row says there is no chat yet; tapping opens an empty 1:1 with the shared context', () => {
    renderV13();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'fay' } });
    const people = screen.getByRole('list', { name: 'People results' });
    expect(people.textContent).toContain('No chat yet');
    fireEvent.click(within(people).getByText('Fay Okafor'));
    expect(screen.getByTestId('empty-chat').textContent).toBe('No messages yet. Say hello to Fay. You both attend Clarity Night, Oct 16.');
    expect(screen.queryByText(/@fayo/)).toBeNull();
  });

  it('📎 opens a search over points and stories in their real frames; picking one posts that card', () => {
    renderV13();
    openRow('dm-bob-alice');
    fireEvent.click(screen.getByRole('button', { name: 'Attach a point or story' }));
    const dlg = screen.getByRole('dialog', { name: 'Attach a point or story' });
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: '#listening' } });
    const results = within(dlg).getByTestId('attach-results');
    expect(within(results).getAllByTestId('share-point')).toHaveLength(1);
    expect(within(results).getAllByTestId('share-story')).toHaveLength(1);
    fireEvent.click(within(results).getByRole('button', { name: /Attach How I misread/ }));
    // staged above the composer, sent together with a note
    expect(screen.getByTestId('staged-share').textContent).toContain('How I misread');
    fireEvent.change(within(screen.getByTestId('composer')).getByRole('textbox'), { target: { value: 'read this' } });
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    const posted = within(within(chatView()).getByRole('list', { name: 'Messages' })).getByTestId('share-story').closest('li')!;
    expect(posted.textContent).toContain('read this');
    expect(screen.queryByTestId('staged-share')).toBeNull();
  });

  it('live event: a banner says Transcribing, lines post as the speaker, a table is a live thread', () => {
    renderV13();
    openRow('ch-night-oct16');
    expect(screen.getByTestId('live-banner').textContent).toContain('Transcribing');
    expect(within(chatView()).getAllByTestId('transcribed-mark').length).toBeGreaterThan(0);
    const table = msg(/Table 1/);
    expect(within(table).getByTestId('replies-link').textContent).toContain('live');
    fireEvent.click(screen.getByRole('button', { name: 'Next transcript line' }));
    fireEvent.click(within(msg(/Table 1/)).getByTestId('replies-link'));
    expect(within(screen.getByTestId('thread-panel')).getByText(/rate how sure/)).toBeTruthy();
  });

  it('review fixes: group Members shows the whole circle and Back returns; a recording never follows me to another chat; a voice reply keeps its quote', () => {
    vi.useFakeTimers();
    renderV13();
    tab(/^Groups/);
    fireEvent.click(screen.getAllByTestId('group-section-header')[0]!);
    fireEvent.click(within(screen.getByTestId('group-info')).getByRole('button', { name: /Members/ }));
    expect(screen.getByTestId('members').textContent).toContain('5 members');
    expect(screen.getByTestId('members').textContent).toContain('Fay Okafor');
    fireEvent.click(within(screen.getByTestId('members')).getByRole('button', { name: 'Back' }));
    expect(screen.queryByTestId('members')).toBeNull();
    expect(screen.queryByTestId('chat-view')).toBeNull();

    tab(/^All chats/);
    openRow('dm-bob-alice');
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice message' }));
    openRow('dm-bob-carol');
    expect(screen.queryByTestId('recording')).toBeNull();

    tool(msg(/send the slides/), 'Reply');
    fireEvent.click(screen.getByRole('button', { name: 'Record a voice message' }));
    rtlAct(() => { vi.advanceTimersByTime(2000); });
    fireEvent.click(screen.getByRole('button', { name: 'Send voice message' }));
    const voice = within(chatView()).getAllByTestId('voice-note').at(-1)!.closest('li')!;
    expect(within(voice).getByTestId('reply-quote').textContent).toContain('send the slides');
    expect(screen.queryByTestId('reply-bar')).toBeNull();
    vi.useRealTimers();
  });

  it('the strip no longer has Mock new message', () => {
    renderV13();
    expect(screen.queryByRole('button', { name: 'Mock new message' })).toBeNull();
  });
});
