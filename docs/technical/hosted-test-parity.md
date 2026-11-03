# Switching hosted TEST on (P1606)

Hosted TEST, called PARITY, is paused by default. Self-hosted TEST is the one default server. Switching hosted TEST on is the founder's decision, one use at a time.

Why it stays: it is the only environment running on Supabase's own platform. It is not a rollback for a multi-agent load: it is on the smallest plan and timed out under that load.

Decide by 2027-02-01 whether to delete it if no justified use has come up. Supabase's dashboard allows resuming a paused project for up to one year.

## When it is justified

An agent asks the founder in two lines:

1. What only real Supabase can show.
2. The failed self-hosted run that proves it.

Justified: behaviour of Supabase's own platform that self-hosted TEST cannot reproduce, such as its gateway, hosted auth, captcha or rate limits.

Not justified: self-hosted TEST lacks a key or feature (fix it), speed, or a note saying so. The 2026-11-02 incident came from a stale note: the feature was then switched on for self-hosted and worked.

Agents never restore the project themselves, by API or through a logged-in browser. No token in a plaintext env file has that permission; the account-wide token in the keychain does, behind the founder's dialog.

## Using it

1. The founder restores the project in the Supabase dashboard.
2. Compare its schema with production's, read-only. Reading production takes the usual keychain approval.
3. If they differ, rebuild by the P1538 procedure (private schema dump, then grant reset and replay; [decisions.md](../decisions.md) 2026-10-21). Never replay migrations from empty, which is known to fail (P1132), and never copy production rows.
4. Confirm the schema diff is empty.
5. Run with `CP_HOSTED_TEST_REASON="<the founder's decision>"` and hosted TEST's URL and keys, kept in `.env.test.local` as `HOSTED_TEST_*`. Keep the load small: one worker.
6. The founder pauses the project again. `scripts/selfhosted/upkeep.sh` warns while it is left on.

The reason variable is not a permission. It only replaces the refusal message with a record of why. The pause is the wall.

## What still names hosted TEST

`.env.local` still holds hosted TEST's values, and the Supabase MCP points at it. While it is paused these fail with a connection or paused error. That is correct: they must not move to another server silently. For TEST data, use `.env.test.local` and main's scripts.
