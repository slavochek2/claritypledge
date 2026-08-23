---
status: week
type: task
rank: 1
tags: [infra, multi-agent, dsh, claude-code, codex]
drafted_by: gemini
---

# P1151: Universal Multi-Harness Architecture with Zero Maintenance

**Base commit:** `322a8e7d3ae659df4a369df99f4ee19b0a610504`
**Branch/worktree:** `main`

**Revision note (2026-08-23):** original draft authored without reading the repo it
modifies; six of its claims about existing code were false. Corrected below after
`/adversarial-review`. Every repo fact in this spec is now command-verified — the
command is quoted next to the claim.

---

## 1. Problem Statement & Intention

### The Problem
- When working across different AI coding environments (**Claude Code CLI**, **DeepSeek
  Harness (DSH)**, and future tools like **OpenAI Codex**, **Cursor**, or **Aider**),
  configuration and skill discovery fragment across incompatible directory structures:
  1. **Directory / hierarchy mismatch:** Claude Code reads `.claude/commands/slava/**/*.md`
     with nested namespaces (`slava/build/dev.md`). Other harnesses follow the open Agent
     Skills convention: a flat 1-level tree. Typing `/` in DSH shows no project commands.
  2. **Instruction entry-point fragmentation:** Claude Code reads `CLAUDE.md`; open agent
     standards increasingly read `AGENTS.md`.
  3. **Vendor prompt coupling:** some prompts hardcode Claude-specific terminology
     (`Task` tool, `Sonnet`) instead of declarative capabilities (`subagent`, `scoped context`).

### The Intention
- Seamless multi-harness operation across Claude Code, DSH, and future Codex/Cursor
  setups with **near-zero ongoing maintenance**.
- One canonical source of truth, projected automatically — zero manual duplication.

---

## 2. Resolved Design Decisions

These were ambiguous or wrong in the original draft. They are settled here; do not
re-open them during implementation.

**D1 — The projected tree is COMMITTED, not machine-local.** `.gitignore:76` currently
lists `.agents/` under *"Dead AI tool artifacts (Aider, BMAD, old IDE configs)"*, added by
`e73181ee`. That entry must be removed (Task 0). Rationale: an ignored tree exists only on
the machine that generated it — every fresh clone, cloud agent VM, and worktree under
`.claude/worktrees/` would have no skills at all, which is the exact problem this spec
opens with. Committing also gives the pre-commit gate something real to verify.

**D2 — Scan rule: link a file if, and only if, its frontmatter carries a `description:`
field.** This single rule does all the filtering the original draft hand-waved as
"validates and handles collisions gracefully":
- It excludes payload files that are content read *by* a skill, not commands — e.g.
  `build/finish/criteria/*.md`, `build/create-prd/agent.md`,
  `build/generate-tests/agent.md`, `build/prep-spec/synthesizer.md`. Exposing those in a
  slash menu would let an agent invoke a criteria checklist as if it were a workflow.
  `scripts/validate-command-refs.py:139-143` already encodes the same
  command-vs-payload distinction; this rule agrees with it rather than re-deriving it.
- It guarantees every generated link satisfies the Agent Skills frontmatter requirement.
  A symlink is byte-identical to its target and **cannot add frontmatter** — so the only
  way to honour "flat links with valid YAML frontmatter" is to link nothing that lacks it.

  Measured: `find .claude/commands/slava -name '*.md' | wc -l` → **132** total;
  **12** carry no `description:`; **6** of those 12 are `criteria/` payload.

**D3 — Flat-name derivation:** `<basename>.md`, except `SKILL.md`, which takes its parent
directory name. Without this exception a naive basename flatten collides **25** ways
(`find .claude/commands/slava -name SKILL.md | wc -l` → 25).

