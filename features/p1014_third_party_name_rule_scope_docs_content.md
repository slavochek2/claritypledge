---
status: backlog
type: task
rank: 201
created_date: '2026-07-30'
tags: [privacy, audit-privacy, rules, pii]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1014: Extend the third-party-name authoring rule to `docs/` and `content/`

## Problem

**Situation:** P936 (done, 2026-06-15) split third-party PII into two controls by design: **emails** are scanner-detected and server-enforced, **names** are an authoring-layer control, because name auto-detection was rejected against a measured false-positive baseline. That names control is `.claude/rules/features.md` §"PII in Specs" — which states it "applies to **all** `features/` authoring" and auto-loads only on `features/` paths.

**Complication:** On 2026-07-30 a peer practitioner's real first name plus a characterization of his business was found in `docs/decisions.md`, shipped, having survived the 2026-07-29 de-identification pass and every commit since. A second mention was in `content/articles/`. Neither path loads the rule, so no agent authoring them ever saw it. The scanner cannot help by design — `HARD_PATTERNS` covers only the founder's own identifiers, and P936 documented that names "stay an authoring-layer control." Both leaks were found by hand, incidentally, while answering an unrelated question.

**Question:** How do we give `docs/` and `content/` the same write-time name discipline `features/` already has, without reversing P936's rejection of scanner-side name detection?

## Appetite

Low blast radius (rules-file scope change; no scanner, no CI, no enforcement mechanism touched). Fully reversible (`git revert` one commit). Low decision density — P936 already made the hard call; this corrects where that call is delivered.

## Solution

Make the existing role-vocabulary rule reachable from the paths where public prose is actually written. Two candidate mechanisms, to be chosen during implementation:

1. Extend the auto-load globs so the existing rule fires on `docs/**` and `content/**` as well as `features/**`.
2. Add a pointer in the rules file(s) that already auto-load for those paths, referencing the one canonical statement of the rule.

Reference, never duplicate — the rule text has one home (CLAUDE.md "Reference Over Duplication"). Whichever mechanism is used, the outcome is that an agent editing `docs/decisions.md` or `content/articles/*.md` sees the role-vocabulary requirement before writing.

Run `/slava:maintain:claude-md` before editing any rules file, per CLAUDE.md.

## Risks / Non-Goals

### Risks
- **Rule sprawl / dilution.** Widening globs loads more context on more edits, and a rule that fires everywhere gets skimmed. Mitigation: extend scope only to the two path families with demonstrated leaks; do not make it global.
- **False confidence.** An authoring rule is not enforcement — it cannot fail a commit. Mitigation: state that limitation in the rule text itself, as P936 already did, so the next reader does not mistake it for a gate.
- **Backfill is unbounded.** `docs/decisions.md` is ~17,700 lines with 297+ commits of history. A full historical name audit is not this spec. Mitigation: scoped out below.

### Non-Goals
- Do **NOT** add name detection, NER, or a name watchlist to `audit-privacy.sh`. P936 rejected this against a measured FP baseline (`Page` 3,766 hits, `Mark` 302 — `docs/decisions.md` 2026-06-15 [technical]) with founder sign-off. Reversing it needs new evidence about false-positive cost, which this spec does not have and does not gather.
- Do **NOT** commit any real third-party name into the public tree — including into tests, fixtures, or any list. Synthetic fixtures only (mirrors P919/P936 sentinel discipline).
- Do **NOT** weaken, rescope, or touch the founder-identifier patterns, `.privacy-allowlist`, or `.privacy-email-allowlist`.
- Do **NOT** change P919's enforcement mechanism (ruleset, staging hop, credential model).
- Do **NOT** attempt a historical backfill scan of `docs/` in this spec — but note the tension is resolvable, and the resolution is a distinction this spec draws rather than a blocker it inherits (see §The backfill tension). Backfill is a separate decision, not an impossible one.
- Do **NOT** rewrite already-shipped articles for style; the two known leaks are already fixed (`d31c798e`).

