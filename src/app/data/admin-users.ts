/**
 * @file admin-users.ts
 * @description P1381: data + pure helpers for the founder-only /admin/users page.
 *
 * The ONLY gate is server-side: `admin_list_users` calls `public.assert_admin()`
 * inside Postgres. Nothing here decides who is an admin. A non-admin caller gets
 * an error, and the page renders not-found.
 *
 * The list is held in component state only: never localStorage, sessionStorage
 * or a persisted query cache. Errors are logged without row data.
 */
import { supabase } from '@/lib/supabase';

export type AdminUserStatus = 'pledged' | 'verified' | 'unverified';

export interface AdminUser {
  id: string;
  slug: string | null;
  name: string;
  email: string;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  status: AdminUserStatus;
  createdAt: string;
  lastSignInAt: string | null;
}

interface AdminUserRow {
  id: string;
  slug: string | null;
  name: string | null;
  email: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  is_verified: boolean;
  has_pledged: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

// has_pledged defaults TRUE in the schema, so it only means something once verified.
export function statusOf(isVerified: boolean, hasPledged: boolean): AdminUserStatus {
  if (!isVerified) return 'unverified';
  return hasPledged ? 'pledged' : 'verified';
}

/**
 * LinkedIn is user-typed and clicked from an admin session, so only a URL that
 * parses with the https: scheme becomes a link. Stricter than safeLinkHref
 * (which also allows http:), on purpose.
 */
export function safeHttpsHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Most recent login first; never-logged-in last, newest sign-up first among them. */
export function byRecentLogin(a: AdminUser, b: AdminUser): number {
  if (a.lastSignInAt && b.lastSignInAt) return b.lastSignInAt.localeCompare(a.lastSignInAt);
  if (a.lastSignInAt || b.lastSignInAt) return a.lastSignInAt ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

export function formatLastLogin(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Never logged in';
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function matchesQuery(user: AdminUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [user.name, user.email, user.slug ?? ''].some((v) => v.toLowerCase().includes(q));
}

// PostgREST caps every response at max_rows (1000 on this project) WITHOUT erroring,
// so a single call silently truncates. Page until a short page comes back.
const PAGE = 1000;

/** Returns the full list, or null on ANY error (non-admin, signed out, network). */
export async function getAdminUsers(): Promise<AdminUser[] | null> {
  const data: AdminUserRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .rpc('admin_list_users')
      .range(from, from + PAGE - 1) as { data: AdminUserRow[] | null; error: { code?: string } | null };
    if (error || !page) {
      // Code only: never the payload.
      if (error) console.warn('admin_list_users failed', error.code);
      return null;
    }
    data.push(...page);
    if (page.length < PAGE) break;
  }
  return data
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name || '(no name)',
      email: r.email ?? '',
      linkedinUrl: r.linkedin_url,
      avatarUrl: r.avatar_url,
      avatarColor: r.avatar_color,
      status: statusOf(r.is_verified, r.has_pledged),
      createdAt: r.created_at,
      lastSignInAt: r.last_sign_in_at,
    }))
    .sort(byRecentLogin);
}
