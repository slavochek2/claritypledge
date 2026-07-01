---
name: scriptify
description: Convert an existing skill's deterministic steps into a script and produce an A/B twin in the `script/` namespace — extracts the mechanical middle, keeps model judgment inline, and adopts the twin only after it's proven.
when_to_use: "When you want to de-model an existing skill's mechanical steps into a script and A/B-test the result. NOT for creating a skill (/create-skill), moving one global (/promote-skill), or searching skills (/find-skill)."
version: 1.0.0
---

# /scriptify

Take an existing skill, split its steps into **mechanical** (deterministic) / **judgment** (needs the model) / **non-scriptable-io** (needs the model's tool context), extract the mechanical steps into `scripts/generated/<name>.sh`, and write a hybrid twin `/slava:script:<name>` that keeps judgment inline and calls the script for the rest. The original is left untouched so you can A/B them, and `adopt` archives it only once the twin is proven.

**Announce at start:** "Running /scriptify."

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| De-model a skill's mechanical steps into a script + A/B twin | `/scriptify` ← here |
| Create a brand-new skill from scratch | `/slava:build:create-skill` |
| Move a skill from project → global | `/slava:util:promote-skill` |
| Find an existing skill | `/slava:util:find-skill` |

---

## Usage

```
/scriptify util:claude-sync-download          # CREATE the twin (verified: false)
/scriptify util:claude-sync-download adopt     # TEST-then-demote: prove it works, archive the original
```

Takes a skill name (`namespace:name`, `namespace/name`) or a path. The optional `adopt`
word selects adopt mode — the only word the skill reads (it is a mode, not a `--flag`).

**Two modes:**
- **create** (default) — Steps 1–7 below. Builds the twin + script, dry-run only.
- **adopt** — "## Adopt mode" below. Refuses to archive the original unless the twin is
  proven (auto for pure-mechanical, human-attested live run for hybrids).

---

## Workflow

### Step 1: Resolve and read the target skill in full

Resolve the argument to a file under `.claude/commands/slava/<namespace>/`. If it can't be resolved, stop and say so. Read the **entire** file — classification depends on every step.

**Three hard refusals (run these first, they are mechanical):**

```bash
ORIG=".claude/commands/slava/<namespace>/<name>.md"
TWIN=".claude/commands/slava/script/<name>.md"
SCRIPT="scripts/generated/<name>.sh"   # or .mjs
# 1. Twin-of-twin: never scriptify a skill that is itself in the script/ namespace
case "$ORIG" in .claude/commands/slava/script/*) echo "REFUSE: target is already a script twin"; exit 1;; esac
# 2. No-clobber: refuse if EITHER artifact already exists (not just the .md)
[ -e "$TWIN" ]   && { echo "REFUSE: $TWIN exists — delete to regenerate"; exit 1; }
[ -e "$SCRIPT" ] && { echo "REFUSE: $SCRIPT exists — delete to regenerate"; exit 1; }
# 3. Snapshot the original's git state NOW, to prove "untouched" later (Step 6)
git status --porcelain -- "$ORIG" > /tmp/scriptify-orig-before.txt
git hash-object "$ORIG" > /tmp/scriptify-orig-hash.txt
```

Paste the output. If any refusal fires, stop. The snapshot makes "original untouched" falsifiable even on an already-dirty tree — Step 6 diffs against it rather than trusting a bare post-hoc `git status`.

---

### Step 2: Classify every step into three buckets

Print the **full classification table** — this is the crux of the skill, never collapse it to a verdict:

```
Step | Bucket            | Reason
-----+-------------------+----------------------------------------
1    | non-scriptable-io | calls Chrome MCP to click "Export data"
2    | mechanical        | regex-extract URL from email body
3    | judgment          | decide which record matches
...
```

**Bucket criteria — apply in this order (first match wins):**

1. **`non-scriptable-io`** — the step either (a) invokes an MCP tool (`mcp__*`), Chrome/browser automation, or computer-use — capabilities that only exist in the model's tool-call context; OR (b) shells out to anything **stateful, authed, or network-side-effecting** even if it looks like deterministic shell: `open`, `claude-sync`, `gh`, `curl`/`wget`/`http`, `ssh`/`scp`, `supabase`, `gcloud`, `psql`, or any CLI wrapping OAuth/session/credential state. **Force here regardless of how deterministic the logic looks** — this is where the "auth divergence" risk hides: a step reclassified as `mechanical` because it "looks like a curl" reintroduces exactly the different-auth-path bug this bucket exists to prevent. A bash script *can* contain these commands, but doing so moves an authed/prod action out from behind the model gate — so it stays inline unless the user explicitly approves the extraction. Never silently rewrite an MCP step to `curl`/CLI; if a bash equivalent plausibly exists, note it inline as `[REWRITE CANDIDATE — different auth path, verify before trusting]` and leave it inline; the user decides.
2. **`judgment`** — the step needs an NL decision, content generation, visual adjudication, or a success heuristic. This includes **"wait until X" / "retry until Y appears"** steps where "done"/"success" is a judgment (e.g. a DOM/screenshot heuristic), even though the polling loop looks mechanical.
3. **`mechanical`** — everything left: same input → same output, no NL judgment, no MCP/tool context. Regex, file ops, deterministic shell, pure data transforms.

Only `mechanical` steps get extracted. `judgment` and `non-scriptable-io` stay inline in the twin.

---

### Step 3: Extract mechanical steps into a script

Write `scripts/generated/<name>.sh` (use `.mjs` if it needs Node/JSON parsing). Rules:

- **Data-flow contract:** values produced by inline judgment/io steps enter the script as **explicit CLI args** (e.g. `$1` = download URL). The script must **validate every arg up front and `exit 1` with a clear message on missing/malformed input** — never default or coerce silently.
- **`DRY_RUN=1` mode:** the script must skip every mutating or external call (writes, downloads, prod hits, sends) when `DRY_RUN=1` is set, so verification is side-effect-free.
- `set -euo pipefail`. Comment each extracted block with the original step number it came from.
- Create `scripts/generated/` if it doesn't exist. `chmod +x` the script.

**If the twin is PURE-mechanical** (0 `non-scriptable-io` steps), also write an equivalence test `scripts/generated/<name>.test.sh`: known input(s) → assert the script's output equals the original's expected output. This is what lets `adopt` prove the twin automatically. For **hybrid** twins (any io step), a full equivalence test is impossible — the io path needs a real run — so skip the test file and record in the twin that adoption requires human-attested live proof.

---

### Step 4: Write the hybrid twin

Write the twin into the **`script/` namespace**: `.claude/commands/slava/script/<name>.md` (create the dir if missing) → invoked `/slava:script:<name>`. A separate namespace keeps the unverified twin from stealing dispatch from the proven original. Structure:

- Same frontmatter as the original, `name: script-<name>`, `version: 1.0.0`, description prefixed `[SCRIPT TWIN]`.
- `verified: false` — the machine-checkable gate flag. `adopt` refuses to archive the original until this is `true`.
- `when_to_use` prefixed `[UNVERIFIED TWIN — /scriptify, do not route here over the original until A/B-verified]` so skill dispatch and human scanners can't mistake it for canonical behavior.
- Add `requires_original: <path-to-original>.md` to the twin's frontmatter — makes the "don't delete the original" dependency machine-checkable by a later repo-health scan, not just a one-time human note.
- Judgment and non-scriptable-io steps stay as prose, **in original order**.
- The contiguous mechanical run collapses to a single `Bash` call to `scripts/generated/<name>.sh`, passing the judgment-step outputs as documented args.
- A short **"Contract"** note listing exactly which args the script expects and where each comes from.
- Do NOT touch the original file.

---

### Step 5: Verify — run the checks, don't assert them (epistemic gate 7)

Every gate below is a **command whose output you paste** — never a claim you make. Run all of them:

```bash
S="scripts/generated/<name>.sh"
# (a) Syntax
bash -n "$S" && echo "syntax OK"
# (b) LEAK/ESCAPE grep — no MCP-equivalent, network, prod, or stateful CLI should
#     have landed in the script. Any hit = a non-scriptable-io step was misclassified.
grep -nE 'mcp__|curl|wget|\bhttp|\bssh\b|\bscp\b|\bopen\b|claude-sync|supabase|gcloud|psql|\bgh\b' "$S" \
  && echo "!! REVIEW: possible non-scriptable-io / auth-bearing command in script" || echo "escape-grep clean"
# (c) SECRET/PRIVACY grep — repo is PUBLIC AGPL. No secret or personal identifier baked in.
grep -niE 'sk-|api.?key|secret|password|token|@gmail|@googlemail|\.env|besjtuodziykmjidubzw|project.?ref' "$S" \
  && echo "!! REVIEW: possible secret/PII/prod-ref in script" || echo "secret-grep clean"
# (d) DRY_RUN happy path — paste exit code
DRY_RUN=1 ./"$S" <sample args>; echo "dry-run exit=$?"
# (e) NEGATIVE path — arg validation must FAIL LOUD (exercise the failure, gate 7)
DRY_RUN=1 ./"$S"; echo "no-arg exit=$? (MUST be non-zero)"
# (f) SIDE-EFFECT check — prove DRY_RUN actually suppressed writes
find <expected-output-paths> -newer /tmp/scriptify-orig-hash.txt 2>/dev/null \
  && echo "!! DRY_RUN mutated something" || echo "no side effects during dry-run"
```

- Any `!!` line in (b)/(c)/(f) → stop, surface to the user, do not report the twin as ready.
- (e) MUST show non-zero. A zero exit on no-args means validation is missing — fix the script.
- State in the report what green still does **NOT** prove: prod auth resolution, real writes/sends against live targets, and whether the judgment-step arg *values* the model will emit are correct.

If a step genuinely cannot be dry-run without side effects, say so — do not fabricate a pass.

---

### Step 6: Self-check before reporting (each maps to a Step 5 command)

- [ ] Classification table shown in full (all three buckets, per-step reason)
- [ ] Escape-grep (b) clean OR every hit justified inline — no MCP/network/stateful CLI silently in the script
- [ ] Secret-grep (c) clean — no secret/PII/prod-ref; if the original touches `.env`/prod, ran `/slava:maintain:privacy` before any commit
- [ ] Negative-path (e) pasted a **non-zero** exit — validation proven, not asserted
- [ ] Side-effect check (f) clean — DRY_RUN suppressed writes
- [ ] Original unmodified — `git hash-object <orig>` matches `/tmp/scriptify-orig-hash.txt` (not a bare `git status`)
- [ ] Twin references the correct script path; no logic duplicated between twin and script
- [ ] If mechanical count is 0 or == total steps, flagged it and asked before producing a degenerate twin

---

### Step 7: Report

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/scriptify — <name>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Steps: N total → M mechanical (by count, NOT risk-weighted)
  extracted  → scripts/generated/<name>.sh  (steps: 2,4,5)
  inline     → judgment: 3 · non-scriptable-io: 1,6
Twin: /slava:script:<name>  (.claude/commands/slava/script/<name>.md, verified: false)

Where the risk lives: <name the residual judgment/io steps>

Verify:  bash -n ✓  escape-grep ✓  secret-grep ✓
  DRY_RUN happy exit 0 · no-arg exit≠0 ✓ · no side effects ✓
  Proves control flow + validation fires. NOT proven: prod auth,
  real writes/sends, judgment-step arg values.

⚠ Do NOT delete <name>.md — the twin is UNVERIFIED without it.
  Twin carries requires_original: <path> for a repo-health scan.

⚠ Skill files commit on `main`. Current branch: <branch>.
  Commit the twin on main (wip-commit hop) — see .claude/rules/skills.md.
  If the script reads .env/prod or the original touched secrets,
  run /slava:maintain:privacy BEFORE committing (public AGPL repo).

How to A/B: run BOTH /<name> and /<name>-script on the same
  real input and diff the outputs. The twin is unverified until
  you do — "original untouched" enables the test, it isn't the test.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Adopt mode — test THEN demote (`/scriptify <name> adopt`)

Adopt makes the twin canonical and archives the original. It is a **gate, not a mover**:
the original is never archived on faith. Run in order; stop at the first failure.

### A1: Locate + preconditions

```bash
ORIG=".claude/commands/slava/<namespace>/<name>.md"
TWIN=".claude/commands/slava/script/<name>.md"
SCRIPT="scripts/generated/<name>.sh"
[ -f "$TWIN" ]   || { echo "no twin — run /scriptify <name> first"; exit 1; }
[ -f "$ORIG" ]   || { echo "original already gone — nothing to adopt"; exit 1; }
```

### A2: Re-run the mechanical verify suite (Step 5)

Re-run escape-grep, secret-grep, `bash -n`, negative-arg (non-zero), side-effect check.
Any failure → stop. A twin that no longer passes its own build-time checks cannot be adopted.

### A3: Prove equivalence — the actual test

Read the twin's classification. **Two paths:**

- **Pure-mechanical** (no `non-scriptable-io` steps; a `scripts/generated/<name>.test.sh` exists):
  run it. It must exit 0 (script output == original's expected output on known inputs).
  Paste the output. Green → the machine has proven the twin; set `verified: true`.
- **Hybrid** (any io step): a machine cannot prove the io path. **REFUSE to proceed unless
  the user pastes evidence of a real successful run** — the actual command output from running
  `/slava:script:<name>` end-to-end on real input, showing it produced the same result the
  original would. No evidence → stop: "Hybrid twin — I can't prove the browser/MCP path.
  Run `/slava:script:<name>` for real once, paste the result, then re-run adopt." Only that
  human-attested evidence sets `verified: true`.

Never set `verified: true` from a dry-run or from reasoning — only from a real equivalence test (mechanical) or pasted live-run evidence (hybrid).

### A4: Archive the original + promote the twin (only if A3 passed)

Follow `.claude/rules/skills.md` archiving checklist:

```bash
# 1. find references to the ORIGINAL invocation across skills + CLAUDE.md
grep -rn "<namespace>:<name>\|<namespace>/<name>" .claude/commands/ CLAUDE.md docs/
```

- Update every reference to point at `/slava:script:<name>`.
- `git mv "$ORIG" ".claude/commands/slava/<namespace>/archive/<name>.md"` and add frontmatter
  `archived_reason: "replaced by verified script twin /slava:script:<name>"`.
- In the twin: flip `verified: true`, strip the `[UNVERIFIED TWIN]` / `[SCRIPT TWIN]` prefixes
  from `when_to_use`/`description`, drop `requires_original` (original is now archived, not deleted).
- Commit on `main` (branch guard) — the twin, the archived original, and any ref updates together.

### A5: Report

State: equivalence evidence (test exit code or pasted live run), files moved, refs updated,
and the new canonical command `/slava:script:<name>`.

---

## Quality Gates (Agent Self-Review)

- [ ] MCP/browser/computer-use AND stateful/authed/network CLIs (`open`, `curl`, `gh`, `supabase`, …) classified `non-scriptable-io`, left inline — never auto-rewritten
- [ ] Verification was RUN not asserted — escape-grep, secret-grep, negative-arg (non-zero exit), side-effect check all pasted
- [ ] Report states what the dry-run does NOT prove (no false confidence)
- [ ] Original unchanged — `git hash-object` matches the Step 1 snapshot
- [ ] Twin frontmatter: `[UNVERIFIED TWIN]` when_to_use + `requires_original`; report warns against deleting the original
- [ ] `% mechanical` reported as step count with the risk caveat, residual judgment steps named
- [ ] Degenerate case (0 or all-mechanical) flagged and asked, not silently produced

---

## Related Skills

- `/slava:build:create-skill` — create a new skill from scratch (this converts an existing one)
- `/slava:util:promote-skill` — move a skill project → global; same untouched-original discipline
- `/slava:util:find-skill` — locate an existing skill before scriptifying it
