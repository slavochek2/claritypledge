import type { GeminiUsage } from './mirror-agent.ts';

/** The fields of a Gemini generateContent response that the mirror and the canvas engine read. */
export interface RawGeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }>;
  usageMetadata?: GeminiUsage;
}
