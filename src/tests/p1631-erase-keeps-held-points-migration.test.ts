/**
 * @file p1631-erase-keeps-held-points-migration.test.ts
 * @description P1631 source contract for 20261113130000_p1631_erase_keeps_held_points.sql (account erasure keeps a private point another person holds a position on):
 *   - point_chat_shares.shared_by becomes nullable with ON DELETE SET NULL, replacing the named inline constraint;
 *   - _clarify_erase_person, _point_chat_erase_author and erase_chat_data_for are their newest earlier body plus only the marked lines
 *     (erase_chat_data_for replaces two lines of step 2; those old lines are removed on the other side of the comparison);
 *   - every new test is "a position by someone other than the erased person", never "by the owner";
 *   - the replaced functions keep their closed grants.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const FILE = '20261113130000_p1631_erase_keeps_held_points.sql';
const MARK = '-- P1631 erase keeps held points';
const read = (f: string) => readFileSync(join(MIG, f), 'utf8');
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const raw = read(FILE);

function fnBody(sql: string, name: string): string {
  const c = stripComments(sql);
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`).exec(c);
  if (!m) throw new Error(`${name} not found`);
  return norm(c.slice(m.index, c.indexOf('$$;', c.indexOf('AS $$', m.index)) + 3));
}
function newestBefore(name: string, before: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, 'i');
  const defs = readdirSync(MIG).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f < before && re.test(stripComments(read(f)))).sort();
  return defs[defs.length - 1]!;
}
const unmarked = (s: string) => s.split('\n').filter((l) => !l.includes(MARK)).join('\n');
/** the two old lines of step 2 that the marked lines replace */
const REPLACED_OLD = "SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),\n         attachment_kind = NULL, attachment_id = NULL,\n";
const dropReplaced = (s: string) => {
  expect(s, 'the replaced step-2 lines are in the earlier body').toContain(REPLACED_OLD);
  return s.replace(REPLACED_OLD, '');
};
/** the new side already lost its two replacing lines (they are marked); the old side loses the two lines they replace, so both statements read "UPDATE ... m forward_snapshot = NULL, ..." */
const dropReplacedNew = (s: string) => s;

const PREV: Record<string, string> = {
  _clarify_erase_person: '20261110180000_p1631_review_fixes_2.sql',
  _point_chat_erase_author: '20261112150000_p1631_publish_to_chat.sql',
  erase_chat_data_for: '20261112150000_p1631_publish_to_chat.sql',
};

describe('20261113130000 erase keeps held points: the foreign key', () => {
  it('replaces the named constraint: shared_by nullable, ON DELETE SET NULL', () => {
    const sql = norm(stripComments(raw));
    expect(sql).toContain('ALTER TABLE public.point_chat_shares DROP CONSTRAINT IF EXISTS point_chat_shares_shared_by_fkey;');
    expect(sql).toContain('ALTER TABLE public.point_chat_shares ALTER COLUMN shared_by DROP NOT NULL;');
    expect(sql).toContain('ADD CONSTRAINT point_chat_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE SET NULL;');
    // the constraint it replaces is the inline one of the table's own migration, which Postgres names <table>_<column>_fkey
    expect(norm(stripComments(read('20261112150000_p1631_publish_to_chat.sql')))).toContain('shared_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE');
  });

  it('no migration between the table and this one changed the column or redefined a replaced function', () => {
    for (const f of readdirSync(MIG).filter((x) => /^\d{14}_.*\.sql$/.test(x) && x.slice(0, 14) > '20261112150000' && x < FILE)) {
      const code = stripComments(read(f));
      expect(code, f).not.toMatch(/ALTER\s+TABLE[^;]*point_chat_shares/i);
      expect(code, f).not.toMatch(/DROP\s+TABLE[^;]*point_chat_shares/i);
    }
    for (const [fn, file] of Object.entries(PREV)) expect(newestBefore(fn, FILE), fn).toBe(file);
  });
});

