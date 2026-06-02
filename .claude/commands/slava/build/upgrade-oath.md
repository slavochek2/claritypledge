---
name: upgrade-oath
description: Bump a registry-versioned, load-bearing canonical text (Pledge/Agreement) to a new version across every surface, with three mechanical gates that prevent the drift that required 3 hotfixes at v3.
when_to_use: "Bumping a registry-versioned canonical text (PLEDGE_VERSIONS / AGREEMENT_VERSIONS) to a new version. NOT for editing one surface's copy (edit inline), NOT for a redesign (/change-request), NOT for a code bug (/fix)."
version: 1.0.0
---

# /upgrade-oath

Bump a versioned, load-bearing canonical text to a new version across every surface — and prove no surface was left on the old version.

**Announce at start:** "Running /upgrade-oath to bump {document} to v{N}."

This skill exists because the v3 pledge upgrade (commit `0f28d505`) shipped and then needed **three** hotfixes within 23 minutes — each one a surface left behind:
- `74fd7ed1` — the Exception block existed but wasn't invoked on a surface → didn't render.
- `497c86f9` — profile views hardcoded to the old version.
- `3cce3737` — landing + certificate defaulted to the old version.

The lesson: the misses are **operational** (a surface forgotten during execution), not conceptual. A prose spec section doesn't enforce enumeration; **runtime discovery + mechanical gates** do.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Bump a registry-versioned canonical text to a new version across surfaces | `/upgrade-oath` ← here |
| Change one surface's copy, no version bump | Edit inline |
| Redesign a shipped feature whose design was wrong | `/change-request` |
| Fix a code bug | `/fix` |
| Generic feature implementation | `/dev` |

---

## Pipeline Stamp (P659)

On entry, before any other work:
1. Resolve the spec by P-number (worktree-first per `.claude/rules/features.md`).
2. If `pipeline_plan` exists, verify the predecessor skill ran (`pipeline_ran` contains it). First-in-plan skips this check.
3. Set `delivery_stage: upgrade-oath` and append `upgrade-oath` to `pipeline_ran` (inline list format; `.2` suffix on re-run).
4. Set `status: in-progress` (skip if `locked_at` is present and the user has not explicitly authorized a status change for this spec this session).

---

## Pre-flight: worktree (repo default)

Use a worktree (repo default) — these bumps are **high blast radius** (wording across many surfaces; decision-A also touches `src/` DB paths), so a worktree matches the repo default and lets the dev server run isolated for the visual gate. Claim it capturing the lock nonce via the sentinel block (a bare `git-ops.sh claim` leaves the nonce unexported, so a later `release` fails):

```bash
eval "$(./scripts/git-ops.sh claim pN <slug> 2>/tmp/claim.log | sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' | grep -v '^#')"; cat /tmp/claim.log
```

