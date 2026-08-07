---
name: docs-strategy-update
description: Gate + apply changes to the strategy docs (lean-canvas, hypotheses, theory-of-change, definitions, progress, research-programme) when strategy shifts — runs 9 anti-drift gates before writing. Owns the strategy-doc layer; /kdd owns decisions.md.
when_to_use: "Before editing docs/lean-canvas.md, docs/hypotheses.md, docs/theory-of-change.md, docs/definitions.md, docs/progress.md, or docs/research-programme.md — especially after a strategic pivot in conversation. Sync mode (a described change) or audit mode (no arg). NOT for decisions.md (that's /kdd) or CLAUDE.md (that's /slava:maintain:claude-md)."
version: 1.5.0
---

# /slava:maintain:docs-strategy-update

Gate + apply changes to ClarityPledge's six **strategy docs** — `lean-canvas.md`, `hypotheses.md`, `theory-of-change.md`, `definitions.md`, `progress.md`, `research-programme.md` — so a strategic shift gets written down without the recurring drift failures: premature-fact, reversal-churn, cross-doc contradiction, unpruned bloat, claim-without-disproof, fragile refs, competing single-valued directives, degeneration-blindness.

**Announce at start:** "Running /docs-strategy-update."

This skill **owns the strategy-doc layer.** `/kdd` owns `decisions.md` + meta-reflection. `/slava:maintain:claude-md` owns CLAUDE.md and `.claude/rules/`.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| A strategic shift must land in lean-canvas / hypotheses / theory-of-change / definitions / progress / research-programme | `/docs-strategy-update` ← here |
| "Is the programme progressing or degenerating?" — a verdict, not a doc edit | `/slava:maintain:programme-health` (writes nothing) |
| A refutation appears to land on the **hard core** (K1–K7) | `/slava:maintain:programme-health` first — a core edit is not a sync |
| Capture a decision + run session meta-reflection | `/kdd` (writes decisions.md) |
| Change CLAUDE.md or a `.claude/rules/` file | `/slava:maintain:claude-md` |
| Output is a tracked feature, not a strategy-doc change | `/slava:build:create-spec` |

---

## Modes (auto-detected — no flags)

- **Sync** (invoked with a described strategic shift): apply it across the relevant docs, running every gate.
- **Audit** (invoked with no argument): scan the six docs for accumulated violations; produce a punch list, including the Gate-9 rivals-reflection pass. **No writes.**

---

## Workflow

### Step 0 — Resolve branch + load state + record base

1. **Resolve branch FIRST — before any write (Step 3 writes decisions.md).** Strategy docs *and* their decision entry land on `main` or a dedicated docs branch, **never** an unrelated feature/fix branch. Run `git branch --show-current`; if it is not `main` or a docs branch, switch first using the `.claude/rules/skills.md` Branch Guard wip-pattern. Doing this before Step 3 keeps the decision entry and the doc edits on the same correctly-placed branch.
2. Read all six docs in full: `lean-canvas.md`, `hypotheses.md`, `theory-of-change.md`, `definitions.md`, `progress.md`, `research-programme.md`.
   - **Doc routing map:** `docs/CHARTER.md` — one fact, one home (the strategy docs are homes 4–8, plus **4b**). Read it when unsure where a fact belongs; this skill references it rather than restating the tree.
   - **`research-programme.md` (CHARTER rule 4b) is the home for programme-level content** — the hard core (K1–K7 + core-hit signatures), the negative/positive heuristic, the **rivals registry**, the **progressivity ledger**, and the stopping rule. Routing test: is it *about* the bets, or is it *a* bet? A bet carries its own falsifier and priority and belongs in `hypotheses.md` — rule 4 wins, first-match. **The hard core is not edited by a sync.** Its only two retirement routes are a recorded founder decision or displacement by a rival with corroborated novel predictions the core cannot match; a sync that appears to require a core edit is a **core-hit** — stop, and hand off to `/slava:maintain:programme-health` before writing.
   - **README / CLAUDE.md reflection duty.** Both describe the project publicly, and neither is in this skill's write scope. After any sync that changes the wedge, the market focus, the mission framing, or the programme's self-description, **check whether they now misdescribe the project** and say so in the Step-6 report. README is a direct edit; CLAUDE.md routes through `/slava:maintain:claude-md`, never a direct edit. A silent no-check is the failure this line exists to stop — the CLAUDE.md market-focus copy was stale for 17 days and misled three agents in one session.
   - **Launch/GTM posture source:** **`docs/goals.md`** is the public, git-versioned home of tactical GTM/funnel execution (CHARTER rule 7) — read it for the current posture. `.private/docs/gtm-launch-icp-worksheet.md` holds only the **named residue** (private — contains names; reference by name only, never copy into public docs). **`goals.md` is not a gated home** (ungated/tactical) — free-standing tactical edits to it are outside this skill entirely. **But when a sync you just applied *invalidates* `goals.md`** (a hypothesis you demoted is still framed there as active, a page-lead you moved is still copied there), reconcile it **in the same edit**, under **Gates 1 and 3 only** (no SINGLE-VALUE markers exist in `goals.md`, so Gate 8 does not apply). Detect-and-hand-off was the prior rule; it produced two recorded hand-offs and zero edits (see Step 6).
