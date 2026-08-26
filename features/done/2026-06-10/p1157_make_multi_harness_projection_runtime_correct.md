---
status: all-done
type: change-request
rank: 1000055.0
changes: p1151
tags:
  - redesign
  - p1151
  - infra
  - multi-harness
  - codex
created_date: '2026-08-25'
completed_at: 2026-08-26
flow: dev
pipeline_plan: [change-request, dev]
pipeline_ran: [change-request, adversarial-review, dev]
pipeline_skipped:
  - architect -- adapter ownership, runtime oracles and hook protocol boundaries are explicit in this spec after adversarial review
  - spec-review -- the fresh adversarial review attacked the existing infrastructure artifact and its implementation contract directly
---

# P1157: Make the multi-harness projection correct at runtime, not only structurally

> **Redesign of:** [P1151: Universal Multi-Harness Architecture with Zero Maintenance](p1151_universal_multi_harness_architecture.md)
> **What was wrong:** P1151 proved the Agent Skills directory shape but inferred live discovery
> from structural conformance. In the first Codex session, Codex exposed 95 regular migrated
> `source-command-*` skills while the tracked symlinked skills, including `points-select`, were
> absent from the session catalog. The same migration wrote into the projection directory owned by
> P1151, and Claude-specific routing and hook semantics were copied into Codex without adapters.

## Operating Mode

> This spec is an incremental correction to P1151, not a greenfield design. P1151 remains read-only
> shipped history. Preserve its source-of-truth, filtering, collision, archive-exclusion and
> verify-only decisions unless an observable harness requirement forces a narrower correction.

## Problem Statement

P1151 solved file placement but not runtime semantics. A valid-looking projection is insufficient
when the target harness does not discover it, mutates the projection on startup, interprets shared
model guidance for another provider, or runs a hook against the wrong event schema.

The first Codex session produced four observable failures:

1. The global Codex instructions warned that GPT-5.6 Sol was “not Opus.”
2. Claude quota and model routing were applied inside Codex, causing an irrelevant Gemini
   delegation.
3. `points-select` existed as a tracked projected skill but was absent from the injected Codex
   skill catalog.
4. the Codex Stop hook was a copied Claude parser; Codex reported a StopHook failure while the
   parser could not interpret Codex transcript entries.

## Jobs To Be Done

- **Preserved from P1151:** maintain one canonical skill source and make the same workflows
  available across Claude Code, DSH and Codex without hand-maintained semantic copies.
- **Corrected:** prove discovery and execution in each harness rather than treating file-shape
  conformance as the oracle.
- **New:** keep capability policy universal while isolating model catalogs, quotas, delegation
  mechanisms and hook schemas behind harness-specific adapters.

## Current State

```text
.claude/commands/slava/**          canonical command sources
          |
          +-- sync script --> .agents/skills/<name>/SKILL.md symlinks (tracked)
          |                            |
          |                            +-- DSH structural contract: proven
          |                            +-- Codex live discovery: not proven, failed for points-select
          |
Codex migration ----------------> .agents/skills/source-command-* regular files (untracked)

shared model prose --------------> Claude assumptions interpreted by Claude, Codex and DSH
copied Claude hooks -------------> Codex event stream with a different transcript/tool schema
```

## Root Cause

P1151 used a dependent signal as its oracle: directory and frontmatter conformance stood in for
actual discovery. AC4 explicitly accepted an undriven menu, while Codex was only described as
“converging on the same standard.” That left three adapter boundaries untested:

- **storage ownership:** two generators can write the same `.agents/skills/` directory;
- **policy interpretation:** universal intent was mixed with Claude model names, quota and tools;
- **lifecycle protocol:** Claude hook files were copied without translating or testing Codex events.

The design also descoped P1151 Task 5 as prose quality. The first Codex run demonstrates that vendor
decoupling affects runtime decisions and is therefore correctness work.

## Redesign

```text
universal capability policy
  = task class + data boundary + required tools/context + independent oracle
                         |
          +--------------+---------------+
          |              |               |
     Claude adapter   Codex adapter    DSH adapter
     models/quota     models/effort    actual provider/model
     native hooks     native hooks     supported lifecycle only
                         |
canonical skill sources + exactly one projection owner
                         |
              live discovery canary per harness
```

