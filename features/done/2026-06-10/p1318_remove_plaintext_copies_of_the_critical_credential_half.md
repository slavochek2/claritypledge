---
status: all-done
type: task
rank: 8
workstream: keyring
created_date: '2026-09-15'
tags:
  - security
  - credentials
  - keyring
  - least-privilege
disclosure: public
related:
  - p1322
  - p1316
  - p1239
  - p1214
  - p1148
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
completed_at: 2026-10-05
---

# P1318: Measure the locked path in real use, then remove the plaintext copies of the critical credential half

## Problem

**Situation:** P1316 moved every remaining consumer of the prod master key onto the per-access lock or
the read-only helper, proved it with a canary that fails against the old code, and gave all 28
credential-drift candidates a verdict. Every critical credential is still readable in the plaintext env
files — the lock guards only callers that choose to use it.

**Complication:** The last steps cannot be done in the same session as the migration. The removal is
gated on a measured week of real use, the first locked prod migrate/deploy/publish has not happened yet,
and one archived script still reads prod with the master key. P1316's own ship gate refuses a spec with
unticked boxes, so these items would have held finished, verified code off `main`. The founder chose to
split them out (2026-09-15).

The P1316 liveness probes also changed what "retired" means: four credentials no consumer uses still
authenticate (each probe was controlled with a deliberately wrong credential, which was refused). So
retiring them means revoking them, not deleting a dead string.

**Reshaped 2026-09-15** after an adversarial review (all findings command-verified): the urgent,
un-gated work — revoking the unused-but-live credentials, wiring an Always-Allow check, building a
recovery escrow, and reckoning with the plaintext copies that live *outside* the env files (≈115
session transcripts, restic snapshots, the cloud VM, CI) — moved to **P1322**, which now **blocks**
this spec. What remains here is only the removal itself, behind P1322's escrow and this spec's
measured week. The review's specific corrections to the boxes below are folded in.

**Question:** Does the locked path hold up in a real week of use — and, once P1322's recovery escrow
exists and is drill-proven, can the plaintext copies in the env files be removed without breaking any
consumer — knowing that removal alone does NOT make the keys unreadable while the off-file copies P1322
handles still exist?

> Founder framing, verbatim (2026-09-15, on P1316): "did we eliminate something from .env.local and put
> it somewhere else? Or that is part of some future thing?" — this spec is the part that removes it.

## Appetite

Blast radius: high at the final step — every consumer of every critical credential. Reversibility: high
until the removal (measurement and one script edit), low after it, which is why removal is last and
gated. Decision density: one founder call on the archived export script, and a stop/continue call if the
prompt count exceeds the threshold.

## Invariants

- **Never remove a plaintext copy until the locked path has served every consumer at least once**,
  through a full cycle (a `/weekly` run, a `/day-cp` run, one deploy) — carried from P1239 via P1316.
  The order of the Done-When items is the control.
- **The lock gates an access, never a state.** No time window, and no grant an agent could satisfy by
  creating a file (P1239).
- **Attribution precedes removal.** Once the plaintext is gone a wrongly-denied prompt breaks real work,
  so every prompt must already name its session and reason (decisions.md 2026-09-08 [technical], P1239).
- **No fallback to a plaintext copy, ever** (`.claude/rules/credentials.md`).
- **Nothing is revoked at a provider by this spec** — revocation is P1148's.
- Credential identifiers stay out of this spec and its commit messages; per-credential detail lives in
  `.private/docs/`.

## Solution

**Observed 2026-09-21 — the failure this spec must survive, for real.** At 15:52 macOS replaced
the login keychain with a fresh one and kept the old file under a renamed name. All 14 locked items
were in the old file, confirmed by name only. `keyring.sh status` reported all 14 not enrolled, and
every locked consumer would have failed closed. It was caught by an ad-hoc status check, not by
`/weekly`. Recovery took three commands (`enroll`, plus `enroll-from .env.prod` for the two prod-tier
names), and `verify` then passed for all 14. **Cause, found later the same day:** the reset was a "Reset My Default Keychain" click, following
agent advice for an unrelated app prompt after a macOS update. The agent then wrongly said the
button "no longer resets anything". The old keychain opened with the current login password and was
swapped back in with a restart, so the original items, the 14 included, are live again. A
keychain-wide reset is never the fix for one app's prompt. **After step 4 those commands have no source.** The same
event then means 14 manual re-enrolls from the password-manager copy. Removal should wait until that
path has been walked once, or until a keychain reset is made to surface the same day.

**Precondition (P1322):** do not start step 4 until P1322's recovery escrow exists and its Always-Allow
check is wired into `/weekly`. *Both hold as of 2026-09-21. The escrow is the founder's
password-manager copy of both env files. The founder waived the restore drill, so the copy is
founder-attested and was not drilled (P1322 Done-When 1). Recovery steps:
`docs/technical/credential-keyring.md` § Recovery.*

1. Run the first real prod migrate, deploy and publish on the locked path, one dialog each, and start
   the prompt count from that date.
