/**
 * P1425 — no code may write `event_rsvps.mailgun_message_ids` as a whole object.
 *
 * The column is one jsonb object shared by every scheduled email kind. On 2026-10-03 a writer
 * that spread an old read of it and wrote the whole thing back erased a sibling's id every cron
 * tick, and one attendee received the same reminder 13 times. Every write now goes through
 * `supabase/functions/_shared/rsvp-message-ids.ts` (per-key compare-and-set in the database).
 * This test keeps it that way: any JS/TS construct that could hand the column to
 * `.update()` / `.insert()` / `.upsert()` fails it, and so does any SQL migration other than the
 * one defining `set_rsvp_message_ids` that assigns the column. There are no exceptions.
 *
 * Scope is DERIVED (every source file under the roots below), never a file list. Reads are fine:
 * `rsvp.mailgun_message_ids`, select strings, PostgREST filters, type declarations.
 * Destructuring the column by name is flagged too (it cannot be told apart from a shorthand
 * write); read it as `row.mailgun_message_ids` instead.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const CODE_ROOTS = ['supabase/functions', 'src', 'scripts'];
const SQL_ROOT = 'supabase/migrations';
const SQL_DEFINER = 'supabase/migrations/20261006120000_p1425_set_rsvp_message_ids.sql';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'archive']);

function listFiles(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const COL = 'mailgun_message_ids';
// A declaration's right-hand side is a type, not a value.
const TYPE_RHS = /^(Record<|\{\s*\[|string\b|unknown\b|Json\b|any\b|null\s*\||Partial<)/;

/**
 * Blank out comments and string-literal text, keeping offsets (so line numbers stay true). Code
 * inside a template literal's `${...}` is KEPT — it executes, so a write hidden there must be seen.
 */
export function stripCode(text: string, keepStrings = false): string {
  const out = text.split('');
  const blank = (i: number) => { if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  const depth: number[] = []; // brace depth at which each open `${` resumes its template literal
  let braces = 0;
  const inTemplate = () => {
    // scan template text until the closing backtick or a `${`
    while (i < text.length) {
      if (text[i] === '\\') { blank(i); blank(i + 1); i += 2; continue; }
      if (text[i] === '`') { i++; return; }
      if (text[i] === '$' && text[i + 1] === '{') { depth.push(braces); braces++; i += 2; return; }
      blank(i); i++;
    }
  };
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') blank(i++); continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      while (i < stop) blank(i++);
      continue;
    }
    if ((c === "'" || c === '"') && keepStrings) {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') {
        if (text[i] === '\\') { blank(i); i++; }
        blank(i); i++;
      }
      i++;
      continue;
    }
    if (c === '`' && keepStrings) {
      i++;
      while (i < text.length && text[i] !== '`') i += text[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '`') { i++; inTemplate(); continue; }
    if (c === '{') braces++;
    if (c === '}') {
      braces--;
      if (depth.length && braces === depth[depth.length - 1]) { depth.pop(); i++; inTemplate(); continue; }
    }
    i++;
  }
  return out.join('');
}

export interface Hit { file: string; line: number; text: string }

/** Every construct that could write the column from JS/TS. */
export function scanCode(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split('\n');
  const at = (index: number) => {
    const line = text.slice(0, index).split('\n').length;
    hits.push({ file, line, text: lines[line - 1].trim() });
  };
  // the column's name as a whole string literal: a quoted/computed key ({ 'col': x }, { ['col']: x },
  // o['col'] = x) or a constant that feeds one (const k = 'col'; { [k]: x }). Reads never need it
  // alone — selects list several columns and filters address a key ('col->>reminder').
  // A literal handed straight to .select( is a read.
  const noComments = stripCode(text, true);
  for (const m of noComments.matchAll(new RegExp(`(\\.select\\(\\s*)?['"\`]${COL}['"\`]`, 'g'))) {
    if (!m[1]) at(m.index!);
  }
  const code = stripCode(text);
  // object key (also across lines): { col: x }, { col\n : x } — unless the RHS is a type
  for (const m of code.matchAll(new RegExp(`\\b${COL}\\s*\\??\\s*:\\s*([^\\n]*)`, 'g'))) {
    if (!TYPE_RHS.test(m[1].trim())) at(m.index!);
  }
  // property assignment: o.col = x
  for (const m of code.matchAll(new RegExp(`\\.\\s*${COL}\\s*=(?!=)`, 'g'))) at(m.index!);
  // shorthand property: { col } / { a, col, b }
  for (const m of code.matchAll(new RegExp(`[{,]\\s*${COL}\\s*[,}]`, 'g'))) at(m.index! + m[0].indexOf(COL));
  return hits;
}

/** A SQL assignment of the column (UPDATE ... SET col = ...). */
export function scanSql(file: string, text: string): Hit[] {
  const sql = text.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
  return [...sql.matchAll(new RegExp(`"?\\b${COL}"?\\s*=(?!=)`, 'gi'))].map((m) => {
    const line = sql.slice(0, m.index!).split('\n').length;
    return { file, line, text: text.split('\n')[line - 1].trim() };
  });
}

