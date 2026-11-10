/**
 * P1653 (server): a bare domain counts as a link (F4), the one reply table, and the derived coverage of every failure code (Done-When 7).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractUrls, isThinRedirect } from '../../supabase/functions/_shared/canvas-material';
import {
  CANVAS_REPLY_TABLE, CANVAS_RETRY_BY_CODE, PAGE_BUTTONS, WORDS, pageButtonsFor, pageTokenOf, retryShownFor, rowOf,
} from '../../supabase/functions/_shared/canvas-reply-table';
import { readPick } from '../../supabase/functions/_shared/canvas-choice';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('P1653 F4: a bare domain counts as a link', () => {
  it('airbnb.com and airbnb.co.uk match, with a path too', () => {
    expect(extractUrls('airbnb.com - make canvas')).toEqual(['https://airbnb.com']);
    expect(extractUrls('see airbnb.co.uk please')).toEqual(['https://airbnb.co.uk']);
    expect(extractUrls('try shop.example.com/rooms/1?x=2, thanks')).toEqual(['https://shop.example.com/rooms/1?x=2']);
  });
  it('node.js, e.g. and a file name do not match', () => {
    expect(extractUrls('we run node.js services, e.g. for banks')).toEqual([]);
    expect(extractUrls('see notes.md and index.html and v2.0')).toEqual([]);
    expect(extractUrls('i.e. nothing at all. Next sentence.')).toEqual([]);
  });
  it('an email address is not a link, a full link is not read twice', () => {
    expect(extractUrls('write to me@example.com')).toEqual([]);
    expect(extractUrls('https://www.airbnb.com/ and airbnb.com')).toEqual(['https://www.airbnb.com/', 'https://airbnb.com']);
    expect(extractUrls('https://www.airbnb.com/rooms')).toEqual(['https://www.airbnb.com/rooms']);
  });
  it('a word with a space is not a domain', () => {
    expect(extractUrls('airbnb .com')).toEqual([]);
  });
  it('the ending must be lowercase in the owner\'s text: a missing space after a full stop is not a link', () => {
    for (const t of ['We sell shoes.It works.', 'Hello.In Berlin', 'we sell in shops.In Tallinn', 'AIRBNB.COM', 'Airbnb.Com']) expect(extractUrls(t), t).toEqual([]);
    expect(extractUrls('shoes.it works')).toEqual(['https://shoes.it']); // control: the same words, lowercase ending, are a link
  });
  it('a bare domain with a port is refused, not read with the port dropped', () => {
    expect(extractUrls('see airbnb.com:8080 now')).toEqual([]);
    expect(extractUrls('see airbnb.com:8080/rooms now')).toEqual([]);
    expect(extractUrls('see airbnb.com: now')).toEqual(['https://airbnb.com']); // control: a colon that starts no port
  });
});

describe('P1653 F2: a thin redirect page is decided from the text the reader returned', () => {
  it('the replay page (a 32 character redirect notice) is thin', () => {
    expect(isThinRedirect('Redirecting to www.airbnb.com.sg')).toBe(true);
  });
  it('a short real page that merely mentions "redirect" is not a redirect notice', () => {
    expect(isThinRedirect('We redirect surplus stock to families')).toBe(false);
    expect(isThinRedirect('Redirect services for logistics firms')).toBe(false);
    expect(isThinRedirect('You are being redirected to https://example.com/home')).toBe(true);
  });
  it('a short page that is not a redirect, and a long one that mentions a redirect, are not', () => {
    expect(isThinRedirect('We sell used cars to families in Riga')).toBe(false);
    expect(isThinRedirect(`Redirecting ${'we sell used cars to families '.repeat(10)}`)).toBe(false);
  });
});

describe('P1653 the buttons', () => {
  it('a label is never read as a pick (labels are checked against the pick reader)', () => {
    expect(readPick(PAGE_BUTTONS.yes.token)).toBeNull();
    expect(readPick(PAGE_BUTTONS.no.token)).toBeNull();
  });
  it('the tokens are recognised exactly, and a reply ending in the question carries the buttons', () => {
    expect(pageTokenOf(' Yes, this is my business ')).toBe('yes');
    expect(pageTokenOf('Not mine')).toBe('no');
    expect(pageTokenOf('Not mine, I run a bakery')).toBeNull();
    expect(pageButtonsFor(`${WORDS.redirectPage('airbnb.com')}\n${WORDS.pageQuestion}`)).toBe(PAGE_BUTTONS);
    expect(pageButtonsFor('Nothing changed on the canvas.')).toBeNull();
  });
});

describe('P1653 the retry table', () => {
  it('is the approved one for the codes the inventory names', () => {
    for (const c of ['nothing_supported', 'no_readable_material', 'blocked', 'too_large', 'choice_read', 'choice_stale', 'transcript_failed', 'not_offered', 'cap']) expect(CANVAS_RETRY_BY_CODE[c], c).toBe('hide');
    for (const c of ['unparsable', 'empty', 'timeout', 'capped', 'network', 'write', 'internal', 'choice_write', 'abandoned']) expect(CANVAS_RETRY_BY_CODE[c], c).toBe('show');
  });
  it('http_* is one family, shown; an unknown code keeps the button as before', () => {
    expect(retryShownFor('http_500')).toBe(true);
    expect(retryShownFor('http_400')).toBe(true);
    expect(rowOf('http_503')).toBe(CANVAS_REPLY_TABLE['http_*']);
    expect(retryShownFor(null)).toBe(true);
    expect(retryShownFor('never_heard_of_it')).toBe(true);
  });
  it('the daily limit never shows it, and a file run never does', () => {
    expect(retryShownFor('cap')).toBe(false);
    expect(retryShownFor('timeout', 'file')).toBe(false);
    expect(retryShownFor('timeout', 'text')).toBe(true);
  });
  it('no approved sentence holds an em or en dash', () => {
    for (const w of Object.values(WORDS)) expect(typeof w === 'function' ? w('x.com') : w).not.toMatch(/[–—]/);
  });
});

// ── Done-When 7: a code with no row in the table fails this test; codes are DERIVED from where they are defined (gate 7e) ──

const calls = read('src/app/data/canvas-draft-calls.ts');
const union = (src: string, name: string): string[] => {
  const m = new RegExp(`${name}\\s*=([^;]+);`).exec(src);
  return [...(m?.[1] ?? '').matchAll(/'([A-Za-z_]+)'/g)].map((x) => x[1]!);
};
const FN = 'supabase/functions/_shared/';
const fnFiles = readdirSync(resolve(process.cwd(), FN)).filter((f) => f.startsWith('canvas-') && f.endsWith('.ts')).map((f) => FN + f);

/** The top-level arguments of the call whose "(" is at `open` (strings and nested brackets are skipped). */
function argsAt(src: string, open: number): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote = '';
  for (let i = open + 1; i < src.length; i++) {
    const ch = src[i]!;
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { if (depth === 0) { out.push(src.slice(start, i).trim()); return out; } depth--; }
    else if (ch === ',' && depth === 0) { out.push(src.slice(start, i).trim()); start = i + 1; }
  }
  return out;
}

