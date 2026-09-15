---
status: week
type: task
rank: 100
workstream: keyring
created_date: '2026-09-15'
tags: [security, credentials, least-privilege, supabase]
disclosure: public
related: [p1214, p1239, p1148]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1316: Finish moving the remaining consumers of the prod master key, then remove the plaintext copies

## Problem

**Situation:** P1214 moved the daily checks, the read-only skills and the prod writers of the
management token onto weaker credentials or the per-access lock (P1239), and issued the scoped
tokens that made that possible. The account-wide Supabase CLI login is gone from the machine.

**Complication:** Nothing has left the plaintext env files yet — every critical credential is still
readable there by any process. Removing those copies is this spec's last Done-When item (absorbed from P1239), and it is
deliberately sequenced last: removing a copy while something still reads it breaks that consumer
silently. On 2026-09-15 a grep of the P1214 branch still found the prod master key **named** in 20
skill files (including `/day-cp`), 7 scripts and 3 archived scripts. Some of those are probably
warning text ("never switch back to the master key"), not reads — that has not been checked file by
file. P1214's original Done-When list for this work was never completed, and its drift-audit
criterion could not even be run (`audit-credential-drift.sh --audit` exited 2).

**Question:** Which of the remaining files actually use the master key, what does each one really
need, and — once every consumer is on its right credential and a real cycle has been measured — can
the plaintext copies finally be removed?

**Scope absorbed 2026-09-15:** P1239's three remaining Done-When items moved here when P1239 closed
(founder: one open keyring spec, not a second spec that can only close after this one).

> Founder framing, verbatim (2026-09-15): "did we eliminate something from .env.local and put it
> somewhere else? Or that is part of some future thing?" — this spec is that future thing, including
> the removal.

## Appetite

Blast radius: medium — event-promotion, publishing and content skills plus a handful of scripts;
a wrong verdict either breaks a skill run or leaves a consumer on the plaintext copy. Reversibility:
high until the final step — every change before it is a skill or script edit; the plaintext removal
is the one step that is hard to undo, which is why it is last and gated on a measured cycle.
Decision density: low — the verdict rule was settled on 2026-09-08 and applied across P1214.

## Invariants

- **Weaker credential first, lock second** (decisions.md 2026-09-08). A consumer that only reads
  gets a narrower credential; only a genuine write goes behind the per-access lock. Friction added
  to guard a credential the task should not hold is a fix at the wrong layer.
- **No fallback to the plaintext copy, ever** (`.claude/rules/credentials.md`). A declined dialog or
  a missing scoped token exits non-zero and says so.
- **Verdicts are read, not grepped.** A filename or a variable name in a file is not a read; each
  verdict names the write form found (direct, shell-out, RPC, client library) or states none.
- **Credential identifiers stay out of this spec and its commit messages** — describe them
  generically; the per-file table lives in `.private/`.
- **The drift audit is trusted only after it runs against real data** (decisions.md 2026-08-24).
- **Carried from P1239 — never remove a plaintext copy until the locked path has served every
  consumer at least once**, through a full cycle (a `/weekly` run, a `/day-cp` run, one deploy). The
  order of the Done-When items below is the control, not a suggestion.
- **Carried from P1239 — the lock gates an access, never a state.** No time window, and no grant an
  agent could satisfy by creating a file.

## Solution

1. **Census.** For each remaining file that names the prod master key (skills, scripts and
   `scripts/archive/`), read it and record a verdict: *warning text only*, *read* (→ the read-only
   helper or another scoped credential), or *write* (→ the per-access lock). The table goes in
   `.private/docs/`; the spec carries the counts.
2. **Migrate** each read and write per its verdict, reusing P1214's patterns: the read-only SQL
   helper, `keyring_require` on the prod-tier name, and headers passed from a file rather than argv.
3. **Carry P1214's unfinished original criteria** (below) and the two items P1214 could not close
   before its push: removing the master key from the stranded-signups workflow once CI proves the
   scoped token, and the first real prod migrate, deploy and publish on the locked path.
4. **Retirement candidates.** Give each of the 28 candidates a verdict — retired or live elsewhere —
   naming the consumer and which deployed surfaces were enumerated live.
5. **Measure, then remove.** Record the prompt count over one full `/weekly` + `/day-cp` cycle on the
   locked path. If it is above roughly 10 a week, stop and revisit. Otherwise remove the plaintext
   copies of the critical half, keeping the recovery drill (`keyring.sh enroll` from the plaintext
   source) re-runnable until the removal is verified.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A skill that only runs occasionally (event promotion) breaks on its next real run | MITIGATE | Each migrated skill gets one real or dry run before its box is ticked |
