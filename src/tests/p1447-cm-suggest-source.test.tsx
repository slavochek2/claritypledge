/**
 * P1447 — "Suggest a source" on /cm.
 *
 * One branch per rendered state of the dialog: editing, client-side refusal, server refusal
 * (invalid link, rate limit, other failure), saving, saved. The RPC is mocked; the server-side
 * guarantees (write-only, de-dup, cap) live in
 * e2e/integration/20261009150000_p1447_calendar_source_suggestions.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { ChiangMaiPage } from '@/app/pages/chiang-mai-page';
import { looksLikeSourceUrl, normalizeSourceUrl } from '@/app/data/calendar-sources';

function renderPage() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  return render(
    <MemoryRouter initialEntries={['/cm']}>
      <ChiangMaiPage />
    </MemoryRouter>
  );
}

function openAndType(url: string, note = '') {
  fireEvent.click(screen.getByTestId('cm-suggest-source'));
  fireEvent.change(screen.getByLabelText('Link'), { target: { value: url } });
  if (note) fireEvent.change(screen.getByLabelText(/Note/), { target: { value: note } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('P1447: looksLikeSourceUrl', () => {
  it.each([
    ['https://sola.day/event/4seas', true],
    ['http://example.org', true],
    ['hello', false],
    ['javascript:alert(1)', false],
    ['https://localhost', false],
    ['', false],
    [`https://example.org/${'a'.repeat(500)}`, false],
  ])('%s → %s', (v, ok) => expect(looksLikeSourceUrl(v)).toBe(ok));
});

describe('P1447: normalizeSourceUrl', () => {
  it('sends a Thai-script host as punycode, which the server hostname check accepts', () => {
    const out = normalizeSourceUrl('  https://เชียงใหม่.com/events ');
    expect(out).toMatch(/^https:\/\/xn--[a-z0-9-]+\.com\/events$/);
  });
  it('leaves an ordinary link as typed (trimmed)', () => {
    expect(normalizeSourceUrl(' https://sola.day/event/x ')).toBe('https://sola.day/event/x');
  });
});

describe('P1447: Suggest a source dialog on /cm', () => {
  beforeEach(() => rpc.mockReset());

  it('the header keeps one primary button and adds a labelled secondary entry', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Add this calendar to yours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggest a source' })).toBeInTheDocument();
  });

  it('a non-link is refused before any call is made', () => {
    renderPage();
    openAndType('hello');
    expect(screen.getByRole('alert')).toHaveTextContent("doesn't look like a web link");
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a valid link is sent with the trimmed note, then the confirmation shows', async () => {
    rpc.mockResolvedValue({ error: null });
    renderPage();
    openAndType('  https://sola.day/event/x  ', '  weekly events  ');
    await waitFor(() => expect(screen.getByTestId('cm-suggest-source-saved')).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith('submit_calendar_source', {
      p_url: 'https://sola.day/event/x',
      p_note: 'weekly events',
    });
  });

  it('an empty note is sent as null', async () => {
    rpc.mockResolvedValue({ error: null });
    renderPage();
    openAndType('https://sola.day/event/x');
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0][1]).toEqual({ p_url: 'https://sola.day/event/x', p_note: null });
  });

  it.each([
    ['invalid link', "doesn't look like a web link"],
    ['rate limit', 'try again a little later'],
    ['boom', "wasn't sent"],
  ])('server refusal "%s" keeps the input and explains', async (message, text) => {
    rpc.mockResolvedValue({ error: { message, code: 'x' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();
    openAndType('https://sola.day/event/x');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));
    expect(screen.getByLabelText('Link')).toHaveValue('https://sola.day/event/x');
    expect(screen.queryByTestId('cm-suggest-source-saved')).toBeNull();
  });

  it('the Send button is disabled only while sending', async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    openAndType('https://sola.day/event/x');
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
    resolve({ error: null });
    await waitFor(() => expect(screen.getByTestId('cm-suggest-source-saved')).toBeInTheDocument());
  });

  it('closing while sending discards the late reply: the next open shows an empty form', async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    openAndType('https://sola.day/event/x');
    await screen.findByRole('button', { name: 'Sending…' });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    resolve({ error: null });
    await Promise.resolve();
    fireEvent.click(screen.getByTestId('cm-suggest-source'));
    expect(screen.queryByTestId('cm-suggest-source-saved')).toBeNull();
    expect(screen.getByLabelText('Link')).toHaveValue('');
  });
});
