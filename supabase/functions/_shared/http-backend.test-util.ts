// Test support only (imported by tests, never by a function).
//
// Answers a function's outbound requests from an in-memory store, so the function's real
// index.ts and the real client library run unchanged and nothing reaches a network. Each
// request the client library sends (auth, table reads and writes, RPCs) is translated into the
// matching call on a FakeSupabase; requests to the mail provider are recorded. A request it
// does not understand is refused loudly, so nothing can fall through to a real server (the
// tests also run without network permission).
import type { FakeSupabase } from './fake-supabase.test-util.ts';
import type { Query, QueryResult, Row } from './fake-query.test-util.ts';

export interface SentMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const bearer = (req: Request) => (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
const wantsObject = (req: Request) => (req.headers.get('Accept') ?? '').includes('application/vnd.pgrst.object+json');
const prefers = (req: Request, what: string) => (req.headers.get('Prefer') ?? '').includes(what);

async function bodyOf(req: Request): Promise<Row> {
  return (await req.json().catch(() => ({}))) as Row;
}

/** The auth server: who a token is, and the admin calls the functions make. */
async function answerAuth(db: FakeSupabase, req: Request, url: URL): Promise<Response> {
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  if (path === '/user' && req.method === 'GET') {
    const user = db.userForToken(bearer(req));
    return user
      ? json({ ...user, aud: 'authenticated', role: 'authenticated' })
      : json({ code: 401, msg: 'invalid token' }, 401);
  }
  if (path === '/admin/generate_link' && req.method === 'POST') {
    const body = await bodyOf(req);
    const redirectTo = url.searchParams.get('redirect_to') ?? (body.redirectTo as string | undefined) ?? null;
    const link = db.mintLink(String(body.type), String(body.email), redirectTo);
    return json({ ...link, redirect_to: redirectTo, verification_type: body.type, email: body.email });
  }
  if (path === '/admin/users' && req.method === 'POST') {
    return json(db.createAuthUser((await bodyOf(req)) as { email: string; email_confirm?: boolean }));
  }
  const one = /^\/admin\/users\/([^/]+)$/.exec(path);
  if (one && req.method === 'GET') {
    const user = db.authUser(one[1]);
    return user ? json(user) : json({ code: 404, msg: 'user not found' }, 404);
  }
  if (one && req.method === 'PUT') {
    const user = db.updateAuthUser(one[1], await bodyOf(req));
    return user ? json(user) : json({ code: 404, msg: 'user not found' }, 404);
  }
  throw new Error(`unexpected auth request in a test: ${req.method} ${url.pathname}`);
}

/** `in.(a,b)` → ['a', 'b'] */
function listOf(value: string): string[] {
  return value.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
}

/** Applies the filters and paging a request's query string names. */
function applyQueryString(query: Query, url: URL): Query {
  let offset: number | null = null;
  let limit: number | null = null;
  for (const [key, value] of url.searchParams) {
    if (key === 'select' || key === 'columns' || key === 'on_conflict') continue;
    if (key === 'order') query.order(value.split('.')[0]);
    else if (key === 'offset') offset = Number(value);
    else if (key === 'limit') limit = Number(value);
    else if (value.startsWith('eq.')) query.eq(key, value.slice(3));
    else if (value.startsWith('gt.')) query.gt(key, value.slice(3));
    else if (value === 'is.null') query.is(key, null);
    else if (value === 'not.is.null') query.not(key, 'is', null);
    else if (value.startsWith('in.(')) query.in(key, listOf(value));
    else throw new Error(`unsupported filter in a test request: ${key}=${value}`);
  }
  if (offset !== null || limit !== null) {
    const from = offset ?? 0;
    query.range(from, from + (limit ?? Number.MAX_SAFE_INTEGER) - 1);
  }
  return query;
}

/**
 * The write a table request asks for, before filters. Not async on purpose: a query is
 * thenable, so returning one from an async function would run it.
 */
function startWrite(db: FakeSupabase, table: string, req: Request, url: URL, body: Row | Row[]): Query {
  if (req.method === 'DELETE') return db.from(table).delete();
  if (req.method === 'PATCH') return db.from(table).update(body as Row);
  if (!prefers(req, 'resolution=')) return db.from(table).insert(body);
  return db.from(table).upsert(body, {
    onConflict: url.searchParams.get('on_conflict') ?? undefined,
    ignoreDuplicates: prefers(req, 'resolution=ignore-duplicates'),
  });
}

function restResponse(result: QueryResult, req: Request): Response {
  if (result.error) return json(result.error, result.error.code === 'PGRST116' ? 406 : 500);
  if (result.data === null && req.method !== 'GET') return new Response(null, { status: 204 });
  return json(result.data);
}

/** One table read or write. */
async function answerTable(db: FakeSupabase, table: string, req: Request, url: URL): Promise<Response> {
  const select = url.searchParams.get('select') ?? undefined;
  let query: Query;
  if (req.method === 'GET') {
    query = db.from(table).select(select);
  } else {
    const body = req.method === 'DELETE' ? {} : ((await req.json()) as Row | Row[]);
    query = startWrite(db, table, req, url, body);
    if (prefers(req, 'return=representation')) query.select(select);
  }
  applyQueryString(query, url);
  if (wantsObject(req)) query.single();
  return restResponse(await query, req);
}

async function answerRpc(db: FakeSupabase, fn: string, req: Request): Promise<Response> {
  const result = await db.rpc(fn, await bodyOf(req));
  return result.error ? json({ code: 'PGRST202', message: result.error.message }, 404) : json(result.data);
}

export class HttpBackend {
  /** Mail the provider accepted. */
  mail: SentMail[] = [];
  /** Every mail handed to the provider, accepted or not. */
  attempted: SentMail[] = [];
  /** What the provider answers for the next sends, in order; it accepts once the list runs out. */
  transport: boolean[] = [];
  /** `${method} ${path}` of every request answered, in order. */
  seen: string[] = [];

  constructor(public db: FakeSupabase, private mailOrigin = 'https://api.mailgun.net') {}

  /** Replaces globalThis.fetch for the duration of `run`. */
  async during<T>(run: () => Promise<T>): Promise<T> {
    const real = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => this.answer(input, init)) as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = real;
    }
  }

  private async takeMail(req: Request): Promise<Response> {
    const form = await req.formData();
    const mail = {
      to: String(form.get('to')), subject: String(form.get('subject')),
      html: String(form.get('html')), text: String(form.get('text')),
    };
    this.attempted.push(mail);
    const accepted = this.transport.length > 0 ? this.transport.shift() : true;
    if (!accepted) return json({ message: 'refused by the test transport' }, 500);
    this.mail.push(mail);
    return json({ id: 'queued' });
  }

  private answer(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(req.url);
    this.seen.push(`${req.method} ${url.pathname}`);

    if (url.origin === this.mailOrigin && req.method === 'POST') return this.takeMail(req);
    if (url.pathname.startsWith('/auth/v1/')) return answerAuth(this.db, req, url);
    const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
    if (rpc && req.method === 'POST') return answerRpc(this.db, rpc[1], req);
    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (table) return answerTable(this.db, table[1], req, url);
    return Promise.reject(new Error(`unexpected request in a test: ${req.method} ${url.origin}${url.pathname}`));
  }
}
