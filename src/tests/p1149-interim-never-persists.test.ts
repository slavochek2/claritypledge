/**
 * @file p1149-interim-never-persists.test.ts
 * @description P1149 DW-4 — interim (not-yet-final) words are never written to the server
 * and never reach another participant. Three independent layers, each closing a different
 * way this could leak:
 *
 *  1. DB layer  — transcribe_messages.is_final has a CHECK(is_final = true): even a bug
 *     that tried to insert interim text with is_final=false is rejected at the database,
 *     not merely skipped by convention.
 *  2. Service layer — sendFinalMessage (the only insert path onto transcribe_messages)
 *     always writes is_final: true, hardcoded, not caller-controlled.
 *  3. Page layer — the room page's effect that calls sendFinalMessage reads only the
 *     hook's cumulative `transcript` (which only grows on a FINAL speech result); the
 *     effect's own dependency array and body never reference `interimTranscript`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const MIGRATION = R('supabase/migrations/20260823190000_p1149_transcribe_room_tables.sql');
const SERVICE = R('src/app/data/transcribe-service.ts');
const PAGE = R('src/app/pages/transcribe-room-page.tsx');

describe('P1149 DW-4: DB layer — is_final is a hard constraint, not a convention', () => {
  it('transcribe_messages.is_final is CHECKed to true at the database', () => {
    expect(MIGRATION).toMatch(/is_final BOOLEAN NOT NULL DEFAULT true CHECK \(is_final = true\)/);
  });
});

describe('P1149 DW-4: service layer — sendFinalMessage always writes is_final: true', () => {
  it('the only INSERT onto transcribe_messages hardcodes is_final: true', () => {
    const fn = SERVICE.slice(
      SERVICE.indexOf('export async function sendFinalMessage'),
      SERVICE.indexOf('export async function sendFinalMessage') + 700
    );
    expect(fn).toMatch(/is_final: true/);
    // No caller-supplied is_final parameter exists on the exported signature.
    expect(SERVICE).toMatch(/export async function sendFinalMessage\(roomId: string, memberId: string, text: string\)/);
  });

  it('transcribe-service.ts has exactly one INSERT call site onto transcribe_messages', () => {
    const inserts = SERVICE.match(/\.from\('transcribe_messages'\)\s*\n?\s*\.insert/g) ?? [];
    expect(inserts.length).toBe(1);
  });
});

describe('P1149 DW-4: page layer — interimTranscript never reaches sendFinalMessage', () => {
  it('the effect body that calls sendFinalMessage never references interimTranscript', () => {
    const bodyStart = PAGE.indexOf('useEffect(() => {\n    if (!room || !member) return;');
    expect(bodyStart).toBeGreaterThan(-1);
    const bodyEnd = PAGE.indexOf('}, [transcript, room, member]);');
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const effectBody = PAGE.slice(bodyStart, bodyEnd);
    expect(effectBody).toMatch(/sendFinalMessage/);
    expect(effectBody).not.toMatch(/interimTranscript/);
  });

  it('interimTranscript is only used for local display, never passed to sendFinalMessage', () => {
    const sendCallLine = PAGE.split('\n').find((l) => l.includes('void sendFinalMessage('));
    expect(sendCallLine).toBeDefined();
    expect(sendCallLine).not.toMatch(/interimTranscript/);
  });
});
