---
status: all-done
type: bug
disclosure: public
rank: 1000072
severity: high
workstream: infrastructure
date_reported: '2026-09-04'
created_date: '2026-09-04'
tags: [pipeline, ship, hooks, gates, tooling]
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-09-08
---

# P1246: Every control in the delivery pipeline is advisory, and none is deterministic

## Problem

**Situation:** The pipeline is built from ~138 skill files. Each quality step is an
instruction written in prose for an agent to follow.

**Complication:** Measured this session, those steps run at these rates:

| Step | Specified in | Actually runs |
|---|---|---|
| Capture the founder's verbatim framing | `create-spec.md:213` | **37 / 106 specs (35%)** |
| `/verify` | `pick-flow`, `dev` | **6%** of implemented specs |
| `/architect` | `pick-flow` | **9%** |
| `/generate-tests` | `pick-flow` | **6%** |
| `ship-gates.sh` at close time | `ship.md:51` prose | **0 call sites in the closing code** |
| Worktree cleanup | last step of `cmd_ship` | only on a fully successful ship |

Anthropic's own AI-native SDLC playbook (21 Aug 2026) states the mechanism directly:
*"A skill is a control, though an advisory one… nothing forces a session to comply
with it. A policy that must always hold needs something deterministic behind the
skill, such as a hook that blocks the action."*

The consequence is that finished and unfinished work are indistinguishable at the
end. Scored against `ship-gates.sh`'s own gate 2.5 **at the moment of each close**,
**15 of 18 co-located closes (83%)** and **at least 19 of 40 sampled ordinary closes
(≥48%)** would have been refused had the gate run. One spec sits in `features/done/`
stamped `all-done` while its own body reads *"PARKED — the decided architecture was
never built."* Another was a live security spec marked complete.

**Correction, recorded because the first draft got it wrong.** This table first
reported the framing rule at **4% (38/981)** — a denominator including ~892 specs
created before the rule existed (it entered `create-spec.md` on 2026-08-26,
`4f0d981e9`). Split at that date: **1% before, 35% after**. The rule is nine days old
with rising adoption, not a dead letter, and this row is the weakest in the table.
The same defect class — scoring against a population that predates the thing measured —
was the error corrected twice elsewhere in this investigation.

**Question:** What is the smallest deterministic layer that makes the existing
controls actually bind?

> Founder framing, verbatim: *"now I do need to control my agents. I need to see
> which worktrees are there, are they closed, are the specs finished."*

> And on the worktrees specifically: *"I honestly don't even want to think about
> them. Why would I think about them? They should be automatically happening within
> ship or finish or whatever, and done."*

**This defect has been correctly diagnosed three times in eight days and never
fixed** — [decisions.md](../../../docs/decisions.md) 2026-08-27, 2026-09-01 and 2026-09-04.
The first two both ended in a discipline rule and both recurred. A fourth discipline
entry is not worth writing.

**Why the prior spec sat.** [p931](../../p931_ship_phase2b_coclose_false_close.md) was filed
2026-06-11 with a correct root cause and a correct fix approach, at
`severity: medium`, `status: backlog`. The founder triaged it from that label and it
has not moved in three months. The severity was wrong, not the triage — a defect that
silently marks security specs complete at an 83% wrong rate is not medium. **Re-triage
p931 as part of this work.**

## Appetite

**Blast radius: high** — every close, every worktree, every spec creation. A gate wired
wrong blocks all shipping.
**Reversibility: medium** — hook configuration and scripts revert cleanly; no data
migration. But a gate that wrongly blocks costs a session each time.
**Decision density: two founder calls**, both named inline below.

## Invariants

- **A control that must always hold is enforced by the harness, not by prose.** Adding
  an instruction to a skill file is not a fix for this class — that is the defect.
- **Every gate fails closed.** Unreadable spec, missing script, unresolvable branch →
  deny. `detect_cospecs` already sets this precedent (P1105).
- **No gate reads `status:`.** [features.md](../../../.claude/rules/features.md): *"no skill,
  script or hook may gate a merge, a close or a deploy on this field."*
  `git-ops.sh:2240-2249` violates this today; the fix removes the violation.
- **No override is writable by the agent being gated.** The repeated failure in this
  repo is a bypass the gated party can type — `inline` in gate 2.5, the hand-written
  review stamp. Any escape hatch must be auditable and out of the agent's reach.

## Solution

Build the deterministic layer out of Claude Code's native blocking hooks, which the
repo already uses correctly in two places (`verify-before-stop.py`,
`verify-screenshot-before-reedit.py`) and nowhere in the pipeline.