### Routing contract

The universal layer classifies work, not vendors:

- judgment / architecture;
- bounded, partitionable bulk work;
- long agentic edit-test loops;
- routine lookups or cleanup.

Before delegation it must independently pass:

1. the content is independently known to be public or explicitly approved for the named external
   provider — unclassified content stays native;
2. the target has the necessary tools and context;
3. a local or otherwise independent oracle can verify the result.

The privacy wrapper is defense-in-depth, not the classifier. A regex pass proves only that no known
deny pattern matched; it never proves that customer data, private prose or an unlisted identifier is
safe to send.

Each harness adapter maps those requirements to models it actually exposes and to that harness's
own quota. It must not read another harness's quota or warn merely because a model belongs to a
different vendor. Gemini remains an optional executor for externally-safe bounded bulk work, never
the default for judgment or long agentic loops. Its active model/provider must be observed at
runtime; an unknown or preview route is surfaced rather than silently accepted.

### Policy and adapter ownership

| Layer | Authoritative artifact | Runtime inputs | Fallback / oracle |
|---|---|---|---|
| Universal capability and delegation policy | `~/.agents/model-routing.md` | Task class, positive data eligibility, required tools/context, independent oracle | No adapter or unknown model: stay on the current native model and report the gap |
| Claude adapter | `~/.claude/commands/recommend-model-effort.md`, invoked by `~/.claude/CLAUDE.md` | Active Claude session model; Claude quota cache; native subagent tools | Claude session metadata and current quota cache only |
| Codex adapter | `~/.codex/model-routing.md`, invoked by `~/.codex/AGENTS.md` | Codex session model/effort and harness-exposed native subagent roster; Codex rate-limit metadata | Codex session/transcript metadata, never Claude cache or model self-report |
| DSH adapter | `~/.dsh/model-routing.md`, invoked by `~/.dsh/AGENTS.md` | Composed profile, persisted runtime settings, and DSH spawn/fork availability | Compare `--dump-config` with `~/.dsh/settings.yaml`; when they disagree use a credential-removal provider canary; session model prose is not an oracle |
| External Gemini executor | `~/.agents/bin/delegate-gemini` | Explicit verified Google overlay, positive data eligibility, wrapper scan | Credential-removal provider canary; exit 2/3 or execution failure returns inline without retry |

Keep a compatibility link from the current `~/.claude/bin/delegate-gemini` path only after all
dependents are enumerated. Universal policy contains no preferred vendor or model name. Adapters may
name currently available models, but must discover availability at runtime and apply the roster's
freshness tripwire before comparing quality. “Free” is a cost property, never a quality verdict.

### Skill projection contract

`.agents/skills/` has exactly one writer. Codex migration/import output must use a separate cache or
be disabled for this repository. Determine experimentally whether Codex local discovery accepts a
symlinked `SKILL.md`; if it does not, change the generated artifact to regular files whose bytes are
verified against the canonical sources. Do not weaken orphan detection to ignore a second writer.
The sync oracle is closed-world: its manifest covers every expected directory and every allowed
entry below it, and it rejects unexpected top-level directories, files, symlinks and nested payloads.

### Hook contract

Keep Claude hooks unchanged. Codex loads only Codex-native hooks built from official Codex event
schemas and real hook-event fixtures. Unsupported Claude plugin hooks remain disabled in Codex.
Start/session hooks that only inject accurate guidance may remain, but every injected instruction
must be harness-correct and its exit behavior must be tested.

Do not create a dual-protocol transcript parser. Official Codex documentation says
`transcript_path` is convenient but its format is not a stable hook interface. Keep Claude protocol
parsing in `.claude/hooks/`; Codex hooks consume stable lifecycle event fields and keep only bounded
per-turn state. Share only pure policy matching if duplication becomes material. Disable the current
Codex Stop hook until its replacement passes the fixtures, then enable the native replacement.