describe('20261113130000 erase keeps held points: replaced bodies', () => {
  it('_clarify_erase_person is its newest earlier body plus only the marked lines', () => {
    const mine = fnBody(unmarked(raw), '_clarify_erase_person');
    expect(mine).toBe(fnBody(read(PREV._clarify_erase_person!), '_clarify_erase_person'));
  });

  it('_point_chat_erase_author is its newest earlier body plus only the marked lines', () => {
    const mine = fnBody(unmarked(raw), '_point_chat_erase_author');
    expect(mine).toBe(fnBody(read(PREV._point_chat_erase_author!), '_point_chat_erase_author'));
  });

  it('erase_chat_data_for is its newest earlier body, with the two replaced step-2 lines and the marked lines removed from the respective sides', () => {
    const mine = fnBody(dropReplacedNew(unmarked(raw)), 'erase_chat_data_for');
    const theirs = fnBody(dropReplaced(read(PREV.erase_chat_data_for!)), 'erase_chat_data_for');
    expect(mine).toBe(theirs);
  });

  it('CONTROL: an unmarked change to a restated body is caught by the same comparison', () => {
    const mutated = raw.replace("WHERE j.state IN ('queued', 'running') AND j.derived_refs", "WHERE j.state IN ('queued') AND j.derived_refs");
    expect(mutated).not.toBe(raw);
    const mine = fnBody(dropReplacedNew(unmarked(mutated)), 'erase_chat_data_for');
    expect(mine).not.toBe(fnBody(dropReplaced(read(PREV.erase_chat_data_for!)), 'erase_chat_data_for'));
    const mutated2 = raw.replace("DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility", "DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.id IS NOT NULL AND p.visibility");
    expect(mutated2).not.toBe(raw);
    expect(fnBody(unmarked(mutated2), '_clarify_erase_person')).not.toBe(fnBody(read(PREV._clarify_erase_person!), '_clarify_erase_person'));
  });

  it('CONTROL: dropping one marked line of a restated body is caught by the same comparison', () => {
    const lines = raw.split('\n');
    const i = lines.findIndex((l) => l.includes('v_kept    uuid[];'));
    expect(i).toBeGreaterThan(-1);
    // un-marking the DECLARE line leaves it in the "unmarked" body
    lines[i] = lines[i]!.replace(MARK, '');
    const mine = fnBody(dropReplacedNew(unmarked(lines.join('\n'))), 'erase_chat_data_for');
    expect(mine).not.toBe(fnBody(dropReplaced(read(PREV.erase_chat_data_for!)), 'erase_chat_data_for'));
  });
});