### Alternatives Considered
- **Gitignored name watchlist (`.private/privacy-names.txt`) read by `audit-privacy.sh`.** Sidesteps P936's "don't publish the name to protect the name" trap, since the list is never committed. REJECTED here as out of scope **as a standing gate**: it is still the scanner route P936 rejected for names, and a green gate that knows three names is the strongest false-confidence signal of any option. Note the recall objection ("only catches names someone remembered to add") does *not* hold for a **derived** list — see §The backfill tension, which permits exactly this list for a one-time local audit. Standing gate stays rejected; one-time local audit is separately scoped.
- **Rely on the periodic de-identification pass.** REJECTED as the sole layer: the 2026-07-29 pass ran and missed this exact line. Nothing scanned for it, so it was never in scope rather than overlooked.
- **Make names server-enforced.** REJECTED: requires the detection P936 ruled out; enforcement without reliable detection blocks legitimate commits.
- **Do nothing.** REJECTED: two leaks found by hand in one session, one of them shipped, is not a rate that process memory alone survives.

### Rollback Strategy
Single-commit revert of the rules-file change. No data migration, no scanner change, no CI change — prior behavior restored immediately.

## Done-When

- [x] A rules file's `paths:` list matches `docs/**/*.md`, so editing a file under `docs/` loads the third-party-name rule without the agent having to know it exists (`.claude/rules/pii.md`)
- [x] The same `paths:` list matches `content/**/*.md` (superset of `content/articles/**`, the demonstrated leak path)
- [x] The rule text exists in exactly one place (`.claude/rules/pii.md`); `features.md` and `content.md` carry one-line pointers, not restatements
- [x] The rule states plainly that it is an authoring-layer control and NOT commit-enforced ("A green gate is not evidence that this rule was followed")
- [x] `.claude/rules/features.md` §"PII in Specs" behavior for `features/` is unchanged — `pii.md` still matches `features/**/*.md`, so no `features/` edit loses coverage
- [x] `./scripts/pre-commit-checks.sh` passes against an **actually-staged** diff (a green run on an empty index is vacuous); `git diff HEAD --stat scripts/ CLAUDE.md` is **empty** — that, not a green test run, is what proves the scanner was untouched
- [x] The `/slava:maintain:claude-md` gate was run before the rules edit, and its verdict recorded (below)

### Gate verdict (AC above)

**ADD**, 2026-07-30. Placement `.claude/rules/` confirmed: prose-about-people spans ~4 of ~11 task families, well under the >80% universality bar for CLAUDE.md — which is also at 350/350 and has no headroom. Routing confirmed empirically: **no `paths:` entry in any of the 18 rules files references `docs/`**; the only files reaching a `docs/` edit are the four `globs: "*"` behavior rules, none of which mention PII. Widening `features.md`'s own `paths:` was rejected (14 KB of kanban/pipeline/lifecycle rules loaded on every `docs/` edit to deliver one paragraph). No redundancy with CLAUDE.md §"Private vs Public Files": that owns the *routing* decision (sensitive material → `.private/`), `pii.md` owns the *write-time technique* + the scanner blind spot.

Two gate findings recorded as deltas from the original Solution:
1. `content/articles/**` was **not** ruleless — `content.md` already loads there with a §"Privacy Rule", but it covers only *process notes about* named individuals, not a name in the article's own prose. It was rule-**incomplete**, not unreachable. `content.md` now carries a pointer so its privacy section no longer reads as complete.
2. **Root cause: necessary but insufficient** — see §Known insufficiency.

## The backfill tension — the *permission* question is resolved; the mechanism is not

An automated history scan appears blocked: it needs a list of third-party names, and committing real names to a public repo to protect those names is self-defeating. The block dissolves on one distinction:

- **A standing gate** requires a *committed, maintained* list. Forbidden (non-goals above), and rejected by P936 on false-positive grounds. Stays rejected.
- **A one-time local audit** requires a list that exists only on the founder's machine. Already permitted — `.private/` is gitignored, and P936's non-goal forbids names in the **public tree**, not names held locally.

**But no tool currently performs it, and the obvious tool is off-limits.** `audit-privacy.sh` defines `HARD_PATTERNS` as a hardcoded heredoc — no env var, no `--patterns` flag, nothing that reads an external list. Its range mode scans history with the *founder's* patterns only. Wiring a derived list into it would be exactly the change the first Non-Goal forbids. So the audit needs a **standalone throwaway script** that never lands in `scripts/` (per file-creation discipline: `scripts/archive/migrations/` or a `mktemp -d`), not a scanner modification. Anyone scoping this should not assume range mode covers it.

