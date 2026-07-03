---
name: docs-strategy-update
description: Gate + apply changes to the strategy docs (lean-canvas, hypotheses, theory-of-change, definitions, progress) when strategy shifts — runs 7 anti-drift gates before writing. Owns the strategy-doc layer; /kdd owns decisions.md.
when_to_use: "Before editing docs/lean-canvas.md, docs/hypotheses.md, docs/theory-of-change.md, docs/definitions.md, or docs/progress.md — especially after a strategic pivot in conversation. Sync mode (a described change) or audit mode (no arg). NOT for decisions.md (that's /kdd) or CLAUDE.md (that's /slava:maintain:claude-md)."
version: 1.2.0
---

# /slava:maintain:docs-strategy-update

Gate + apply changes to ClarityPledge's five **strategy docs** — `lean-canvas.md`, `hypotheses.md`, `theory-of-change.md`, `definitions.md`, `progress.md` — so a strategic shift gets written down without the recurring drift failures: premature-fact, reversal-churn, cross-doc contradiction, unpruned bloat, claim-without-disproof, fragile refs.

**Announce at start:** "Running /docs-strategy-update."

This skill **owns the strategy-doc layer.** `/kdd` owns `decisions.md` + meta-reflection. `/slava:maintain:claude-md` owns CLAUDE.md and `.claude/rules/`.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| A strategic shift must land in lean-canvas / hypotheses / theory-of-change / definitions / progress | `/docs-strategy-update` ← here |
| Capture a decision + run session meta-reflection | `/kdd` (writes decisions.md) |
| Change CLAUDE.md or a `.claude/rules/` file | `/slava:maintain:claude-md` |
| Output is a tracked feature, not a strategy-doc change | `/slava:build:create-spec` |

---

## Modes (auto-detected — no flags)

- **Sync** (invoked with a described strategic shift): apply it across the relevant docs, running every gate.
- **Audit** (invoked with no argument): scan the four docs for accumulated violations; produce a punch list. **No writes.**

---

## Workflow

### Step 0 — Resolve branch + load state + record base

1. **Resolve branch FIRST — before any write (Step 3 writes decisions.md).** Strategy docs *and* their decision entry land on `main` or a dedicated docs branch, **never** an unrelated feature/fix branch. Run `git branch --show-current`; if it is not `main` or a docs branch, switch first using the `.claude/rules/skills.md` Branch Guard wip-pattern. Doing this before Step 3 keeps the decision entry and the doc edits on the same correctly-placed branch.
2. Read all five docs in full: `lean-canvas.md`, `hypotheses.md`, `theory-of-change.md`, `definitions.md`, `progress.md`.
   - **Launch/GTM posture source:** `.private/docs/gtm-launch-icp-worksheet.md` (private — contains names; reference by name only, never copy content into public docs).
3. Read the most recent ~50 lines of `decisions.md` for live context — and **widen the read** if Gate 2's `git log -S` later surfaces an older relevant decision.
4. Record the base commit: `git rev-parse HEAD` — used in Step 4 to detect concurrent drift before applying.
5. Resolve mode: argument present → **Sync**; absent → **Audit**.

### Step 1 — State the delta (Sync) / scope the scan (Audit)

- **Sync:** in 1–3 sentences, state the strategic change and exactly which docs + sections it touches. A pivot from conversation must be expressible as **"X was true; now Y, because &lt;evidence&gt;."** If you cannot name the evidence, stop — that is Gate 5/7 failing before you start.
- **Audit:** skip to Step 2 against current doc contents.

### Step 2 — Run the 7 gates

Run each gate against the proposed edit (Sync) or current docs (Audit). Produce a gate report (PASS / FIX / WARN per gate). **A FIX blocks the write until resolved.** Every gate that runs a grep or command must **quote its actual output** in the report (matched lines, the anchor checked, or "0 matches") — **a verdict with no quoted artifact is treated as not-run, not PASS.**

