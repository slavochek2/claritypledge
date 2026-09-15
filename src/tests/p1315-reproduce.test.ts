/**
 * @file p1315-reproduce.test.ts
 * @description P1315 — a database built from this repo's migrations must end with NO client
 * INSERT policy on transcribe_room_members.
 *
 * P1236 Decision 5 makes a member row creatable only by an RPC that records consent in the same
 * statement. Its contract migration, which removes the P1149 self-insert policy, was never
 * committed, so replaying supabase/migrations/ in order still leaves that policy in place — which
 * is exactly the state prod was found in. Test only lacked it because it was dropped by hand.
 *
 * Reads the migrations directly, like p1114-no-anon-surface.test.ts: a policy that is still
 * created by the committed history is a policy that still ships to any database built from it.
 * The live behaviour (insert accepted with the policy, refused without) was reproduced on test
 * in a rolled-back transaction; see the spec's reproduce_artifact.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const TABLE = 'transcribe_room_members';

/** Strip `--` comments so prose that quotes a policy name cannot create or drop it. */
function sqlOnly(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** Replay every CREATE/DROP POLICY on the table in filename (= version) order. */
function insertPoliciesAfterReplay(): Map<string, string> {
  const live = new Map<string, string>(); // policy name -> migration that created it
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const stmt = new RegExp(
    String.raw`(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+(?:public\.)?${TABLE}\b([^;]*);`,
    'gi',
  );
  for (const name of files) {
    const sql = sqlOnly(readFileSync(join(MIGRATIONS, name), 'utf-8'));
    for (const m of sql.matchAll(stmt)) {
      const [, verb, policy, rest] = m;
      if (verb.toUpperCase() === 'DROP') live.delete(policy);
      else if (/FOR\s+INSERT/i.test(rest)) live.set(policy, name);
    }
  }
  return live;
}

describe('P1315: no client INSERT path onto transcribe_room_members survives the migration history', () => {
  it('the replay control sees the P1149 policy being created (the parser is not blind)', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    const creator = files.find((f) =>
      /CREATE\s+POLICY\s+"authenticated users can join as themselves"/i.test(
        sqlOnly(readFileSync(join(MIGRATIONS, f), 'utf-8')),
      ),
    );
    expect(creator, 'control: the P1149 migration that creates the policy must be found').toBeDefined();
  });

  it('ends with zero INSERT policies on transcribe_room_members', () => {
    const survivors = insertPoliciesAfterReplay();
    expect(
      [...survivors.entries()].map(([policy, file]) => `"${policy}" (created in ${file})`),
      'A client INSERT policy on transcribe_room_members lets a signed-in user create a member row ' +
        'without consent. Membership must be created only through the consent-recording RPCs (P1236 ' +
        'Decision 5) — drop the policy in a migration.',
    ).toEqual([]);
  });
});
