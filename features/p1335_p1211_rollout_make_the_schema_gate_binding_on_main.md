---
status: today
type: task
rank: 2
workstream: infrastructure
created_date: '2026-09-21'
tags: [migrations, push, ci, rollout]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1335: P1211 rollout — make the schema gate binding on `main`

## Problem

**Situation:** P1211 built the schema gate (`check-schema-ready.sh`, the `git-ops.sh` push-command
gate, the `schema-ready` workflow, `/push` steps 2.5 and 6) and proved each piece before merge:
canaries with mutants, live prod-ledger controls, real `git-ops.sh` replays, and on 2026-09-21
`schema-ready` green on staging SHA `1f7dfded2` and red on the fabricated `b1c1483e4` (`disclosure`
red too; both refs deleted).
**Complication:** P1211's acceptance list also held steps that only exist after the merge — a real
`/push`, making the check required, `--post` after a real promote. `/ship` refuses to merge while any
box is unticked, so those boxes deadlocked the close. Per decisions.md 2026-09-15, P1211 ticks what a
command proved and carries `[post-deploy]` clauses; the real remaining work moves here.
**Question:** Until `schema-ready` is a required check on `main`, the gate runs but binds nothing on
GitHub. What must happen, in what order, to make it binding without weakening the P919 credential
boundary?

> Founder framing, verbatim: *"Do we continue right here, and why not continue and finish now? I
> mean, why are we splitting at all, if we want to complete everything?"*

The answer recorded here: nothing is postponed — this spec is worked in the same session, straight
after `/ship p1211`. The split exists only because a completion box cannot be ticked before the merge
it depends on.

## Appetite

Blast radius: every push to `main` once the check is required (a false positive blocks every
migration-carrying deploy). Reversible: the required check is removed in the web UI in one step.
Decision density: low — the order and the credential posture are already decided (below).

## Invariants

- **The agent's credential holds no Administration scope** (decisions.md, P919 posture; and the
  credential cutover entry "Replace the `gh` keyring token with a fine-grained PAT"). On 2026-09-21 a
  `gh auth login` replaced that PAT with an admin-scoped OAuth token (`repo` scope, `admin: true`,
  read-only probe). The ruleset change is therefore made by the founder **in the GitHub web UI**,
  never via the agent's `gh api`.
- **Observe before requiring** (P1211 C3): the check must be seen green and red on real pushes before
  it is required — done 2026-09-21, see Problem.

## Solution

In order:
1. Restore the fine-grained `cp-agent-push` PAT as the `gh` credential; confirm with the read-only
   probe that `repos/<repo>/branches/main/protection` returns 403 again.
2. After `/ship p1211`: one real `/push` of that range — the first run of the new steps on the shared
   checkout.
3. Founder adds `schema-ready` to `main-privacy-gate`'s required status checks in the web UI. In the
   same agent commit, `schema-ready` is appended to `REQUIRED_CHECKS_FALLBACK` in
   `scripts/lib-required-checks.sh` (P1211 C3 / Fable #7) — the agent never edits the ruleset itself.
4. Run the server-boundary and end-to-end proofs below.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A false positive blocks every migration-carrying push | MITIGATE | Docs-only and invalid-token runs below; removal is one web-UI step |
| The admin OAuth token stays because nothing forces the swap back | MITIGATE | Step 1 is first, with the 403 probe as evidence |
| GitHub UI merges judge a PR against a stale base (no merge queue) | ACCEPT | Stated in P1211; merge queue is a separate decision |

**Non-Goals**
- Do NOT change the gate's logic here — defects found go to their own spec.
- Do NOT edit the ruleset from the agent's credential, even if it can.

## Done-When

- [ ] `gh` is back on the fine-grained PAT: the protection probe returns 403 (pasted).
- [ ] Real `/push` of the P1211 range: exit 0, `origin/main...HEAD` = `0 0` (pasted).
- [ ] Docs-only `/push` with the ledger reachable passes; with `SUPABASE_READONLY_TOKEN` invalid it
      passes with the skip warning (P1211 C1-level evidence already recorded).
- [ ] Replay of 2026-09-18 via `/push` on local `main` (scratch commit, fabricated client-safe
      migration, keychain dialog declined): step 2.5 STOPs, nothing is pushed, scratch commit dropped.
- [ ] `schema-ready` in `main`'s required checks (founder, web UI; rulesets JSON before/after pasted)
      and in `REQUIRED_CHECKS_FALLBACK`; `push-docs` waited for it on one real push.
- [ ] Server boundary: throwaway staging SHA with a fabricated migration and a spec lacking
      `disclosure:` — a promote attempt is refused `GH013` and the message names `schema-ready`
      (Codex #16). Branch deleted.
- [ ] Narrow range (Fable #2): that staging branch re-pushed with one unrelated commit — still red.
- [ ] End to end: a real `/push` of a migration-carrying range — step 2.5 applied it, the stamp rode
      the push, no leftover stamp commit.
- [ ] `--post` / step 6 after a real promote carrying a coupled fixture: it waits for the Production
      deployment before applying; with the deploy stubbed failed it does not apply.
- [ ] Deadlock case live on the **test** project (`migrate.sh --only`), then the fabricated ledger row
      removed — the DELETE needs the founder's explicit OK.
- [ ] Vercel Production Branch = `main`, confirmed by the founder.

## Rollback Strategy

Remove `schema-ready` from the required checks in the web UI and from `REQUIRED_CHECKS_FALLBACK`.
Nothing else in P1211 needs reverting for the rollback.

## Related

- [p1211](p1211_frontend_ships_ahead_of_its_migration_with_no_gate.md) — the gate itself.
- [p1290](p1290_push_docs_promotes_while_a_second_required_check_is_still_queued.md) — how
  `push-docs` derives the required-check list.