| Current Codex hook surface | Disposition |
|---|---|
| Global production-deploy blocker | Native-port and prove the blocked path |
| Global Supabase environment reminder | Keep as accurate injection; test output and exit |
| Global decision brief and project route brief | Keep only after harness-wording and exit tests |
| Project instruction gate and screenshot-before-re-edit | Native-port with real Codex tool events |
| Project Playwright pipe blocker, design-system check and lint-after-edit | Native-port with Codex tool names/results |
| Project compaction reminder | Keep as accurate injection |
| Project Stop verification/KDD gate | Disable copied parser; replace with Codex-native parser |
| Imported Claude security-guidance plugin hooks | Disable in Codex until the plugin declares Codex support and passes native fixtures |

## Predecessor Sections Superseded

| P1151 section | Status | Correction |
|---|---|---|
| Architecture: “Universal root instructions” as the complete solution | Partially superseded | Universal intent plus harness-specific executable adapters |
| Task 1: instruction symlink is sufficient | Partially superseded | Symlink remains, but semantic compatibility is tested separately |
| Task 2: prune every unrecognized output directory | Partially superseded | Establish exclusive ownership before pruning |
| Task 5: vendor decoupling is prose-only and descoped | Superseded | Routing and hook decoupling are runtime correctness requirements |
| AC4 structural conformance implies discovery | Superseded | Each supported harness needs a live discovery canary |
| Done-When “All ACs pass” | Superseded | Runtime evidence below determines completion |

P1151 D1-D5 and D7-D8 remain valid unless the Codex discovery experiment requires regular generated
files instead of symlinked manifests. The canonical source and verify-only gate remain mandatory.

## Requirements

1. Remove the unconditional Opus warning from Codex instructions; preserve a Claude-only default
   check only if Claude still benefits from it.
2. Make project model guidance capability-based and explicitly harness-aware. Each adapter reads
   only its own model catalog and quota.
3. Delegate only content independently proven public/external-safe or explicitly approved for the
   named provider. Keep Gemini only for bounded work with tools/context and an independent oracle;
   treat the wrapper denylist as defense-in-depth and preserve exit-2/3 inline fallback without retry.
4. Give `.agents/skills/` one writer and prevent Codex startup/import from adding another skill
   namespace there.
5. Make `points-select` discoverable by name in a fresh Codex session without a migrated duplicate.
6. Inventory every imported Codex hook using the disposition table above. Replace copied Claude
   protocol behavior with Codex-native implementations or disable it until real-schema fixtures
   pass. Claude hook files and current Claude fixtures must remain unchanged.
7. Remove Claude-only environment variables from Codex configuration unless Codex documentation
   proves a consumer.
8. Use harness-supplied session/config metadata as the model/provider oracle. Never accept a model's
   textual self-identification as routing evidence.

## What Stays the Same

- `.claude/commands/slava/` remains the canonical project workflow source.
- P1151 filtering, name-collision, alias and archive rules remain.
- The projection remains committed and the pre-commit check remains verify-only.
- Claude Code remains the primary harness and keeps its native hooks and model controls.
- No model or delegation route may bypass privacy or approval gates.

## Surfaces in Scope

**In scope:** `~/.agents/model-routing.md` and `~/.agents/bin/delegate-gemini`; the exact Claude,
Codex and DSH adapters in the ownership table; global and project Codex hook configurations;
`.claude/rules/model-effort.md`; `.codex/` hook/config projection; `scripts/sync-agent-skills.sh`
and its tests; `.agents/skills/` generated artifacts; Codex skill-import configuration; P1151
regression evidence.

**Out of scope:** application runtime, database, product UI, rewriting historical `drafted_by`
values, renaming model references that describe historical reviews, or changing Claude hooks merely
to make their implementation resemble Codex.

## Acceptance Criteria

- [x] A fresh Claude session, Codex session and DSH session each identify the correct active
      harness/model and produce no warning about another vendor's preferred model.
- [x] Routing tests cover task class × positive data eligibility × tool/context availability ×
      quota × independent oracle, including unclassified prose, content-based PII, unknown/preview
      model IDs, path/casing errors, wrapper exit 2/3 and executor failure.
- [x] A public bounded corpus may delegate; a private-path corpus refuses and completes inline; a
      judgment task and a long agentic loop remain on the strongest suitable native lane.