/**
 * The code of every failRun call: the 4th argument of each call site, found by parsing the call. A literal is the code. A variable is resolved from where its
 * values come from (failCode's outputs, the parse FailureCode union, the failUpload call sites); an argument this does not know is reported as
 * `UNRESOLVED:<expression>`, which has no row, so a new variable code fails the test instead of slipping past it (gate 7e).
 */
function failRunCodes(): string[] {
  const run = read(FN + 'canvas-run.ts');
  const failCode = /const failCode = \(status: number\) => \(([^;]+)\);/.exec(run)?.[1] ?? '';
  const viaFailCode = [...failCode.matchAll(/'([a-z_]+)'|`(http)_\$\{/g)].map((m) => m[1] ?? `${m[2]}_*`);
  const parse = union(read(FN + 'canvas-types.ts'), 'type FailureCode');
  const handlers = read(FN + 'canvas-handlers.ts');
  const upload = [...handlers.matchAll(/failUpload\(c, runId, '([a-z_]+)'/g)].map((m) => m[1]!);
  const uploadVar = [...handlers.matchAll(/response \? '([a-z_]+)' : capped \? '([a-z_]+)' : '([a-z_]+)'/g)].flatMap((m) => [m[1]!, m[2]!, m[3]!]);
  const byExpression: Record<string, string[]> = { 'out.code': parse, code: [...viaFailCode, ...upload, ...uploadVar], 'failCode(status)': viaFailCode };
  const out: string[] = [];
  for (const f of fnFiles) {
    const src = read(f);
    for (const m of src.matchAll(/(?<!function )failRun\(/g)) {
      const arg = argsAt(src, (m.index ?? 0) + m[0].length - 1)[3] ?? '';
      const literal = /^'([a-z_]+)'$/.exec(arg)?.[1];
      out.push(...(literal ? [literal] : byExpression[arg] ?? [`UNRESOLVED:${arg}`]));
    }
  }
  return [...new Set([...out, ...upload, ...uploadVar])];
}
/** The error codes a piece of SQL writes: literals, CASE branches, jsonb answers and typed refusals. */
const sqlCodesOf = (sql: string): string[] => {
  const out: string[] = [];
  for (const m of sql.matchAll(/error_code = '([a-z_]+)'/g)) out.push(m[1]!);
  for (const m of sql.matchAll(/error_code = CASE([\s\S]*?)\bEND\b/g)) for (const q of m[1]!.matchAll(/(?:THEN|ELSE) '([a-z_]+)'/g)) out.push(q[1]!);
  for (const m of sql.matchAll(/'error_code', '([a-z_]+)'/g)) out.push(m[1]!);
  for (const m of sql.matchAll(/'status', '(?:failed|gone)', 'code', '([a-z_]+)'/g)) out.push(m[1]!);
  for (const m of sql.matchAll(/_canvas_draft_refuse\('([a-z_]+)'/g)) out.push(m[1]!);
  return out;
};
const MIG = 'supabase/migrations/';
const migrationFiles = (): string[] => readdirSync(resolve(process.cwd(), MIG)).filter((f) => f.endsWith('.sql')).map((f) => MIG + f);
const sqlCodes = (): string[] => [...new Set(migrationFiles().flatMap((f) => sqlCodesOf(read(f))))];
const thrown = (): string[] => [...(/readonly code: ([^)]+)\)/.exec(calls)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
const clientCodes = (): string[] => [...new Set([...union(calls, 'CanvasDraftErrorCode'), ...union(calls, 'CanvasRefusalCode'), ...thrown()])];

describe('P1653 Done-When: every failure code has a row in the reply table', () => {
  it('derives codes from each source, one known member asserted per source (no hand list of members)', () => {
    const fr = failRunCodes(); expect(fr, 'failRun literal call sites').toContain('nothing_supported');
    expect(fr, 'failRun variable call site (parse code)').toContain('unparsable');
    expect(fr.filter((c) => c.startsWith('UNRESOLVED:')), 'every failRun argument is resolved').toEqual([]);
    expect(fr, 'failCode family').toContain('http_*');
    expect(fr, 'upload call sites').toContain('unsupported');
    const sql = sqlCodes(); expect(sql, 'SQL literal').toContain('abandoned'); expect(sql, 'SQL refusal').toContain('stale_view');
    const mine = sqlCodesOf(read(MIG + '20261110100000_p1653_never_a_wall.sql'));
    expect(mine, 'SQL CASE branch (this file alone)').toEqual(expect.arrayContaining(['abandoned', 'transcript_failed']));
    expect(sqlCodesOf(read(MIG + '20261030080000_p1536_v6_engine.sql')), 'SQL jsonb answer').toContain('not_offered');
    const cl = clientCodes(); expect(cl, 'client union').toContain('TERMS_NOT_ACCEPTED'); expect(cl, 'client refusal union').toContain('busy_elsewhere');
    expect(cl, 'client thrown refusal').toContain('TOO_MANY_DRAFTS');
  });
  it('every derived code has a row', () => {
    const all = [...failRunCodes(), ...sqlCodes(), ...clientCodes()];
    const missing = all.filter((c) => !(c in CANVAS_REPLY_TABLE));
    expect(missing).toEqual([]);
  });
  it('CONTROL: a code only a CASE branch or a variable could carry is caught by the same probes', () => {
    const caseSql = "UPDATE t SET state = 'failed', error_code = CASE WHEN x THEN 'new_cap' ELSE 'abandoned' END";
    expect(sqlCodesOf(caseSql).filter((c) => !(c in CANVAS_REPLY_TABLE))).toEqual(['new_cap']);
    expect(argsAt('failRun(deps, run, p, someVariable, reply, 0)', 'failRun'.length)[3]).toBe('someVariable');
    expect(`UNRESOLVED:someVariable` in CANVAS_REPLY_TABLE).toBe(false);
  });
  it('CONTROL: a made-up code is reported missing by the same probe', () => {
    expect([...failRunCodes(), 'brand_new_code'].filter((c) => !(c in CANVAS_REPLY_TABLE))).toEqual(['brand_new_code']);
  });
});