2. Record the prompt count over one full `/weekly` + `/day-cp` cycle against the prediction P1322
   re-derives for the current locked set. Above the pre-registered stop-number, stop and revisit.
3. Resolve the one remaining master-key read: an archived prod-export script whose census verdict is
   *read* behind the lock (no scoped credential can bypass RLS for a full export). Delete the script —
   it is not runnable from its archived path and a rewrite cannot reach the read-only helper.
   [FOUNDER DECISION: confirm deletion of the archived export script, or name a reason to keep it.]
4. Remove the plaintext copies of the critical half from the env files, recovering only via P1322's
   escrow (never the deleted plaintext). Update the removal pointer in `.claude/rules/credentials.md`
   to this spec, through `/slava:maintain:claude-md`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A rarely-run consumer breaks only after removal | MITIGATE | Every registered consumer must have run once (not one calendar cycle); the widened grep below |
| Prompt fatigue leads to "Always Allow", silently disabling the gate | MITIGATE | P1322 wires `keyring.sh verify` into `/weekly`; the pre-registered stop-number |
| Removal read as "keys now unreadable" while off-file copies remain | MITIGATE | P1322 owns the off-file reckoning; this spec's scope statement names what removal does and does not cover |
| Lockout after removal (keychain loss / new laptop) | MITIGATE | Blocked on P1322's drill-proven escrow; `migrate.sh` recovery text fixed there |
| The prompt count is inflated by one unusual week | ACCEPT | Revisit only above the stop-number |

**Non-Goals**
- Do NOT start removal before P1322's escrow Done-When holds (it does, as of 2026-09-21).
- Do NOT revoke, rotate or delete any credential at a provider — that is P1148, queued by P1322.
- Do NOT change which credentials are in the locked half.
- Do NOT re-migrate consumers P1316 already moved; a newly found consumer is a P1316-style census entry.

### Progress — 2026-09-29/30 (partial removal, founder-approved in session)

**The measured week, read from `.private/logs/keyring-requests.log` rather than re-run:** 22 locked
reads 2026-09-21 → 09-29 (~20/week), including prod access-token reads (migrate/deploy) on 09-22 and
09-28 and prod master-key reads (publish) on 09-22/28/29 — the locked path works in real use. The count
is **above the ~10 stop-number**; the driver is the event/promotion sessions re-reading the same key
(11 reads across two sessions on 09-28/29). Founder decision: proceed with removal anyway and treat the
count as a comfort problem, not a safety one. The log cannot see reads that bypassed the keychain via
`.env.local`, so consumer coverage was established by grep instead (below).

**Removed from `.env.local` (names verified gone, values never printed; the per-key record is in
`.private/docs/security-log.md` 2026-09-30 — public files name no credentials):**
- 2026-09-29: five locked keys, the prod master key among them, whose consumers were already
  keychain-only; smoke-tested with one locked read.
- 2026-09-30: five more (the blog-admin, social-scheduler, mail-account and bot credentials) after
  moving their file-readers to `keyring_require` — six blog skills incl. `/weekly`, three social
  skills, `promote-email`, `scripts/resend-feedback.sh`. The same pass moved two of those values off
  curl/python **argv** onto stdin/env (both were visible in `ps`). The bot handler reads its token
  from the VM's shell env, not `.env.local`.

**Supabase management tokens (2026-09-30, later):** the account-wide token in `.env.local` was
measured reaching prod (200; bogus-token control 401), so it was replaced rather than locked. Test
paths now use two test-project-scoped tokens — database query (existing) and a new edge-functions
read-write + function-secrets read token — each measured 200 on test and 403 on prod. Switched:
test migrate, test deploy, the test secrets check, the RLS drift check's test fallback, the p1207
audit helper, `/publish` on test (no dialog now), and the p1207 privilege check's env-file selection.
The account-wide token is then removed from `.env.local`, and the prod management token and DB URL
from `.env.prod` — prod paths already read the locked keychain items only. Canary fixtures that fake
the env files carry the new variables (p890, p1042, p1168, p1173, p1174, p1211; each failed before).
Not exercised: a real test function deploy (it would overwrite a co-tenant's test deploy).

### Scope of the removal (2026-10-06)

Removal covers the two env files only. It does **not** make the locked keys unreadable while P1322's
off-file copies remain: session transcripts, restic snapshots, the cloud VM, CI secrets (the CI DB-URL
copy is explicitly out of scope in the registry), and the password-manager escrow. Supabase management
tokens are regenerable, so they are recovered by minting a new scoped token, not by restoring
(security-log 2026-09-30).

## Done-When

- [x] P1322's escrow Done-When holds (recovery drill passed on a clean keychain; `/weekly` runs
      `keyring.sh verify`) — this spec does not start step 4 until then
      — *2026-09-21:* holds by founder decision, and the drill clause is waived. The escrow is a
      password-manager copy of both env files. `/weekly` step 2.10.3 runs `keyring.sh verify`. See P1322
      Done-When 1 for what this does and does not prove.
