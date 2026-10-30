/**
 * P1536: the model's answer as JSON, or the reason it is not one (blocked, empty, unparsable). Pure: no Deno or esm.sh imports.
 */

import { costUsd, type GeminiUsage } from './mirror-agent.ts';
import type { Failure } from './canvas-types.ts';

// ── The model's JSON ────────────────────────────────────────────────────────

const BLOCKED_FINISH = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'];

interface RawResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }>;
  usageMetadata?: GeminiUsage;
}

function answerText(r: RawResponse): string {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p) => p && p.thought !== true && typeof p.text === 'string').map((p) => p.text as string).join('').trim();
}

export function readJson(response: unknown): { ok: true; parsed: unknown; costUsd: number | null } | Failure {
  const r = (response ?? {}) as RawResponse;
  const cost = costUsd(r.usageMetadata);
  const finish = r.candidates?.[0]?.finishReason;
  if (r.promptFeedback?.blockReason || (finish && BLOCKED_FINISH.includes(finish))) return { ok: false, code: 'blocked', costUsd: cost };
  const text = answerText(r);
  if (!text) return { ok: false, code: 'empty', costUsd: cost };
  try {
    return { ok: true, parsed: JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), costUsd: cost };
  } catch {
    return { ok: false, code: 'unparsable', costUsd: cost };
  }
}

