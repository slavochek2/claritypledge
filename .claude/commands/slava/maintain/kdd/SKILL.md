---
name: kdd
description: Record decisions + meta-reflection. Run after features with trade-offs, architectural choices, or any session worth learning from. Captures what was built (why) and surfaces session friction as chat output only — no file logging.
when_to_use: "After features with trade-offs, architectural choices, or sessions worth learning from."
version: 1.0.0
---

# Knowledge-Driven Development (KDD)

Capture knowledge that matters. Git tracks *what* changed; this captures *why* and keeps docs current.

## Doc Architecture

**Source of truth docs** (concepts live here, one place only):

| Knowledge type | Goes in |
|----------------|---------|
| Concepts (Stories, Points, Verification, etc.) | `docs/definitions.md` |
| Business strategy (platform + coaching) | `docs/lean-canvas.md` |
| What we're testing + evidence base | `docs/hypotheses.md` |
| Open questions (unresolved) | `docs/hypotheses.md` "Open Questions" section |
| Stakeholder objections + our answers (therapist/investor/skeptic/partner) | `.private/docs/business/stakeholder-qa.md` |
| Build sequence, priorities, trade-offs | `docs/decisions.md` |
| GTM, sales tactics, pitches | `features/archive/p105_sales_playbook.md` (archived) |
| Pivot options | `docs/lean-canvas.md` "Alternative Approaches" section |
| Epistemology (WHY this works) | `docs/philosophy.md` |
| Cascade, √N, network effects | `docs/theory-of-change.md` |
| Service layer, component patterns | `docs/technical/architecture.md` |
| Schema, RLS, data model | `docs/technical/database.md` |
| Auth flows, session handling | `docs/technical/authentication.md` |
| Test patterns, helpers | `docs/technical/e2e-testing-guide.md` |

> **Strategy-doc gate (single rule — no exceptions below):** `/kdd` **never writes the five gated strategy docs** (`lean-canvas.md`, `hypotheses.md`, `theory-of-change.md`, `definitions.md`, `progress.md`). It captures the decision + falsifier in `decisions.md` (which it owns) and **hands the strategy-doc edit to `/slava:maintain:docs-strategy-update`** (8 anti-drift gates, incl. Gate 8 single-valued-slot reconciliation). Any instruction below that reads as "→ write `lean-canvas.md`/`hypotheses.md`" means: **record the decision in `decisions.md`, then hand off** — routing a strategy edit around the gate is how competing directives silently accumulated (the §UVP page-lead drift).

**Consumer docs** (link only, never duplicate):
- `README.md` — Setup for humans
- `CLAUDE.md` — Instructions for AI

**Don't update via /kdd:**
- Historical explorations (`docs/visions/`) — archived, rarely change
- Feature specs (`features/`) — managed separately

## Feature-level vs Product-level Decisions

**Use /kdd (global docs):**
- Affects multiple features or establishes reusable pattern
- Changes product direction or mental model
- "Future me will wonder why we did this"

**Use feature spec "Decisions Made" section:**
- Only matters within this feature
- Implementation details
- Won't be referenced elsewhere

| Decision | Level | Destination |
|----------|-------|-------------|
| "Sifter-first model" | Product | `/kdd` → decisions.md |
| "Journey position above content" | Feature | feature spec |
| "N:N Story-Point relationship" | Product | `/kdd` → decisions.md |
| "Mock data for prototype" | Feature | feature spec |

---

## Guardrails

1. **Never add concept explanations to README.md or CLAUDE.md** — these are consumer docs that link to source docs
2. **Warn if knowledge would duplicate existing content** — check source docs first
3. **Suggest consolidation when detecting drift** — if same concept appears in multiple places, propose moving to single source

**Example of drift detection:**
```
⚠️ Drift detected: "Stories vs Points" explained in:
  - docs/definitions.md (source)
  - README.md lines 15-20 (duplicate)

Recommendation: Remove from README.md, link to definitions.md instead.
```

## Workflow

0. **Branch check (non-blocking):**
   ```bash
   git branch --show-current
   ```
   KDD writes and commits on the current branch. Doc entries (decisions.md, INDEX.md, technical docs) ride to main when the feature merges, like any tracked file.

   **Exception — skill files.** KDD does not edit `.claude/commands/slava/**/*.md`. If a session surfaces a skill-file change, handle it as a separate edit following `.claude/rules/skills.md` Branch Guard.

   **Park/reject risk:** If the current branch is about to be `/park`'d or deleted without merging, cherry-pick KDD edits to main first — otherwise entries are lost.

