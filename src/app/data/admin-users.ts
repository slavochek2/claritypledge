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
 * LinkedIn is user-typed and clicked from an admin session under a LinkedIn icon,
 * so it becomes a link only if it parses as https: AND the host is linkedin.com
 * or a subdomain. Otherwise any https phishing page could wear the LinkedIn icon.
 */
export function safeLinkedInHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:') return undefined;
    const host = url.hostname.toLowerCase();
    return host === 'linkedin.com' || host.endsWith('.linkedin.com') ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Most recent login first; never-logged-in last, newest sign-up first among them. */
export function byRecentLogin(a: AdminUser, b: AdminUser): number {
  if (a.lastSignInAt && b.lastSignInAt) {
    const c = b.lastSignInAt.localeCompare(a.lastSignInAt);
    if (c !== 0) return c;
  } else if (a.lastSignInAt || b.lastSignInAt) {
    return a.lastSignInAt ? -1 : 1;
  }
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

export function formatLastLogin(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Never logged in';
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 24 * 7) return `${Math.floor(mins / 1440)}d ago`;
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
  // The SQL orders by a unique final key, but pages are separate queries: a sign-in
  // between two calls shifts offsets. Dedupe by id so nobody renders twice.
  const seen = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .rpc('admin_list_users')
      .range(from, from + PAGE - 1) as { data: AdminUserRow[] | null; error: { code?: string } | null };
    if (error || !page) {
      // Code only: never the payload.
      if (error) console.warn('admin_list_users failed', error.code);
      return null;
    }
    for (const r of page) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        data.push(r);
      }
    }
    if (page.length < PAGE) break;
  }
  return data
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      // No profile row yet (auth sign-up only): show the email as the name.
      name: r.name || r.email || '(no name)',
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