describe('20261113130000 erase keeps held points: the rule', () => {
  const marked = raw.split('\n').filter((l) => l.includes(MARK)).join('\n');

  it('every position test excludes the erased person, never the draft owner or the publisher', () => {
    const tests = marked.match(/pp\.user_id IS DISTINCT FROM [a-z_.]+/g) ?? [];
    expect(tests.length).toBe(2);
    for (const t of tests) expect(t).toBe('pp.user_id IS DISTINCT FROM p_uid');
    expect(marked).not.toContain('first_validator_id');
  });

  it('a CITED person: the draft keeps its state and point, only the ref leaves; an in-flight draft is still failed', () => {
    const b = fnBody(raw, '_clarify_erase_person');
    expect(b).toContain("SET derived_refs = array_remove(d.derived_refs, v_ref) WHERE d.derived_refs @> ARRAY[v_ref] AND d.state NOT IN ('queued', 'running');");
    // no position test any more: the point is its author's sentence whatever the positions are
    expect(b).not.toContain('point_positions');
    // the statement runs before the statements that fail drafts and collect their points
    expect(b.indexOf('array_remove(d.derived_refs, v_ref)')).toBeLessThan(b.indexOf('SELECT COALESCE(array_agg(d.point_id)'));
    expect(b.indexOf('array_remove(d.derived_refs, v_ref)')).toBeLessThan(b.indexOf("SET state = 'failed'"));
  });

  it('the citations of the erased person\'s rows leave cited and sent_ids, collected before step 2 clears author_id', () => {
    const b = fnBody(raw, 'erase_chat_data_for');
    expect(b).toContain('FROM public.chat_messages cm WHERE cm.author_id = p_uid UNION ALL SELECT tl.id FROM public.transcribe_messages tl JOIN public.transcribe_room_members trm ON trm.id = tl.member_id WHERE trm.profile_id = p_uid');
    expect(b).toContain('SET sent_ids = ARRAY(SELECT s FROM unnest(cd.sent_ids) AS s WHERE s::text <> ALL (v_mine))');
    expect(b).toContain("jsonb_array_elements(COALESCE(cd.cited -> 'a', '[]'::jsonb)) AS e WHERE (e #>> '{}') <> ALL (v_mine)");
    expect(b).toContain("jsonb_array_elements(COALESCE(cd.cited -> 'b', '[]'::jsonb)) AS e WHERE (e #>> '{}') <> ALL (v_mine)");
    expect(b).toContain("WHERE cd.derived_refs @> ARRAY[v_ref] AND cd.state NOT IN ('queued', 'running');");
    expect(b.indexOf('INTO v_mine')).toBeLessThan(b.indexOf('UPDATE public.chat_messages m SET body = NULL'));
    expect(b.indexOf('UPDATE public.clarify_drafts cd')).toBeLessThan(b.indexOf('UPDATE public.chat_messages m SET body = NULL'));
  });

  it('the publisher leaves the share row of a kept point before the delete that finds points by publisher', () => {
    const b = fnBody(raw, '_point_chat_erase_author');
    expect(b).toContain('UPDATE public.point_chat_shares s SET shared_by = NULL WHERE s.shared_by = p_uid AND EXISTS');
    expect(b.indexOf('SET shared_by = NULL')).toBeLessThan(b.indexOf('DELETE FROM public.points p'));
  });

  it('the card of a kept point keeps deleted_at and the attachment, and still loses body and author', () => {
    const b = fnBody(raw, 'erase_chat_data_for');
    expect(b).toContain("km.author_id = p_uid AND km.deleted_at IS NULL AND km.attachment_kind = 'point' AND km.attachment_id = s.point_id");
    expect(b).toContain('deleted_at = CASE WHEN m.id = ANY (v_kept) THEN m.deleted_at ELSE COALESCE(m.deleted_at, now()) END');
    expect(b).toContain('attachment_kind = CASE WHEN m.id = ANY (v_kept) THEN m.attachment_kind END, attachment_id = CASE WHEN m.id = ANY (v_kept) THEN m.attachment_id END');
    const step2 = b.slice(b.indexOf('UPDATE public.chat_messages m SET body = NULL'), b.indexOf('WHERE m.author_id = p_uid'));
    expect(step2).toContain('forward_snapshot = NULL, forward_author_id = NULL, author_id = NULL');
    // the collection happens before the scrub
    expect(b.indexOf('INTO v_kept')).toBeLessThan(b.indexOf('UPDATE public.chat_messages m SET body = NULL'));
    // the reader's rule still holds for a kept card: a live message whose attachment is the point (see _point_chat_readable_by_me)
    const readable = norm(stripComments(read('20261112180000_p1631_publish_read_cost.sql')));
    expect(readable).toContain("m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id");
  });

  it('the replaced functions stay closed to every client', () => {
    const code = norm(stripComments(raw));
    for (const f of ['_clarify_erase_person(uuid)', '_point_chat_erase_author(uuid)', 'erase_chat_data_for(uuid)']) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
    }
    expect(code).not.toMatch(/GRANT EXECUTE/);
    expect(raw.split('\n')[0]).toMatch(/^-- client-safe: /);
  });
});
