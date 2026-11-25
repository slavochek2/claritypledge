import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// P1722 fix round 2 (R1): the owner's position is read and locked ONCE, and the public copy is made from that row.
const dir = join(__dirname, '../../supabase/migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

function newestBody(fn: string, marker: string): string {
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const m = new RegExp(`FUNCTION public\\.${fn}\\(`, 'g');
    let hit: RegExpExecArray | null;
    while ((hit = m.exec(sql))) {
      const rest = sql.slice(hit.index);
      const end = rest.search(/\nREVOKE ALL ON FUNCTION/);
      const body = end === -1 ? rest : rest.slice(0, end);
      if (body.includes(marker)) return body;
    }
  }
  throw new Error(`no definition of ${fn} with ${marker}`);
}

describe('P1722 Z2: clarify_publish takes the owner position lock before the point lock (the position path locks the position row first)', () => {
  const body = newestBody('clarify_publish', 'p_warning_ack');
  it('the position FOR UPDATE comes before the point FOR UPDATE in the source', () => {
    const pos = body.search(/FROM public\.point_positions pp\s+WHERE pp\.point_id = v_d\.point_id AND pp\.user_id = v_uid\s+FOR UPDATE/);
    const pt = body.search(/FROM public\.points p\s+WHERE p\.id = v_d\.point_id AND p\.first_validator_id = v_uid FOR UPDATE/);
    expect(pos, 'position lock present').toBeGreaterThan(-1);
    expect(pt, 'point lock present').toBeGreaterThan(-1);
    expect(pos).toBeLessThan(pt);
  });
});

describe('P1722 R1: clarify_publish locks the owner position once', () => {
  const body = newestBody('clarify_publish', 'p_warning_ack');
  it('reads the owner position FOR UPDATE into a variable', () => {
    expect(body).toMatch(/FROM public\.point_positions pp\s+WHERE pp\.point_id = v_d\.point_id AND pp\.user_id = v_uid\s+FOR UPDATE/);
  });
  it('copies the position from that variable, not from a second read', () => {
    const reads = body.match(/FROM public\.point_positions pp[^;]*?pp\.user_id = v_uid/g) ?? [];
    expect(reads).toHaveLength(1);
    expect(body).toMatch(/VALUES \(v_new, v_uid, v_pos\)/);
  });
});
