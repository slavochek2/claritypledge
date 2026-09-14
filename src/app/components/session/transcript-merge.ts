/**
 * @file transcript-merge.ts
 * @description P1307 Part 7 (D4): render-time readability for a room transcript.
 *
 * Live text arrives as one row per 13-second slice, so a person speaking for a minute reads
 * as a wall of name-stamped fragments. Consecutive rows from the same speaker are joined into
 * one block here, at render time only — the stored rows are untouched.
 *
 * Deliberately NOT here: the "…" speaking cue. It is transient realtime state, never a row
 * (Invariant: "interim text never reaches the database"), so it is passed alongside the
 * merged rows by the caller rather than encoded into one of them.
 */
import type { TranscribeMessage } from '@/app/data/transcribe-service';

export interface MergedTranscriptRow {
  /** The first message's id — a stable React key for the block. */
  key: string;
  memberId: string;
  text: string;
  /** The FIRST message's time: merging must never move a block later in the transcript. */
  spokenAt: string;
}

export function mergeConsecutiveSpeakerRows(messages: TranscribeMessage[]): MergedTranscriptRow[] {
  const rows: MergedTranscriptRow[] = [];
  for (const message of messages) {
    const last = rows[rows.length - 1];
    if (last && last.memberId === message.memberId) {
      last.text = `${last.text} ${message.text}`;
    } else {
      rows.push({ key: message.id, memberId: message.memberId, text: message.text, spokenAt: message.spokenAt });
    }
  }
  return rows;
}