3. Read the most recent ~50 lines of `decisions.md` for live context — and **widen the read** if Gate 2's `git log -S` later surfaces an older relevant decision.
4. Record the base commit: `git rev-parse HEAD` — used in Step 4 to detect concurrent drift before applying.
5. Resolve mode: argument present → **Sync**; absent → **Audit**.

### Step 1 — State the delta (Sync) / scope the scan (Audit)

- **Sync:** in 1–3 sentences, state the strategic change and exactly which docs + sections it touches. A pivot from conversation must be expressible as **"X was true; now Y, because &lt;evidence&gt;."** If you cannot name the evidence, stop — that is Gate 5/7 failing before you start.
- **Audit:** skip to Step 2 against current doc contents.

### Step 2 — Run the 9 gates

Run each gate against the proposed edit (Sync) or current docs (Audit). Produce a gate report (PASS / FIX / WARN per gate). **A FIX blocks the write until resolved — with one carve-out below.**

> **META-RULE (decisions.md 2026-08-05 [process]) — no gate may block a write, only require a label.** A FIX may block a write that is *wrong* (a broken anchor, a mislabeled status, a stale number). It may **never** block a write for being **unevidenced**. Where a gate's only objection is "you have no field datum for this," the write **proceeds** carrying `PROPOSED-PENDING-CONTACT` (or `UNTESTED` + a falsifier) — the gate warns, flags, questions, and requires the label; it does not restrict. Rationale: a rule that stops the founder writing does not stop him acting; it only desyncs the docs from what he is already doing, which is worse than the drift the gate prevents. **Any instruction in this skill that reads as "no evidence → no write" is void on sight.** Sole exception: `.claude/rules/pii.md` (irreversible external harm). Every gate that runs a grep or command must **quote its actual output** in the report (matched lines, the anchor checked, or "0 matches") — **a verdict with no quoted artifact is treated as not-run, not PASS.**

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

**Gate 2 — Reversal-lock (WARN-only for the unevidenced case; see the META-RULE above).** Before rewriting a named construct or settled position:

```bash
# (a) in-file lock markers — case-sensitive + boundary-anchored so *unlocked* / *Unblocked* don't false-match
grep -rnE '(^|[^[:alnum:]])(LOCKED|DECISION-LOCK):' docs/lean-canvas.md docs/hypotheses.md docs/theory-of-change.md docs/definitions.md docs/progress.md
# (b) THE REGISTRY — rulings live in decisions.md, which (a) does NOT read. Skipping this is how the gate failed 2026-08-05.
grep -n 'PROPOSED-PENDING-CONTACT\|slot is frozen\|Rejected on the merits\|NOT applied' docs/decisions.md | head -20
# (c) history, keyed on the SLOT NAME — not on a phrase you chose
git log -S "<slot-name>" --oneline -- docs/ | head      # e.g. active-market-focus / page-lead / active-channel
```

**Key on the slot name, never on your own construct phrase.** If the edit region sits under a `<!-- SINGLE-VALUE: <slot> -->` marker, `<slot>` **is** the retrieval key — the marker names it, so the agent cannot pick wrong. A free-text `git log -S "<construct phrase>"` pass is **circular and measured to fail**: on 2026-08-05, `git log -S "market focus"` did *not* return the ruling that froze that slot, while `git log -S "10-50"` — the refusal's own vocabulary — did. Only the refusal's wording retrieves the refusal, which is useless when you don't already know it exists.

Zero hits on (a) means "no in-file lock, proceed" — **not** "gate passed". (b) and (c) run regardless. If any of the three surfaces a prior ruling that settled this the other way, **read it in full before writing.**

