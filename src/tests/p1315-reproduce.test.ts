/**
 * @file p1315-reproduce.test.ts
 * @description P1315 — a database built from this repo's migrations must end with NO client write
 * policy on transcribe_room_members.
 *
 * P1236 Decision 5: a member row is created only by an RPC that records consent in the same
 * statement. That holds only if the committed migration history removes the P1149 self-insert
 * policy and leaves no other policy admitting a client write.
 *
 * Reads the migrations directly, like p1114-no-anon-surface.test.ts: a policy still created by the
 * committed history is a policy that ships to any database built from it.
 *
 * The replay handles the shapes a policy statement can take (quoted or bare names, quoted or bare
 * schema, FOR ALL or no FOR clause, block and line comments, ALTER POLICY ... RENAME), and the
 * control cases at the bottom prove each one is recognised — a replay that silently misses a shape
 * would pass for the wrong reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const TABLE = 'transcribe_room_members';
const WRITE_CMDS = new Set(['INSERT', 'UPDATE', 'DELETE', 'ALL']);

/** Remove comments, string literals and dollar-quoted bodies in ONE left-to-right pass, so neither
 *  prose (an apostrophe in a comment), nor a '--' inside a string, can create, drop or truncate a
 *  statement. Separate regex passes cannot do this: whichever runs first misreads the other. */
export function stripSql(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '--') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      out += ' ';
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      out += ' ';
    } else if (text[i] === "'") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "'" && text[j + 1] === "'") j += 2;
        else if (text[j] === "'") break;
        else j += 1;
      }
      i = j + 1;
      out += "''";
    } else if (text[i] === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (tag) {
        const end = text.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? text.length : end + tag[0].length;
        out += ' ';
      } else {
        out += text[i++];
      }
    } else {
      out += text[i++];
    }
  }
  return out;
}

const IDENT = String.raw`(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*))`;
// A lookahead, not \b: after a closing quote there is no word boundary to match.
const TABLE_REF = String.raw`(?:(?:"public"|public)\s*\.\s*)?(?:"${TABLE}"|${TABLE}(?![A-Za-z0-9_$]))`;

function identName(quoted: string | undefined, bare: string | undefined): string {
  return quoted !== undefined ? quoted.replace(/""/g, '"') : bare!.toLowerCase();
}

/** Replay CREATE / DROP / ALTER ... RENAME POLICY on the table over the given SQL files, in order.
 *  Returns surviving policies that admit a client write, mapped to the file that created them. */
export function replayWritePolicies(files: { name: string; sql: string }[]): Map<string, string> {
  const live = new Map<string, { cmd: string; file: string }>();
  const stmt = new RegExp(
    String.raw`\b(CREATE|DROP|ALTER)\s+POLICY\s+(?:IF\s+EXISTS\s+)?${IDENT}\s+ON\s+${TABLE_REF}([^;]*);`,
    'gi',
  );
  for (const { name, sql } of files) {
    for (const m of stripSql(sql).matchAll(stmt)) {
      const [, verb, q, b, rest] = m;
      const policy = identName(q, b);
      const v = verb.toUpperCase();
      if (v === 'DROP') {
        live.delete(policy);
      } else if (v === 'ALTER') {
        const rename = new RegExp(String.raw`RENAME\s+TO\s+${IDENT}`, 'i').exec(rest);
        if (rename && live.has(policy)) {
          live.set(identName(rename[1], rename[2]), live.get(policy)!);
          live.delete(policy);
        }
      } else {
        const forClause = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(rest);
        live.set(policy, { cmd: forClause ? forClause[1].toUpperCase() : 'ALL', file: name });
      }
    }
  }
  const survivors = new Map<string, string>();
  for (const [policy, { cmd, file }] of live) if (WRITE_CMDS.has(cmd)) survivors.set(policy, file);
  return survivors;
}

function repoMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf-8') }));
}

describe('P1315: no client write policy on transcribe_room_members survives the migration history', () => {
  it('ends with zero write policies on transcribe_room_members', () => {
    const survivors = replayWritePolicies(repoMigrations());
    expect(
      [...survivors.entries()].map(([policy, file]) => `"${policy}" (created in ${file})`),
      'A client write policy on transcribe_room_members lets a signed-in user create or alter a ' +
        'member row without consent. Membership must be written only through the consent-recording ' +
        'RPCs (P1236 Decision 5) — drop the policy in a migration.',
    ).toEqual([]);
  });

  it('control: the replay sees the P1149 policy being created in the real history', () => {
    const upToP1149 = repoMigrations().filter((f) => f.name <= '20260823190000_p1149_transcribe_room_tables.sql');
    expect([...replayWritePolicies(upToP1149).keys()]).toContain('authenticated users can join as themselves');
  });

  describe('control: every policy shape is recognised (the replay is not blind)', () => {
    const one = (sql: string) => [...replayWritePolicies([{ name: 'x.sql', sql }]).keys()];

    it.each([
      ['FOR INSERT, quoted', `CREATE POLICY "p" ON public.${TABLE} FOR INSERT TO authenticated WITH CHECK (true);`, ['p']],
      ['FOR ALL', `CREATE POLICY "p" ON public.${TABLE} FOR ALL USING (true);`, ['p']],
      ['no FOR clause defaults to ALL', `CREATE POLICY "p" ON ${TABLE} USING (true);`, ['p']],
      ['bare name', `CREATE POLICY p_bare ON public.${TABLE} FOR UPDATE USING (true);`, ['p_bare']],
      ['quoted schema and table', `CREATE POLICY "p" ON "public"."${TABLE}" FOR DELETE USING (true);`, ['p']],
      ['SELECT is not a write', `CREATE POLICY "p" ON public.${TABLE} FOR SELECT USING (true);`, []],
      ['DROP removes it', `CREATE POLICY "p" ON public.${TABLE} FOR INSERT WITH CHECK (true); DROP POLICY IF EXISTS "p" ON public.${TABLE};`, []],
      ['DROP inside a block comment does not', `CREATE POLICY "p" ON public.${TABLE} FOR INSERT WITH CHECK (true); /* DROP POLICY "p" ON public.${TABLE}; */`, ['p']],
      ['DROP inside a line comment does not', `CREATE POLICY "p" ON public.${TABLE} FOR INSERT WITH CHECK (true);\n-- DROP POLICY "p" ON public.${TABLE};`, ['p']],
      ["an apostrophe in a comment does not hide a later DROP", `CREATE POLICY "p" ON public.${TABLE} FOR INSERT WITH CHECK (true);\n-- one environment's ledger\nDROP POLICY IF EXISTS "p" ON public.${TABLE};`, []],
      ["'--' in a string does not truncate", `CREATE POLICY "p" ON public.${TABLE} FOR INSERT WITH CHECK (note <> '--');`, ['p']],
      ['RENAME then DROP of the old name keeps it', `CREATE POLICY "p" ON public.${TABLE} FOR INSERT WITH CHECK (true); ALTER POLICY "p" ON public.${TABLE} RENAME TO "q"; DROP POLICY IF EXISTS "p" ON public.${TABLE};`, ['q']],
      ['another table is ignored', `CREATE POLICY "p" ON public.transcribe_rooms FOR INSERT WITH CHECK (true);`, []],
    ])('%s', (_label, sql, expected) => {
      expect(one(sql)).toEqual(expected);
    });
  });
});
