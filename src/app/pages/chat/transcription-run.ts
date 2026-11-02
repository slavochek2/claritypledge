import type { ChatMessage } from '@/app/data/chat-service';

/**
 * "Transcribed" is shown once per consecutive run of one author's transcription messages: this one continues the run.
 * `startsNewBlock`: the row opens a day break or shows its own author header, so the pill sits there again.
 */
export function continuesTranscription(prev: ChatMessage | undefined, m: ChatMessage, startsNewBlock = false): boolean {
  return !startsNewBlock && !!prev && !!prev.isTranscription && !prev.isDeleted && !!m.isTranscription && prev.authorId === m.authorId;
}
