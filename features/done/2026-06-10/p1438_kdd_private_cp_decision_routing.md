---
status: all-done
type: task
rank: 23
created_date: '2026-10-08'
tags: [kdd, privacy, docs-routing, process]
disclosure: public
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-10-08
---

# P1438: KDD routing for private cp decisions — where business/GTM decisions with names go

## Problem

> Founder framing, as relayed by the main session (subagent filing; the founder's original sentence was not visible to the filer): *"one skill that splits output by privacy (public cp / .private cp / pp), or several? Should .private/docs/decisions.md exist? Should event reflections be consolidated?"*

**Situation:** cp has two decision-capture skills. `/kdd` writes to the public `docs/decisions.md`. The global `/kdd-private` writes to the private personal repo's decisions log (and two other private repos by topic); it never writes into cp. `docs/CHARTER.md` rule 1 routes anything identifying to `.private/`, and `/kdd` step 6.25 (`.claude/commands/slava/maintain/kdd/SKILL.md:234`) says "Private details belong in `.private/` only", but neither names a target file. `.private/docs/decisions.md` does not exist (verified with `ls`, 2026-10-08).

**Complication:** cp business decisions that involve named partners or GTM moves (for example "a planned hackathon track was dropped, and the reasons involve named people") have no home. Today they scatter: per-opportunity notes in `.private/crm/opportunities/` (5 files), and per-event retro folders such as `.private/events/2026-10-06-clarity-night/` (which holds `decision_synthesis.md`, `decision_brief_for_review.md`, `spec-decisions.md`, `RETRO.md`). Nothing indexes them as decisions. The public 2026-10-07 entry "Pause founder-run public Clarity Nights" already shows the pattern working by hand: a name-free public entry plus "Details and data are private (founder's event retro)", with no path a future agent can follow.

**Question:** One skill that splits its output by privacy into public cp / `.private` cp / personal repo, or several skills? Should `.private/docs/decisions.md` exist? Should event reflections be consolidated?

## Appetite

- **Blast radius:** medium. Touches `/kdd` (run after most cp sessions) and the CHARTER routing tree. A wrong split leaks names into a public AGPL repo, which is the one irreversible failure CHARTER rule 1 names.
- **Reversibility:** high for skill text (git revert). Low for any leak that reaches GitHub.
- **Decision density:** a few (see `[FOUNDER DECISION]` markers).

## Options

**A. Extend `/kdd` with a privacy split; create `.private/docs/decisions.md` (recommended).** For each decision `/kdd` already captures, it classifies the content per CHARTER rule 1 and writes: the name-free decision (context, decision, alternatives, falsifier) to `docs/decisions.md`; the named part (who, what they said, deal terms, per-person reasons) to `.private/docs/decisions.md` under the same date and heading. Both entries cross-reference each other by date + heading (no names in the public pointer). Decisions with no cp-business content (personal life, infra on the founder's own machines) still go to `/kdd-private`; `/kdd` names that hand-off but does not write to the personal repo.

**B. New cp-local `/kdd-cp-private` skill.** A third skill that writes only to `.private/docs/decisions.md`.

**C. Teach global `/kdd-private` a cp branch.** Add a routing row so `/kdd-private` writes cp-business entries into cp's `.private/`.

**D. Do nothing; keep per-event and per-CRM files.** Current state.

**Argument for D (current state might be sufficient):** the event retro folder already holds a full decision synthesis with adversarial reviews, and the public entry points at it in prose. Volume is low (one event folder with decision files, 5 CRM notes). Against D: the pointer "founder's event retro" is not a path; a future agent asking "why was the hackathon track dropped" must already know which folder to open; CRM notes hold decisions mixed with contact logs. The pattern is already being done by hand and inconsistently, so the cost is real, not hypothetical.

**Recommendation: A over B** because (2) correctness: one skill sees one decision once and writes both halves in the same pass, so the public and private halves cannot be captured independently; B and C have two skills each deciding whether a session holds a decision, which is two failure modes instead of one (missed capture in one log, duplicate in the other). **A over C** because (3) security: `/kdd-private` is global and pp-rooted; giving it write paths into a public repo's tree adds a cross-repo actor whose misroute lands next to public files. **A over D** because (1) user outcome: a later agent can follow a date+heading pointer from the public log to the named reasons, which today requires knowing the folder.

## Solution

Founder decisions (2026-10-08, this session): Option A approved; sensitive-but-unnamed decisions (pricing figures, GTM sequencing) go private, with a short public line only when they change the product; backfill the two known decisions only; spec consumers search the private log too, and say so when they cannot.

**Trigger (what happened):** two decisions in two days (2026-10-07 public-night pause, 2026-10-08 hackathon track) had named reasons and no findable home; and while building this, a full name from a private CRM file was found already committed in three public files since 2026-06 (an old spec, a UAT file, a test) — the "missed without knowing" failure this spec is about, observed. Absence of reported misses is not evidence of absence: a search that silently skips the private log reports nothing.

1. **`.private/docs/decisions.md`** — append-only, name-free headings, `**Public entry:**` line per entry. Backfilled with the two known decisions. Listed in `.private/INDEX.md`.
2. **`/kdd` privacy split** (step 4): every entry classified public-only / split / private-only / not-cp-business before it is written. `.private/` resolved via git-common-dir from worktrees; absent → stop the private half, never fall back to public.
3. **Privacy gate before commit** (step 4.4): step 6.25's judgment gate and `audit-privacy.sh --staged` now run BEFORE `/kdd` commits (they ran after — Codex finding 1, verified).
4. **Known-names check** in `scripts/audit-privacy.sh`: blocks names held in `.private/` (seed `docs/privacy-names.txt` + derived from `crm/opportunities/<first-last>.md`). Local only — CI has no `.private/` and says so on stderr. It cannot catch a name never recorded privately; the human/agent read stays primary.
5. **`scripts/search-decisions.sh`** searches both logs and prints `PRIVATE LOG: searched | NOT AVAILABLE` first. Wired into `/create-spec` (duplicate gate + rulings), `/spec-review` (dim 9), `/challenge-prd`. Private hits are cited as `private ruling <date>`, never quoted into public files.
6. **Discoverability:** `docs/decisions.md` header names the private companion and the helper; CHARTER rule 1 points named decisions to it.
7. **Event reflections: index, do not consolidate.** Evidence folders and CRM notes stay; the private entry links them.

## Alternatives Considered

See Options B, C, D above. Also rejected: merging event retro folders into one consolidated retro file — merges raw evidence with decisions and recreates the size problem `docs/decisions.md` already has.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Classifier leaves a name in the public half | MITIGATE | Step 6.25 privacy gate and `audit-privacy.sh` still run on the public half; the split adds a destination for names, it does not remove the gate |
| Public pointer itself reveals something (heading text names a partner) | MITIGATE | Private headings written name-free; names only in body |
| Private log grows unread like the public one | ACCEPT | Volume is low; revisit if it passes ~200 entries |
| `.private` commit forgotten (separate repo) | MITIGATE | `/kdd` report lists both repos and their uncommitted state |
| Two halves drift after edits | ACCEPT | Append-only logs; corrections are new entries in both |

**Non-Goals:**
- Do NOT change `/kdd-private`'s routing table or give it cp write paths.
- Do NOT move or rewrite existing event folders or CRM notes.
- Do NOT add a new skill.
- Do NOT put any person or partner name in public files, including this spec.

## Invariants

- Nothing identifying (names, contacts, provenance) is written to a public cp file by the split. CHARTER rule 1 overrides every other routing step.

## Done-When

- [x] `.private/docs/decisions.md` exists with scope header and `**Public entry:**` lines; listed in `.private/INDEX.md`; both backfilled entries present.
- [x] `/kdd` step 4 contains the four-way privacy classification; step 4.4 runs the privacy gate and `audit-privacy.sh --staged` before the commit; step 6.25 no longer runs after it.
- [x] `test-audit-privacy.sh` passes, including known-name cases per derivation path (seed, CRM filename) and controls (name-free text, substring, single-token filename).
- [x] `search-decisions.sh` reports `PRIVATE LOG: searched` from a worktree and `NOT AVAILABLE` from a repo without `.private/` (both observed).
- [x] `/create-spec`, `/spec-review`, `/challenge-prd` call `search-decisions.sh`.
- [x] Control: a public-safe decision yields no write to the private log (classification "public-only").
- [x] CHARTER rule 1 and the `docs/decisions.md` header point to the private log.
- [x] Adversarial review run; findings addressed or recorded.

## Open Questions

- Resolved 2026-10-08: one skill (A); sensitive-but-unnamed → private; backfill two entries.
- `[FOUNDER DECISION: scrub the already-public full name (3 files since 2026-06) from current files and/or git history?]`

## Related

- `docs/decisions.md` 2026-10-07 [product] "Pause founder-run public Clarity Nights" (hand-made split precedent)
- `docs/CHARTER.md` rule 1
- `.claude/commands/slava/maintain/kdd/SKILL.md` step 6.25
- Global `/kdd-private`
- Duplicate gate: NONE — searched features/ for "kdd-private", "private decisions log", ".private/docs/decisions", "decision_synthesis". RULINGS: decisions.md entries on `/kdd` + `/kdd-private` (negative-knowledge tag rejected for volume creep; KDD output-format rewrites) — this spec adds no new tag and no new output format.

## Review (Codex)

`codex-review --review` (2026-10-08; model gpt-6.1-sol, effort low, identity `accepted-only`, exit 0). **Verdict: REJECT** — revise before `/dev`.

1. **High — privacy review runs after the commit.** `/kdd` commits at step 4.4 (`SKILL.md:156`) and runs the step 6.25 privacy gate later (`SKILL.md:232`) — verified by grep. `audit-privacy.sh` does not catch arbitrary third-party names (Codex test: synthetic partner name passed, exit 0). A misclassified name reaches public history before any judgment review. Fix: the split's classification and a privacy review of the public half must run before either commit; add a negative test with an arbitrary name.
2. **Medium — private-only decisions are invisible to later readers.** `/create-spec` (duplicate gate, rulings) and `/spec-review` only grep `docs/decisions.md`, so a privately recorded rejection is missed when a later spec proposes the same thing. Fix: add a private-log lookup to those consumers, with defined behavior when `.private/` is absent (it is absent in clones and worktrees).
3. **High — Done-When contradicts the open question on unnamed-but-sensitive decisions.** The control "no named content → nothing written privately" conflicts with routing confidential pricing/GTM decisions privately. Fix: settle the founder decision on sensitivity-based routing first, then rewrite the control around content that is explicitly public-safe.

Not verified by Codex: `.private/` index and two-repo commit flow (private repo not present in its isolated copy).

## Implementation review (Codex, 2026-10-08) — 1 of 1 report received

Hostile review of the implementation, public files only (private files not sent: they hold real names). Verdict FAILS → fixed, each re-tested:
- Known names not checked in commit messages (range mode) → fixed; test added.
- Separator bypasses (comma, tab, NBSP, en-dash) and padded seed lines → fixed; tests added. Mutation check: reverting the two fixes fails 5 tests.
- Silent pass when `.private/` exists but holds no names → now warns on stderr; test added.
- `search-decisions.sh` printed "searched" and exit 0 on grep errors / bad max → now exit 2; "searched" printed only after success.
- `/kdd` commit block lacked the scan command; 6.25 read ran before staging → block now stages, reads `git diff --cached`, runs the scan, then commits.
- **Accepted, not fixed:** CI cannot run the known-names check (no `.private/` there, by design — names must not be shipped to CI); decomposed-Unicode and line-split names; a hyphenated non-person CRM filename would be treated as a name; "never quote private into public" is an instruction, not an enforced boundary. The agent's own read of the public half stays the primary gate.
- **Out of scope, noted:** `/kdd` step 4.6 tells the agent to `git add .private/...` from the public repo (pre-existing; `.private/` is a separate repo).

## Re-review (Codex, 2026-10-08) — 1 of 1 report received

Verified FIXED by its own commands: range-mode commit messages, separator bypasses, empty-sources warning, `/kdd` commit-block order. Two new defects, both fixed and re-tested: max-hits `0` / oversized accepted (now 1–9999, else exit 2); a grep error inside the known-names check passed as "no name" (now fails closed — proven with a fault-injected grep, exit 1). Evidence gap it named: GNU grep under a UTF-8 locale not tested (BSD grep only).

## Follow-up (not in scope)

Rulings lookups outside the three spec skills still read only the public log: `build/fix.md` (prior-decision grep per edited file), `build/create-bug.md` (rejected-alternatives check), `build/create-prd/agent.md`, and CLAUDE.md "Before Starting Work" item 5. Found by the `/finish` skills review. To be filed in the task inbox (`docs/process-learnings.md` was held by another session's uncommitted edit at ship time).
