/**
 * Counts every HTTP request made by the live P1536 suite, whichever Supabase client makes it (the suite's own, and the
 * e2e helpers' admin client used to create and delete users). Import it FIRST in the test file: a client binds the global
 * `fetch` when it is constructed, so the wrapper must be in place before any client exists.
 */
// failedResponses: status 400 or above. Each one is a provoked failure that writes an error log line on top of the
// request's own access line (metered-services rule 5), so log lines per run ≈ requests + failedResponses.
export const traffic = { requests: 0, authRequests: 0, responseBytes: 0, failedResponses: 0 };

type Counting = typeof fetch & { __p1536Counting?: boolean };
const current = globalThis.fetch as Counting;
if (!current.__p1536Counting) {
  const real = current;
  const counting: Counting = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    traffic.requests += 1;
    if (url.includes('/auth/v1/')) traffic.authRequests += 1;
    const res = await real(input, init);
    if (res.status >= 400) traffic.failedResponses += 1;
    try { traffic.responseBytes += (await res.clone().arrayBuffer()).byteLength; } catch { /* a stream that cannot be read twice is not counted */ }
    return res;
  }) as Counting;
  counting.__p1536Counting = true;
  globalThis.fetch = counting;
}
