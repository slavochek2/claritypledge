/**
 * @file p1149-job-no-diarization.test.ts
 * @description P1149 DW-7 — transcription for the room is done with diarization off.
 * Non-Goals: "Do NOT enable diarization on these jobs — one device is one speaker."
 *
 * There is no diarization concept anywhere on the room's transcription path. "Off" holds by
 * absence, not by an extra flag someone has to remember to pass.
 *
 * UPDATED for P1307 (Architecture Decisions 5 and 7). The client `endRoom()` this file used to
 * exercise — which created a `/live` batch job per member through createTranscriptionJob — is
 * retired: no client ends a room for anyone else, the server-side sweep ends it, and each
 * member's whole recording is transcribed by the room engine (Gemini per segment, the device as
 * the speaker), never the Whisper + diarization worker. The DW-7 property is therefore asserted
 * where the room's jobs are now created and processed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('P1149 DW-7: no diarization concept exists anywhere touched by room transcription', () => {
  it('api.ts has zero occurrences of "diarization"', () => {
    const api = R('src/app/data/api.ts');
    expect(api).not.toMatch(/diariz/i);
  });

  it('the create_transcription_job RPC migration has zero occurrences of "diarization"', () => {
    const rpc = R('supabase/migrations/20260313140327_p495_create_transcription_job_rpc.sql');
    expect(rpc).not.toMatch(/diariz/i);
  });
});

describe('P1307: the room never reaches the diarizing /live batch worker', () => {
  it('the client has no room-end path and creates no transcription job', () => {
    const service = R('src/app/data/transcribe-service.ts');
    expect(service).not.toMatch(/export async function endRoom/);
    expect(service).not.toMatch(/createTranscriptionJob\(/);
    expect(service).not.toMatch(/\.from\('transcription_jobs'\)/);
  });

  it('the room-end sweep creates room jobs, and never a /live transcription_jobs row', () => {
    const sweep = R('supabase/migrations/20260914120300_p1307_transcribe_room_jobs_transcripts_sweep.sql');
    expect(sweep).toMatch(/INSERT INTO public\.transcribe_room_transcription_jobs/);
    expect(sweep).not.toMatch(/INSERT INTO public\.transcription_jobs/);
  });

  it('the room engine carries no diarization dependency and sends no diarization setting', () => {
    const requirements = R('services/transcribe-room-batch/requirements.txt');
    expect(requirements).not.toMatch(/^\s*(pyannote|openai-whisper|torch)/im);
    const gemini = R('services/transcribe-room-batch/gemini_client.py');
    expect(gemini).not.toMatch(/diariz/i);
  });
});
