/**
 * P1653: shape checks that catch the syntax mistakes a text-shape test used to miss in the three P1653 migrations' function bodies.
 * THE REAL CHECK IS APPLYING THE MIGRATION to the TEST database (it parses every body in a transaction): these checks only catch the classes of error
 * that already happened, and say so. A body that parses can still be wrong; nothing here runs SQL.
 *
 *   1. A CASE inside an IF or ELSIF condition. plpgsql reads an IF condition up to the FIRST `THEN`, so the CASE's own `THEN` ends it early and the
 *      statement fails with "syntax error at end of input" (20261110120000 first version). Compute the CASE into a variable first.
 *   2. Every CASE has its END (an unbalanced CASE reads as the end of the function).
 *   3. Every BEGIN has its END; and every IF has its END IF, every LOOP its END LOOP.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = [
  '20261110100000_p1653_never_a_wall.sql',
  '20261110110000_p1653_fix_batch.sql',
  '20261110120000_p1653_structured_tap.sql',
];
const read = (f: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', f), 'utf8');

/** Comments and string literals removed, so keywords inside them never count. */
const bare = (sql: string) => sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");
const bodies = (sql: string): string[] => [...sql.matchAll(/AS \$\$([\s\S]*?)\n\$\$;/g)].map((m) => bare(m[1]!));

/** The conditions of every IF / ELSIF (the text from the keyword to the first THEN) that hold a CASE. */
export function caseInsideIfCondition(body: string): string[] {
  const bad: string[] = [];
  for (const m of body.matchAll(/(?<![A-Z_])(?<!\bEND\s+)(?:ELSIF|IF)\b/g)) { // an IF or ELSIF that is not the IF of an END IF
    const rest = body.slice((m.index ?? 0) + m[0].length);
    const then = rest.search(/\bTHEN\b/);
    const condition = then < 0 ? rest : rest.slice(0, then);
    if (/\bCASE\b/.test(condition)) bad.push(`${m[0]}${condition}`.replace(/\s+/g, ' ').trim());
  }
  return bad;
}

/** Opens minus closes for CASE, IF and LOOP in one body; a balanced body gives [0, 0, 0]. */
export function balance(body: string): [number, number, number] {
  const count = (re: RegExp) => [...body.matchAll(re)].length;
  const cases = count(/\bCASE\b/g) - count(/\bEND\s+CASE\b/g);
  const caseEnds = count(/\bEND\b(?!\s+(?:IF|LOOP|CASE)\b)/g) - 1; // the function's own final END
  const ifs = count(/(?<![A-Z_])(?<!\bEND\s+)IF\b/g) - count(/\bEND\s+IF\b/g); // ELSIF opens nothing: it continues an IF
  const loops = count(/\bLOOP\b(?!\s*;)/g) - count(/\bEND\s+LOOP\b/g);
  return [cases - caseEnds, ifs, loops];
}

describe('P1653 migrations: syntax classes a text-shape test missed (the real check is the TEST apply)', () => {
  for (const file of MIGRATIONS) {
    const found = bodies(read(file));
    it(`${file}: every function body is found and has no CASE inside an IF condition`, () => {
      expect(found.length).toBeGreaterThan(0);
      for (const body of found) expect(caseInsideIfCondition(body)).toEqual([]);
    });
    it(`${file}: every CASE has its END, every IF its END IF, every LOOP its END LOOP`, () => {
      for (const body of found) expect(balance(body)).toEqual([0, 0, 0]);
    });
  }

  it('finds the three functions of the structured-tap migration (a parser that finds nothing must not pass)', () => {
    expect(bodies(read('20261110120000_p1653_structured_tap.sql'))).toHaveLength(3);
  });

  it('CONTROL: the first version of canvas_mark_tap (a CASE inside the IF condition) is caught', () => {
    const broken = bare(`
BEGIN
  IF NOT FOUND
     OR btrim(COALESCE(v_m.body, '')) IS DISTINCT FROM CASE p_token WHEN 'yes' THEN 'Yes, this is my business' ELSE 'Not mine' END
     OR NOT EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.owner_id = v_uid) THEN
    RETURN jsonb_build_object('status', 'refused');
  END IF;
END;`);
    expect(caseInsideIfCondition(broken)).toHaveLength(1);
    // and the fixed shape (the CASE computed into a variable before the IF) passes
    const fixed = bare(`
BEGIN
  v_expect := CASE p_token WHEN 'yes' THEN 'Yes, this is my business' ELSE 'Not mine' END;
  IF NOT FOUND OR btrim(COALESCE(v_m.body, '')) IS DISTINCT FROM v_expect THEN
    RETURN 1;
  END IF;
END;`);
    expect(caseInsideIfCondition(fixed)).toEqual([]);
    expect(balance(fixed)).toEqual([0, 0, 0]);
  });
  it('CONTROL: a CASE with no END, an IF with no END IF and a LOOP with no END LOOP are each caught', () => {
    expect(balance(bare("BEGIN\n  v := CASE WHEN a THEN 1 ELSE 2;\nEND;"))).not.toEqual([0, 0, 0]);
    expect(balance(bare('BEGIN\n  IF a THEN\n    RETURN 1;\nEND;'))).not.toEqual([0, 0, 0]);
    expect(balance(bare('BEGIN\n  FOR r IN SELECT 1 LOOP\n    n := 1;\nEND;'))).not.toEqual([0, 0, 0]);
  });
});