- [x] The first real prod migrate, deploy and publish each complete on the locked path with one dialog,
      while the plaintext copy still exists; the prompt count starts from that date
      — *2026-10-05, from `.private/logs/keyring-requests.log`:* prod migrate 2026-09-17 (`migrate.sh
      --env prod`), prod publish 2026-09-28 (`promote-to-prod ikigai1`), both while the plaintext copy
      existed. **Deviation:** the first prod deploy on the locked path was 2026-10-02 (P1380), *after*
      the prod token's plaintext was removed (09-30), and it cost one dialog **per function** (3), not
      one per deploy. That is stronger evidence the path works and weaker on the dialog count.
- [x] Prompt count over one full `/weekly` + `/day-cp` cycle is recorded against P1322's re-derived
      prediction, AND every registered consumer of the locked set has run at least once — above the
      pre-registered stop-number, stop and revisit before removing anything
      — *2026-10-06, accepted by the founder:* the count is recorded (Progress, ~20/week against the ~10 stop-number;
      the founder chose to proceed). The consumer half fails: per the log, **five registered names have
      never been read through the keychain**: the two Postiz credentials (already removed from
      `.env.local` on 09-30, so `/promote-blog`, `/insight-post` and `/gen-image` are unproven since),
      the prod DB URL (no consumer found anywhere), the local DB URL (de-registered, see box 5), and
      the mailbox password added 2026-10-05. Founder, 2026-10-06: a proving Postiz run is "no need
      yet", so the Postiz path stays unproven until its next real use.
- [x] The archived prod-export script is deleted (or kept with a founder-named reason), and a grep for
      the key across `.claude/commands/slava/`, `scripts/`, `e2e/`, `supabase/`, `tools/` and
      `.github/` returns only files whose verdict is *write* or *warning text only*
      — *2026-10-06, done (founder approved deleting all three):* the export script was
      `scripts/archive/migrations/20260425-copy-prod-to-test.mjs`. It already reads behind the lock
      (`keyringGet`). Two more archived scripts also read the prod master key through the lock:
      `20260813-p1055-cmp-points.mjs` and `20260622-number-webinar-titles.ts`. All three are deleted.
      Every remaining reader of the key reads it through the lock: `test-p1316-master-key-consumers.sh`
      passes 17/0, including "no plaintext read of the master key under scripts/, skills, workflows".
- [x] The plaintext copies are removed from `.env.local`/`.env.prod`, verified by checking the key
      **names** are gone (never by printing values), and every consumer still runs afterwards
      — *2026-10-05, names-only check against `.private/docs/keyring-critical.txt` (15 names):*
      `.env.prod` holds none; `.env.local` still holds **one**, the local (test-project) DB URL, read
      in plaintext by `migrate.sh` on test. To remove it, `migrate.sh` would move to `keyring_require`,
      which puts a dialog on every test migrate. **Founder, 2026-10-06: de-register it instead.** It
      opens the test project only. This overrides the non-goal "do not change the locked set" for this
      one name. Re-checked after the change: neither env file holds any of the 14 registered names.
      The P1316 canary passes 17/0.
- [x] A scope statement records that removal covers the env files only, and that the off-file copies
      (transcripts, restic, cloud VM, CI, second store) were handled or accepted by P1322 — removal is
      not claimed as "keys unreadable" while any accepted copy remains
      — *2026-10-06:* § Scope of the removal, above. P1322 (which owns the off-file copies) is closed in
      `features/done/`.
- [x] `.claude/rules/credentials.md` names this spec as the removal gate
      — *2026-10-05:* the stale "both halves hold the same values / P1316" paragraph is replaced (gate run).
- [x] Nothing was revoked at any provider by this spec
      — *2026-10-06, ticked as attributed to P1148 (founder decision):* `.private/docs/security-log.md` 2026-09-30 records
      the founder deleting the legacy Supabase management tokens in the dashboard during this
      spec's session, once the scoped replacements were measured. The founder did the deleting, not
      an agent. Those deletions count as P1148's rotation work. This spec's own changes revoked nothing.

## Open Questions

- ~~**Supabase tokens (2026-09-30):** is the test-side management token account-wide?~~ Yes — replaced by test-scoped tokens (see Progress).

1. **The two in-process Python consumers the drift audit cannot see** (filed in the private inbox
   2026-09-15) — fix the audit's matcher before removal, or accept the blind spot for two known files?
2. **The two payment links' liveness** — the HTTP probe was blind (a fake link returned the same page);
   checking them needs the provider dashboard. Not assessed.

## Related

- [P1316](p1316_finish_moving_remaining_master_key_consumers.md) — the consumer migration this finishes; its time-gated items moved here
- [P1239](p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md) — the per-access lock
- [P1214](p1214_credential_separation_and_privilege_reduction.md) — credential separation
- [P1148](../../p1148_credential_rotation_system.md) — rotation and revocation execution