1. **Review recent work:**
   ```bash
   git log --oneline -10
   ```
   **Already-captured check (speed filter):** Before the full doc read in step 3, scan recent commits (`git show <hash> --stat`) for any that already wrote the same topic to a doc file (decisions.md, INDEX.md, etc.). If the commit log confirms it, skip — don't propose a duplicate. When the commit log is unclear, step 3's file-level read is authoritative.

2. **Analyze and classify** — what type of knowledge was created? (Rows marked **→ hand off** mean: record the decision in `decisions.md`, then run `/slava:maintain:docs-strategy-update` for the doc edit — `/kdd` never writes those docs directly. See the Strategy-doc gate above.)
   - Decision made? → `decisions.md`
   - Hypothesis validated/added? → decisions.md + **hand off** to docs-strategy-update (`hypotheses.md`)
   - New open question surfaced? → decisions.md + **hand off** (`hypotheses.md` "Open Questions")
   - Open question answered? → decisions.md + **hand off** (update/remove from Open Questions)
   - Phase complete / focus shifted? → `decisions.md`
   - Business strategy changed (platform or coaching)? → decisions.md + **hand off** (`lean-canvas.md`)
   - GTM/sales approach changed? → `features/archive/p105_sales_playbook.md` (archived — or capture in decisions.md if new direction)
   - Schema/auth/testing changed? → relevant technical doc
   - Domain concepts changed? → decisions.md + **hand off** (`definitions.md`)
   - Epistemological claims or WHY-this-works reasoning updated? → `docs/philosophy.md`

3. **Propose updates** — before proposing, cross-check against the git log from step 1. If a commit in the Step 1 log (`git log --oneline -10`) shows the doc file was updated AND the commit message references the same topic as the current KDD update — skip it; it's already captured. A doc file touched for a different feature in a prior commit does not count as captured. When in doubt, read the target doc file directly and grep for the topic's key noun phrase. If the concept is found with the same conclusion, do NOT propose — cite the existing entry instead. If the concept is found but the session produced a different conclusion, updated evidence, or changed direction — propose an update to the existing entry (not a new one). Only propose a new entry if the file read confirms the topic is absent entirely. State what you'll update and why, then proceed.
   - If no updates needed: "No knowledge updates needed" and skip to step 5
   - Don't ask repeatedly for confirmation — be decisive

