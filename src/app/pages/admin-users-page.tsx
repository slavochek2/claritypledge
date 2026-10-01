/**
 * @file admin-users-page.tsx
 * @description P1381: founder-only user lookup at /admin/users.
 *
 * Job: "find a person and open their profile." Search by name or email, filter
 * chips double as the only stats, most recent login first, whole row opens /p/:slug.
 *
 * The gate is server-side (`admin_list_users` → `assert_admin()` in Postgres).
 * This page never checks admin itself: any error, including "not an admin" or
 * "signed out", renders the ordinary not-found page, so the route reveals nothing.
 *
 * Deliberately NOT here: resend verification, analytics, sort controls, edit/delete.
 * Public search stays out entirely (decisions.md 2026-06-06, P878).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Linkedin, Search, X } from 'lucide-react';
import { useAuth } from '@/auth';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { NotFoundPage } from '@/app/pages/not-found-page';
import {
  getAdminUsers,
  formatLastLogin,
  matchesQuery,
  safeLinkedInHref,
  type AdminUser,
  type AdminUserStatus,
} from '@/app/data/admin-users';
import { analytics } from '@/lib/mixpanel';
import { cn } from '@/lib/utils';

type Filter = 'all' | AdminUserStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pledged', label: 'Pledged' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
];

const STATUS_LABEL: Record<AdminUserStatus, string> = {
  pledged: 'Pledged',
  verified: 'Verified',
  unverified: 'Unverified',
};

// Search and counts cover everyone; only the rendered rows are capped, so a large
// user base never mounts thousands of rows. The founder narrows by typing.
const RENDER_CAP = 200;

type LoadState = { kind: 'loading' } | { kind: 'denied' } | { kind: 'ready'; users: AdminUser[] };

export function AdminUsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Mixpanel records 100% of sessions; this page is a PII directory. index.html keeps
  // recording off on a direct load of /admin/*; this covers in-app navigation here.
  useEffect(() => {
    analytics.stopSessionRecording();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ kind: 'denied' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    getAdminUsers().then((users) => {
      if (cancelled) return;
      setState(users ? { kind: 'ready', users } : { kind: 'denied' });
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- refetch only when the signed-in identity changes

  const users = useMemo(() => (state.kind === 'ready' ? state.users : []), [state]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: users.length, pledged: 0, verified: 0, unverified: 0 };
    for (const u of users) c[u.status] += 1;
    return c;
  }, [users]);

  const rows = useMemo(
    () => users.filter((u) => (filter === 'all' || u.status === filter) && matchesQuery(u, query)),
    [users, filter, query],
  );

  if (state.kind === 'loading') return <ClarityPageLoader />;
  if (state.kind === 'denied') return <NotFoundPage />;

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
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
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

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
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
        {rows.slice(0, RENDER_CAP).map((u) => {
          const linkedin = safeLinkedInHref(u.linkedinUrl);
          const body = (
            <>
              <PersonAvatar
                person={{
                  name: u.name,
                  avatarUrl: u.avatarUrl,
                  avatarColor: u.avatarColor ?? undefined,
                  hasPledged: u.status === 'pledged',
                }}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{u.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{u.email}</span>
                <span className="block text-xs text-muted-foreground sm:hidden">
                  {STATUS_LABEL[u.status]} · {formatLastLogin(u.lastSignInAt)}
                </span>
              </span>
              <span className="hidden shrink-0 text-right text-sm sm:block">
                <span className="block text-foreground">{STATUS_LABEL[u.status]}</span>
                <span className="block text-muted-foreground">{formatLastLogin(u.lastSignInAt)}</span>
              </span>
            </>
          );
          return (
            <li key={u.id} className="flex items-center" data-testid="admin-user-row">
              {u.slug ? (
                <Link to={`/p/${encodeURIComponent(u.slug)}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 hover:bg-muted/50">
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2" title="No public profile yet">
                  {body}
                </div>
              )}
              {/* Sibling of the row link, never nested: <a> inside <a> is invalid. Fixed slot keeps rows aligned. */}
              <span className="flex w-12 shrink-0 justify-center">
                {linkedin && (
                  <a
                    href={linkedin}
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
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            {!query.trim()
              ? 'No users in this filter.'
              : filter !== 'all' && users.some((u) => matchesQuery(u, query))
                ? `No ${STATUS_LABEL[filter as AdminUserStatus].toLowerCase()} users match “${query.trim()}”. Try All.`
                : `No one matches “${query.trim()}”.`}
          </li>
        )}
      </ul>
      {rows.length > RENDER_CAP && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Showing {RENDER_CAP} of {rows.length}. Search to narrow.
        </p>
      )}
    </main>
  );
}