Then make every edit at the worktree-rooted path (`git rev-parse --show-toplevel`). *(Earlier guidance said "no worktree, edit on main" — P855's first run proved that wrong.)*

---

## Per-doc config (the manifest — P857 extends this)

The skill is doc-agnostic. Read the active config; do not hardcode surface lists — **discover them at runtime** (Step 2).

```
pledge (default):
  registry        : PLEDGE_VERSIONS              (src/app/content/pledge-text.tsx)
  pointer         : CURRENT_PLEDGE_VERSION
  version type    : PledgeVersion
  blocks          : YOUR RIGHT · MY PROMISE · THE EXCEPTION
  block renderers : YourRightText(+Tailwind) · MyPromiseText(+Tailwind) · ExceptionText(+Tailwind)
  frozen alias    : PLEDGE_TEXT  (legacy object — must follow the pointer, not a hardcoded index)
  shared constant : VERIFIED_UNDERSTANDING_OATH  (referenced by the registry entry, NEVER copied)
  db              : profiles.pledge_version  (column default · write-pin · read-fallback)
  share-text      : share-hub · share-dropdown  (plaintext built from the alias — separate from React renderers)
  prose           : full-article.md

agreement (shipped via P857):
  registry        : AGREEMENT_VERSIONS
  pointer         : CURRENT_AGREEMENT_VERSION
  version type    : AgreementVersion
  blocks          : YOUR RIGHT · MY PROMISE · THE EXCEPTION
  shared constant : VERIFIED_UNDERSTANDING_OATH  (same constant — edit once, both converge)
  db              : clarity_agreements.agreement_version  (+ pin trigger; one additive migration adds both)
  prose           : none — the agreement has no standalone prose article (the pledge's full-article.md is the only prose surface)
```

---

## Workflow

### Step 1 — Classify every surface: default-path vs dispatched

This classification scopes every gate. Without it, grandfathering looks like a bug.

- **DEFAULT-PATH** — renders the *current* version for a new/unsigned visitor (landing, certificate preview, FAQ, manifesto, /live). After the bump these **must** resolve to v{N}.
- **DISPATCHED** — renders a *stored/pinned* version (a signed profile certificate reads `profiles.pledge_version` and renders that signer's version). These **must stay version-driven** — a v3 signer still rendering v3 is correct, not stale.

Produce a two-column list. Every gate that follows runs against the right column only.

### Step 2 — Discovery (no hardcoded list)

Grep at runtime for five classes. Reconcile the union against Step 1's list — any surface found here but unclassified is an enumeration gap, not a pass.

```bash
DOC_OATH_OLD="<distinctive phrase from the prior version's oath>"
REG="PLEDGE_VERSIONS"; PTR="CURRENT_PLEDGE_VERSION"; PREV=3   # from config

# (i) prior-version oath strings
grep -rn "$DOC_OATH_OLD" src/ *.md
# (ii) registry consumers + frozen alias
grep -rn "$REG\|PLEDGE_TEXT" src/
# (iii) version literals that bypass the pointer
grep -rnE "\[$PREV\]|version\s*=\s*$PREV|\|\|\s*$PREV|as\s+1\s*\|\s*2" src/
# (iv) block headings + no-param renderers (catch ExceptionText: invoked but version-agnostic)
grep -rnE "YOUR RIGHT|MY PROMISE|THE EXCEPTION|ExceptionText" src/
# (v) DB layer — column default, write-pin, read-fallback
grep -rn "pledge_version" supabase/migrations/ src/
```

### Step 3 — Apply the bump

1. **Registry:** add `PLEDGE_VERSIONS[N]`. Its oath body **references the shared constant** (`VERIFIED_UNDERSTANDING_OATH[N]`) — never inline a copy. Each doc keeps its own framing (title/intro) around the shared body.
2. **Pointer:** flip `CURRENT_PLEDGE_VERSION = N`. This is the single intended lever.
3. **Default-path surfaces:** single-source to the registry/pointer. Remove hardcoded indices and `version = PREV` defaults on default-path renderers.
4. **Frozen alias:** rewire `PLEDGE_TEXT` to `PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION]` (not a hardcoded index) so it tracks the pointer forever.
5. **DB write-path (decision A — app writes the pointer):** the sign flow writes `CURRENT_PLEDGE_VERSION`, and the read-fallback uses the pointer — not a hardcoded number. **Leave the SQL column default as a harmless backstop** (no migration this bump; the pointer stays the sole lever, rollback stays a one-line flip).
6. **Dispatched surfaces:** leave version-driven. Verify the version type (`keyof typeof PLEDGE_VERSIONS`) now includes N; replace any hardcoded union cast (`as 1 | 2 | 3`) with the type or extend it to include N.
7. **Prose:** align `full-article.md` to v{N} deliberately (narrative artifact).

### Self-check before committing

- [ ] Step 1 two-column classification produced; every Step 2 discovery hit is classified.
- [ ] Registry entry references the shared constant, not a copied string.
- [ ] Pointer flipped; frozen alias tracks the pointer (no hardcoded index left).
- [ ] Write-path + read-fallback use the pointer (decision A); SQL default left as backstop.
- [ ] No `version = PREV` default and no `[PREV]` index remains on a default-path surface.
- [ ] Both renderer twins (inline-style + `…Tailwind`) updated for every block.

---

## The three gates (STOP on any failure)

> **Grep robustness (P855 learning):** never write a gate as `grep -rE "pat" $FILES && echo ✗ || echo ✓`. If the file list mis-expands — or `ugrep -r` rejects a multi-file variable — grep exits non-zero and the `||` branch prints a FALSE "✓". Confirm inputs exist (`[ -f ]`), loop per file, and check each result explicitly. A gate that cannot open its inputs has NOT passed.

### Gate 1 — No stale DEFAULT-path text

Scope: **default-path surfaces only** (Step 1 left column). Do **not** scan dispatched paths — a signer rendering their pinned old version is legitimate.

```bash
# zero prior-oath strings AND zero stale literals on default-path files
grep -rn "$DOC_OATH_OLD" <default-path files>
grep -rnE "\[$PREV\]|version\s*=\s*$PREV|\|\|\s*$PREV" <default-path files>
```
Any match → **STOP**, name the file:line, fix, re-run.

### Gate 2 — Every block renders the NEW content

(a) **Call-site completeness** — each block renderer is invoked on every surface that renders the doc (catches `74fd7ed1`: a block silently omitted).
(b) **Content freshness** — each invoked renderer's body references v{N} content, not v{N-1} (catches `ExceptionText`: invoked but hardcodes old prose, so invocation-presence alone lies).
(c) **Independent QA subagent** — spawn per `.claude/rules/visual-qa.md` anti-confirmation-bias rule. Give it **only** the expected block names + screenshots at 375px and desktop. Do **not** give it the edit list or intent. *(P855 learning: claude-in-chrome `resize_window` may not shrink below Chrome's min window width — if a 375/390px capture returns at desktop width, mark mobile tool-limited and fall back to a device/manual check; never assert mobile passed from a desktop-width capture.)*

```
You are a visual QA reviewer. These screenshots should show a document with exactly these
named blocks, each containing the NEW (v{N}) wording: {block names + the v{N} text}.
You succeed by FINDING a block that is missing, truncated, or still showing OLD wording —
not by confirming quality. Report per block: PRESENT-AND-CURRENT / MISSING / STALE-TEXT,
with the screenshot evidence. List anything that does not match.
```
Any missing/stale block → **STOP**.

### Gate 3 — The pointer is the sole lever

Assert `CURRENT_*` reaches every default-choice point and no hardcoded version literal pins a default path:

```bash
# every default-choice point resolves to the pointer, not a literal:
#   render defaults (version = N)  ·  frozen alias (PLEDGE_TEXT → [N])
#   DB write-pin  ·  DB read-fallback  ·  type-union casts (as 1|2|3)
grep -rnE "version\s*=\s*[0-9]|PLEDGE_TEXT\s*=.*\[[0-9]\]|pledge_version[^a-z].*\|\|\s*[0-9]|as\s+1\s*\|\s*2" src/
```
Any default-path literal that bypasses the pointer → **STOP**.

**Rollback corollary:** if Gate 3 passes, rollback to v{N-1} = flip the pointer back, by construction (no other lever pins the version). The one documented non-pointer lever is the SQL column default left as a backstop — note it in the spec's Rollback line.

---

## Commit

Commit only after all three gates pass. Stage explicit file paths (never `git add .` / `-A` — see `.claude/rules/git.md`). Verify `git diff --cached --name-only` is only your files before committing.

---

## Gate report (print on success)

```
/upgrade-oath pN — {document} → v{N}. All gates passed.
  ✓ Gate 1: 0 stale references on {D} default-path surfaces
  ✓ Gate 2: {B} blocks present-and-current (call-site + content + independent QA)
  ✓ Gate 3: pointer is sole lever — 0 literals bypass CURRENT_*
  Default-path surfaces: {D}   Dispatched (grandfathered) surfaces: {G}
```

## Handoff

```
Bumped:        {document} → v{N}
Files changed: {count} ({list})
Pointer:       CURRENT_*_VERSION = {N}   (sole lever — rollback = flip back)
Shared const:  VERIFIED_UNDERSTANDING_OATH[{N}] referenced (not copied)
DB:            write-path + read-fallback use the pointer; column default = backstop
Stale refs:    0 on default paths
Grandfathered: existing signers keep their stored version (verified version-dispatched)
Worktree:      /ship removes the branch + slot; if parking instead, release with git-ops.sh release wN
Next:          /verify pN (live UAT) → /ship pN
```

---

## Quality Gates (Agent Self-Review)

- [ ] Surfaces classified default-path vs dispatched BEFORE any gate ran.
- [ ] Discovery greps ran at runtime — no hardcoded surface list used.
- [ ] Gate 1 scoped to default-path only — did NOT flag grandfathered dispatched paths.
- [ ] Gate 2 checked call-site completeness AND content freshness AND ran an independent QA subagent (not self-review).
- [ ] Gate 3 confirmed the pointer is the sole lever (render defaults, frozen alias, DB write/read, type casts).
- [ ] Shared constant referenced, never copied.
- [ ] Both renderer twins updated for every block.
- [ ] Commit staged explicit paths; gate report + handoff printed.

---

## Related Skills

- `/verify` — live UAT after the bump; confirms blocks render for a real user.
- `/ship` — merge the feature branch to prod once gates + UAT pass.
- `/fix` — for a code bug, not a version bump.
- `/change-request` — for a redesign whose design was wrong, not a version bump.
- `/kdd` — capture learnings if this run surfaces a new drift class to fold into the gates.