Verified available (`code.claude.com/docs/en/hooks.md`):

| Hook event | Blocks | Use here |
|---|---|---|
| `TaskCompleted` | *"Prevents the task from being marked as completed"* | Run `ship-gates.sh`; refuse completion on failure |
| `WorktreeRemove` / `WorktreeCreate` | Yes | Detect and report strandings |
| `Stop` | Yes | Already proven in this repo |
| `PreToolUse` | Yes (`permissionDecision: deny`) | Guard the close path itself |

Four gates, one mechanism:

1. **Closure gate.** `ship-gates.sh` runs from the closing path, not from prose. Covers
   all three close routes — named, direct-to-main, and Phase 2b co-located, which today
   runs no gate at all.
2. **Cleanup gate.** Cleanup runs even when the ship sequence fails earlier, and a
   stranded worktree is reported without the founder asking.
3. **Step-ran gate.** Hooks read the session transcript — the repo's own
   `_transcript_lib.py` already does exactly this — to check a required prior step ran.
4. **Intent gate.** A spec created from a conversation must carry the founder's verbatim
   framing. This is mechanically checkable and requires nothing new from the founder:
   the agent already reads the conversation; only the check is missing.

**Also in scope:** remove the `status:` gating at `git-ops.sh:2240-2249`, and adopt
`claude plugin eval` as a merge check on any change to `CLAUDE.md`, skills or hooks —
confirmed available on this machine, with a built-in no-plugin baseline arm. Approved
by the founder this session.

### Founder decisions, recorded 2026-09-08

**D1 — the override is a TTY-only prompt plus an audit trail.** Chosen over a flag
file (`~/.push-enabled`-style), over no escape at all, and over a warn-only phase.

Measured this session from the agent Bash tool:

```
stdin tty: NO   stdout tty: NO   stderr tty: NO
/dev/tty: "Device not configured"   <- not redirected, ABSENT
```

**That measurement is correct. The inference drawn from it was not, and the
decision was taken on a false premise — see the correction below.**

The claim was that a controlling terminal is the one thing an agent structurally
cannot obtain, so the Invariant *"No override is writable by the agent being
gated"* would be satisfied. There is deliberately no test-mode env var, and the
canary proved the allow-path through a real pty via `script(1)`.

The reason typed at the prompt is recorded twice: in
`git-common-dir/gate-overrides.log`, and — the one that matters — as a
`Gate-Override-Reason:` trailer on the closure commit, which is pushed, permanent,
and greppable across history.

**D2 — yes, a gate may block the founder.** One code path, no actor detection.
The gate refuses everyone; passing it requires answering a prompt on /dev/tty.
The *intent* — no actor detection, one path — survives the correction below; the
claim that this made "agent vs founder" a structural property does not.

### CORRECTION, same day: D1's premise is false

An adversarial review falsified the central claim, and it reproduces in one
command from a plain agent shell with no human present:

```
$ { sleep .5; printf 'agent typed this, no human present\n'; sleep .5; } \
    | script -q /dev/null bash -c './scripts/git-ops.sh ship p777 --override'
[GATE 2.5] FAIL: 1 unticked completion item(s)
  ── GATE OVERRIDE ──
ship: GATE OVERRIDE accepted for p777
Ready to push.
```

`script(1)` is a standard, unrestricted utility that allocates a real pty. A spec
with an unticked box was closed by an agent on a red gate.

**The tell was inside the test.** The canary proved the allow-path by feeding the
prompt through `script(1)` — it used the bypass as its stand-in for a human. An
oracle built out of the thing under test cannot detect that thing, which is the
independence rule in CLAUDE.md, and it is why this survived being "proven" in
four canary arms.

**No local check fixes it.** Detecting `script` is an arms race against every
other pty allocator, and any predicate an agent can read it can arrange to
satisfy. What the prompt is actually worth is stated in `gate-override.sh`: a
real speed bump (reaching for a pty wrapper is a decision, not a slip, and reads
as circumvention in a transcript) plus a durable public record in the closure
commit. That is the same posture as every other local control here — accident
prevention, explicitly not the boundary (`.claude/rules/git.md`).

**The boundary must therefore be server-side, and it is not yet enforced.**
`closure-gate.yml` re-derives the verdict from pushed commits, but verified
2026-09-08 via `gh api repos/.../rulesets/17729463`, the only required status
check on `main` is `audit-privacy`. Until a repo admin adds `closure-gate`,
**nothing in the closure chain is un-routable-around.** That is a founder action;
this branch cannot perform it.