- [x] `sync-agent-skills --check` enforces a closed-world manifest, including canaries for an
      unexpected nested file and every unexpected top-level filesystem type. It passes in the main
      repo, a fresh clone and a new worktree before and after Codex startup; no `source-command-*`
      artifact is created in the projection.
- [x] A fresh Codex session discovers `points-select`, reads its canonical instructions and does not
      expose a migrated duplicate.
- [x] Every current global/project Codex hook is classified by the disposition table. Must-keep
      blockers fire on real Codex events, accurate injections exit cleanly, and unsupported plugin
      hooks are demonstrably disabled.
- [x] Real Codex hook-event fixtures prove: edit then unverified completion claim blocks; edit then a
      successful browser/curl verification allows; nonzero curl, HTTP failure and browser-tool error
      still block; non-claim allows; malformed/missing hook fields follow the documented fail-open
      policy; no Stop loop occurs.
- [x] Existing Claude hook fixtures and all 25 P1151 projection tests still pass unchanged.
- [x] Project pre-commit checks pass.

## Implementation Evidence — 2026-08-26

- **Projection:** `scripts/sync-agent-skills.test.sh` passed 41/41, including the original P1151
  cases plus regular-file, closed-world, nested-entry and unsafe-name canaries. Main, a no-local
  clone and a detached worktree each reported `121 skills in sync, 0 collisions, 0 drift` before
  and after fresh Codex startup. Both fresh contexts retained zero `source-command-*` entries.
- **Live Codex discovery:** literal `$points-select` invocation in main, the fresh clone and the new
  worktree loaded the canonical `# /points-select` body and returned the expected canary. Codex's
  migration importer is disabled; 28 pre-existing global migrated duplicates were moved intact to
  `~/.agents/backups/p1157-source-command.Qn51is` (aggregate content checksum
  `c478c8f7b6c5308cc06ccb7742289f4b59b809a0ad68d85c9ebceb38082a3a78`).
- **Routing:** `scripts/test-multi-harness-routing.sh` passed 31/31. A real public wrapper call
  returned `P1157_WRAPPER_OK`; refusal, casing, missing-overlay and executor-failure paths returned
  their specified exits. DSH's dump/settings conflict was resolved by the credential-removal
  oracle, proving the current runtime selects Google despite the composed profile naming DeepSeek.
- **Harness canaries:** a fresh Claude process reported `claude-opus-5` through first-party runtime
  metadata; a configured DSH headless call returned `P1157_DSH_OK`; fresh Codex processes invoked
  the canonical skill without cross-vendor warnings or Stop-hook failure.
- **Hooks:** `scripts/test-codex-native-hooks.sh` passed 61/61 against Codex event payloads. Existing
  Claude browser fixtures passed 11/11 and route-brief fixtures passed 55/55; the Claude Playwright
  pipe blocker still denied its real bad-command shape. The unsupported imported security plugin is
  installed but disabled in Codex. Three compatibility symlinks keep sessions started before the
  migration operational: the historical Stop and screenshot paths execute the native Codex
  lifecycle parser, and the historical instruction-gate path executes the native Codex gate.
  Fresh sessions load only the replacement paths from `.codex/hooks.json`.
- **Review:** the requested fresh-context reviewer returned no report because its Codex usage limit
  was exhausted: 0 of 1 reports received, so the external-review lens remained uncovered. Inline
  verification found and fixed four load-bearing defects: missing Bash exit status in real Codex
  events, DSH dump/runtime disagreement, traversal-like projected names, and BSD path extraction in
  hook ports. The `/finish code` stamp records 4 found / 4 fixed.
- **Repository gate:** `./scripts/pre-commit-checks.sh` exited 0. Its two non-blocking notices are
  inherited TODO examples in byte-identical skill mirrors and historical P1151's absent UAT file.
  Privacy allowlisting applies only to generated mirrors; canonical skill sources remain scanned.

### Known runtime limitation

Codex 0.149.1 still reports that the combined global, plugin and project skill catalog exceeds its
context budget. It strips descriptions and omits 63–64 lower-priority skills in fresh contexts, but
explicit project-skill invocation was independently proven in all three contexts above. Removing
legitimate global scientific or Cowork plugin skills solely to silence this product limit is out of
scope and requires a separate usage/ownership decision; the 28 migration-generated duplicates were
the only artifacts removed.