**Fix the axis before the gates — two orthogonal dimensions, neither is epistemic status, neither pre-blocks a write** (this argument has recurred 3+ times; decisions.md 2026-07-03 [process]):
- **Edit permission** (may I change this box?): **destructive-vs-additive** (Gate 1 / Gate 4; decisions.md 2026-06-30). Additive, `UNTESTED`-labeled, falsifier-carrying content is always recordable — validation is NOT a precondition.
- **Routing** (which doc holds it?): **structural/durable vs tactical/volatile** — the structural bet (customer, value-prop, mechanism, and the channel *bet* of *who delivers*, e.g. coaches; *change = pivot*) → strategy docs; tactical mechanics (funnel choreography, prices, per-step targets, event run-of-show — including channel *mechanics* like a specific webinar format; *change = every experiment*) → decisions.md / goals.md / .private. Reason = **churn-isolation, NOT epistemic rank**. **Advisory, and it never withholds content:** default is to RECORD it (with a Gate-5 falsifier + honest `UNTESTED` label — that requirement is the churn/scope brake, so "record freely" is not "dump anything"); routing is a non-blocking note on *which doc*, never a reason to not write. **If a piece is genuinely ambiguous between structural and tactical, record it where the founder wants and move on — do not argue placement** (that argument IS the recurrence).

> **STOP — retired axis.** If you are about to keep content OUT of a strategy doc because it is "unvalidated," "unrun," or "not yet validated" — that axis is **DEAD** (decisions.md 2026-06-30 + 2026-07-03). *Everything* in the strategy docs is an unvalidated bet. The only questions are destructive-vs-additive (edit permission) and structural-vs-tactical (routing). **Recording is never blocked, only routed — and routing is advisory.** Excluding on *structural* grounds is ALSO not a block: if the founder wants it in the canvas, it goes; a routing recommendation is a note, not a veto, and must never read to the founder as a refusal to record. Do not re-derive this; do not re-litigate it with the founder.

**Gate 1 — Premature-fact (per-doc source of truth).** **Scope (read first):** this gate governs the *accuracy of epistemic status labels and numbers*, **not** whether reasoned-but-untested content may be recorded at all. A box MAY be rewritten with a deductively-reasoned model so long as it is honestly labeled (`UNTESTED` / hypothesis) and carries a falsifier (Gate 5) — recording it is permitted; **mislabeling** it as `Validated` / `Active` / `proven` is what this gate blocks. The discriminator for *may I update this box* is **destructive-vs-additive, NOT validated-vs-untested** (decisions.md 2026-06-30 [process]) — empirical validation is not a precondition for recording. With that scope set: every status word (`Active`, `Validated`, `proven`, `✅`) and hard number (price, R₀, %, count) must trace to real evidence:
- `lean-canvas.md` / `theory-of-change.md` → must agree with that doc's **Validation Status** block.
- `hypotheses.md` → must agree with the hypothesis's evidence rows / Transform-if.
- `definitions.md` → **no status words at all** (it is a glossary). Flag any.
- `progress.md` → numbers live ONLY inside the `<!-- AUTO -->` block and regenerate via `./scripts/progress-refresh.sh --write`; a hand-edited number anywhere in the doc is a FIX. Bets-and-kills rows must agree with `hypotheses.md` status + Transform-if. The human-stamped self-discipline line (untested-hypothesis date) must be re-checked against hypotheses.md on every sync.
- A milestone label (e.g. `C1`) is NOT a customer. Unvalidated → label **"theory / untested bet"**, never "Active".
- A doc with no Validation block to check against → **WARN** (never a silent pass).
- Agreeing with the Validation block is **necessary but not sufficient** — Gate 7 still requires an external source. If a number is internally consistent but unsourced, **Gate 7 wins** (label it "unverified").

