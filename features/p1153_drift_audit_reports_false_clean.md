---
status: week
type: task
rank: 67
workstream: infrastructure
created_date: '2026-08-24'
tags: [security, credentials, audit, silent-skip]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: anomaly
---

# P1153: The drift audit reports a false all-clear, and P1148 is sized on it

## Problem

**Situation:** P1147 shipped the credential drift audit on 2026-08-23. Its first run against
real data (2026-08-23, this session) exits 0 and reports `COVERAGE:84/84:not-enumerated=1` — a
clean bill of health.

**Complication:** Three of its finding classes are wrong, all verified by command against the
live registries and env files. The coverage ratio silently drops ten real credentials; roughly
half the retirement findings name credentials that are actively read at build time and at
runtime; and every registry-disagreement finding in the run was two registries *agreeing* in
different prose. P1148 (rotation system) is explicitly blocked on this audit's classification
data — its Done-When section reads *"Deferred until P1147 lands — the classification data
determines how many rotators exist and which tiers they fall in."* Building the rotation
system's per-provider surface on this output means sizing it against an inventory that is wrong
in both directions.

**Question:** What must the audit report correctly before its output can size P1148?

### The three defects, with the evidence that established each

**D-1 — `COVERAGE` excludes unparseable lines from both halves of the ratio.**
`TOTAL_REACHABLE` is computed from `LIVE_KEYS`, which is derived only from `CLASSIFIED:` lines
(`scripts/audit-credential-drift.sh:320-321`, ratio emitted at `:481`). Lines emitted as
`UNPARSEABLE:` never enter it. The real run produced **10 `UNPARSEABLE:` lines in `.env.local`**,
each carrying a live credential whose key name is not shell-legal (lowercase, dots). They are
neither counted as classified nor as reachable, so the ratio reads 84/84 instead of 84/94.

This is the **silent-skip-equals-clean** pattern that P1147's own KDD records finding three times
(`49c2d2bf`) — now reproduced inside the metric that was supposed to make skipping visible. The
script is honest at the line level (it *does* emit `UNPARSEABLE:` for every one, dropping none);
the defect is only that the summary ratio does not reflect them.

**D-2 — the consumer scan misses real consumer surfaces, producing false retirements.**
The audit is invoked with `--consumers-dir src --consumers-dir supabase/functions
--consumers-dir scripts` (`.claude/commands/slava/maintain/weekly/SKILL.md:442`). Genuine
consumers live outside all three. Verified reads, not prose mentions:

| Surface | Evidence | Why it matters |
|---|---|---|
| repo root | `vite.config.ts:149` — `process.env.SENTRY_AUTH_TOKEN` | build-time consumer |
| `services/` | `services/transcribe/config.py:22` — `os.getenv("HF_TOKEN")` | whole service tree unscanned |
| `.claude/commands/` | `prep-email.md:251` — `process.env.GHOST_ADMIN_API_KEY` | skills consume credentials |

**Control check (the check P1125 was rejected for omitting):** every one of the 41
`RETIREMENT_CANDIDATE` keys was grepped across the repo excluding `.env*` and `.private/`.
**21 of 41 are referenced in live code.** A probe that returns "retire this" for a key read on
every production build is not reporting staleness — it is reporting where it looked. The same
under-scoping inflates the 33 `CONSUMER_LIST_STALE` findings, which compare a documented
consumer count against the same incomplete live count.

**D-3 — the tier comparison is a raw string compare including free prose.**
`scripts/audit-credential-drift.sh:449` emits `REGISTRY_MISMATCH` when `[[ "$tier_a" !=
"$tier_n" ]]`, comparing the entire tier cell. Registry cells carry a backticked tier token plus
an explanatory parenthetical, so identical classifications with different wording flag as drift:

```
`not-a-secret` (domain name + region code)
`not-a-secret` (domain name, not a credential)
```

**3 of 3** `REGISTRY_MISMATCH` findings in the real run were of this shape; extracting the
backticked token from each collapses all three to a single agreed tier. Beyond the false
positives, this is why D-3 blocks P1148 hardest: P1148 requires that adding a credential means
*"one rotator file, one registry row, no driver edit"*, which needs the driver to read a tier
mechanically from the registry. There is currently no normalized tier token to read.

**Not a defect, but adjacent:** the run also emitted `PLAINTEXT_CHECK_SKIPPED` ×3 and
`LOCATION_CHECK_SKIPPED` ×2 against `.private/docs/accounts.md`, meaning the one hard-fail check
did not run for three of its tables. The script reports this honestly and `/weekly` already
routes it to ACTIONS — the mechanism is correct. The gap is the registry's table shape, which is
a private-doc edit, not a code change. Tracked here as context; see Non-Goals.

## Appetite

**Blast radius: medium.** One read-only script plus its test suite. It mints nothing, writes no
credential, and touches no product surface. But its output gates P1148, and it prints a
line into `/weekly` that the founder is meant to trust.

**Reversibility: high.** Every change is to a single script and a single test file; `git revert`
restores the prior behaviour with no external state to unwind.

**Decision density: low.** One founder decision only — whether the coverage denominator counts
unparseable lines (D-1 fix) or whether those ten credentials should instead be renamed to
shell-legal keys at source. Both are defensible; see Risks.

## Solution