| Some hits are warning text and inflate the work estimate | ACCEPT | The census classifies them; they need no change |
| The drift audit's exit 2 hides a real defect in the audit itself | MITIGATE | First Done-When item: find out why it cannot run |
| Unattended CI loses the stranded-signups check if the master key is removed before the scoped token is proven | MITIGATE | Remove only after a CI summary reports the scoped credential |

**Non-Goals**
- Do NOT remove any plaintext copy before every Done-When item above the removal holds (see Invariants).
- Do NOT revoke or delete any credential at a provider — rotation and retirement execution is P1148.
- Do NOT change which credentials are in the locked half — the registry is P1239's.

## Done-When

- [ ] `audit-credential-drift.sh --audit` runs to completion (it exited 2 on 2026-09-15); cause recorded
- [ ] Every file that names the prod master key — skills, scripts **and** `scripts/archive/` — has a
      written verdict derived from reading it, naming the write form found or stating none
- [ ] A grep for the prod master key across `.claude/commands/slava/` and `scripts/` returns only
      files whose verdict is *write* or *warning text only*; `/day-cp` reads nothing through it
- [ ] `git diff --stat .agents/skills/` shows only changes produced by `scripts/sync-agent-skills.sh`
- [ ] Every credential minted by this work has a registry row and a `manual-only` declaration dated
      before its first use
- [ ] `/day-cp` completes its user-activity block with the master key unset in the environment, and
      the reduced principal's allowed and denied RPC set is recorded
- [ ] Each of the 28 retirement candidates carries a verdict (retired | live elsewhere) naming the
      consumer and the deployed surfaces enumerated live — not only the directories grepped
- [ ] Every credential marked retired carries a liveness probe with its expected status, and the
      handoff queue to P1148 is a standing `/weekly` item until empty
- [ ] `audit-credential-drift.sh --audit` reports no `MULTI_KEY_ROW_BUNDLED` for the prod/test
      service-role pair, and the prod master-key row's documented consumer list matches live
- [ ] The stranded-signups CI summary reports the scoped read-only credential, and the master key is
      then removed from that workflow
- [ ] The first real prod migrate, deploy and publish each complete on the locked path with one
      dialog, while the plaintext copy still exists; the prompt count starts from that date
- [ ] Prompt count over one full `/weekly` + `/day-cp` cycle is recorded and compared to the ~4/week
      prediction (from P1239) — above ~10/week, stop and revisit before removing anything
- [ ] The critical half is unreadable on disk without a confirmation — the plaintext copies are removed,
      verified by reading the env files, and every consumer still runs afterwards
- [ ] Nothing was revoked at any provider by this spec (rotation and retirement execution stay P1148)

## Open Questions (carried over 2026-09-15 — none of these was answered before P1214 or P1239 closed)

1. **The CI-side copy of the prod database connection string.** A second copy lives in the CI
   provider's secret store, read nightly by one scheduled backup job — the only critical-tier
   credential in any workflow. The local lock cannot reach it, so standing prod-DB access remains
   readable to anything that compromises the source-control account or a workflow. **Not assessed:**
   whether that different adversary is acceptable, or whether the copy needs its own control.
   (From P1214 Open Question 4, which P1239 had routed there.)
2. **A syscall-level read block on a few named credential paths.** Narrower than the session
   sandboxing P1214 rejected on 2026-09-01, and half of that rejection's reasoning no longer holds
   for the locked set. Whether the narrow form falls inside the rejection is a **founder call**. The
   two mechanisms already ruled out by measurement stay recorded in P1239 Open Question 4 — do not
   re-measure them. (From P1239 Open Question 4 and P1214's sandbox Non-Goal.)
3. **Guarding the second local credential store** — four live secrets outside the plaintext env
   file (names in `.private/docs/security-log.md`), one of them duplicated. Do they join the locked
   half, get their own guard, or stay put? Rotating them is P1148's inventory item; guarding them is
   open here. (From P1239 Open Question 5.)
4. **The test project's master key is still in the legacy format.** Migrate it in the same pass as
   the consumer census, or after? Not assessed. (From P1214 Open Question 3.)

## Related

- [P1214](p1214_credential_separation_and_privilege_reduction.md) — the consumer migration this finishes
- [P1239](p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md) — the per-access lock: design, rationale and rejected alternatives; its remaining Done-When moved here
- [P1148](p1148_credential_rotation_system.md) — rotation and retirement execution