## Adversarial Review Round 2 — 2026-08-26 (the lens that was uncovered)

The spec above recorded the external fresh-context review as **0 of 1 received** (the reviewer's
Codex usage limit was exhausted). That lens was covered in a fresh Claude context: **1 of 1
received**. Every finding below was re-run by command before being recorded here — the reviewer's
claim alone was not treated as evidence (epistemic gate 9).

**The central finding: P1157 had repeated P1151's own mistake.** P1151 used directory conformance
as a stand-in for discovery. P1157 captured three real Codex events — all `PostToolUse`, from one
turn — then hand-authored fixtures for every other event and every failure payload. Two acceptance
criteria above were marked `[x]` on fixtures that structurally could not emit the input that breaks
them (epistemic gate 7b).

### BLOCK 1 — the closed-world manifest was not closed (falsified AC4). FIXED.

`scripts/sync-agent-skills.sh` looked a projection entry up with `grep -qF "<name><TAB>"` against a
`name<TAB>path` manifest. `grep` matches anywhere on the line, so any orphan whose name is a
**suffix** of a real skill name matched a different skill's row and was treated as known: invisible
to `--check`, never pruned, yet a fully discoverable injected skill in every harness. Affected
`skill`, `flow`, `spec`, `blog`, `email`, `select`, `create`, `publish`, `gate` and more.

Reproduced against a control: a `source-command-evil` directory was detected and pruned while
planted `skill/` and `flow` survived `--check`, survived regeneration, and left the tree reporting
`OK — 0 collisions, 0 drift`. The E1–E5 canaries could not catch this class — none of their names is
a suffix of a real skill.

Fixed with an exact first-field match (`manifest_has`, `awk -F'\t' '$1 == n'`). New canaries **E6**
(detected) and **E7** (actually pruned) pin the class. Gate 7 exercised: both cases pass against the
old script (`0 drift`) and fail against it under the fix.

### BLOCK 2 — privacy-gate bypass compounded from BLOCK 1. CLOSED BY BLOCK 1's FIX.

`.privacy-allowlist:16` allowlists the whole `.agents/skills` subtree, justified as "generated
byte-identical mirrors of already-scanned canonical sources". That justification held only for
entries the sync check validates — and BLOCK 1 was a class it did not. A file at
`.agents/skills/skill/SKILL.md` was therefore skipped by `audit-privacy.sh` (prefix match at
`:116`), reported as `0 drift`, and pruned by nothing, on a public AGPL repo. No separate fix: the
allowlist's premise is true again once the manifest is genuinely closed.

### BLOCK 3 — a FAILED browser check certified a turn as verified (falsified AC7). FIXED.

`response_succeeded` ended in `return bool(response)`. Real Codex sends `tool_response` as a plain
**string** even on failure — the captures show a command exiting 7 arriving as just `"CODEX_FAILURE"`.
Every browser fixture in the suite used a **dict** (`{isError: true}`), a shape no real capture
exhibits. So: edit → screenshot returning `"Error: No page selected"` → "verified in the browser"
returned `{}` (allow), while the no-verification control correctly blocked. `HTTP_FAILURE_RE` was
also applied only on the Bash branch, so a browser call rendering a 500 certified too.

Fixed with `browser_verification_succeeded`: a browser response certifies only on an explicit
non-error result — `isError is False` / `exit_code == 0` for dicts, and for the real string shape,
rejection of anything matching `BROWSER_FAILURE_RE` or `HTTP_FAILURE_RE`. The same fail-closed
discipline `run-verified.sh` already applied to Bash. Legitimate browser evidence still allows, in
both string and dict shape — a gate that blocks everything is not a working gate.

**Also removed:** an unconditional `if tool_name == "Agent": return True` inside the verification
gate. Codex ships no tool by that name, so it certified nothing real, but a delegated "I could not
verify anything" would have satisfied the gate had one appeared.

