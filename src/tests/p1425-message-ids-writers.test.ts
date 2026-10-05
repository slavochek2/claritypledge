/**
 * P1425 — no code may write `event_rsvps.mailgun_message_ids` as a whole object.
 *
 * The column is one jsonb object shared by every scheduled email kind. On 2026-10-03 a writer
 * that spread an old read of it and wrote the whole thing back erased a sibling's id every cron
 * tick, and one attendee received the same reminder 13 times. The fix routes every claim and
 * write-back through `setMessageIds` (`supabase/functions/_shared/rsvp-message-ids.ts`), a
 * per-key compare-and-set in the database. This test is what keeps it that way: any object
 * literal that names `mailgun_message_ids` as a key — the only way to hand the column to
 * `.update()` / `.insert()` / `.upsert()` from JS — fails it, except the one deliberate reset
 * marked `p1425-sanctioned-reset`.
 *
 * Scope is DERIVED (every .ts/.tsx/.mjs/.js file under the roots below), never a file list.
 * Type annotations (`mailgun_message_ids: Record<...>`) are declarations, not writes.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const ROOTS = ['supabase/functions', 'src', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'archive']);
const SELF = 'src/tests/p1425-message-ids-writers.test.ts';

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listSourceFiles(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const KEY = /\bmailgun_message_ids\s*\??\s*:\s*(.*)$/;
// A declaration's right-hand side is a type, not a value.
const TYPE_RHS = /^(Record<|\{\s*\[|string\b|unknown\b|Json\b|any\b|null\s*\||Partial<)/;

export interface Hit { file: string; line: number; text: string; sanctioned: boolean }

/** Every object-key use of mailgun_message_ids that is not a type declaration. */
export function scan(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  text.split('\n').forEach((raw, i) => {
    const code = raw.replace(/\/\/.*$/, '');
    if (/^\s*(\*|\/\*)/.test(raw)) return; // block-comment prose
    const m = KEY.exec(code);
    if (!m) return;
    if (TYPE_RHS.test(m[1].trim())) return;
    hits.push({ file, line: i + 1, text: raw.trim(), sanctioned: raw.includes('p1425-sanctioned-reset') });
  });
  return hits;
}

const files = ROOTS.flatMap((r) => listSourceFiles(join(REPO, r)))
  .map((p) => relative(REPO, p))
  .filter((p) => p !== SELF && !/\.test\.(ts|tsx)$/.test(p));
const hits = files.flatMap((f) => scan(f, readFileSync(join(REPO, f), 'utf8')));

describe('P1425: mailgun_message_ids is never written as a whole object', () => {
  it('scans the edge functions (derivation is not empty)', () => {
    expect(files.some((f) => f.startsWith('supabase/functions/_shared/'))).toBe(true);
    expect(files).toContain('supabase/functions/dispatch-event-emails/index.ts');
  });

  it('finds the one sanctioned reset (the scanner is not blind)', () => {
    const sanctioned = hits.filter((h) => h.sanctioned);
    expect(sanctioned.map((h) => h.file)).toEqual(['supabase/functions/send-event-emails/index.ts']);
  });

  it('finds no other whole-object write', () => {
    const offenders = hits.filter((h) => !h.sanctioned).map((h) => `${h.file}:${h.line}  ${h.text}`);
    expect(offenders).toEqual([]);
  });

  it('control: a whole-object write injected into the REAL starting-soon.ts is caught', () => {
    const real = readFileSync(join(REPO, 'supabase/functions/_shared/starting-soon.ts'), 'utf8');
    expect(scan('x', real).length).toBe(0);
    const mutated = real.replace(
      "  if (!claimed) return 'skipped:already-claimed';",
      "  await supabase.from('event_rsvps').update({ mailgun_message_ids: { ...rsvp.mailgun_message_ids, starting_soon: 'PENDING' } });\n  if (!claimed) return 'skipped:already-claimed';",
    );
    expect(mutated).not.toBe(real);
    expect(scan('x', mutated).filter((h) => !h.sanctioned).length).toBe(1);
  });

  it('control: shorthand and spread-variable forms are caught, a type is not', () => {
    expect(scan('x', 'update({ mailgun_message_ids: claimIds, x: 1 })').length).toBe(1);
    expect(scan('x', '  mailgun_message_ids: {').length).toBe(1);
    expect(scan('x', '  mailgun_message_ids: Record<string, string> | null;').length).toBe(0);
    expect(scan('x', '  mailgun_message_ids?: Record<string, string>;').length).toBe(0);
  });
});
