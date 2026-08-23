---
status: qa
type: task
rank: 63
workstream: infrastructure
created_date: '2026-08-21'
tags: [security, credentials, audit, drift]
delivery_stage: ship
pipeline_ran: [create-spec, challenge-prd, generate-tests, dev, ship]
driver: anomaly
uat_file: features/uat/p1147.md
test_files:
  - scripts/audit-credential-drift.test.sh
---

# P1147: Credential drift audit — classify every secret, detect drift in three directions

## Problem

**Situation:** Two private registries document credentials — an account-level one and an
edge-function one. Between them they hold 15 rows (plus 2 documented in prose). The three local
env files hold **43 unique secrets** by name, plus at least 2 more on malformed lines the obvious
parser cannot see.

**Complication:** **33 of 43 (77%) are in neither registry**, and nothing detects that. Nothing
ever will, because no mechanism has the job. Three separate drift instances exist *today*, all
verified by command:

1. **Three registry-documented credentials have no entry in any env file.** Two of those rows
   explicitly name a local env file in their "stored elsewhere" column — the registry does not
   merely omit them, it **asserts a storage location that does not hold**. One is a service-account
   key with no local copy at all, i.e. no rollback source exists for it right now.
2. **Registry-vs-registry disagreement.** One key is documented with two different values in the
   two registries. That key is low-stakes; another dual-registered credential is not.
3. **Consumer lists in the registry are stale against live code.** One secret is documented with
   one consumer and has two; another is documented with five and has six.

Meanwhile the same day this spec was filed, `docs/decisions.md` recorded a live incident: sourcing
a local env file echoed several unrelated third-party credentials into a session transcript,
because that file contains lines that are not valid shell assignments. **Those are the same
malformed lines any naive audit parser silently skips** — so the keys most likely to be mishandled
are exactly the ones a careless implementation would report as clean.

**Question:** What mechanism establishes, and keeps establishing, that every credential is known,
correctly located, and correctly described?

## Appetite

**Blast radius: low.** This spec reads and compares. It mints nothing, writes no credential, and
revokes nothing. Its worst failure is a wrong report, not an outage.

**Reversibility: total.** One script plus additive registry columns. Deleting the script removes
the system.

**Decision density: low, and honestly so.** The four decisions this scope depends on were resolved
after adversarial review (see Resolved Decisions). Rotation's genuinely hard decisions — authority
model, rollback storage, verify discrimination — are **out of scope here** and recorded in the
successor spec.

**Sizing, which the predecessor scope never stated:** classification is ~46 credentials × (tier +
`never-rotate` screen). No `verify_cmd` execution, no per-provider rotators. That is the cheap
half, and it produces the data that would size the expensive half with facts instead of estimates.

## Solution

Two components: registry columns, and one audit script.

### 1. Registry columns

Both existing registries gain: `tier`, `consumers`, `interval`, `last_rotated`, `status`.
No new registry file — the existing two stay authoritative, and ~20 documents already reference
them (`.private/docs/accounts.md`, `.private/docs/edge-function-secrets.md`; the paths are already
named in public committed files, so naming them here adds no exposure).

`tier` values: `auto-api` · `browser-assisted` · `manual-only` · `never-rotate` · `not-a-secret`.

Two rules on `tier`, both structural rather than left to judgment:

- **Meta-authority is `browser-assisted` by definition.** Any credential that can mint,
  administer, or revoke *other* credentials is barred from `auto-api` — not classified into it by
  a judgment call. This is [decisions.md](../docs/decisions.md) 2026-06-27's reusable pattern
  ("the agent's credential must be unable to administer the gate it's subject to") applied to a
  static registry field instead of a runtime property.
- **`never-rotate` must state what breaks**, and distinguish *data loss* from *inconvenience*.
  The two currently share one word in the existing registries; collapsing them teaches every
  future reader that `never-rotate` means "annoying," which is how it eventually gets overridden.

### 2. The audit script

Reports drift in **three** directions, not two:

| Direction | Detects |
|---|---|
| consumer → registry | a live key nobody classified |
| registry → consumer | a documented credential that lives nowhere, or claims a location it does not occupy |
| registry → registry | the same key described two different ways in the two registries |

**The parser is the correctness surface, not an implementation detail.** A `^[A-Z_][A-Z0-9_]*=`
parser misses 8 of 84 lines in the largest env file — 4 lowercase-named, and 4 that yield no key
at all. Those last 4 cannot even be *reported* as unclassified, because no name is emitted. Every
line that is neither blank nor a comment must produce either a classified key or an explicit
unparseable-line finding.