**Where its output may be written: `.private/` only.** The Non-Goals forbid committing a name "including into tests, fixtures, or any list" — they do not mention *evidence*, and CLAUDE.md §"Evidence Over Declaration" otherwise pushes an agent to paste command output into a spec, a decisions entry, or a commit message. For this audit specifically, that norm is suspended: hits go to `.private/incidents/`, and the public-tree artifact is a count and a decision, never a name.

The list need not be hand-maintained: `.private/docs/business/` already holds a dossier per person engaged, so it can be **derived** from records that exist anyway. That also answers the "only catches names someone remembered to add" objection to the watchlist — a derived list inherits its coverage instead of depending on recall.

**What limits the audit's value is remedy, not detection.** A name already committed to a public repo is already public: GitHub holds it, clones hold it, and `git revert` does not remove it from history. Removing it needs a history rewrite of a public repo, which is destructive and cannot recall what has already been fetched. So a backfill audit is a **disclosure instrument** — it establishes what is exposed, who should be told, and what to say if asked — not a cleanup one. Anyone scoping the backfill should decide what they would *do* with a hit before spending effort finding hits.

## Known insufficiency — this change is necessary but not sufficient

Recorded honestly rather than deferred, so the next reader does not mistake a shipped rescope for a closed incident. The rescope fixes a real, verified defect: the rule was unreachable from two paths it logically governs. It does not explain three facts:

1. **`content/articles/` already loaded a privacy rule and leaked anyway.** A rule was on that path, mentioning "named individuals," and the name shipped. What failed there was not delivery.
2. **The 2026-07-29 de-identification pass ran over that exact file and missed the line.** Upstream awareness does not explain a dedicated pass missing its own target.
3. **`docs/decisions.md` is written by a skill (`/kdd`), not by hand.** A rule in context competes with a skill's own step list, and the steps win. A rule cannot fail a commit and produces no artifact to check afterward.

**Missing layer (NOT scanner-side name detection — P936 rejected that on measured FP grounds):** move the check from *awareness* to *evidence* inside the producing skills. `/slava:maintain:kdd`, `/slava:maintain:docs-strategy-update`, `/slava:content:draft-blog`, and `/slava:maintain:analyze-demo-meeting` all write the leak-prone paths. Each emits one required line before writing, e.g. `Third-party names: 0 personal proper nouns in new prose (orgs/products exempt)`. That converts an un-auditable intention into an observable artifact — what "Evidence Over Declaration" already demands of every other completion claim here — and is the layer that would have caught the 2026-07-29 miss, since a pass that must report a count cannot silently skip. `UNTESTED`; falsifier: add the line to `/kdd`, then check whether the next three `docs/decisions.md` entries carry it.

**Not filed as done here.** Editing four skill files is a separate blast radius from a rules-file rescope and needs its own spec. Shipping only the rescope and calling the incident addressed would be precisely the false-confidence failure this spec's own risk register names.

### Two surfaces this control provably cannot reach

Found by adversarial review, verified, and left open deliberately — not oversights:

1. **Commit messages.** `paths:` globs match files, never messages, and `audit-privacy.sh` (~L196) deliberately skips the third-party-email check in `--msg` mode. **Already realized:** the message of `d31c798e` — the commit that *fixed* this leak — re-publishes the characterizing detail its own diff removed (the third party's workshop audience, business model, and consulting role). That text is permanent in public history; `git revert` does not remove it and a history rewrite of a public repo cannot recall what has been fetched. Per §Remedy above this is a **disclosure** fact, not a fixable one. Mitigation shipped: `pii.md` now says to write the message in roles too.
2. **Skill files (`.claude/commands/slava/**`) and root-level `*.md`.** ~120 public skill files, several of which (`analyze-demo-meeting`, `prep-campaign`, `lawyer-dd`, `interview`) are *about named individuals* and plausibly carry an example name. `.claude/rules/skills.md` loads there and says nothing about PII. Deliberately out of this spec's scope (`docs/` + `content/` were the demonstrated leaks); a live candidate for the successor spec.

## Notes

- Triggering leak and both fixes: commit `d31c798e` (2026-07-30). Prior de-identification pass: `dd35ce20`.
- Predecessor: P936 — read its §Resolved Decisions before proposing any scanner-side change here.
- The founder's own name is effectively allowlisted (it is the git author), which is why founder-name leaks and third-party-name leaks fail differently and need different controls.