**Gate 2 — Reversal-lock.** Before rewriting a named construct or settled position, grep for a structural lock marker (case-sensitive + boundary-anchored, so *unlocked* / *Unblocked* don't false-match):
```bash
grep -rnE '(^|[^[:alnum:]])(LOCKED|DECISION-LOCK):' docs/lean-canvas.md docs/hypotheses.md docs/theory-of-change.md docs/definitions.md docs/progress.md
git log -S "<construct phrase>" --oneline -- docs/ | head
```
As of this skill's creation the docs carry **no** lock markers, so expect zero grep hits — that means "no lock present, proceed", **not** "gate failed". The `git log -S` pass applies regardless of markers: if it surfaces a commit that settled this construct the other way, **read that commit before reversing**. If a lock exists and this edit reverses it, the edit + the decision entry (Step 3) must name the **new evidence** (not new phrasing) that justifies overriding it. When you settle a position you expect to hold, write `LOCKED: <date> — <reason>` next to it so future runs can see it.

**Gate 3 — Cross-doc.** (a) Every anchor/section this edit links to must still exist — grep the target heading; a link to a missing heading is a FIX. (b) No sibling doc may assert the **negation** of what you're writing. Don't grep your new sentence — a contradiction is rarely a near-duplicate. Instead: list 3–5 key nouns in the new claim (e.g. *coach, distribution, spread*), then for each run `grep -rniE '(not|without|never|no|isn.?t) .{0,30}<noun>' docs/` and **read every hit in full**. Fix or remove the contradiction in the same edit. (This is what catches theory-of-change "spreads NOT through coaches" vs a coach-distribution pivot — grepping the literal new wording never surfaces it.)

**Gate 4 — Bloat (propose-only deletion).** An addition that supersedes an existing dated block must delete or merge that block — but:
- **Never auto-delete.** Show each proposed cut; get confirmation.
- A block is "superseded" only if the newer block carries explicit supersede intent OR the user confirms it. Blocks marked as deliberate **alternates** ("alternates, not a sequence") are kept.
- **Never delete a block containing a falsifier / Transform-if** — that content is load-bearing by Gate 5.
- **Additive `UNTESTED` updates are NOT bloat.** Rewriting a box with current best thinking is permitted (see Gate 1 scope); only the *destruction of a revivable fallback* is a FIX. Do not block an additive, honestly-labeled rewrite.
- **Active-on-top / dormant-below check (mechanical FIX).** When a box's active content is relabeled to a new (`UNTESTED`) market/construct, the prior version must survive as a `### Dormant (...)` sibling **in the same box**. Grep the box for a `Dormant` heading: a box carrying a new active framing but **no** dormant-below sibling for a construct that previously had one = **FIX** (revivable fallback destroyed — the one thing the discriminator still guards). Quote the grep result ("0 matches" where one is expected IS the FIX).
- **Erosion guard (WARN).** If across syncs the count of `UNTESTED`-labeled active blocks climbs while none are promoted (validated) or pruned, flag **WARN** — the label may be laundering scrutiny rather than carrying honest epistemic weight (the failure mode in decisions.md 2026-06-30 [process] falsifier).
- (A coarse, line-granular net-bloat count is also flagged in `scripts/pre-commit-checks.sh` — a hygiene signal that over-counts multi-line blocks, **not** this gate's judgment.)

**Gate 5 — Disproof.** Every strategic claim being written carries a one-line falsifier — "how we'd know this is wrong" or a Transform-if. lean-canvas positioning claims are the usual offender; hypotheses.md is the model to copy.

**Gate 6 — Fragile refs.** No `file.md:NNN` or `L123` line-number cross-references — use quoted-phrase anchors. (Also enforced mechanically in `scripts/pre-commit-checks.sh`.)

**Gate 7 — Numbers cite a source.** Any prod number (R₀, count, %, conversion, price-as-validated) must cite an evidence source — a Mixpanel query, a prod row, a dated session note — not "a number mentioned this turn." No source → label **"unverified"**, never "Validated". Internal consistency is not truth.

### Step 3 — Precondition: record the decision (Sync only)

Before writing **any** strategy-doc change, the decision + its falsifier must exist in `decisions.md` (on the branch resolved in Step 0). `/kdd` is user-triggered and cannot auto-fire, so a "capture it later" hand-off orphans the doc edit — it asserts a position with no recorded kill-condition (the exact failure Gate 5 prevents).
- Already in decisions.md → cite it.
- Not yet → write the entry now (the user invoked this skill = authorization), using `/kdd`'s decisions.md format with a `[product]` tag and a one-line falsifier. `/kdd`'s deeper meta-reflection still runs separately when the user calls it.

### Step 4 — Apply (Sync) / report (Audit)

- **Concurrency check:** re-run `git rev-parse HEAD` and `git status --short docs/`; if the four docs changed since Step 0's base, re-read before editing — a concurrent `/kdd`-at-merge or co-tenant edit must not be clobbered.
- **Sync — two classes of change (the auto-vs-surface contract):**
    - **Mechanical → apply automatically:** fix fragile line-refs (Gate 6), add falsifiers (Gate 5), merge exact-duplicate framings, and apply the spine already settled in the Step-3 decision entry.
    - **Judgment → surface to the founder as A/B/C options, never resolve silently** (the "Founder decisions" rule — never fill in positioning / category / pricing without being told): every contradiction (Gate 3), every stale-fact / status reframe (Gate 1), every deletion (Gate 4, propose-only), and any positioning wording. Present each as: *current text · why it's stale/contradictory · 2–3 resolution options*; apply only the chosen one. Update the Validation Status block with the new evidence once resolved.
- **Audit:** output the punch list grouped by gate, one line per violation in the shape `<gate> | <doc> | "<quoted phrase or anchor>" | <suggested action>` (matching the precision pre-commit Gate F already prints). A bare count is not actionable for a 50-item bloat list. No writes.

### Step 5 — Self-check

Branch placement was resolved in Step 0 (decision + docs on `main` / a docs branch); confirm it held. Then verify every gate before writing.

Self-check (**each box must cite its gate-report artifact** — a ticked box with no quoted evidence counts as not-done):
- [ ] Branch resolved before any write (Step 0.1) — decision + docs on main / docs branch
- [ ] All four docs read this session (Step 0)
- [ ] Sync delta expressible as "X was true; now Y, because &lt;evidence&gt;"
- [ ] Gate 1: no unsourced status word / number; definitions.md carries none
- [ ] Gate 2: lock grep run (output quoted); any override names new evidence
- [ ] Gate 3: negation greps run (terms quoted); no anchor broken, no contradiction left standing
- [ ] Gate 4: every deletion shown + confirmed; no falsifier-bearing block cut; relabeled box has a `Dormant` sibling (active-on-top check, grep quoted)
- [ ] Gate 5: every new claim has a one-line falsifier
- [ ] Gate 6: no line-number cross-refs introduced
- [ ] Gate 7: every number cites a source or is labeled unverified
- [ ] Decision + falsifier recorded in decisions.md (Step 3)
- [ ] Concurrency re-check passed (Step 4)

### Step 6 — Confirm + hand off

Report: docs touched, gate report (pass/fix/warn with artifacts), the decision entry written, and the next step (`/kdd` for meta-reflection; `/slava:maintain:claude-md` if CLAUDE.md needs a pointer).

---

## Template (gate report + decision stub)

```
docs-strategy-update — <SYNC|AUDIT>
Branch: <main | docs-branch>    Base: <sha>

Delta: <X was true; now Y, because <evidence>>      # sync only
Docs touched: <list>

Gate report (every verdict cites its artifact — grep output, anchor, or "0 matches"):
  1 premature-fact ........ PASS|FIX|WARN  <status words/numbers + evidence row>
  2 reversal-lock ......... PASS|FIX|WARN  <lock grep result; git log -S result>
  3 cross-doc ............. PASS|FIX|WARN  <negation greps run (terms) + anchors + hits read>
  4 bloat (prune) ......... PASS|FIX|WARN  <proposed cuts, each confirmed y/n>
  5 disproof .............. PASS|FIX|WARN  <each new claim + its falsifier>
  6 fragile-refs .......... PASS|FIX|WARN  <line-ref grep result>
  7 numbers-cite-source ... PASS|FIX|WARN  <each number + its cited source>

Decision recorded (decisions.md):
  ## <date> [product]: <title>
  Decision: <Y>
  Falsifier: <how we'd know this is wrong>

Applied: <files>    |    Punch list: <n items>   (audit)
Next: /kdd (meta-reflection) · /slava:maintain:claude-md (if CLAUDE.md pointer)
```

---

## Quality Gates (Agent Self-Review)

- [ ] Ran in the correct mode (sync vs audit) — auto-detected, not asked
- [ ] Branch resolved before the decision write (Step 0.1)
- [ ] Gate report produced with a verdict + quoted artifact per gate (no gate silently skipped or rubber-stamped)
- [ ] No status word / number written without an evidence source (Gates 1, 7; Gate 7 wins ties)
- [ ] No block deleted without showing it first (Gate 4 propose-only)
- [ ] Judgment calls (contradictions, stale-fact / positioning reframes) surfaced as A/B/C options — never silently resolved; only mechanical cleanup applied automatically
- [ ] Decision + falsifier in decisions.md before the doc write (Step 3)

---

## Related Skills

- `/kdd` — owns decisions.md + meta-reflection; this skill writes the decision stub as a precondition, `/kdd` does the deeper pass
- `/slava:maintain:claude-md` — gate for CLAUDE.md / `.claude/rules/` changes
- `/slava:build:create-spec` — when the output is a tracked feature, not a strategy-doc change
- `/slava:think:falsify` — when a strategic claim itself needs first-principles stress-testing before it is written