**D1 is therefore returned to the founder.** The options are unchanged — the
information is not. A TTY prompt is friction plus audit, not authorization; the
genuinely unforgeable choices remaining are "no override at all", or an override
that only the server-side check can grant.

**D3 — the intent gate is scoped to feature/story/task; bug specs are exempt.**
A bug's authoritative artifact is its reproduction, not a stated intent, and
`/create-bug` already skips `/problemify` for that reason. Forcing a quote onto a
spec whose honest origin is "the alarm fired" would manufacture ceremony.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Gates block legitimate work on day one (≥48% historical failure rate) | MITIGATE | Required: run the repo's own documented workflows through each gate and measure false positives before shipping — [epistemic.md](../../../.claude/rules/epistemic.md) gate 7c |
| "Would fail gate 2.5" over-counts non-delivery — a finished spec can carry a stale unticked line | ACCEPT | The gate's job is to force the question. The override absorbs this |
| The override becomes the new self-attestation hole | MITIGATE | Named as an invariant above and as a founder decision |
| Agent teams are documented as sometimes failing to mark tasks complete | MITIGATE | The hook is load-bearing; the task list is not. Gates must not assume the task list is reliable |
| `TaskCompleted` ignores `continue: false` when a task update triggered it | ACCEPT | Exit code 2 still blocks; use the exit code, not the JSON form |
| Founder framing quoted in a spec may carry personal context | MITIGATE | Specs are public; the existing privacy gate and [pii.md](../../../.claude/rules/pii.md) apply to the quoted line like any other |
| Enforcing steps that don't earn their place | DEFER | Of two skills benchmarked, one showed no measurable advantage and one was void. Evals (in scope) measure this; deleting skills is not this spec |

**Non-Goals**

- **Do NOT adopt an off-the-shelf orchestrator.** Surveyed this session; decided against.
  Nothing in a ~450-tool census models "done", and none preserves the founder-decision
  markers or epistemic gates. Conductor solves worktree ergonomics only.
- **Do NOT add a new manual step, artifact folder, or `create-intent` command.** The
  intent capture already exists in `create-spec`; only its check is missing. The founder
  must not have to remember anything new.
- **Do NOT delete or rewrite `/dev`, `/architect` or `/adversarial-review` on current
  evidence.** The `/dev` A/B was declared **void**, not lost; `/architect` has never been
  benchmarked. Evals settle this later.
- **Do NOT fix `detect_cospecs`' set arithmetic.** [p931](../../p931_ship_phase2b_coclose_false_close.md)
  owns it. Wire the gate into Phase 2b here; leave the detection logic there.
- **Do NOT edit `.claude/commands/slava/build/*.md` while the concurrent session holds
  them.** Sequence or coordinate.

## Alternatives Considered

- **A richer machine-checkable spec format.** Rejected — evidence refuted it. A spec was
  closed carrying four unticked criteria and no implementation record; a better format
  would have sat in the same place, equally unread.
- **Fix the co-located auto-close alone.** Rejected — it is worth ~35 points on top of an
  ungated baseline that still fails at ≥48%.
- **Discipline rules.** Rejected — tried three times in eight days, recurred each time.
  Two of the nine known false closes were caused by the *repair* of a previous false
  close, which no discipline rule reaches.
- **Adopt Anthropic's artifact chain wholesale.** Partially adopted (intent capture) and
  otherwise rejected: verified against the primary source, the chain has **no mechanism**
  checking that a spec satisfies its intent — that check is a human answering a prose
  question — and it never mentions cleanup or skip detection. It also assumes distinct
  role-holders, which a solo founder does not have.
- **Buy (Conductor, gastown, spec-kit).** Rejected this session. Two structural ideas
  from gastown are worth stealing without adopting it: the implementer may not close its
  own work, and the reviewing task is dependency-blocked and carries no memory of the
  implementation.

## Rollback Strategy

Hook configuration and scripts; `git revert` restores prior behaviour with no data
migration. Gates only ever *refuse* closes, so a revert cannot corrupt state a gate
created. The `status:` removal at `git-ops.sh:2240-2249` is the one change that alters
which closes *succeed* — revert it together with the wiring, never alone.

## Done-When

- [x] `ship-gates.sh` is invoked from the closing code on all three close routes, shown
      by call sites in `git-ops.sh` (or a hook it cannot bypass)
- [x] A spec with an unticked completion box cannot be closed — the `p1043` case replayed
      against the new code, with the non-zero exit pasted
- [x] Phase 2b refuses to close a co-located spec that fails the gate, shown on a fixture
- [x] A ship that fails before cleanup leaves no stranded worktree, **or** the stranding
      is reported without anyone asking — demonstrated by killing a ship mid-sequence
