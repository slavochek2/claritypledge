// TRANSCRIPTION TYPES (P495), re-exported from '@/app/types'.

export interface TranscriptSegment {
  speaker_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface SessionTranscript {
  id: string;
  session_id: string;
  session_code: string;
  language: string | null;
  segments: TranscriptSegment[];
  speaker_map: Record<string, { user_id?: string; display_name: string }> | null;
  model_version: string | null;
  processing_time_ms: number | null;
  created_at: string;
}

export type TranscriptionJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | null;