const codeFiles = CODE_ROOTS.flatMap((r) => listFiles(join(REPO, r), /\.(ts|tsx|mjs|js)$/))
  .map((p) => relative(REPO, p))
  .filter((p) => !/\.test\.(ts|tsx)$/.test(p));
const sqlFiles = listFiles(join(REPO, SQL_ROOT), /\.sql$/).map((p) => relative(REPO, p));
const codeHits = codeFiles.flatMap((f) => scanCode(f, readFileSync(join(REPO, f), 'utf8')));
const sqlHits = sqlFiles.flatMap((f) => scanSql(f, readFileSync(join(REPO, f), 'utf8')));

describe('P1425: mailgun_message_ids is never written as a whole object', () => {
  it('derives a non-empty scope on both paths', () => {
    expect(codeFiles).toContain('supabase/functions/dispatch-event-emails/index.ts');
    expect(codeFiles).toContain('supabase/functions/_shared/rsvp-message-ids.ts');
    expect(sqlFiles).toContain(SQL_DEFINER);
  });

  it('SQL path is not blind: it finds the assignment inside set_rsvp_message_ids itself', () => {
    expect(sqlHits.some((h) => h.file === SQL_DEFINER)).toBe(true);
  });

  it('no JS/TS construct writes the column', () => {
    expect(codeHits.map((h) => `${h.file}:${h.line}  ${h.text}`)).toEqual([]);
  });

  it('no SQL other than set_rsvp_message_ids assigns the column', () => {
    expect(sqlHits.filter((h) => h.file !== SQL_DEFINER).map((h) => `${h.file}:${h.line}  ${h.text}`)).toEqual([]);
  });

  it('control: whole-object writes injected into the REAL starting-soon.ts are each caught', () => {
    const real = readFileSync(join(REPO, 'supabase/functions/_shared/starting-soon.ts'), 'utf8');
    expect(scanCode('x', real)).toEqual([]);
    const anchor = "  if (claim.status === 'held') return 'skipped:already-claimed';";
    expect(real).toContain(anchor);
    const inject = (snippet: string) => scanCode('x', real.replace(anchor, `${snippet}\n${anchor}`)).length;
    expect(inject("  await supabase.from('event_rsvps').update({ mailgun_message_ids: { ...ids, starting_soon: 'PENDING' } });")).toBe(1);
    expect(inject("  await supabase.from('event_rsvps').update({\n    mailgun_message_ids\n      : ids,\n  });")).toBe(1);
    expect(inject("  await supabase.from('event_rsvps').update({ 'mailgun_message_ids': ids });")).toBe(1);
    expect(inject("  await supabase.from('event_rsvps').update({ ['mailgun_message_ids']: ids });")).toBe(1);
    expect(inject('  const mailgun_message_ids = ids;\n  await supabase.from(\'event_rsvps\').update({ mailgun_message_ids });')).toBe(1);
    expect(inject('  payload.mailgun_message_ids = { ...ids };')).toBe(1);
    expect(inject("  payload['mailgun_message_ids'] = ids;")).toBe(1);
    // review round 2 (Codex): a constant-fed computed key, and a write inside a template literal
    expect(inject("  const key = 'mailgun_message_ids';\n  await supabase.from('event_rsvps').update({ [key]: ids });")).toBe(1);
    expect(inject("  const r = `${await supabase.from('event_rsvps').update({ mailgun_message_ids: ids })}`;")).toBe(1);
  });

  it('control: reads, selects, filters and types are not flagged', () => {
    expect(scanCode('x', "const v = rsvp.mailgun_message_ids?.reminder;")).toEqual([]);
    expect(scanCode('x', ".select('id, mailgun_message_ids, profiles(email)')")).toEqual([]);
    expect(scanCode('x', ".filter('mailgun_message_ids->>reminder', 'is', 'null')")).toEqual([]);
    expect(scanCode('x', '  mailgun_message_ids: Record<string, string> | null;')).toEqual([]);
    expect(scanCode('x', 'if (a.mailgun_message_ids == null) {}')).toEqual([]);
    expect(scanCode('x', '// mailgun_message_ids: { ...old }')).toEqual([]);
    expect(scanCode('x', 'const SEL = `id, mailgun_message_ids, profiles(email)`;')).toEqual([]);
    expect(scanCode('x', ".select('mailgun_message_ids')")).toEqual([]);
    expect(scanCode('x', "/* see `mailgun_message_ids` */ // 'mailgun_message_ids'")).toEqual([]);
    expect(scanCode('x', 'const q = `a ${x} b`; const o = { a: 1 }; f(o.mailgun_message_ids);')).toEqual([]);
  });

  it('control: a SQL UPDATE of the column in another migration is caught', () => {
    expect(scanSql('x.sql', "UPDATE public.event_rsvps SET mailgun_message_ids = '{}'::jsonb;")).toHaveLength(1);
    expect(scanSql('x.sql', 'UPDATE public.event_rsvps SET "mailgun_message_ids" = \'{}\'::jsonb;')).toHaveLength(1);
    expect(scanSql('x.sql', "ALTER TABLE public.event_rsvps ADD COLUMN mailgun_message_ids JSONB;")).toHaveLength(0);
    expect(scanSql('x.sql', "-- SET mailgun_message_ids = x")).toHaveLength(0);
  });
});
