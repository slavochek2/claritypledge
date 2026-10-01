/**
 * @file admin-users-prototype.tsx
 * @description DEV-only prototype (/tree/admin-users). Founder-only user lookup.
 *
 * Job: "I need to find a person and open their profile." Nothing else in v1.
 * - One search box (name, email, slug). Filter chips double as the only stats.
 * - Order: most recent login first (who I just met is on top). No sort controls.
 * - Row = who + status + last login; whole row opens the profile.
 * - Users with no slug yet (unverified /live sign-ups) have no public profile, so the
 *   row says so instead of linking to a 404.
 *
 * LinkedIn opens in a new tab (outreach after events). Real build: admin-only RPC,
 * since P877 keeps linkedin_url out of the public read grant.
 *
 * Deliberately NOT here (add when a real need shows up): resend verification,
 * analytics charts, edit/delete, impersonation. Public search stays out entirely:
 * decisions.md 2026-06-06 (P878) rejected an open directory as a scraping surface.
 *
 * Render-only: mock data, no api.ts / auth imports.
 */
import { useMemo, useState } from 'react';
import { Linkedin, Search, X } from 'lucide-react';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { safeLinkHref } from '@/app/prototypes/events/location-utils';
import { cn } from '@/lib/utils';

type Status = 'pledged' | 'verified' | 'unverified';

interface MockUser {
  id: string;
  name: string;
  email: string;
  slug: string | null;
  linkedin?: string;
  avatarUrl?: string;
  status: Status;
  joined: string; // ISO date
  lastLogin: string | null; // auth.users.last_sign_in_at; null = never logged in
}

const USERS: MockUser[] = [
  { id: '1', name: 'Tibor Kovács', email: 'tibor@example.com', slug: 'tibor-k', avatarUrl: '/customer-avatar.jpg', linkedin: 'https://linkedin.com/in/example-tibor', status: 'pledged', joined: '2026-09-30', lastLogin: '2026-10-01T06:10:00Z' },
  { id: '2', name: 'Anna Schmidt', email: 'anna.s@example.com', slug: 'anna-schmidt', avatarUrl: '/customer-avatar.jpg', status: 'verified', joined: '2026-09-29', lastLogin: '2026-09-30T18:00:00Z' },
  { id: '3', name: 'Somchai P.', email: 'somchai@example.com', slug: null, status: 'unverified', joined: '2026-09-29', lastLogin: null },
  { id: '4', name: 'Philip Brandt', email: 'philip@example.com', slug: 'philip', linkedin: 'https://linkedin.com/in/example-philip', status: 'pledged', joined: '2026-09-12', lastLogin: '2026-09-28T09:00:00Z' },
  { id: '5', name: 'Maria Lopez de la Fuente-Hernández', email: 'maria.lopez.delafuente@a-very-long-subdomain.example.com', slug: 'maria-lopez', linkedin: 'https://linkedin.com/in/example-maria', status: 'verified', joined: '2026-08-21', lastLogin: '2026-09-02T12:00:00Z' },
  { id: '6', name: 'Jake', email: 'jake@example.com', slug: null, status: 'unverified', joined: '2026-08-02', lastLogin: null },
  { id: '7', name: 'Lena Fischer', email: 'lena@example.com', slug: 'lena-f', status: 'pledged', joined: '2026-07-15', lastLogin: '2026-09-30T20:30:00Z' },
];

const FILTERS: { key: 'all' | Status; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pledged', label: 'Pledged' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
];

const STATUS_LABEL: Record<Status, string> = {
  pledged: 'Pledged',
  verified: 'Verified',
  unverified: 'Unverified',
};

const NOW = new Date('2026-10-01T08:00:00Z').getTime(); // fixed so the mock reads the same every day

function formatLastLogin(iso: string | null) {
  if (!iso) return 'Never logged in';
  const mins = Math.round((NOW - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Most recently logged-in first; never-logged-in last, newest sign-up first among them.
function byRecent(a: MockUser, b: MockUser) {
  if (a.lastLogin && b.lastLogin) return b.lastLogin.localeCompare(a.lastLogin);
  if (a.lastLogin || b.lastLogin) return a.lastLogin ? -1 : 1;
  return b.joined.localeCompare(a.joined);
}

export function AdminUsersPrototype() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');

  const counts = useMemo(() => {
    const c = { all: USERS.length, pledged: 0, verified: 0, unverified: 0 };
    for (const u of USERS) c[u.status] += 1;
    return c;
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...USERS].sort(byRecent).filter((u) => filter === 'all' || u.status === filter).filter(
      (u) => !q || [u.name, u.email, u.slug ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [query, filter]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold text-foreground">Users</h1>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or email"
          aria-label="Search users"
          className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'h-10 rounded-full border px-4 text-sm transition-colors',
              filter === f.key
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
        {rows.map((u) => {
          const body = (
            <>
              <PersonAvatar person={{ name: u.name, avatarUrl: u.avatarUrl, hasPledged: u.status === 'pledged' }} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{u.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{u.email}</span>
                <span className="block text-xs text-muted-foreground sm:hidden">
                  {STATUS_LABEL[u.status]} · {formatLastLogin(u.lastLogin)}
                </span>
              </span>
              <span className="hidden shrink-0 text-right text-sm sm:block">
                <span className="block text-foreground">{STATUS_LABEL[u.status]}</span>
                <span className="block text-muted-foreground">{formatLastLogin(u.lastLogin)}</span>
              </span>
            </>
          );
          return (
            <li key={u.id} className="flex items-center">
              {u.slug ? (
                <a href={`/p/${u.slug}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 hover:bg-muted/50">
                  {body}
                </a>
              ) : (
                <div className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2" title="No public profile until they verify">
                  {body}
                </div>
              )}
              {/* Sibling of the row link, never nested: <a> inside <a> is invalid. Fixed slot keeps rows aligned. */}
              <span className="flex w-12 shrink-0 justify-center">
                {u.linkedin && (
                  <a
                    href={safeLinkHref(u.linkedin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${u.name} on LinkedIn`}
                    className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Linkedin className="h-4 w-4" />
                  </a>
                )}
              </span>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">No one matches “{query}”.</li>
        )}
      </ul>
    </main>
  );
}
