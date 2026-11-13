/**
 * One generateContent POST to Gemini, shared by the canvas and Clarify model callers. The key travels in a header, never in the URL.
 * A non-2xx answer is `{ status, body: null }` (its body is cancelled); a network error or a bad JSON body throws, so each caller logs it under its own name.
 */
import { anySignal } from './abort-signals.ts';

export async function postGemini(
  model: string,
  apiKey: string,
  request: unknown,
  fetchFn: typeof fetch,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ status: number; body: unknown | null }> {
  const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(request),
    signal: anySignal(signal, AbortSignal.timeout(timeoutMs)),
  });
  if (!res.ok) { await res.body?.cancel(); return { status: res.status, body: null }; }
  return { status: 200, body: await res.json() };
}