**Unreachable surfaces are declared, never silently counted as clean.** The CI secret surface
returns HTTP 403 to the agent's credential **by deliberate design** — the audit must report it as
*not enumerated* rather than contributing zero unclassified keys to a total that then reads as
complete coverage.

## Risks / Non-Goals

### Risks

- **A parser that reports clean over what it cannot see** — the failure this spec exists to
  prevent, reproducible today on 8 real lines. Mitigation: unparseable lines are a finding class,
  and the Done-When fixture is a malformed key, not a well-formed one.
- **Reading the registries loads secrets into agent context** — one registry row currently holds a
  plaintext password inline. Mitigation: that value is removed under a separate action before this
  script is written; the audit compares fingerprints only.
- **Classification drifts the moment it is finished.** Mitigation: the audit is the ongoing check,
  not the classification pass; it runs in `/weekly`.

### Non-Goals

- Do NOT mint, write, rotate, or revoke any credential. This spec **reads**. Rotation is the
  successor spec.
- Do NOT build rotator plugins, a driver, or a rollback vault here.
- Do NOT print any secret value anywhere — context, terminal, or file. Fingerprints only
  (`first2…last2(length)`), matching the existing secret-audit skill's discipline.
- Do NOT store any secret value in either registry — and treat an existing one as a finding.
- Do NOT use `source` on any env file. That is the mechanism of the 2026-08-21 incident, and it is
  still present in 11 files in this repo. Parse line-by-line.
- Do NOT pass any secret as a shell argument (visible in `ps`) — file-based or stdin only.
- Do NOT create a third registry.

### Alternatives Considered

- **Full five-component rotation system** (the predecessor scope). Rejected for now on adversarial
  review: two independent reviewers returned RETHINK, and the decisive argument was that every
  value claim the spec made was a claim about *this* component. Deferred, not abandoned — the
  ordering design survived both attacks and is preserved in the successor spec.
- **Derive everything at runtime, no registry columns.** Rejected: `never-rotate` and its
  justification have nowhere to live.
