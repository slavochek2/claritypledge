/**
 * P1487 — the server accepts, and records, only the current terms version.
 *
 * The client sends CURRENT_TERMS_VERSION (src/lib/constants.ts). The server mirrors it in ONE
 * place (supabase/functions/_shared/terms-version.ts) used by the invitation functions, and the
 * terms-recording RPC holds the same literal. A superseded version must never be accepted or
 * recorded. This file reads the sources and fails when any of them drift apart.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { CURRENT_TERMS_VERSION, ACCEPTED_TERMS_VERSIONS } from '@/lib/constants';

const REPO = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

describe('P1487: one terms version, everywhere', () => {
  it('the client accepts only its current version', () => {
    expect([...ACCEPTED_TERMS_VERSIONS]).toEqual([CURRENT_TERMS_VERSION]);
  });

  it('the shared server constant equals the client current version', () => {
    const m = /SERVER_CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/.exec(read('supabase/functions/_shared/terms-version.ts'));
    expect(m?.[1]).toBe(CURRENT_TERMS_VERSION);
  });

  it.each(['create-and-open-letter/handler.ts', 'create-and-sign/handler.ts'])('%s uses the shared check and keeps no list of its own', (f) => {
    const src = read(`supabase/functions/${f}`);
    expect(src).toContain("from '../_shared/terms-version.ts'");
    expect(src).toContain('isCurrentTermsVersion(termsVersion)');
    expect(src).not.toMatch(/ACCEPTED_TERMS_VERSIONS\s*=/);
  });

  it('request-letter-response-signin accepts only the current version', () => {
    const m = /ACCEPTED_TERMS_VERSIONS\s*=\s*\[([^\]]*)\]/.exec(read('supabase/functions/request-letter-response-signin/index.ts'));
    const list = (m?.[1] ?? '').split(',').map((v) => v.trim().replace(/'/g, '')).filter(Boolean);
    expect(list).toEqual([CURRENT_TERMS_VERSION]);
  });

  it('the latest definition of the recording RPC holds the same version', () => {
    const dir = join(REPO, 'supabase/migrations');
    const defs = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .filter((sql) => /FUNCTION public\.consume_pending_terms_acceptance\(/.test(sql));
    expect(defs.length, 'no migration defines the RPC').toBeGreaterThan(0);
    const m = /c_current_version\s+CONSTANT\s+text\s*:=\s*'([^']+)'/.exec(defs[defs.length - 1]);
    expect(m?.[1], 'the latest RPC definition pins no version').toBe(CURRENT_TERMS_VERSION);
  });
});