**Also registered:** `SubagentStop` in `.codex/hooks.json`. It is a real Codex event sharing Stop's
schema and was unregistered, so subagent-delegated work stopped ungated.

### Gate 7 evidence (a gate not watched failing is unproven)

All three attacks were run against the HEAD hook and the fixed hook:

| Attack | old | new |
|---|---|---|
| failed screenshot, string shape | allow | **block** |
| browser HTTP 500, string shape | allow | **block** |
| `tool_name: "Agent"` non-verification | allow | **block** |
| suffix-named projection orphan | `0 drift` | `DRIFT_ORPHAN:skill` |

### Suites after the fix

`test-codex-native-hooks.sh` **82/82** (was 61 — 8 new cases covering the string failure shape, the
browser HTTP branch, the removed Agent bypass, a `null` `last_assistant_message`, `SubagentStop`,
and the legitimate-allow counterpart of each). `sync-agent-skills.test.sh` **45/45** (was 41).
`test-multi-harness-routing.sh` **31/31**. Claude-side fixtures unchanged: browser evidence 11/11,
route-brief all pass. Projection: `123 skills in sync, 0 collisions, 0 drift`.
`./scripts/pre-commit-checks.sh` exits 0.

### Carried gaps — recorded, not fixed

1. **`test-codex-native-hooks.sh` and `test-multi-harness-routing.sh` are gated by nothing.**
   Neither runs in `pre-commit-checks.sh` or CI; only `sync-agent-skills.sh --check` is gated.
   The routing suite additionally targets `$HOME` adapter files that are not in the repo, so a
   fresh clone, a CI runner or a second machine cannot run it — its 31/31 is a single-machine
   reading with no mechanism to stay true. Same drift shape that hid P1151's problem.
2. **The DSH credential-removal oracle has never been run against a control.** Removing
   `GEMINI_API_KEY` produced a google-route error, but `env -u DEEPSEEK_API_KEY dsh --profile
   headless 'provider canary'` was never run. If it errors naming deepseek, the oracle is blind and
   "the runtime selects Google despite the profile naming DeepSeek" is unsupported. One command
   settles it; it was not run here because a live `dsh` prompt is a spend with side effects.
3. **Stop's `turn_id` correspondence is assumed, not observed.** The whole Stop gate rests on Stop's
   `turn_id` equalling the enclosing turn's `PostToolUse` `turn_id`. The capture rig registered only
   `PostToolUse`, so this was never seen directly. One line in that rig's `hooks.json` settles it.
4. **The instruction gate's deny message hands over its own bypass** — it names a fixed
   world-writable marker path and nothing verifies the gate ran. Inherited from the Claude hook, so
   pre-existing, but worse in Codex where skill descriptions are stripped.
5. **Discoverability is not rescued by explicit invocation.** Codex 0.149.1 strips descriptions from
   all 123 skills and omits 63–64. That breaks proactive routing and `/find-skill` outright, and
   cross-skill invocation by name is pervasive (19× `/slava:maintain:claude-md`, 19×
   `/slava:content:positions-create`, 14× `/slava:think:align-detect`). The spec proves explicit
   invocation for `points-select` but never establishes that `points-select` was among the omitted
   skills — so it is proven for *a* skill, not an *omitted* one.
6. **`test-hook-sha-gate.sh` fails 4 of 10** — confirmed pre-existing, identical against HEAD's hook
   files and the fixed ones. Not caused by P1157 and not in its scope.

### Surfaces attacked that held

`run-verified.sh`'s sentinel design (rejects shell composition, absolute-path invocation, and
`bash`-prefix invocation; correctly closes Codex omitting Bash exit status entirely) · PascalCase
`hook_event_name` matching · `apply_patch_succeeded` against the real success string ·
`permissionDecision: "deny"` output contract · symlink escape from the projection dir (the **type**
enumeration is sound; only **name** matching was defective) · the `--out-dir` guard · the D9
unsafe-name hard fail · universal-policy vendor neutrality.

## Next Steps

Capture the adapter/ownership decision in `docs/decisions.md`, then implement the exact map above.
After implementation, run one fresh-context adversarial review, re-run every load-bearing claim
locally, then start the P1156 topic-pipeline canary.