- **New registry in the private personal repo.** Rejected on evidence: the existing location is
  inside the whole-home backup (verified against the backup script's exclude list), and ~20
  documents reference it.
- **Two-direction audit** (consumer ↔ registry only). Rejected: registry-vs-registry drift exists
  today and would be invisible.

### Rollback Strategy

Delete the script. The registry columns are inert without it and carry independent documentary
value.

## Done-When

- [x] Every key in every **reachable** consumer surface is classified in a registry, or listed as
      an accepted exclusion with a reason — `COVERAGE:84/84:not-enumerated=1`, zero
      `CONSUMER_ONLY` findings, zero `PLAINTEXT_IN_REGISTRY`, zero `REGISTRY_LOCATION_MISMATCH`.
      2026-08-23 founder classification session: ~24 keys classified with high confidence
      (build-time-public `VITE_`/`NEXT_PUBLIC_` vars, already-documented email accounts), ~45
      more proposed by an agent from naming convention + repo context and confirmed in batch by
      the founder rather than verified line-by-item — real, but lower-confidence than the rows
      `/challenge-prd` and `/dev` produced. Each such row is labeled `candidate` in the registry
      so a future reader can tell which classifications were individually reasoned about vs.
      batch-confirmed. Two rows (`GOOGLE_APPLICATION_CREDENTIALS`, `GITHUB_PAT`) are marked
      **unconfirmed** — IAM-role/staleness questions the founder still needs to answer, not
      resolved by this pass.
- [x] Every surface the agent's credential **cannot** enumerate is named in the audit's output as
      not-enumerated, and excluded from any coverage percentage — mechanism verified (test case F)
      and the one real declared surface (GitHub Actions secrets store, `/weekly` wiring) correctly
      excluded from `COVERAGE`'s denominator in the 84/84 real run. Caveat carried forward: the
      403 itself was never independently triggered live — the exclusion is asserted, not tested
      against the real API.
- [x] Each `never-rotate` row states what breaks, and whether that is data loss or inconvenience —
      true of the one row classified `never-rotate` (`IP_HASH_SECRET`, candidate). No other row in
      the now-fully-classified 84 claims `never-rotate` — every other credential has an ordinary
      manual/on-compromise/not-a-secret path, so there is nothing else this rule needs to check.
- [x] Every newly classified key has been screened for the `never-rotate` property — true of all
      84 keys now that classification is complete.
- [x] The audit reports each of the 3 drift instances that exist today: the credentials with no
      env entry, the registry-vs-registry disagreement, and a stale consumer list — verified
      against **real, current data**, not just synthetic fixtures: `REGISTRY_ONLY` found
      `GCS_SERVICE_ACCOUNT_KEY` with zero env entry anywhere (matches the Problem section's
      "service-account key with no local copy" instance exactly) and `CONSUMER_LIST_STALE` found
      `TALLY_FORM_ID:documented=1:live=2` (matches "documented with one consumer and has two"
      exactly). **Known gap:** a key registered in both registries picks the first `--registry`
      flag's row for its consumer count rather than merging both — `MAILGUN_API_KEY`'s
      accounts.md row (blank Consumers) shadows edge-function-secrets.md's real 5-consumer list,
      so the spec's "documented with five and has six" instance isn't independently reproduced.
      Flagged as follow-up, not fixed this session.
- [x] Running the audit against a deliberately unregistered key with a **malformed, non-`KEY=VALUE`
      name** reports it as a finding (failure path exercised per epistemic gate 7 — a well-formed
      fixture certifies a parser proven blind to 8 real lines) — test case A; also reproduced
      against real `.env.local` (10 UNPARSEABLE lines found, close to the spec's own "8 of 84")
- [x] Every non-blank non-comment line in every env file produces either a classified key or an
      explicit unparseable-line finding — zero silently dropped — test + real-data verified
- [x] Running the audit against a registry row with no live consumer reports a retirement candidate
      — test case E; also reproduced on real data (`GHOST_ADMIN_API_KEY`, `UNSPLASH_SECRET_KEY`)
- [x] No secret value appears in the audit output, either registry, the terminal, or any commit —
      test-verified (independent fingerprint oracle) + real-run verified (zero raw values in
      output; no plaintext exists in either real registry today, confirmed by entropy grep)
- [x] The audit runs as a `/weekly` sub-step — wired as step 2.10.2, committed to `main`
- [x] The registry contains no inline plaintext secret value — confirmed via real-audit run
      (no `PLAINTEXT_IN_REGISTRY` finding) and a manual entropy grep of both files

## Test Coverage Strategy

**Shape:** parser/logic-heavy, not E2E-heavy. This is a standalone CLI script with zero
`src/`/`e2e/`/`supabase/` surface — the standard web-app test pyramid doesn't apply. Coverage is
one hermetic bash test harness (`scripts/audit-credential-drift.test.sh`, in the
`day-gates.sh`/`day-gates.test.sh` pattern — externally-fixtured, no internal `--self-test`
required) plus a CLI-verification UAT file (`features/uat/p1147.md`) for the live-data half the
automated suite structurally cannot cover.

**What's tested and why:**
- The naive-parser failure path (Done-When #6, #7) — the single hardest correctness risk the spec
  names. A fixture with a lowercase-named line and three distinct "yields no key at all" shapes
  (PEM continuation, PEM footer, `export`-prefixed line), with an *independently computed* expected
  line count (not trusted from the script's own output — epistemic.md gate 7b) asserting
  CLASSIFIED + UNPARSEABLE sums to exactly that count. A well-formed-only fixture would prove
  nothing here per epistemic.md gate 7.
- All 3 drift directions (Done-When #5) as one combined synthetic fixture: consumer→registry,
  registry→consumer (both "missing entirely" and "wrong claimed location" sub-cases), and
  registry→registry (conflicting `tier` across two registry files).
- The retirement candidate (Done-When #8) and its sibling, stale-consumer-list drift, via a
  `--consumers-dir` grep-count mechanism against a synthetic fake source tree.
- The not-enumerated-surface exclusion (Done-When #2) — asserting the coverage denominator neither
  credits an unreachable surface as reachable-but-empty nor as clean.
- No-secret-value-in-output (Done-When #9) and no-inline-plaintext-in-registry (Done-When #11),
  combined: a synthetic registry row carries a fake inline value (standing in for the real
  violation the spec says exists today and must be fixed before this script is written), and the
  test asserts both that it's flagged (`PLAINTEXT_IN_REGISTRY`) and that only its fingerprint form
  ever appears in output — computed by an independent oracle function in the test, not trusted from
  the script.
- Static Non-Goal guards (never `source`s an env file, never puts a secret-shaped variable directly
  into an executed command's argv, no mint/rotate/revoke verbs in executable code) — grep-based,
  heuristic, same spirit as `check-edge-function-secrets.sh`'s static checks. Explicitly **not** a
  proof of absence for every possible leak path; a human should still eyeball any new exec call the
  script gains in review.

**What's deliberately not tested, and why:**
- **Tier/`never-rotate` classification correctness for the ~46 real credentials** — that's a
  founder judgment call per credential (which tier, what breaks, data-loss-vs-inconvenience), not
  a testable property. The script's job is to let that judgment be recorded and then check it stays
  correct going forward, not to make the judgment itself.
- **Live network calls** — nothing in the automated suite calls a real provider API or the real CI
  secrets endpoint. The not-enumerated case is exercised via an operator-supplied
  `--not-enumerated` flag, not by actually triggering a 403.
- **Real credential fixtures** — every fixture name/value is synthetic (`FAKE_*`/`ZZZ_UAT_*`). The
  actual 3 drift instances that exist today, and the real inline-plaintext violation, are verified
  live via the UAT scenarios (against scratch copies of the real registries, never the originals),
  not reproduced in the committed test file.
- **The exact CLI flag names and output tokens** — these are a `/generate-tests` suggestion, not an
  `/architect`-approved contract (this spec's `pipeline_ran` is `[create-spec, challenge-prd]`
  only). `/dev` may implement a different shape; if so, the fixtures and assertions in
  `scripts/audit-credential-drift.test.sh` need updating to match, but the underlying invariants
  (zero dropped lines, fingerprint-only output, all 3 drift directions, not-enumerated exclusion,
  retirement candidates, read-only/no-`source`/no-ps-visible-secret) must keep being enforced by
  *some* form of these cases.
- **`/weekly` wiring itself** — the test harness doesn't grep `SKILL.md` (that's UAT-5, a one-line
  manual check); adding a SKILL.md-parsing assertion to a bash test for a markdown prose file would
  be more machinery than the invariant is worth.

**Open questions for `/dev`:**
1. Language/runtime is unconfirmed — bash was chosen following `check-edge-function-secrets.sh` +
   `day-gates.sh` precedent, but no `/architect` ran. A different runtime choice requires
   re-fixturing the test harness (the invariants survive, the literal file does not).
2. The registry markdown table shape used in fixtures (`Env var`/`Location`/`Consumers`/`Tier`/
   `Interval`/`Last rotated`/`Status`/`Value`) is invented for testing purposes — the real
   registries have different base columns today. Confirm real column layout before finalizing the
   parser.
3. "Retirement candidate" (Done-When #8) vs. "stale consumer list" (Problem section drift #3) are
   modeled as related but distinct, both via a `--consumers-dir` grep-count mechanism. This is the
   least certain interpretation here — confirm with founder before implementing.
4. Exit-code semantics (0 for informational drift, 1 only for the plaintext-in-registry violation)
   are invented, not spec-stated. Confirm whether any drift finding should be blocking, especially
   since this runs unattended in `/weekly`.
5. `REGISTRY_LOCATION_MISMATCH` assumes the registry names an exact file; real rows today are prose
   ("`.env.local`; GCP IAM"). Decide how strict location-matching should be.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | adversarial review | [BLOCK] Concentrates mint/write/revoke over every credential into one agent-invoked driver; contradicts the 2026-06-27 decision, uncited | Scope cut to read-only; meta-authority barred from `auto-api` **by definition** in the successor | A read-only audit has no authority to concentrate. The constraint becomes a static registry fact rather than a runtime judgment |
| 2 | adversarial review | [BLOCK] Ledger section self-contradictory — archive plaintext for rollback vs. no secret in any file | Two separate artifacts in the successor: a short-lived purged `rollback-vault` and a permanent fingerprint-only `ledger` | Only option under which both properties hold; distinct names are what stop an implementer conflating them. Neither exists in this spec's scope |
| 3 | adversarial review | [BLOCK] "Every consumer surface" untestable — one surface returns 403 by design, 8 env lines defeat the parser | Unreachable surfaces declared explicitly; unparseable lines are a finding class | A coverage number over surfaces you cannot see is the exact lie the spec was written to prevent |
| 4 | adversarial review | [WARN] "The only worked example of safe ordering anywhere in the toolchain" — **false**; a registry row encodes that exact ordering | Claim removed | The prior art was in the file the author had read. The claim was doing argumentative work: no prior art → build from scratch |
| 5 | adversarial review | [WARN] "The rest carry none" — false; 6 rows carry Generator + Rotation columns, 2 carry mint commands, plus a shared write procedure and a verify script | Claim removed | 4 of 5 plugin verbs already written down. Both false claims pointed the same direction |
| 6 | adversarial review | [WARN] Appetite mis-sized ~3× — Problem said 17, Done-When committed to ~46 | Sized explicitly; scope cut to classification only | Largest gap between what the spec said it was and what it committed to |
| 7 | adversarial review | [WARN] `driver: heuristic` mislabeled; the same-day incident went unmentioned | Corrected to `anomaly`; incident now in the Problem | Its only consumer reads it as a ratio; a fabricated value corrupts the signal |
| 8 | founder | Skill placement | Global | The credentials span personal and project infrastructure; cross-repo read of the private registry is established practice |
| 9 | adversarial review (post-`/dev`, 3 reviewers) | [CRITICAL] A registry table whose Value-like column was renamed (e.g. "Secret") silently disabled `PLAINTEXT_IN_REGISTRY` entirely — exit 0, zero findings, indistinguishable from "checked, clean" | `PLAINTEXT_CHECK_SKIPPED` finding emitted whenever no Value-like column resolves for a table | Reproduced live: a real leaked secret in a "Secret"-headed column produced a perfectly clean-looking run |
| 10 | adversarial review | [CRITICAL] A missing/typo'd `--registry` path degraded to "0 registered keys," exit 0 — and `/weekly`'s own runbook told the reader not to escalate low coverage | `--registry` paths validated (exist + readable) before use, aborts loudly if not, mirroring the existing `--env-dir` check | Reproduced live: file-not-found produced the identical output shape as a legitimately-empty registry |
| 11 | adversarial review | [CRITICAL] Ordinary free text in a Tier/Location cell (an arrow, a `<name>` placeholder) could trigger `_safe_echo`'s abort and kill the whole run with `exit 3` before the plaintext hard-fail check ran — and `/weekly`'s `tee\|grep` pipe swallowed that exit code, reading as "0 drift findings" | Every free-text registry field is sanitized (`desafe()`) at the parse source; `PLAINTEXT_IN_REGISTRY` now runs first, before any other finding class; `/weekly` reads the script's real exit code directly instead of `grep`'s | Reproduced live end-to-end, including through the exact `/weekly` pipeline; confirmed not live in the two real registries today, but one careless future edit would have killed the check silently |
| 12 | adversarial review | [HIGH] `fingerprint()` fully disclosed the raw value for length ≤4 (`ab` → `ab…ab(2)`, the value twice) | Masks fully as `***(n)` for length ≤4 | The design intent ("never the raw value") was false at the function's own boundary |
| 13 | adversarial review | [HIGH] `REGISTRY_MISMATCH` only ever compared the first two occurrences of a duplicate key, silently dropping a 3rd+ registry's disagreement | Compares every registry carrying the key against the first, reporting every mismatch | Reproduced with 3 registries, 3 tiers — only the first pair was reported before the fix |
| 14 | adversarial review | [MEDIUM] Multi-key row bundling shares one Tier across keys of different sensitivity — live in `accounts.md`'s un-split Mailgun row | `MULTI_KEY_ROW_BUNDLED` finding added (counting only genuinely-valid split keys, after catching a self-inflicted false positive on `OAuth via ~/.config/gws/`); the real Mailgun row split into a `MAILGUN_API_KEY` row and a separate `not-a-secret` domain/region row | The live instance this finding named is now resolved, not just detectable |
| 15 | adversarial review | [MEDIUM] Registries now spell out which credentials are meta-authority-capable, functioning as an attacker triage map if `.private/` were ever exposed | Verified containment: `~/Projects` is a plain local directory, not inside iCloud Drive or Dropbox's synced trees, and Desktop/Documents iCloud sync is disabled on this machine | Mitigated by the same containment that already protects `.env.local`'s raw values; closed as verified, not assumed |
| 16 | adversarial review | [MEDIUM] `/weekly`'s `/tmp/p1147-weekly-audit.txt` output was world-readable (default `tee` perms) and persisted between runs with no cleanup | Pre-created under `umask 077`, `chmod 600`'d after every write | Content is never a raw value, but it is a full key/tier/reasoning map — worth protecting from other local processes running as the same user |
| 17 | adversarial review | [LOW] `.gitleaks.toml`'s new allowlist entry (this session's own addition) was unanchored on the left, matching nested paths | Anchored with `^` | Cheap fix; mirrors the intent already stated in the entry's own comment |

## Related

- **Successor:** the rotation system itself — plugin rotators, driver, ordering, vault. The
  ordering design (`mint → write → verify → archive → revoke-old`, revocation last,
  `never-rotate` as unoverridable refuse, no-driver-edit constraint) survived both adversarial
  reviews intact and is preserved there.
- The existing secret-audit skill — classifies **leak** findings from git history; this classifies
  the **live inventory**. Complementary, different input.
- `docs/decisions.md` 2026-05-29 (rotation is the remediation for a leak) · 2026-06-27 (the agent's
  credential must not administer the gate it is subject to) · 2026-08-21 (the env-sourcing incident)