**D4 — Collision policy: hard-fail, listing the pair.** Never last-writer-wins — one of
the colliding pairs sits under `util/archive/`, so silent shadowing could route a live
command to an archived one. Under D2 + D3 + the `archive/` exclusion, the scan yields
**119 links and exactly 1 collision**: `slava/note.md` vs `slava/util/note.md`. That pair
is a deliberate alias (the former's description reads *"Shortcut alias for
/slava:util:note"*) — resolution: skip alias files, link the canonical one.

**D5 — `archive/` is excluded from the scan.** Archived commands must not appear in any
harness's slash menu.

---

## 3. Architecture

```
                              ┌────────────────────────┐
                              │ Source of Truth (Repo) │
                              │   - CLAUDE.md          │
                              │   - .claude/commands/  │
                              └───────────┬────────────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
          ┌────────────────────────────┐      ┌───────────────────────────┐
          │ scripts/sync-agent-skills  │      │   Universal Symlink       │
          │  (generator, run by hand   │      │  AGENTS.md -> CLAUDE.md   │
          │   or by /ship)             │      └─────────────┬─────────────┘
          └─────────────┬──────────────┘                    │
                        ▼                                   ▼
          ┌────────────────────────────┐      ┌───────────────────────────┐
          │  .agents/skills/  (TRACKED)│      │    Root Instructions      │
          │  119 flat symlinks, each   │      │ (Read by DSH, Codex,      │
          │  target has a description  │      │     Cursor, Claude)       │
          └─────────────┬──────────────┘      └───────────────────────────┘
                        │
         ┌──────────────┴──────────────┬────────────────────────┐
         ▼                             ▼                        ▼
  DeepSeek Harness                Claude Code              OpenAI Codex
```

1. **Single source of truth:** skills stay in `.claude/commands/slava/`.
2. **Automated projection:** `scripts/sync-agent-skills.sh` regenerates `.agents/skills/`.
3. **Verify-only gate:** pre-commit *checks* the tree is in sync; it never regenerates
   (see D6 in Task 3).
4. **Declarative prompts:** goals and constraints, not harness-specific tool identifiers.
5. **Universal root instructions:** `AGENTS.md` symlinked to `CLAUDE.md`.

---

## 4. Unverified Assumptions — verify BEFORE building

**A1 [UNVERIFIED — blocking].** That DSH reads `.agents/skills/` and requires a flat
1-level layout of the form `<root>/<name>/SKILL.md` or `<root>/<name>.md`.
`grep -rn "agents/skills\|\.dsh" .` returns **no occurrence anywhere in this repo** outside
this spec, and `docs/decisions.md` holds no DeepSeek prior art. The entire design rests on
this. Note the two forms are **not** interchangeable: `<name>/SKILL.md` is a directory per
skill, which file symlinks cannot produce.
*Falsifier:* create two skills by hand in both shapes, open the DSH slash menu, see which
appears. Do this before Task 2.

**A2 [UNVERIFIED].** That a committed symlink survives every consumer. Harnesses checking
out on Windows, or CI without symlink support, materialise a symlink as a text file
containing its target path.

---

## 5. Implementation Tasks

- [ ] **Task 0: Un-ignore the projection target (D1)**
  - Remove `.agents/` from `.gitignore:76`; leave the other dead-tool entries intact.
  - Add a one-line comment recording that `.agents/` is now generated-and-tracked, so a
    future cleanup pass does not re-add it as a dead artifact.
- [ ] **Task 1: Create universal instruction link (`AGENTS.md`)**
  - Symlink `AGENTS.md -> CLAUDE.md` at repo root.
  - Confirm `scripts/validate-command-refs.py` and the CLAUDE.md line-budget check
    (`scripts/pre-commit-checks.sh:1406-1413`, keyed on `^CLAUDE.md$`) still behave — the
    budget gate must not become bypassable via the new path.
- [ ] **Task 2: Implement `scripts/sync-agent-skills.sh`** (after A1 is verified)
  - Scan `.claude/commands/slava/**/*.md`; apply D2, D3, D4, D5.
  - Emit **relative** symlinks into `.agents/skills/`.
  - Remove orphaned links whose source no longer exists.
  - `--check` mode: exit non-zero and print the drift, changing nothing.
- [ ] **Task 3: Integrate with `scripts/pre-commit-checks.sh` (D6 — verify only)**
  - **The gate must NOT regenerate before verifying.** A regenerate-then-check step is
    vacuous by construction: the generator's job is to make the check pass, so the failure
    branch is unreachable. Call `sync-agent-skills.sh --check` only, and fail with
    instructions to run the generator.
  - Note `set -e` at `scripts/pre-commit-checks.sh:6`, and that the only precedent for a
    hook mutating the tree (ESLint, `:124-128`) has to re-stage with `git add` afterwards.
    Verify-only mode sidesteps that entirely.
  - Note `.git/hooks/pre-commit` is an absolute symlink to the main repo's script but runs
    with cwd set to each worktree's root — confirm `--check` behaves there.
- [ ] **Task 4: Prove the gate can fail (epistemic.md gate 7)**
  - Delete one link, run the gate, paste the non-zero exit code into the spec.
  - Add a source file, run the gate, confirm it fails on the missing link.
  - No CI workflow runs `pre-commit-checks.sh` (checked: 11 files in `.github/workflows/`),
    so this local gate is the only one — it must be demonstrably real.
- [ ] **Task 5: Decouple core workflow prompts**
  - Review `dev`, `ship`, `status`, `architect`, `create-spec` for hardcoded vendor tool
    names; replace with declarative delegation language.

---

## 6. Acceptance Criteria & Done-When

### Acceptance Criteria
- [ ] AC0: A1 verified — evidence pasted showing which layout DSH actually discovers.
- [ ] AC1: `AGENTS.md` exists as a valid symlink to `CLAUDE.md`, and is committed.
- [ ] AC2: `./scripts/sync-agent-skills.sh` generates flat symlinks in `.agents/skills/`
      for exactly the files matching D2/D5 — currently **119** — with **0** unresolved
      collisions, and every link's target carries a `description:` field.
- [ ] AC3: `.agents/skills/` is tracked in git; a fresh `git clone` into a temp dir
      contains the links without running any script.
- [ ] AC4: DSH slash menu discovers and autocompletes the synced skills — verified in a
      **fresh clone or a worktree**, not only on the authoring machine.
- [ ] AC5: Claude Code CLI still executes `/dev`, `/ship`, `/status` with no regression,
      and no payload file (`criteria/*`, `agent.md`, `synthesizer.md`) appears as a command
      in any harness.
- [ ] AC6: `./scripts/pre-commit-checks.sh` runs the sync check in `--check` mode and has
      been **observed failing** — exit code pasted per Task 4 — on both a deleted link and
      an unlinked new source.

### Done-When
- [ ] All ACs pass.
- [ ] Pre-commit checks pass (`./scripts/pre-commit-checks.sh`).