Three independent changes to `scripts/audit-credential-drift.sh`, each with a test that is
observed **failing first** (epistemic gate 7 — a gate not seen red is unproven):

1. **Count what was skipped.** Introduce an explicit unclassifiable count and surface it in the
   summary rather than dropping it — the ratio must never be able to read 100% while any line
   went unexamined. Whether that appears as a widened denominator or a separate mandatory
   `UNCLASSIFIABLE:<n>` field is an implementation choice for `/dev`; the invariant is that a
   reader cannot see a clean summary when lines were skipped.

2. **Widen the consumer scan, and make its scope self-reporting.** Add the repo root,
   `services/`, and `.claude/commands/` to the scanned surfaces. Because "where it looked"
   turned out to be the actual finding, the audit must also emit the consumer surfaces it
   scanned, so a future false retirement is attributable from the output alone rather than
   requiring someone to re-derive it.

3. **Compare normalized tier tokens.** Extract the backticked tier token from each registry cell
   and compare tokens, not cells. A row carrying no recognizable token must report as
   unclassifiable rather than silently comparing equal to another token-less row — the same
   silent-skip trap in a different place.

## Risks / Non-Goals

### Risks

- **The widened scan introduces false *negatives* (the opposite error): a genuinely dead
  credential mentioned only in a doc or an archived spec now looks live.** `docs/` and
  `features/done/` contain prose references to retired credentials. Mitigation: scan for
  *reads* (`process.env.X`, `os.getenv("X")`, `$X`), not bare name occurrences, and keep
  documentation trees out of the consumer scan. A test must cover a name that appears only in
  prose and confirm it still reports as a retirement candidate.
- **Fixing D-1 makes the weekly line go from green to amber and stay there** until the ten
  non-shell-legal credentials are dealt with. That is the correct signal, but a permanently
  amber line gets ignored just like a permanently green one. Mitigation: the follow-up decision
  in Done-When must be taken, not deferred indefinitely.
- **Re-running against real data risks putting credential material into an agent transcript.**
  Mitigation: unchanged from P1147 — capture to a `600` file outside the repo, read aggregates,
  never paste raw output. This spec's own evidence was gathered that way.

### Non-Goals

- Do NOT start P1148 until this lands and the audit has been re-run.
- Do NOT change what the script *does* to credentials — it stays strictly read-only: no mint, no
  write, no revoke, no `source` of any env file.
- Do NOT rename the ten non-shell-legal credential keys as part of this spec. Deciding their
  fate is a separate founder call; this spec only makes them impossible to miss.
- Do NOT edit `.private/docs/accounts.md` to fix the skipped plaintext/location checks — a
  registry-shape change is its own piece of work with its own review.
- Do NOT widen the scan to `docs/` or `features/` — prose mentions are not consumers, and
  treating them as such creates the inverse defect.
- Do NOT put any real credential name or value into this spec, the test file, or any commit.
  Test fixtures stay 100% synthetic per `.claude/rules/pii.md`.

### Alternatives Considered

- **Fix only the false green line (D-1), leave D-2 and D-3.** Rejected: kills the misleading
  weekly signal but leaves P1148 sized on a retirement count that is wrong by 21, which was the
  reason to run the audit at all.
- **Correct the inventory by hand and carry a known-wrong list through P1148's build.** Rejected:
  makes a person the check, and the same gap reappears for every credential added later.
- **Widen the scan by simply grepping the whole repo for each key name.** Rejected: produces the
  false-negative failure in Risks above — every retired credential named in `docs/decisions.md`
  or an archived spec would read as live.

### Rollback Strategy

`git revert` the commit. The script is read-only and holds no state, so reverting restores prior
behaviour exactly; the only consequence is that the next `/weekly` prints the old (false-clean)
line again.

## Done-When

- [ ] A run where any line is unparseable cannot print a summary that reads fully clean —
      demonstrated by pointing the audit at a fixture containing one unparseable line
- [ ] Each of the three fixes has a test that was observed **failing before** the fix and
      passing after — exit codes pasted for the red run, not asserted from reasoning
- [ ] A credential read only at build time (repo root) is not reported as a retirement candidate
- [ ] A credential read only from a service tree or a skill file is not reported as a retirement
      candidate
- [ ] A credential named only in prose in `docs/` **is** still reported as a retirement
      candidate (the inverse case, protecting against over-widening)
- [ ] Two registry rows carrying the same tier token with different parenthetical wording
      produce no `REGISTRY_MISMATCH`
- [ ] Two registry rows carrying genuinely different tier tokens still produce one
- [ ] A registry row with no recognizable tier token reports as unclassifiable, not as a match
- [ ] The audit's output names the consumer surfaces it scanned
- [ ] Re-run against real data: the retirement-candidate count is re-derived, and every
      remaining candidate is confirmed unreferenced by the same control grep used here
- [ ] Test fixtures contain no real credential name or value
- [ ] No secret value in the terminal, the test file, or any commit

## Related

- **Predecessor:** P1147 (credential drift audit) — this fixes defects in what it shipped.
- **Blocks:** P1148 (credential rotation system) — its Done-When is deferred pending this data.
- **Pattern precedent:** P1125 — rejected because its premise rested on a probe blind to half its
  input. The control grep in D-2 exists specifically to avoid repeating that.
