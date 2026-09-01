#!/usr/bin/env node
/**
 * Control probe for the auth rate-limit knob (P1085 / P1043).
 *
 * supabase/config.toml:191 sets `sign_in_sign_ups = 30` per 5 min PER IP. The E2E
 * suite issues ~1.5 sign-ins per test, so ~1000 tests need >=4.2h of pure auth
 * budget on any machine — the measured bottleneck behind run 4's 156 rate-limit
 * failures, which were indistinguishable from real defects.
 *
 * The overnight runner raises that ceiling on a LOCAL stack. This probe is the
 * control: it proves the raised ceiling is real rather than assumed. Without it a
 * patch that silently failed to apply would look identical to one that worked, and
 * the night's failures would again be uninterpretable.
 *
 * Exit 0 = ceiling raised (no 429 within N attempts). Exit 1 = still throttled.
 *
 * Usage: node probe-auth-rate-limit.cjs <supabase-url> <anon-key> [attempts]
 */
const [, , url, anonKey, attemptsArg] = process.argv;
const attempts = Number(attemptsArg || 60);

if (!url || !anonKey) {
  console.error('usage: probe-auth-rate-limit.cjs <supabase-url> <anon-key> [attempts]');
  process.exit(2);
}

const stamp = Date.now();

async function signup(i) {
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `ratelimit-probe-${stamp}-${i}@example.com`,
      password: `Probe!${stamp}${i}`,
    }),
  });
  return res.status;
}

(async () => {
  // Fire in tight sequence — the suite's own burst shape, not a paced trickle.
  // A paced probe would pass against the un-raised 30/5min ceiling and prove nothing.
  let throttledAt = null;
  const codes = {};
  for (let i = 0; i < attempts; i++) {
    let status;
    try {
      status = await signup(i);
    } catch (err) {
      console.error(`attempt ${i}: network error: ${err.message}`);
      process.exit(2);
    }
    codes[status] = (codes[status] || 0) + 1;
    if (status === 429) {
      throttledAt = i + 1;
      break;
    }
  }

  console.log(`attempts=${attempts} status_counts=${JSON.stringify(codes)}`);

  if (throttledAt !== null) {
    console.error(`THROTTLED after ${throttledAt} sign-ups (HTTP 429) — ceiling NOT raised.`);
    process.exit(1);
  }
  console.log(`OK — ${attempts} consecutive sign-ups, no 429. Ceiling is raised.`);
  process.exit(0);
})();