4. **Update docs** using appropriate format:

   **Before writing to decisions.md:** run `[ -f .git/CHERRY_PICK_HEAD ] && echo "BLOCKED" || echo "OK"`. If BLOCKED — stop: "cherry-pick in progress — resolve it first (`git cherry-pick --continue` or `--abort`), then re-run /kdd." Do not attempt the Edit while a cherry-pick is in progress; the file is in an unmerged state and the write will fail or corrupt it.

   **For decisions.md** (append at TOP, after header):
   ```markdown
   ## YYYY-MM-DD [tag]: Decision Title

   **Context:** Why this came up
   **Decision:** What we chose
   **Alternatives rejected:** What we didn't choose
   **Consequences:** What this means going forward
   **References:** [file.md](path/to/file.md)
   ```

   **Tag is required.** Pick exactly one:
   - `[product]` — strategy, positioning, business model, UX model, customer definition → read by `/create-spec`, `/ux`, `/spec-review`
   - `[technical]` — schema, code patterns, data model, infrastructure, service design → read by `/architect`, `/finish`, `/spec-review`
   - `[process]` — workflows, skills, dev tooling, testing, agent setup → no active skill filters this tag; serves as human-readable context in `/day` and `/weekly` when they scan decisions.md

   **Quick classification:** if it affects how users experience the product → `[product]`. If it affects how the code is structured → `[technical]`. If it affects how the team/agents work → `[process]`.

   **Security-sensitive entries:** When writing `[technical]` or `[security]` entries about vulnerability fixes, describe *what was fixed* — not *how to exploit* the old version. This is a public repo; decisions.md is readable by anyone.
   - **Do:** "Moved secret from client bundle to server-side edge function"
   - **Don't:** "Secret was extractable from DevTools by opening Sources tab and searching for VITE_"
   - **Do:** "Fixed RLS policy that allowed unauthorized reads"
   - **Don't:** "Policy used `OR true` which always evaluates true, exposing all rows"
   - **Commit messages follow the same rule** — describe the fix, not the attack vector
   - Specific secret values (even old/rotated ones) never go in decisions.md — reference `.private/` if needed

   **For hypotheses.md (and the other four gated strategy docs) — DO NOT write here directly.** Capture the decision in `decisions.md` (above), then hand the edit to `/slava:maintain:docs-strategy-update`. The strategy-doc changes it will make (via that skill's gates) include:
   - Change status emoji (⏳ → 🔄 → ✅)
   - Add validation notes
   - Add new hypotheses if discovered
   - Add/update Open Questions section when unresolved questions surface
   - Remove/update Open Questions when answered

   `/kdd`'s own commit (step 4.4) covers `decisions.md` + INDEX; the strategy-doc write + its commit belong to docs-strategy-update.

   **For technical docs:**
   - Keep them accurate to current implementation
   - These are Claude's context shortcuts — save future re-reading

4.4. **Commit immediately after writing** — do not leave KDD changes staged or unstaged:

   ```bash
   git add docs/decisions.md features/done/INDEX.md  # decisions.md + INDEX only — NOT the gated strategy docs (those are docs-strategy-update's commit)
   git commit -m "docs: [topic] KDD — [one-line summary]"
   ```

   If the commit fails (pre-commit hook), fix the blocker and retry — never leave KDD changes uncommitted. Staged-but-uncommitted edits are lost if the worktree or session ends before commit.

4.5. **Flag decisions with follow-up work:**

   After writing new entries to `decisions.md`, scan each new entry's **Consequences** field for actionable language:
   - Keywords: "Status: proposed", "needed", "follow-up", "future spec", "TODO", "implement via"
   - Pattern: any sentence that implies work not yet tracked

   For each flagged decision:
   - Ask the user: "Decision '{title}' has follow-up work: '{consequence snippet}'. Create a spec? (y/n)"
   - If yes: run `/create-spec` to create a skeleton spec linked back to the decision
   - If no: respect the decline, don't ask again this session

   **Skip this step if:** no new entries were written to decisions.md in step 4.

4.6. **Stakeholder Q&A pass:**

   Scan this session for any question a **therapist, investor, skeptic, or partner** asked — or would predictably ask — that we developed a usable answer for (positioning, objection-handling, evidence-concession, targeting). These are pitch-and-credibility answers, distinct from product decisions (`decisions.md`) and the customer-facing in-app FAQ (`src/app/content/faqs.ts`).

   For each one found:
   - Read `.private/docs/business/stakeholder-qa.md` first. If the same question exists, update the entry only if this session changed the answer, evidence, or confidence. Otherwise skip — don't duplicate.
   - Append new questions using the template at the top of that file (Q / Asked-by / Short answer / Why+evidence / Status / Source).
   - Set `Status` honestly: `firm` (evidence-backed), `provisional` (reasoned, untested), `needs-validation` (claim outruns evidence). A `needs-validation` answer must say so — never present inference as confirmed.
   - Commit with the other KDD edits: `git add .private/docs/business/stakeholder-qa.md`.

   **Skip this step if:** the session produced no stakeholder-facing Q&A (e.g. a pure technical/refactor session).

5. **Update done-features index:**

   After any feature is closed (moved to `features/done/`), append it to `features/done/INDEX.md`.

   Find the right domain section and add one line:
   ```
   - **P{N}** ({Mon YY}) {Title} — {≤15-word learning: gotcha, pattern, or key decision}
   ```

   **Domain sections** (add new ones if needed):
   - Live Session / Real-time
   - Points & Stories
   - Database / RLS / Migrations
   - Navigation & Routing
   - UI / Design System
   - Auth & Verification
   - Infrastructure / Process

   **What makes a good learning:** A gotcha ("DROP CONSTRAINT before ALTER COLUMN TYPE"), a pattern ("use atomic transaction, not sequential calls"), or a decision ("positions use optimistic updates, not refetch"). Not a summary of what was built.

   **Update the `Last updated:` date** at the top of the file.

   **Skip if:** No features were closed this session (running `/kdd` standalone on infra/docs work with no spec to close).

6. **Feature housekeeping:**

   **Skip if running after `/dev` or `/fix`** — those auto-close features already. This step only applies when running `/kdd` standalone after work done outside the standard flow (e.g., direct code edits, infra changes, manual migrations). To verify, run `git log --oneline -5` and look for commits matching `feat(pN)` or `fix(pN)`. If the spec is already in `features/done/`, skip this step.

   ```bash
   ls features/*.md
   ```
   If any features are complete based on the work done, update frontmatter before moving:
   ```yaml
   status: done
   completed_at: '{today YYYY-MM-DD}'
   ```
   Then move:
   ```bash
   git mv features/pNN_feature.md features/done/
   ```
   **Do NOT skip `completed_at`** — kanban "Done Today" column filters on this field.

6.25. **Privacy & security disclosure gate:**

   **Universal rule:** This is a public repo. Never write client names, phone numbers, WhatsApp links, session details, or any personally identifiable information into docs, decisions, or feature specs. Use generic references ("a client", "the feedback form") instead of names. Private details belong in `.private/` only.

   Run `/maintain:privacy` before committing if the session involved:
   - **claude-conversations:** doc updates synthesized from personal claude.ai conversations (reading from `~/projects/private/claude-conversations/` or user mentioned a conversation by name)
   - **sifter sessions:** any use of `/slava:sifter-story` or `/slava:sifter-point` — brain dumps contain real names and private context; verify no session file landed in `content/sifter/` before committing
   - **client/sales sessions:** any work involving client names, testimonials, referral flows, WhatsApp messages, or post-session follow-ups. Decisions about the *model* (pay-what-it's-worth, referral structure) go in decisions.md; client-specific details (names, links, templates) go in `.private/docs/client-lifecycle.md` only.

   **Security disclosure check — if session involved security/vulnerability work:**

   Before committing, scan all staged doc changes (`git diff --cached`) for:
   - **Exploitation details:** step-by-step attack instructions, specific bypass techniques, SQL/code that demonstrates the vulnerability
   - **Secret values:** API keys, tokens, passwords, connection strings — even rotated/old ones (attackers can search git history for previously-valid secrets)
   - **Specific CVE reproduction steps** beyond the CVE number itself
   - **RLS policy logic flaws** described in enough detail to reproduce on similar systems

   If found: rewrite to describe the fix outcome, not the attack path. Move exploitation details to `.private/docs/security-log.md` if they need to be preserved for future reference.

   **The test:** Could someone reading this entry exploit a similar system that hasn't been patched? If yes, rewrite.

6.5. **Session wrap checklist:**

   Run in parallel:
   ```bash
   git status --short          # uncommitted changes?
   python3 scripts/fix-frontmatter.py --dry-run 2>/dev/null | head -5   # frontmatter drift?
   curl -sf "http://localhost:9050/api/features?refresh=true" > /dev/null && echo "Kanban refreshed." || echo "Kanban not running — skip."
   cat "$(git rev-parse --path-format=absolute --git-common-dir)/.finish-reviewed" 2>/dev/null || echo "NO_FINISH_REVIEW"
   ```

   Report:
   - If uncommitted changes exist: list them. Ask: "Commit now or leave for next session?"
   - If frontmatter drift detected: mention it. Offer to run `fix-kanban`.
   - Report kanban result as returned by the curl command.
   - If `.finish-reviewed` is missing or empty: "Reminder: `/finish` wasn't run this session. Run it to review changes before shipping."

7. **Meta-reflection** — output to chat only (no file logging):

   > **User-triggered only.** This step runs when `/kdd` is explicitly called by the user. Do NOT invoke `/kdd` autonomously to capture meta-reflection from your own session reasoning — only run when the user explicitly calls the skill.

   **7.0 Eventful-session self-check (gating):**

   Before extracting anything, ask yourself:

   > "Can I name at least 2 concrete frictions in this session? A friction is a moment where:
   > - I had to retry the same command/approach with a fix in between
   > - The user corrected me on a non-trivial assumption
   > - A test failed in a way that revealed missing context
   > - I asked a question the user later said was unnecessary
   > - A subagent returned output that had to be re-spawned with better framing
   > - I changed direction on a decision and the prior reasoning would mislead a future session"

   Output one of:
   - **(a) Eventful:** `Eventful: <friction 1 with file/P-number/quote>, <friction 2 ...>`. Proceed to 7.1.
   - **(b) Clean session:** `Clean session — candidates considered: <list 0–2 borderline moments that didn't meet the friction bar, with why each was below>`. Append to `~/.claude/kdd-suppressed-log.md` (see 7.X) and **exit /kdd**.

   **Do NOT lower the bar to find 2.** Default is "Clean session." The suppression log lets the user verify periodically that real frictions weren't missed.

   **7.1 Extract problems (sonnet subagent) with EV gate:**

   Before spawning, collect key session events (files edited, errors encountered, decisions made, back-and-forth exchanges) as a concise summary. Also read recent `docs/decisions.md` entries for cross-reference context — the file is newest-first, so "the last 50 lines" is the wrong end (it lands 7+ months stale) and a flat line count is unreliable regardless of direction (entries vary from a few lines to 50+). Anchor on headings instead: `head -n "$(grep -n '^## 2026-' docs/decisions.md | sed -n '15p' | cut -d: -f1)" docs/decisions.md` reads the 15 most recent entries regardless of length. Pass both inline.

   Spawn a `general-purpose` subagent (`model: "sonnet"`) with this task:

   > "From the session summary and decisions context provided above, extract problems, friction points, mistakes, and inefficiencies. Consolidate near-identical incidents into one item.
   >
   > **Cap: 2 items maximum. If more than 2 candidates pass the EV gate, return only the top 2 by upside × confidence — drop the rest with reason.**
   >
   > For each candidate, apply the EV gate:
   >
   > - **Upside (1–5):** 1 = this session only, 3 = monthly recurrence, 4 = weekly recurrence, 5 = multiple times per week
   > - **Confidence (1–5):** 1 = guess, 3 = pattern observed once, 5 = pattern observed 3+ times across sessions
   >
   > Include item **ONLY if upside ≥ 4 AND confidence ≥ 3.** Weekly-or-tighter recurrence is the bar. Monthly-recurrence × once-observed is the noise floor — drop. Log dropped candidates with reason in your response.
   >
   > For each included item: (1) what happened concretely (file paths, P-numbers, quotes), (2) upside/confidence ratings with one-sentence justification, (3) category: wrong-assumption / unnecessary-question / repeated-step / missed-signal / scope-creep / tool-fumble / missing-context / process-gap, (4) severity: minor / moderate / significant."

   **Early exit:** If 7.1 returns 0 items after EV gate, skip 7.1b and 7.1c entirely. Output "Clean session after EV gate — no items met upside ≥ 4 AND confidence ≥ 3." Log dropped candidates to suppression (7.X) and exit.

   **7.1b Opus critic with EV verdict:**

   After 7.1 returns 1–2 items, spawn a second `general-purpose` subagent (`model: "opus"`) with this task:

   > "You are a devil's advocate critic. For each item, verdict on TWO axes:
   >
   > (1) **ROOT CAUSE:** SURVIVES / WEAKENED / FALSIFIED — if weakened or falsified, provide the corrected diagnosis; be concrete (name the file, line, or command).
   > (2) **EV:** HIGH / MEDIUM / LOW — HIGH = clear future-session benefit + low intervention cost; MEDIUM = real but narrow benefit, or cost obvious; LOW = benefit unclear, or cost > expected savings.
   >
   > **Disposition:**
   > - **PROCEED** if ROOT CAUSE survives AND EV is HIGH or MEDIUM.
   > - **SKIP** if ROOT CAUSE falsified OR EV is LOW.
   > - **SIMPLIFY** (multi-option) only if ROOT CAUSE survives AND EV is HIGH AND multiple defensible interventions exist.
   >
   > **Required:** read every file each item cites before verdict. Cite the file + line for any objection. Uncited objections are invalid.
   >
   > Items: [paste 7.1 output here]"

   Pass the 7.1 output inline. The second agent must read actual files — not critique from prose alone.

   After second-round critique:
   - **WEAKENED:** replace the root cause with the corrected diagnosis
   - **FALSIFIED:** drop the item, note it was falsified, log to suppression (7.X)
   - **SURVIVES + EV HIGH/MEDIUM:** proceed to 7.1c
   - **SURVIVES + EV LOW:** drop and log to suppression (7.X)

   **7.1c Lean critic on PROCEED set:**

   If 1+ items survive 7.1b as PROCEED or SIMPLIFY, spawn one more `general-purpose` subagent (`model: "sonnet"`) with this task:

   > "Hostile reviewer. For each item, score:
   > - Already covered by existing rule/doc/skill? (cite file + line)
   > - Better alternative exists?
   > - Net upside after intervention cost?
   >
   > Per-item verdict: **REJECT** / **DEFER** / **ACCEPT**.
   >
   > **ACCEPT burden:** if you mark 2+ items ACCEPT, justify in 2 sentences why each ACCEPT is not already covered by an existing rule (cite the rule file you searched). This burden lives on ACCEPT, not REJECT — accepting more than the minimum needs justification, not refusing to accept.
   > Cap 800 words.
   >
   > Items: [paste PROCEED + SIMPLIFY items here]"

   Apply 7.1c verdict:
   - **REJECT** → drop, log to suppression (7.X)
   - **DEFER** → drop with "revisit if recurs" note in suppression log
   - **ACCEPT** → carry to 7.2 presentation

   **7.2 Present (confirmation, not triage):**

   **Hard cap: 2 items.** If 7.1c returns 3+ ACCEPTs, present only the top 2 by Opus EV verdict (HIGH before MEDIUM); log the rest to suppression.

   If 0 items survive 7.1c: output "Clean session after EV filter — no recommendations. Suppressed items logged to `~/.claude/kdd-suppressed-log.md` for periodic review." and exit.

   For each surviving item:

   ```
   Item N: <one-sentence what-happened>
   Confidence: <Opus EV verdict — HIGH/MEDIUM>
   Action: <exact command, file path, line number — no abstractions>
   ```

   End with: `Confirm to apply, or N=skip to drop item N.`

   *Note: removed the prior "filter to 3-4" step. Volume is not a goal.*

   **7.3 `/simplify` block format for decisions (used only when 7.1b returns SIMPLIFY):**

   ```
   **Situation:** [1 sentence — what friction occurred]

   **Options:**
   A) [option] — [one line of real consequence, in the lenses of `/slava:build:simplify`
      section 2: business · cost · product · user · the founder as operator]
   B) [option] — [same]
   C) [option, if exists] — [same]

   **Recommendation:** [Option X] — prevents this by [mechanism] (mechanical: yes/no). Main risk: [Y].

   Reply: "A", "B", or "C"
   ```

   *mechanical = prevents the problem automatically without future discipline. Prefer mechanical solutions. Use 3 options only when a genuine middle path exists — don't invent one to fill the format.*

   End with: "Reply with choices, e.g. 1=A, 2=B."

   If it requires `/slava:maintain:claude-md` gate or user judgement: flag as a block, don't act unilaterally.

   **Proposed → resolved:** When a `(Status: proposed)` entry in decisions.md gets resolved (fix applied, root cause confirmed), update the entry in-place: remove `(Status: proposed)` from title, fill in Decision and Consequences fields. One file, no graduation step.

   **7.X Suppression log:**

   After every `/kdd` run (including 7.0 "Clean session" exits), append a YAML entry to `~/.claude/kdd-suppressed-log.md`:

   ```yaml
   - date: 2026-MM-DD
     session_summary_oneline: <what session was about>
     outcome: clean | items: N
     suppressed_at_7.0: [<friction candidates that didn't meet bar, with why>]
     suppressed_at_7.1_ev_gate: [<dropped items with upside/confidence ratings>]
     suppressed_at_7.1b_opus: [<items marked SKIP and why>]
     suppressed_at_7.1c_lean: [<REJECT/DEFER items>]
   ```

   Create the file with a header if it doesn't exist:

   ```markdown
   # /kdd Suppression Log

   Items the meta-reflection gate dropped. Reviewed by `/slava:maintain:weekly` — if 4+
   suppressed items in a week share the same category, surface for threshold recalibration
   (7.0 friction bar, 7.1 EV gate, 7.1c lean critic). Without a reader, this log becomes
   write-only debt — `/weekly` is the reader.
   ```

8. **Skill-quality reflection** — dropped. Use `/falsify` explicitly when skill quality review is needed. KDD's core job is capturing decisions (Steps 1-7), not reviewing skill quality.

## Rules

- **Be decisive** — analyze and propose, don't repeatedly ask
- **decisions.md is append-only** — never edit old entries
- **Technical docs are living** — update to match current reality
- **One commit can touch multiple docs** — that's fine
- If user says skip, acknowledge and exit
