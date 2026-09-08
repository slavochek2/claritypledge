/**
 * @file p1149-interim-never-persists.test.ts
 * @description P1149 DW-4 — interim (not-yet-final) words are never written to the server
 * and never reach another participant. Three independent layers, each closing a different
 * way this could leak:
 *
 *  1. DB layer  — transcribe_messages.is_final has a CHECK(is_final = true): even a bug
 *     that tried to insert interim text with is_final=false is rejected at the database,
 *     not merely skipped by convention.
 *  2. Service layer — the client has NO insert path onto transcribe_messages at all.
 *  3. Page layer — the room page holds no interim text to leak.
 *
 * P1236 STRENGTHENED layers 2 and 3 rather than weakening them, and this file was updated
 * to match. Decision 7 removes the browser recognizer from the room page, so there is no
 * `interimTranscript`, no cumulative `transcript`, and no client-side insert: the server
 * transcribes and writes. The old assertions checked that a specific effect body did not
 * mention `interimTranscript`. That effect no longer exists, so those assertions could
 * only ever pass vacuously or fail on their own scaffolding — neither of which measures
 * DW-4 any more. What replaces them is the stronger claim the new architecture supports:
 * the identifier does not appear in the page or the service AT ALL.
 *
 * Layer 1 is untouched. The CHECK constraint is still the backstop, and it now guards a
 * table only the server writes to.
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

describe('P1149 DW-4: service layer — the client cannot write to transcribe_messages', () => {
  it('transcribe-service.ts has ZERO INSERT call sites onto transcribe_messages', () => {
    // P1236 Decision 2: the writer is the transcribe-slice edge function, using a
    // server-derived member_id. Before this the count was 1 (sendFinalMessage).
    const inserts = SERVICE.match(/\.from\('transcribe_messages'\)\s*\n?\s*\.insert/g) ?? [];
    expect(inserts.length).toBe(0);
  });

  it('sendFinalMessage is gone, not merely unused', () => {
    // An exported writer with no callers is an invitation, not dead weight — the next
    // agent that wants "just write a line to the transcript" would find it and use it.
    expect(SERVICE).not.toMatch(/export async function sendFinalMessage/);
  });
});

describe('P1149 DW-4: page layer — there is no interim text to leak', () => {
  it('the room page neither imports nor calls the speech hook', () => {
    // The strongest form of "interim text never leaves the browser": none exists. Matched
    // on the IMPORT and the CALL rather than on the identifier, because the page's own
    // comments explain why the hook is gone — and a rule that forbids naming the thing you
    // removed pushes the explanation out of the file that needs it. The hook itself is NOT
    // deleted: /chat still uses its default (non-autoRestart) behaviour.
    expect(PAGE).not.toMatch(/from '@\/hooks\/useSpeechToText'/);
    expect(PAGE).not.toMatch(/useSpeechToText\(/);
    expect(PAGE).not.toMatch(/interimTranscript/);
  });

  it('the page has no data-testid for interim text', () => {
    expect(PAGE).not.toMatch(/transcribe-interim/);
  });

  it('the page does not write transcript text to the server at all', () => {
    // Its only outbound audio call is the slice POST, which carries audio and no text.
    expect(PAGE).not.toMatch(/sendFinalMessage\(/);
    expect(PAGE).toMatch(/sendAudioSlice\(/);
  });
});