**Then apply the META-RULE to what you found:**
- The prior ruling is **factually superseded** (its evidence was wrong, its anchor moved, its number was corrected) → **FIX**. Fix it, cite what changed.
- The prior ruling stands and your only counter-argument is **reasoning without a field datum** → **WARN, never FIX.** Write the change, tag it `[PROPOSED-PENDING-CONTACT <date>]`, keep the incumbent as the active answer, and name in the Step-3 decision entry what datum would settle it. **Do not withhold the reasoning** — an unrecorded conclusion is the failure this gate now exists to prevent, not the one it prevents.

When you settle a position you expect to hold, write `LOCKED: <date> — <reason>` next to it **and** record it in `decisions.md` — (a) alone is not durable, since a ruling written only in prose is invisible to this gate.

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

**Gate 8 — Single-valued-slot reconciliation.** A **single-valued slot** is a strategy-doc heading that must hold exactly **one** current answer (the page hero, the active channel bet, the active market focus) — as opposed to a **bet-list** like `hypotheses.md`, where accumulation is correct. Gates 1/4 are blind to this: three "lead the page with X" directives can each be `UNTESTED`-labeled (Gate 1 pass), carry a falsifier (Gate 5 pass), and not *negate* each other (Gate 3's negation-grep misses non-contradicting directives) — so they silently pile up (the §UVP drift: 2026-07-04 "Get to PMF faster" + 2026-07-11 "divergent-AI hook" both marked "lead"). This gate is deterministic because single-valued slots are tagged in the doc:
```
<!-- SINGLE-VALUE: page-lead -->
```
placed immediately under the heading (convention documented in `docs/CHARTER.md`). A single-valued **directive** is a standalone dated blockquote callout `> **Name (2026-07-04, …).** …`; a `> - **…**` list bullet is an *elaboration* of the one answer, not a competing lead (excluded).

**Run it:**
```bash
python3 scripts/check-single-value-slots.py docs/lean-canvas.md docs/hypotheses.md docs/theory-of-change.md docs/definitions.md docs/progress.md
```
It counts unreconciled dated directive callouts under each `SINGLE-VALUE` marker (a callout carrying a structured `SUPERSEDED` / `FALLBACK` / `dormant` / `parked` / `demoted` token on its lead-in is treated as reconciled/subordinate, not counted). Exit 2 = a slot has **≥2** competing leads. **Quote the script output** (per this skill's "verdict with no artifact = not-run" rule).

On exit 2 → **FIX**: surface the competing directives as an **A/B/C reconcile-to-one for the founder** (never auto-resolve — "never fill in positioning without being told"), then mark the losers with `[SUPERSEDED <date> → …]` or subordinate them explicitly (primary + `[FALLBACK …]`). Adding a *new* directive to a `SINGLE-VALUE` slot without superseding/subordinating the incumbent is the exact FIX this gate blocks. This is the same logic the pre-commit `check-single-value-slots.py` canary enforces at commit time (defense-in-depth).

**Gate 9 — Novel-prediction (degeneration guard). WARN-only, never a FIX.** Gates 1–8 all check whether a claim is *honest*. None of them checks whether the programme is *going anywhere*: a hypothesis can be correctly labeled `UNTESTED`, carry a clean falsifier (Gate 5), cite its numbers (Gate 7), and still be a pure **accommodation** — a reframe that explains only the anomaly that killed its predecessor and predicts nothing new. A programme built entirely of those degenerates while passing every other gate on this list.

**Applies to:** any hypothesis being **added** or **materially updated** in `hypotheses.md` by this sync — a new bet, a reframe, a split, a wedge re-cut. **Does NOT apply to:** the existing backlog (the convention is forward-only), status-only edits, or typo/anchor fixes.

**Scope the check to the ENTRY, never the file.** A whole-file `grep -n "Novel prediction" docs/hypotheses.md` **cannot fail** — the Entry-conventions preamble contains the phrase, so it returns hits (measured: 4) no matter which hypothesis is being written, and the gate rubber-stamps PASS. Use the entry extractor:

```bash
# Extract ONE hypothesis entry, then check that entry alone.
entry() { awk -v id="$1" '$0 ~ "^#### " id "\\:" {f=1; next} f && /^#### / {exit} f' docs/hypotheses.md; }

entry H-YourHypothesis | wc -l                      # 0 lines => extractor missed it; fix before judging
entry H-YourHypothesis | grep -c "Novel prediction" # 0 => WARN;  >0 => PASS

# Ledger cross-check: anything corroborated but not yet promoted?
grep -n "corroborated" docs/hypotheses.md docs/research-programme.md
```

**A zero-line extraction is "not checked", not "PASS"** — same class as the whole-file grep, and the reason the entry count is printed first. *(Verified both directions 2026-08-07: PASS on H-WTP-Pain and H-PopperianIncrement, WARN on H-PairsReturn and H-TopicDepthGate.)*

- Field **present** → PASS. If its status is `corroborated`, promote it into the [progressivity ledger](../../../../../docs/research-programme.md) in the same edit, with its **novelty grade** (`novel` vs `retrodiction` — recorded *before* the test, or after?).
- Field **absent** → **WARN**. Ask the founder the one question: *"What does this framing predict that the one it replaces didn't?"* — then **write the answer, or write `Novel prediction: none identified — accommodation` and proceed.**
- **"None identified" is a legitimate, recordable answer and must never block the write.** Per the META-RULE above, this gate warns and requires a label; it does not restrict. An accommodation honestly labeled is a *data point for the programme-health check*; an accommodation silently written as a successor is the degeneration this gate exists to make visible.
- Programme tag (`business | scientific | both`) and, where applicable, the `core-adjacent` flag with its ad-hoc-ness budget — same treatment: prompt, label, never block.

**Gate 9 (audit mode) — rivals-reflection pass.** In **Audit** mode only, additionally walk every row of the rivals registry and ask, per rival: *did anything in the period make this rival's case stronger on our own data?*

**Define "the period" before you start — it is not otherwise defined in this skill, and two audits using different implicit windows are not comparable.** Use the same resolution `/slava:maintain:programme-health` uses, so the two agree:
```bash
LAST=$(grep '^date:' ~/.claude_programme_health_last_run 2>/dev/null | awk '{print $2}' | tr -d '[:space:]')
[ -z "$LAST" ] && LAST=$(date -v-60d +%Y-%m-%d 2>/dev/null || date -d '60 days ago' +%Y-%m-%d)
echo "Rivals-reflection period: $LAST → $(date +%Y-%m-%d)"
```
**State the resolved window in the punch list.** An audit that does not name its period produces findings nobody can reproduce or diff against the last run. Output one line per rival in the punch-list shape. **A rival whose evidence now looks better than ours is the single highest-value finding this skill can produce** — and it is the one nothing else in the pipeline is looking for. Report `no delta` explicitly rather than omitting a rival; a silently skipped row is indistinguishable from a row with nothing to report.

### Step 3 — Precondition: record the decision (Sync only)

Before writing **any** strategy-doc change, the decision + its falsifier must exist in `decisions.md` (on the branch resolved in Step 0). `/kdd` is user-triggered and cannot auto-fire, so a "capture it later" hand-off orphans the doc edit — it asserts a position with no recorded kill-condition (the exact failure Gate 5 prevents).
- Already in decisions.md → cite it.
- Not yet → write the entry now (the user invoked this skill = authorization), using `/kdd`'s decisions.md format with a `[product]` tag and a one-line falsifier. `/kdd`'s deeper meta-reflection still runs separately when the user calls it.

### Step 4 — Apply (Sync) / report (Audit)

- **Concurrency check:** re-run `git rev-parse HEAD` and `git status --short docs/`; if the six docs changed since Step 0's base, re-read before editing — a concurrent `/kdd`-at-merge or co-tenant edit must not be clobbered.
- **Sync — two classes of change (the auto-vs-surface contract):**
    - **Mechanical → apply automatically:** fix fragile line-refs (Gate 6), add falsifiers (Gate 5), merge exact-duplicate framings, and apply the spine already settled in the Step-3 decision entry.
    - **Judgment → surface to the founder as A/B/C options, never resolve silently** (the "Founder decisions" rule — never fill in positioning / category / pricing without being told): every contradiction (Gate 3), every stale-fact / status reframe (Gate 1), every deletion (Gate 4, propose-only), and any positioning wording. Present each as: *current text · why it's stale/contradictory · 2–3 resolution options*; apply only the chosen one. Update the Validation Status block with the new evidence once resolved.
- **Audit:** output the punch list grouped by gate, one line per violation in the shape `<gate> | <doc> | "<quoted phrase or anchor>" | <suggested action>` (matching the precision pre-commit Gate F already prints). A bare count is not actionable for a 50-item bloat list. No writes.

### Step 5 — Self-check

Branch placement was resolved in Step 0 (decision + docs on `main` / a docs branch); confirm it held. Then verify every gate before writing.

Self-check (**each box must cite its gate-report artifact** — a ticked box with no quoted evidence counts as not-done):
- [ ] Branch resolved before any write (Step 0.1) — decision + docs on main / docs branch
- [ ] All six docs read this session (Step 0)
- [ ] Sync delta expressible as "X was true; now Y, because &lt;evidence&gt;"
- [ ] Gate 1: no unsourced status word / number; definitions.md carries none
- [ ] Gate 2: lock grep run (output quoted); any override names new evidence
- [ ] Gate 3: negation greps run (terms quoted); no anchor broken, no contradiction left standing
- [ ] Gate 4: every deletion shown + confirmed; no falsifier-bearing block cut; relabeled box has a `Dormant` sibling (active-on-top check, grep quoted)
- [ ] Gate 5: every new claim has a one-line falsifier
- [ ] Gate 6: no line-number cross-refs introduced
- [ ] Gate 7: every number cites a source or is labeled unverified
- [ ] Gate 8: `check-single-value-slots.py` run (exit code + output quoted); no `SINGLE-VALUE` slot has ≥2 unreconciled leads
- [ ] Gate 9: every added/updated hypothesis carries a Novel-prediction field (or an explicit `none identified — accommodation`) + programme tag; corroborated ones promoted to the progressivity ledger with a novelty grade. Audit mode: one line per rival.
- [ ] README / CLAUDE.md reflection duty checked and reported (Step 0.2) — CLAUDE.md via `/slava:maintain:claude-md`, never directly
- [ ] Decision + falsifier recorded in decisions.md (Step 3)
- [ ] Concurrency re-check passed (Step 4)

### Step 6 — Confirm + hand off

Report: docs touched, gate report (pass/fix/warn with artifacts), the decision entry written, and the next step (`/kdd` for meta-reflection; `/slava:maintain:claude-md` if CLAUDE.md needs a pointer).

**GTM-drift detect.** After applying, compare the *active* channel/posture in `lean-canvas.md` (the structural channel bet) against `docs/goals.md` §Active (the tactical funnel). If they name **different active channels** (e.g. the canvas says founder-direct while goals still runs coaches-first) that is **drift** — flag it, quoting the two active-channel phrases you compared.

**Fix `goals.md` in this same edit** (Gates 1 + 3 only) when the drift was caused by the sync you just applied — a status or lead you changed in a gated doc that `goals.md` still contradicts. If you leave it unfixed, say so explicitly in the Step-6 report and why. **Hand off only `.private/docs/gtm-launch-icp-worksheet.md`** (CHARTER rule 1 — private, contains names): "the private residue needs updating to match the strategy docs; no skill owns it — update it directly."

**Why this changed (2026-07-23):** the prior rule was detect-and-hand-off for `goals.md` too. `decisions.md` records two such hand-offs; neither produced the edit, and a stale page-lead copy survived in `goals.md` for nine days after the wedge flip. **Honest limit:** this binds only the path that runs *inside this skill*. `/day` and the kanban `PATCH /api/goals` endpoint write `goals.md` outside it, ungated.

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
  8 single-value-slot ..... PASS|FIX|WARN  <check-single-value-slots.py exit code + any competing leads>
  9 novel-prediction ...... PASS|WARN      <per added/updated hypothesis: the prediction, or "none identified — accommodation"; audit: one line per rival>

README/CLAUDE.md reflection: <no change needed | README edit applied | CLAUDE.md needs /slava:maintain:claude-md>

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

- `/slava:maintain:programme-health` — judges progressive/stagnating/degenerating from the docs alone; the hand-off when Gate 9 keeps returning accommodations, or when a refutation looks like a core-hit. Writes nothing, so it never competes with this skill for the doc layer
- `/kdd` — owns decisions.md + meta-reflection; this skill writes the decision stub as a precondition, `/kdd` does the deeper pass
- `/slava:maintain:claude-md` — gate for CLAUDE.md / `.claude/rules/` changes
- `/slava:build:create-spec` — when the output is a tracked feature, not a strategy-doc change
- `/slava:think:falsify` — when a strategic claim itself needs first-principles stress-testing before it is written
