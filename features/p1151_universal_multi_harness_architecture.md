---
status: week
type: task
rank: 1
tags: [infra, multi-agent, dsh, claude-code, codex]
drafted_by: gemini
created_date: 2026-08-23
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

**D7 — Projection unit is a DIRECTORY, not a flat file (supersedes the flat-file shape).**
Verified above: the layout is `<name>/SKILL.md`. A flat `<name>.md` symlink does not satisfy it,
and 107 of the 119 sources are flat `.md` files with no directory to point at. The projection is
therefore: create a **real directory** per skill containing a **symlinked `SKILL.md`** —
`.agents/skills/dev/SKILL.md -> ../../../.claude/commands/slava/build/dev.md`. This satisfies
directory-per-skill while keeping `.claude/` the single source of truth.

**D8 — The `name` field must equal the projected directory name.** Measured: **118 of 119**
sources already satisfy this (count is over qualifying sources, pre-collision-resolution). The single exception is `script/claude-sync-download.md`
(`name: script-claude-sync-download`). Fix that one source, or let the generator hard-fail on
the mismatch. Frontmatter fields beyond `name`/`description` (this repo uses `when_to_use`,
`version`) are unvalidated against the spec — run `skills-ref validate` on one projected skill
before trusting the whole tree.

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
command to an archived one. Under D2 + D3 + the `archive/` exclusion, the scan yields **119 qualifying
sources**, which resolve to **118 output directories** (the colliding pair collapses to one): `slava/note.md` vs `slava/util/note.md`. That pair
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

**A1 [PARTLY VERIFIED — corrected 2026-08-23].** The previous revision of this spec claimed
"no occurrence anywhere in this repo" for `.agents/skills`. **That was wrong.** The grep behind
it could not see two things: symlink *names* (not file content) and files deleted from the
working tree but present in git history. Both hold the evidence.

What actually exists:
- `.gemini/skills/` holds **39 dangling symlinks** of the form
  `<name> -> ../../.agents/skills/<name>` (`ls -la .gemini/skills`). They point at a tree that
  no longer exists, so they resolve to nothing — `find -L .gemini/skills -type f` → 0.
- `.agents/skills/` **did exist and was tracked**. Added by `991ac853` ("add AI skills library"),
  deleted by `e73181ee` with the message *"Delete .agents/ (90 skill files) — tracked but tool no
  longer used"*. That same commit added the `.gitignore` entry.
- Its layout was **directory-per-skill**: `.agents/skills/<name>/SKILL.md`, with a
  `references/` subdirectory alongside. `git show e73181ee --stat -- .agents | grep -c 'SKILL.md'`
  → **39**, matching the 39 symlinks exactly.

**Consequence — this invalidates the current design's shape.** Tasks 2–3 assume flat *file*
symlinks (`.agents/skills/<name>.md`). The only layout this repo has evidence for is a
*directory* per skill containing `SKILL.md`, which file symlinks cannot produce. Resolve before
building.

**Also note what those 39 skills were:** `ab-test-setup`, `analytics-tracking`, `brainstorming`,
`copywriting`, `content-strategy` — a third-party marketing/growth skill pack, **not** this repo's
`slava/` commands. So the prior `.agents/` tree is precedent for the *mechanism*, not evidence
that anyone has projected `.claude/commands/slava/**` this way. And it was abandoned once
already — establish why before rebuilding it.

**A1-remainder [VERIFIED 2026-08-23 — no longer blocking].** Confirmed by direct GitHub API
reads of `deepseek-ai/deepseek-harness` (real repo, created 2026-08-13, default branch
`master`):

- DSH's own skills live at **`.agents/skills/<name>/SKILL.md` — a directory per skill.**
  `gh api repos/deepseek-ai/deepseek-harness/contents/.agents/skills` returns 11 entries,
  every one `type: dir`; each contains a single `SKILL.md`. Not `.dsh/skills/`.
- Required frontmatter is exactly **two fields**, verbatim from
  `.agents/skills/dsh-code-review/SKILL.md`:
  ```yaml
  name: dsh-code-review
  description: Use when reviewing a pull request...
  ```
- Anthropic's Agent Skills spec (agentskills.io/specification) mandates the same directory
  form and requires `name` to **equal the parent directory name**. A reference validator
  exists: `skills-ref validate ./my-skill`.
- **Codex is converging on the same standard** — its flat `~/.codex/prompts/*.md` custom
  prompts are officially deprecated in favour of skills. This raises confidence that the
  investment ports forward rather than being DSH-specific.
- DSH's repo root carries a real `AGENTS.md` with **`CLAUDE.md` as a 9-byte symlink to it** —
  the reverse of Task 1's direction. Functionally equivalent; noted so the choice is deliberate.

**A2 [RESOLVED for the instruction file].** Symlinking between the two instruction files is
proven in production by DSH itself, at three directory levels. No primary-source report of a
tool rejecting the symlink was found; the risk is UNKNOWN rather than confirmed absent.

**A3 [NEW — investigate before building].** Third-party converters for exactly this projection
already exist and are unverified by us: `agent-command-sync` (hatappo), `claude-command-converter`
(dceoy), and a Codex-export skill. None is official or demonstrably widely adopted. **Trial one
before writing our own** — the cheapest outcome here is not building the generator at all.

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
- [ ] **Task 2: Implement `scripts/sync-agent-skills.sh`** (after A3 is investigated)
  - **First: trial an existing converter (A3).** Only build if none fits.
  - Scan `.claude/commands/slava/**/*.md`; apply D2, D3, D4, D5, D7, D8.
  - Emit a real directory per skill containing a **relative symlinked `SKILL.md`** (D7).
  - Validate one projected skill with `skills-ref validate` before generating the rest.
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
- [x] AC0: A1 verified — DSH reads `.agents/skills/<name>/SKILL.md`, directory-per-skill,
      frontmatter `name`+`description`, `name` == directory name. Evidence in section 4.
- [ ] AC1: `AGENTS.md` exists as a valid symlink to `CLAUDE.md`, and is committed.
- [ ] AC2: `./scripts/sync-agent-skills.sh` generates flat symlinks in `.agents/skills/`
      for the files matching D2/D5 — **119 qualifying sources resolving to 118 output
      directories** after the alias pair collapses (D4) — as directories containing a
      symlinked `SKILL.md` (D7), with **0** unresolved collisions, every target carrying a
      `description:`, and `skills-ref validate` passing on a sampled skill.
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
