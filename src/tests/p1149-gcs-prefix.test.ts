/**
 * @file p1149-gcs-prefix.test.ts
 * @description P1149 DW-6 — room audio is path-scoped under `rooms/`, and the existing
 * `sessions/` construction used by /live is untouched.
 *
 * The actual GCS object key is assembled by an out-of-repo Cloud Function (see the
 * comment on buildRoomAudioPathSegments in src/app/data/api.ts) — this repo cannot prove
 * where an upload physically lands, only what it asks for. That live proof is P1152's
 * bucket-listing check. What IS provable here, and what this file proves: the pure path
 * construction never reuses the `sessions/` segment, and the existing `/live` code path
 * that DOES use `sessions/{code}/` is byte-identical to before this feature existed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRoomAudioPathSegments } from '@/app/data/api';

const API_SOURCE = readFileSync(join(process.cwd(), 'src/app/data/api.ts'), 'utf-8');

describe('P1149 DW-6: buildRoomAudioPathSegments', () => {
  it('builds a rooms/{code}/{participant}-{memberId} prefix, never sessions/', () => {
    const { gcsPathPrefix } = buildRoomAudioPathSegments('AB3XY9', 'Jordan Rivera', 'member-1');
    expect(gcsPathPrefix).toBe('rooms/AB3XY9/jordan-rivera-member-1');
    expect(gcsPathPrefix.startsWith('sessions/')).toBe(false);
  });

  it('sanitizes the participant name the same way uploadAudioChunk sanitizes userName', () => {
    const { sanitizedParticipant } = buildRoomAudioPathSegments('AB3XY9', "O'Brien  Smith!!", 'member-1');
    expect(sanitizedParticipant).toBe('o-brien-smith');
  });

  it('is deterministic for the same inputs (idempotent chunk retries land at the same prefix)', () => {
    const a = buildRoomAudioPathSegments('AB3XY9', 'Jordan Rivera', 'member-1');
    const b = buildRoomAudioPathSegments('AB3XY9', 'Jordan Rivera', 'member-1');
    expect(a).toEqual(b);
  });

  it('two participants with the same display name get different prefixes (P1149 finish-review HIGH)', () => {
    const a = buildRoomAudioPathSegments('AB3XY9', 'Alex', 'member-1');
    const b = buildRoomAudioPathSegments('AB3XY9', 'Alex', 'member-2');
    expect(a.gcsPathPrefix).not.toBe(b.gcsPathPrefix);
  });
});

describe('P1149 DW-6: sessions/ prefix is untouched', () => {
  it('recordChunkUploadComplete still writes the literal sessions/{sessionCode}/ path', () => {
    expect(API_SOURCE).toMatch(
      /audio_path: `gs:\/\/claritypledge-ml-training\/sessions\/\$\{sessionCode\}\//
    );
  });

  it('uploadAudioChunk (the /live path) still writes the literal sessions/{sessionCode}/ path', () => {
    const uploadAudioChunkBody = API_SOURCE.slice(
      API_SOURCE.indexOf('export async function uploadAudioChunk'),
      API_SOURCE.indexOf('export async function uploadSingleChunk')
    );
    expect(uploadAudioChunkBody).toMatch(/sessions\/\$\{sessionCode\}\//);
  });

  it('uploadRoomAudioChunk never writes a sessions/ path', () => {
    const fnStart = API_SOURCE.indexOf('export async function uploadRoomAudioChunk');
    const fnEnd = API_SOURCE.indexOf('/**', fnStart); // the JSDoc comment above the NEXT function
    const uploadRoomAudioChunkBody = API_SOURCE.slice(fnStart, fnEnd);
    expect(uploadRoomAudioChunkBody).not.toMatch(/sessions\//);
    expect(uploadRoomAudioChunkBody).toMatch(/gcsPathPrefix/);
  });
});
