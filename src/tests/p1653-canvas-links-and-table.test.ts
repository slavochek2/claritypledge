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
});

describe('P1653 F2: a thin redirect page is decided from the text the reader returned', () => {
  it('the replay page (a 32 character redirect notice) is thin', () => {
    expect(isThinRedirect('Redirecting to www.airbnb.com.sg')).toBe(true);
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
const codesIn = (files: string[], re: RegExp): string[] => files.flatMap((f) => [...read(f).matchAll(re)].map((m) => m[1]!));
const FN = 'supabase/functions/_shared/';
const fnFiles = readdirSync(resolve(process.cwd(), FN)).filter((f) => f.startsWith('canvas-') && f.endsWith('.ts')).map((f) => FN + f);

/** The code of every failRun call: its literal argument, and the codes a variable argument can hold (failCode's outputs, the parse codes, the upload codes). */
function failRunCodes(): string[] {
  const lit = codesIn(fnFiles, /(?<!function )failRun\((?:[^,()]|\([^()]*\))+,(?:[^,()]|\([^()]*\))+,(?:[^,()]|\([^()]*\))+,\s*'([a-z_]+)'/g);
  const failCode = /const failCode = \(status: number\) => \(([^;]+)\);/.exec(read(FN + 'canvas-run.ts'))?.[1] ?? '';
  const viaFailCode = [...failCode.matchAll(/'([a-z_]+)'|`(http)_\$\{/g)].map((m) => m[1] ?? `${m[2]}_*`);
  const parse = union(read(FN + 'canvas-types.ts'), 'type FailureCode');
  const upload = codesIn([FN + 'canvas-handlers.ts'], /failUpload\(c, runId, '([a-z_]+)'/g);
  const uploadVar = [...read(FN + 'canvas-handlers.ts').matchAll(/response \? '([a-z_]+)' : capped \? '([a-z_]+)' : '([a-z_]+)'/g)].flatMap((m) => [m[1]!, m[2]!, m[3]!]);
  return [...new Set([...lit, ...viaFailCode, ...parse, ...upload, ...uploadVar])];
}
const sqlCodes = (): string[] => {
  const dir = 'supabase/migrations/';
  const files = readdirSync(resolve(process.cwd(), dir)).filter((f) => f.endsWith('.sql')).map((f) => dir + f);
  return [...new Set([...codesIn(files, /error_code = '([a-z_]+)'/g), ...codesIn(files, /_canvas_draft_refuse\('([a-z_]+)'/g)])];
};
const thrown = (): string[] => [...(/readonly code: ([^)]+)\)/.exec(calls)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
const clientCodes = (): string[] => [...new Set([...union(calls, 'CanvasDraftErrorCode'), ...union(calls, 'CanvasRefusalCode'), ...thrown()])];

describe('P1653 Done-When: every failure code has a row in the reply table', () => {
  it('derives codes from each source, one known member asserted per source (no hand list of members)', () => {
    const fr = failRunCodes(); expect(fr, 'failRun call sites').toContain('nothing_supported');
    expect(fr, 'failCode family').toContain('http_*');
    expect(fr, 'upload call sites').toContain('unsupported');
    const sql = sqlCodes(); expect(sql, 'SQL').toContain('abandoned'); expect(sql, 'SQL refusal').toContain('stale_view');
    const cl = clientCodes(); expect(cl, 'client union').toContain('TERMS_NOT_ACCEPTED'); expect(cl, 'client refusal union').toContain('busy_elsewhere');
    expect(cl, 'client thrown refusal').toContain('TOO_MANY_DRAFTS');
  });
  it('every derived code has a row', () => {
    const all = [...failRunCodes(), ...sqlCodes(), ...clientCodes()];
    const missing = all.filter((c) => !(c in CANVAS_REPLY_TABLE));
    expect(missing).toEqual([]);
  });
  it('CONTROL: a made-up code is reported missing by the same probe', () => {
    expect([...failRunCodes(), 'brand_new_code'].filter((c) => !(c in CANVAS_REPLY_TABLE))).toEqual(['brand_new_code']);
  });
});
