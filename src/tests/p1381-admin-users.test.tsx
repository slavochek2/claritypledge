/**
 * @file p1381-admin-users.test.tsx
 * @description P1381: /admin/users page + pure helpers (offline lane).
 * The database gate itself is proven in src/tests/integration/p1381-admin-list-users.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'fs';
import type { ReactElement } from 'react';

const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const authState = { user: { id: 'user-id-1234' } as { id: string } | null, isLoading: false };
vi.mock('@/auth', () => ({ useAuth: () => authState }));

// rpc(...).range(from, to) — the mock resolves per page so pagination is testable.
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (name: string) => ({ range: (from: number, to: number) => rpc(name, from, to) }) },
}));

vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div>NOT FOUND</div> }));
const stopSessionRecording = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { stopSessionRecording: () => stopSessionRecording() } }));
vi.mock('@/components/ui/clarity-loader', () => ({ ClarityPageLoader: () => <div>LOADING</div> }));

import { AdminUsersPage } from '@/app/pages/admin-users-page';
import { safeLinkedInHref, statusOf, byRecentLogin, formatLastLogin, type AdminUser } from '@/app/data/admin-users';

function row(o: Partial<Record<string, unknown>>) {
  return {
    id: 'id', slug: null, name: 'X', email: 'x@example.com', linkedin_url: null,
    avatar_url: null, avatar_color: null, is_verified: true, has_pledged: false,
    created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, ...o,
  };
}

const ROWS = [
  row({ id: '1', name: 'Never Old', email: 'old@example.com', is_verified: false, has_pledged: true, created_at: '2026-01-01T00:00:00Z' }),
  row({ id: '2', name: 'Pat Pledger', email: 'pat@example.com', slug: 'pat', has_pledged: true, linkedin_url: 'https://linkedin.com/in/pat', last_sign_in_at: '2026-09-01T00:00:00Z' }),
  row({ id: '3', name: 'Recent Rita', email: 'rita@example.com', slug: 'rita', linkedin_url: 'javascript:alert(1)', last_sign_in_at: '2026-09-30T00:00:00Z' }),
  row({ id: '4', name: 'Never New', email: 'new@example.com', is_verified: false, created_at: '2026-09-29T00:00:00Z', linkedin_url: 'data:text/html,x' }),
];

describe('P1381 helpers', () => {
  it('safeLinkedInHref allows only https on linkedin.com', () => {
    expect(safeLinkedInHref('https://linkedin.com/in/a')).toBe('https://linkedin.com/in/a');
    expect(safeLinkedInHref('https://www.LinkedIn.com/in/a')).toBe('https://www.linkedin.com/in/a');
    expect(safeLinkedInHref('javascript:alert(1)')).toBeUndefined();
    expect(safeLinkedInHref('JavaScript:https://x')).toBeUndefined();
    expect(safeLinkedInHref('data:text/html,<script>')).toBeUndefined();
    expect(safeLinkedInHref('http://linkedin.com/in/a')).toBeUndefined();
    expect(safeLinkedInHref('linkedin.com/in/a')).toBeUndefined();
    expect(safeLinkedInHref(null)).toBeUndefined();
    // Phishing hosts wearing the LinkedIn icon.
    expect(safeLinkedInHref('https://evil.example/linkedin.com')).toBeUndefined();
    expect(safeLinkedInHref('https://linkedin.com.evil.example/in/a')).toBeUndefined();
    expect(safeLinkedInHref('https://evillinkedin.com/in/a')).toBeUndefined();
    // userinfo trick: host is evil.example (split so it doesn't read as an email address)
    expect(safeLinkedInHref('https://linkedin.com' + '@' + 'evil.example/in/a')).toBeUndefined();
  });

  it('index.html never records /admin/* in Mixpanel on a direct load', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/p1325NoRecord = p1325NoRecord \|\| \/\^\\\/admin\(\?:\\\/\|\$\)\/i\.test\(window\.location\.pathname\)/);
  });

  it('statusOf ignores has_pledged until verified (it defaults true)', () => {
    expect(statusOf(false, true)).toBe('unverified');
    expect(statusOf(true, false)).toBe('verified');
    expect(statusOf(true, true)).toBe('pledged');
  });

  it('byRecentLogin: logged-in by recency, then never-logged-in newest signup first', () => {
    const u = (id: string, last: string | null, created: string) => ({ id, lastSignInAt: last, createdAt: created }) as AdminUser;
    const sorted = [u('a', null, '2026-01-01'), u('b', '2026-09-01', '2026-01-01'), u('c', null, '2026-09-01'), u('d', '2026-09-30', '2026-01-01')]
      .sort(byRecentLogin).map((x) => x.id);
    expect(sorted).toEqual(['d', 'b', 'c', 'a']);
  });

  it('formatLastLogin', () => {
    const now = new Date('2026-10-01T08:00:00Z').getTime();
    expect(formatLastLogin(null, now)).toBe('Never logged in');
    expect(formatLastLogin('2026-10-01T07:30:00Z', now)).toBe('30m ago');
    expect(formatLastLogin('2026-09-30T08:00:00Z', now)).toBe('1d ago');
  });
});

describe('P1381 /admin/users page', () => {
  beforeEach(() => {
    rpc.mockReset();
    stopSessionRecording.mockReset();
    authState.user = { id: 'user-id-1234' };
    authState.isLoading = false;
  });

  it('signed out: not-found, and the RPC is never called', async () => {
    authState.user = null;
    render(<AdminUsersPage />);
    expect(await screen.findByText('NOT FOUND')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('RPC error (non-admin): generic not-found, no partial list', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    render(<AdminUsersPage />);
    expect(await screen.findByText('NOT FOUND')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-user-row')).toBeNull();
  });

  it('admin: lists everyone in login order, with counts, links and safe LinkedIn', async () => {
    rpc.mockResolvedValue({ data: ROWS, error: null });
    render(<AdminUsersPage />);
    const rows = await screen.findAllByTestId('admin-user-row');
    const names = rows.map((r) => (r.textContent ?? '').match(/Recent Rita|Pat Pledger|Never New|Never Old/)?.[0]);
    expect(names).toEqual(['Recent Rita', 'Pat Pledger', 'Never New', 'Never Old']);

    expect(screen.getByRole('button', { name: /All 4/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pledged 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verified 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unverified 2/ })).toBeInTheDocument();

    // Row links to profile only when a slug exists.
    expect(within(rows[0]).getAllByRole('link')[0]).toHaveAttribute('href', '/p/rita');
    expect(within(rows[2]).queryAllByRole('link')).toHaveLength(0);
    expect(within(rows[3]).getAllByText('Never logged in').length).toBeGreaterThan(0);

    // LinkedIn: https renders in a new tab; javascript: and data: render nothing.
    const li = screen.getByRole('link', { name: 'Pat Pledger on LinkedIn' });
    expect(li).toHaveAttribute('href', 'https://linkedin.com/in/pat');
    expect(li).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: 'Recent Rita on LinkedIn' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Never New on LinkedIn' })).toBeNull();
  });

  it('search narrows by name or email; clear resets; empty state names the query', async () => {
    rpc.mockResolvedValue({ data: ROWS, error: null });
    render(<AdminUsersPage />);
    await screen.findAllByTestId('admin-user-row');
    const input = screen.getByLabelText('Search users');

    fireEvent.change(input, { target: { value: 'RITA@' } });
    expect(screen.getAllByTestId('admin-user-row')).toHaveLength(1);

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No one matches “zzz”.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getAllByTestId('admin-user-row')).toHaveLength(4);
  });

  it('pages past the 1000-row PostgREST cap instead of truncating', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => row({ id: `u${i}`, name: `User ${i}` }));
    rpc.mockImplementation((_n: string, from: number, to: number) =>
      Promise.resolve({ data: many.slice(from, to + 1), error: null }));
    render(<AdminUsersPage />);
    expect(await screen.findByRole('button', { name: /All 1500/ })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
    // Rendering is capped; search still reaches row 1499.
    expect(screen.getAllByTestId('admin-user-row')).toHaveLength(200);
    expect(screen.getByText('Showing 200 of 1500. Search to narrow.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'User 1499' } });
    expect(screen.getAllByTestId('admin-user-row')).toHaveLength(1);
  });

  it('stops Mixpanel session recording on mount', async () => {
    rpc.mockResolvedValue({ data: ROWS, error: null });
    render(<AdminUsersPage />);
    await screen.findAllByTestId('admin-user-row');
    expect(stopSessionRecording).toHaveBeenCalled();
  });

  it('dedupes a user that appears on two pages', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => row({ id: `u${i}`, name: `User ${i}` }));
    const page2 = [row({ id: 'u999', name: 'User 999' }), row({ id: 'u1000', name: 'User 1000' })];
    rpc.mockImplementation((_n: string, from: number) => Promise.resolve({ data: from === 0 ? page1 : page2, error: null }));
    render(<AdminUsersPage />);
    expect(await screen.findByRole('button', { name: /All 1001/ })).toBeInTheDocument();
  });

  it('a sign-up with no profile row is listed by email, unlinked', async () => {
    rpc.mockResolvedValue({ data: [row({ id: 'np', name: null, email: 'noprofile@example.com', is_verified: false })], error: null });
    render(<AdminUsersPage />);
    const [r] = await screen.findAllByTestId('admin-user-row');
    expect(within(r).getAllByText('noprofile@example.com').length).toBeGreaterThan(0);
    expect(within(r).queryAllByRole('link')).toHaveLength(0);
  });

  it('empty state points to All when the query matches under another chip', async () => {
    rpc.mockResolvedValue({ data: ROWS, error: null });
    render(<AdminUsersPage />);
    await screen.findAllByTestId('admin-user-row');
    fireEvent.click(screen.getByRole('button', { name: /Pledged 1/ }));
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'rita' } });
    expect(screen.getByText('No pledged users match “rita”. Try All.')).toBeInTheDocument();
  });

  it('filter chips filter the list', async () => {
    rpc.mockResolvedValue({ data: ROWS, error: null });
    render(<AdminUsersPage />);
    await screen.findAllByTestId('admin-user-row');
    fireEvent.click(screen.getByRole('button', { name: /Unverified 2/ }));
    expect(screen.getAllByTestId('admin-user-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Pledged 1/ }));
    expect(screen.getAllByTestId('admin-user-row')).toHaveLength(1);
  });

  it('never writes the list to web storage', async () => {
    rpc.mockResolvedValue({ data: ROWS, error: null });
    localStorage.clear(); sessionStorage.clear();
    render(<AdminUsersPage />);
    await screen.findAllByTestId('admin-user-row');
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(dump).not.toContain('example.com');
  });
});