- [x] A spec created from a conversation without the founder's verbatim framing is
      refused, with the exit code pasted
- [x] `git-ops.sh` no longer reads `status:` to decide whether a close may proceed
- [x] The `p1113` case replayed: a spec whose frontmatter reads `status: done` with work
      on main can be closed rather than dying
- [x] Every gate's **failure path** exercised with a pasted exit code — unreadable spec,
      missing script, unresolvable branch (epistemic gate 7)
- [x] **False-positive pass:** the repo's own documented ship and dev workflows run
      end-to-end against the wired gates and still complete. Name which were run
      (epistemic gate 7c)
- [x] Both founder decisions above recorded in this spec
- [x] `p931` re-triaged to a severity matching its measured impact

## Implementation Record (2026-09-08)

### What was built

| Gate | Mechanism | Where |
|---|---|---|
| 1. Closure | `ship_run_gates` called from the closing code before any mutation | `git-ops.sh:2329` (direct-to-main), `git-ops.sh:2530` (branch route) |
| 1b. Closure, second layer | `PreToolUse` deny on a hand-rolled `git mv` / `Write` into `features/done/` | `.claude/hooks/block-manual-spec-close.py` |
| 1c. Closure, server-side | Re-derives the verdict from pushed commits, gate script fetched from `origin/main` | `.github/workflows/closure-gate.yml` |
| 2. Cleanup | `ship_on_abort` (in-session, pre-existing) + a standing unasked-for report | `scripts/pipeline-strandings.sh`, `SessionStart` hook |
| 4. Intent | One script, three call sites: `PreToolUse` Write, pre-commit on the staged blob, CI | `scripts/spec-intent-gate.sh` |
| Override | TTY prompt + commit-trailer audit. **Friction, not a boundary** — defeatable via `script(1)`, pinned as canary A4 | `scripts/lib/gate-override.sh` |

`status:` gating removed from `git-ops.sh` — it was the last violation of
[features.md](../../../.claude/rules/features.md)'s *"no skill, script or hook may gate
a merge, a close or a deploy on this field"*.

### Three assumptions in this spec were falsified before building

