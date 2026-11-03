/**
 * @file p1607-e2e-load-workload.test.ts
 * @description P1607: the load driver's fixed workload calls no metered service and holds no spec that changes
 * server-wide state. Checked against the real files and their helper imports, with a failing control (a spec
 * that does both) run through the identical check, so a check that passes everything cannot pass here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WORKLOAD } from '../../scripts/e2e-load-test.mjs';
import { classifyFiles } from '../../scripts/lib/e2e-exclusive-specs.mjs';

const repo = path.resolve('.');
// Edge functions that reach a metered service (Gemini and friends, mail, signed storage urls).
const METERED = /functions\.invoke|\/functions\/v1|gemini|openrouter|enqueue|transcri|resend|sendgrid|signed.?url|send-.*emails|dispatch|chat-voice|generate-|mirror-reply/i;

function imports(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return seen; }
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = path.resolve(path.dirname(file), m[1]);
    for (const e of ['', '.ts', '.tsx', '/index.ts']) {
      if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) { imports(base + e, seen); break; }
    }
  }
  return seen;
}
const meteredIn = (rel: string) => [...imports(path.join(repo, rel))]
  .filter(f => f.startsWith(path.join(repo, 'e2e')))
  .filter(f => METERED.test(fs.readFileSync(f, 'utf8')))
  .map(f => path.relative(repo, f));

describe('the load workload', () => {
  it('lists real specs', () => {
    expect(WORKLOAD.length).toBeGreaterThan(3);
    for (const f of WORKLOAD) expect(fs.existsSync(path.join(repo, f)), f).toBe(true);
  });
  it('calls no metered service, in the spec or in any e2e helper it imports', () => {
    for (const f of WORKLOAD) expect(meteredIn(f), f).toEqual([]);
  });
  it('holds no spec that changes server-wide state', () => {
    expect([...classifyFiles(WORKLOAD.map(f => path.join(repo, f)), { repoDir: repo }).keys()]).toEqual([]);
  });
  it('failing control: the same checks flag a transcription spec', () => {
    const bad = 'e2e/p1592-event-transcripts.spec.ts';
    expect(meteredIn(bad).length).toBeGreaterThan(0);
    expect(classifyFiles([path.join(repo, bad)], { repoDir: repo }).size).toBe(1);
  });
});
