// Test support only (imported by tests, never by a function): an in-memory stand-in for the
// database and auth server behind a function. It keeps rows per table (queries are in
// fake-query.test-util.ts), answers the RPCs and auth calls the functions make, and records
// every write and every minted sign-in link so a test can assert on what a request did.
//
// The functions under test reach it over HTTP, through http-backend.test-util.ts, which
// translates each request the real client library sends into a call here.
import { Query, type QueryResult, type QueryStore, type Row, type WriteRecord } from './fake-query.test-util.ts';

export type { Row, WriteRecord } from './fake-query.test-util.ts';

export interface LinkRecord {
  type: string;
  email: string;
  redirectTo: string | null;
}

export interface FakeAuthUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string }>;
}

export interface FakeOptions {
  tables?: Record<string, Row[]>;
  /** Bearer token → user id, for the "who is this token" call. */
  tokens?: Record<string, string>;
  authUsers?: FakeAuthUser[];
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
}

const AUTH_LINK_BASE = 'https://auth.fake.test/verify';

export class FakeSupabase implements QueryStore {
  tables: Record<string, Row[]>;
  writes: WriteRecord[] = [];
  links: LinkRecord[] = [];
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  createdUsers: FakeAuthUser[] = [];
  /** `${op}:${table}` → error message, to make one kind of query fail. */
  failures: Record<string, string> = {};
  /** `${op}:${table}` → n, to make only the n-th query of that kind fail (1-based). */
  failNth: Record<string, number> = {};
  queryCounts: Record<string, number> = {};
  /** `${op}:${table}` → called with n just before the n-th query of that kind runs (1-based). */
  beforeQuery: Record<string, (nth: number) => void> = {};
  /** The most rows a single read returns, with or without a range (the server's own cap). */
  maxRows = 1000;

  private tokens: Record<string, string>;
  private authUsers: FakeAuthUser[];
  private rpcHandlers: Record<string, (args: Record<string, unknown>) => unknown>;

  constructor(options: FakeOptions = {}) {
    this.tables = structuredClone(options.tables ?? {});
    this.tokens = options.tokens ?? {};
    this.authUsers = structuredClone(options.authUsers ?? []);
    this.rpcHandlers = {
      // The mail limiter admits every request unless a test replaces it.
      reserve_mail_rate_slot: () => 0,
      get_auth_user_by_email: (args) =>
        this.authUsers.filter((u) => u.email === args.p_email).map((u) => ({ id: u.id, email: u.email })),
      ...(options.rpc ?? {}),
    };
  }

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  /** Rows written to one table by one kind of write, in order. */
  written(table: string, op: WriteRecord['op']): Row[] {
    return this.writes.filter((w) => w.table === table && w.op === op).flatMap((w) => w.rows);
  }

  from(table: string): Query {
    return new Query(this, table);
  }

  rpc(fn: string, args: Record<string, unknown> = {}): Promise<QueryResult> {
    this.rpcCalls.push({ fn, args });
    const handler = this.rpcHandlers[fn];
    if (!handler) return Promise.resolve({ data: null, error: { message: `fake-supabase: no rpc ${fn}` } });
    return Promise.resolve({ data: handler(args), error: null });
  }

  /** The user a bearer token belongs to, or null. */
  userForToken(token: string): { id: string; email: string } | null {
    const id = this.tokens[token];
    if (!id) return null;
    const known = this.authUsers.find((u) => u.id === id);
    return { id, email: known?.email ?? `${id}@example.com` };
  }

  authUser(id: string): FakeAuthUser | null {
    return this.authUsers.find((u) => u.id === id) ?? null;
  }

  updateAuthUser(id: string, attributes: { user_metadata?: Record<string, unknown> }): FakeAuthUser | null {
    const user = this.authUser(id);
    if (!user) return null;
    user.user_metadata = { ...(user.user_metadata ?? {}), ...(attributes.user_metadata ?? {}) };
    return user;
  }

  createAuthUser(attributes: { email: string; email_confirm?: boolean }): FakeAuthUser {
    const user: FakeAuthUser = {
      id: crypto.randomUUID(),
      email: attributes.email,
      email_confirmed_at: attributes.email_confirm ? new Date().toISOString() : null,
      identities: [{ provider: 'email' }],
    };
    this.authUsers.push(user);
    this.createdUsers.push(user);
    return user;
  }

  /** Mints a sign-in link and records where it would return the reader to. */
  mintLink(type: string, email: string, redirectTo: string | null): { action_link: string; hashed_token: string } {
    this.links.push({ type, email, redirectTo });
    const n = this.links.length;
    return {
      action_link: `${AUTH_LINK_BASE}?token=fake-${n}&redirect_to=${encodeURIComponent(redirectTo ?? '')}`,
      hashed_token: `fake-hashed-token-${n}`,
    };
  }
}

/** True for a link minted by the fake auth server (its redirect target is checked separately). */
export function isAuthServerLink(url: string): boolean {
  return url.startsWith(`${AUTH_LINK_BASE}?`);
}

/** Every http(s) address in a piece of mail (HTML or plain text), with HTML entities undone. */
export function linksIn(mailBody: string): string[] {
  const found = mailBody.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  return found.map((u) => u.replace(/&amp;/g, '&'));
}