1. **`WorktreeCreate`/`WorktreeRemove` cannot see this repo's worktrees.** They fire
   only for Claude Code's own worktree mechanism (`--worktree`, `isolation:
   "worktree"`, background sessions) — never for `git-ops.sh claim`'s plain
   `git worktree add`. The cleanup gate is in `git-ops.sh` and a `SessionStart`
   report instead.
2. **`TaskCompleted` is the wrong hook for the closure gate.** It fires on
   *task-list* completion, which this spec's own Risks table calls unreliable
   ("agent teams sometimes fail to mark tasks complete"). Gating a close on it
   would have made the gate depend on the least reliable signal available.
3. **Phase 2b no longer closes anything.** [P1250](p1250_colocated_autoclose_closes_specs_nobody_did.md)
   shipped 2026-09-07 and removed the auto-close. Done-When 3 is satisfied more
   strongly than it asked: Phase 2b cannot close a co-located spec that fails the
   gate because it cannot close one at all. This is also why `p931` was re-triaged
   **down** to `low` rather than up — its high-impact path no longer exists.

### Gate 3 (step-ran) was not built, deliberately

The spec proposed reading the session transcript to check a required prior step
ran. Gates 2.5 and 2.7 already assert the *artifacts* those steps produce —
completion checkboxes, `pipeline_ran`, a `.finish-reviewed` entry naming the spec.
Adding a transcript scan would gate on evidence *that the agent authored*, which is
the self-attestation class this spec's Invariants forbid, and would duplicate a
check already made against artifacts. Reported rather than silently dropped.

### Evidence

Failure paths, exit codes read directly (never through a pipe — zsh's `$?` after
`cmd | head` is `head`'s, and `${PIPESTATUS[0]}` expands empty in zsh, both of
which produced wrong readings during this session before being caught):

```
B1  unticked box blocks a close ......................... exit 1, spec not moved
C1  ship-gates.sh deleted -> close DENIED ............... exit 1  (deleting the gate is not a way past it)
D1  --spec-file on an unreadable path ................... exit 1  (no silent fall-back)
E1  task spec with no verbatim framing .................. exit 1
E5  intent gate on an unreadable file ................... exit 1  (fail-closed)
F1  hand-rolled `git mv` into features/done/ ............ exit 2  (PreToolUse deny)
A1  override attempted from a bare agent shell ......... refused (no /dev/tty)
A3  override at a pty with a 2-char reason .............. refused
A4  override via `script(1)` from an agent shell ........ ACCEPTED — known limitation, pinned
D2  --only with an unknown gate id ...................... exit 1  (was exit 0, zero output)
D3  forged ship journal on --resume ..................... gate runs; no ungated code reaches main
G3  --strict with a strand present ...................... exit 1
```

False-positive pass (epistemic gate 7c — the arm with no natural prompt):

```
scripts/test-git-ops-ship.sh ....... 55 PASS / 0 FAIL, exit 0
```

That is every documented ship workflow in the repo — K through ZZ — re-run
end-to-end with the gate armed. It found a real false positive in the first
version of this gate: canary QQ (P1094 item 2) crashes a ship between Phase 2's
`git mv` and the journal flag write, then resumes. The gate looked for a spec that
had already moved, reported "spec not found", and hard-failed a recovery path
whose entire purpose is surviving that crash. Fixed by widening the skip predicate
to "the spec has already left `features/`", not just "the journal says closed".
Nothing prompted that discovery except running the existing workflows — which is
the whole content of gate 7c.

Allow-arms also asserted, so the gates are measured in both directions:
`B3` (a fully-ticked spec still ships), `E2`/`E3`/`E4` (framing present, bug
exempt, cold-start declared), `F3`/`F4` (the sanctioned close path and ordinary
reads are untouched), `G1` (the report is silent when there is nothing to act on).

The canary suite was itself mutation-tested: breaking gate 2.5's unticked-box
comparison turns `B1`/`B2` red and the suite exits 1.

Intent-gate blast radius, measured against the live corpus: 87 of 116 non-bug
open specs would fail it, but only 10 were created after the rule landed
(2026-08-26) — and the gate fires **at creation only**, so no existing spec is
ever re-gated.

### Not delivered — `claude plugin eval` merge check

**Blocked on an account capability, not on this work.** The spec recorded it as
"confirmed available on this machine". The subcommand exists and `--help` prints
in full, but every invocation refuses:

```
$ claude plugin eval . ; echo $?
`plugin eval` is currently in early access
1
```

Reproduced with and without `--threshold`, `--eval-dir`, and a target path. So the
merge check cannot be made to enforce anything today, and wiring it naively would
put a permanently-red required check in front of every skill change — which is how
a control becomes something people route around.

Delivered instead, so that only the account flag remains:

- `evals/` — three real cases (closure gate respected, intent gate respected,
  override not forgeable), each with graders.
- `.github/workflows/plugin-eval.yml` — runs with `--ablation with-without` (the
  no-plugin baseline arm) at threshold 1.0; distinguishes "capability unavailable"
  (warn, pass) from "eval ran and scored low" (fail); and asserts an
  `aggregate-result.json` was actually written, so a future silent no-op cannot
  report a vacuous pass.

**CRITERION RETIRED 2026-09-08, founder decision.** The Done-When line has been
*removed* from the list, not ticked and not marked with a glyph — `ship-gates.sh`
scores any box that is not `[x]` as open precisely so that inventing a "[~]
RETIRED" notation cannot pass, and its comment says a retired criterion is
removed with its reason recorded in prose. This paragraph is that reason.

It was left unticked first, and the gate duly refused to close this spec — on its
own author, which is the behaviour the spec asked for. Retiring it is a decision
about scope, taken with the evidence in hand, not a way around the refusal.

The work is not abandoned: the eval cases and the workflow are committed and
inert, and the follow-up is filed in `docs/process-learnings.md` so it does not
live in anyone's memory. Nothing further is needed here the day early access is
switched on — the workflow flips from warning to enforcing by itself.

## Open Questions

1. Does the override belong per-gate or once globally? → changes whether one bypass
   defeats everything.
2. Should the intent gate apply to bug specs, where the problem is an observed symptom
   rather than a stated intent? `/create-bug` deliberately skips `/problemify` for this
   reason.

## Related

- [p931](../../p931_ship_phase2b_coclose_false_close.md) — owns the co-located detection logic.
  Filed 2026-06-11, never implemented, still at `severity: medium`.
- [p1211](../../p1211_frontend_ships_ahead_of_its_migration_with_no_gate.md) — the same defect
  one gate over; its Done-When already asks that a step be *"enforced by `ship-gates.sh`
  (or the hook), not by prose an agent may skip."*
- [p1040](../../p1040_ship_gates_accept_matching_review_type.md) — gate 2.7 review-type
  matching; presupposes the gate runs.
- `docs/decisions.md` 2026-09-04, 2026-09-01, 2026-08-27 — the three discipline-only
  rulings this spec replaces.
