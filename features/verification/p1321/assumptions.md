# P1321 — Assumption Log

Calls made during the attended run without stopping to ask, each with the date, the call and why.
Entries 1–4 come from the first part of the run (handoff record). Entries from 5 on were made on
2026-10-08 in the resumed session. Live-defect specifics are in `.private/docs/security-log.md`
(2026-10-08), not here.

## 1. 2026-10-08 — Allowlist category "policy-required" applied as resolved in the spec

**Call:** used the third allowlist category from `## Resolved Decisions` (2026-09-16) rather than
re-asking. **Why:** the founder answered it in writing before the run.

## 2. 2026-10-08 — Eleven anonymous-EXECUTE findings revoked, none allowlisted

**Call:** migration 20261008210000 revokes anon and PUBLIC EXECUTE on eleven functions.
**Why:** none had a real anonymous call site at `file:line` (decisions.md 2026-09-10). Canary:
`e2e/integration/p1321-anon-function-grants.spec.ts`.

## 3. 2026-10-08 — Attendee count changed from `select('*')` to `select('id')` (4b29965e1)

**Call:** a frontend change inside a security spec. **Why:** with any column withheld, `*` is
refused, so the column fix could not ship without it; a count needs no columns.

## 4. 2026-10-08 — Definer-function sweep by one reviewer

**Call:** one Opus reviewer over 100 SECURITY DEFINER functions instead of a fan-out.
**Why:** global rule "subagent fan-out: default one, then verify it yourself." Verification:
each lead promoted to a defect only after a failing integration test (entries 6–9).

## 5. 2026-10-08 — R1 coupling: `requires-frontend: 4b29965e1`, not `client-safe`

**Call:** replaced the migration's `client-safe` note. **Why:** the bundle before 4b29965e1 counts
attendees with `*` (signup auto-RSVP path), which the column grant refuses. `/ship` cherry-picks, so
the SHA must be repointed after ship (P1106).

## 6. 2026-10-08 — L1 guard copied from the sibling function, idempotency kept first

**Call:** `create_letter_delivery` now requires `status='sealed' AND mode='one-to-many'`, the
guard `create_letter_delivery_on_open` carries. The existing-delivery return stays before the guard.
**Why:** both callers (`letter-reading-page` ready_public, `signup-page` buffered draft) are
one-to-many readers; one-to-one receivers are invited, never self-enrolled. A reader who already
holds a delivery keeps getting it back, so no legitimate retry breaks.

## 7. 2026-10-08 — L1: 'Letter not found' folded into 'Letter not accessible'

**Call:** added `create_letter_delivery:Letter not found` to `KNOWN_INTENTIONAL_REMOVALS` in
`src/tests/sd-guard-completeness.test.ts`. **Why:** two distinct messages would tell a caller
whether a letter id exists. The guard was narrowed, not dropped.

## 8. 2026-10-08 — L2: witness_profile_id must be NULL on client insert

**Call:** `WITH CHECK (auth.uid() = profile_id AND witness_profile_id IS NULL)`, not
`witness_profile_id = auth.uid()`. **Why:** no client writes the column; the only writers are
definer erasure functions and service-role test seeding, which RLS does not govern. A self-link
would be harmless but serves nothing. Prod has 0 such rows (read-only count).

## 9. 2026-10-08 — L3/L4 fixed at the write side; consumers unchanged

**Call:** pin `profiles.email` to the auth record (guard trigger: INSERT `auth.email()`, UPDATE
`OLD.email`; `upsert_my_profile` reads `auth.users`), and leave `lookup_party_by_email`, the letter
recipient RPCs and `erase_my_account` as they are. **Why:** prod read-only, counts only:
168 of 168 profile emails equal `auth.users.email`, 0 differ, 0 duplicates. The probe was live
(168 matches), so no forged row exists to clean up, and correct writes make every consumer correct.
The trigger uses `auth.email()` (the JWT claim) because it runs as the client role, which cannot
read `auth.users`; RLS already forces `id = auth.uid()` on that path.

## 10. 2026-10-08 — First L3 test discarded as blind

**Call:** rewrote `p1321-profile-email-pin.spec.ts` after it passed 4/4 against the unfixed DB.
**Why:** it used a registered victim's exact address, which `UNIQUE(email)` refuses regardless of
any guard. Rewritten around an unregistered address and a case variant; then red on both paths.

## 11. 2026-10-08 — Browser baseline taken by toggling the grant on the shared test DB

**Call:** restored table-level SELECT on `event_rsvps` (test) for one run (about 4 minutes), ran the
10 failing chromium spec files, re-applied R1's statements, re-ran the same files. **Why:** a column
refusal in the browser surfaces as missing UI, not an error message, so only a with/without
comparison discriminates. Result: the same 14 failures both ways. During the window other
sessions saw the pre-R1 read, never a narrower one. Final ACL verified back to R1.

## 12. 2026-10-08 — No production migration snapshot before the run

**Call:** substitute evidence instead of claiming before/after identity. **Why:** none was taken
before the work. After: prod ledger 399 versions, max 20261007090000; no P1321 version present;
every deploy-manifest prod version is in the ledger.

## 13. 2026-10-08 — Fixture leftovers on the test DB from the first L1 red run

**Call:** left, not deleted. **Why:** that run signed in on the shared admin client, so teardown ran
as the user and failed; deleting rows on any DB is ask-first. Five test users plus letters and
deliveries remain; `/slava:maintain:clean-test-users` covers them. The spec was fixed to sign in on
a throwaway client (also filed as INBOX-151 for p707/p778).

## 14. 2026-10-08 — Reviewers

**Call:** Codex (gpt-6.1-sol via `codex-review`) at `--effort high` for the fixes review and design
round 1; per the 2026-09-16 decision the fallback order is Fable, then Opus. Gemini received nothing
from this spec. **Why:** the wrapper default is low effort; the founder asked for high.

## 15. 2026-10-08 — Phase-1 design rests on vendor docs read today, not on a build

**Call:** wrote the architecture with every vendor capability marked UNVERIFIED and a spike table
(S1–S7) as build step 0. **Why:** the spec's scope is design and review, not build; asserting the
hook can re-role a token without running it would violate "falsify before you rely."

## 16. 2026-10-08 — OPEN: live-defect mechanics are in this branch's commits and migration headers

**Not decided — needs the founder before `/ship`.** The spec's invariant says a new live defect gets
its own embargoed spec. R1 and L1–L4 were fixed here, under a `disclosure: public` spec, with commit
messages and migration headers that describe the mechanics. Nothing is pushed. Options: (A) move
those five commits to an embargoed spec's branch and ship via `publish-spec`; (B) apply the staged
migrations to prod before this branch is pushed, so publication follows the fix; (C) reword the
headers and messages to roles before ship.

## 17. 2026-10-08 — Codex fixes review returned REJECT; work stopped for the founder

**Call:** stopped before design review round 2 and the Done-When ticks. **Why:** the review (Codex,
high effort, 1 of 1 reports received) raised one critical and three high findings. The critical one
and two of the highs were verified against code and the production catalog, read-only and not
exploited. They are live in production and predate this branch. Two of them show that L1's and L2's
outcomes can still be reached by sibling paths. Specifics are in the private security log. A
critical live defect needs its own embargoed spec and a production fix decision, and both are the
founder's call. Criterion 1 stays **No**.
