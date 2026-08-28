---
name: pick-flow
description: >
  Recommends a development flow by classifying the task, naming real risks,
  and picking steps that address those risks. Principles over scoring tables.
when_to_use: >
  When starting work and unsure which development flow to use. Triggered by "/pick-flow",
  "what flow should I use?", or whenever the user is about to start a task and the right
  process is unclear. Proactively offer at the start of any non-trivial task (P-number
  mentioned, bug described, "what do we do next" asked). Skip for one-liner fixes, typo
  edits, or when the user has already named the exact commands to run.
version: 3.2.0
---

# pick-flow

Analyze the task and recommend a flow. No preamble, no padding.

## How to think about flow selection

Don't score signals. Don't classify tiers. Instead:

1. **Classify** — what type of task is this? (Step 0)
2. **Name risks** — what 1-3 things could actually go wrong? (Step 1, features/redesigns only)
3. **Match steps to risks** — each risk maps to a protective step. No risk, no step.
4. **Check firewalls** — five hard stops that override judgment.

A good flow has every step justified by a named risk. A bad flow includes steps "just in case."

## Step -1: Lean viability check

Read `docs/lean-canvas.md`. Ask: who needs this, are they using the product today, does it help the current 30-day priority?

If the feature serves a use case that doesn't exist yet:
```
⚠️ Lean check: This serves [segment/use case] which doesn't exist yet.
Current priority: [from lean canvas]. Recommend: backlog.
```

Skip for: bugs, refactors, infrastructure, and when user has confirmed the use case. If lean-canvas doesn't state a current priority, skip this check and note the gap.

## Step 0: Classify the task

| Task type | Default flow |
|-----------|-------------|
| **Feature** (no spec) | `/create-spec` → risk assessment (Step 1) |
| **Feature** (spec exists) | Check `pipeline_plan`/`pipeline_ran` → resume from first unrun step. If absent, check `delivery_stage:` (legacy). If neither → Step 1 |
| **Bug** (trivial, self-evident cause) | `/fix` → done |
| **Bug** (root cause known, needs proof) | `/reproduce` → `/fix` → done |
| **Bug** (root cause unclear) | `/slava:dd:frame-analyze` → `/reproduce` → `/fix` → done |
| **Redesign** (design was wrong, code works) | `/change-request` → `/challenge-prd` → risk assessment (Step 1) |
| **Refactor** (no behavior change) | `/create-spec` (type: task) → `/dev` |
| **Data migration** | `/create-spec` (type: task) → `/generate-tests` → `/dev` |
| **Infrastructure** (skills/hooks/rules/CLAUDE.md) | `/create-spec` → draft → adversarial subagent → `decisions.md` → implement |
| **Test-only / content-only** | Inline or `/create-spec` (lightweight) → `/dev` |

**If Step 0 gives a complete flow, output it and stop.** Only features and redesigns continue to Step 1.

### Artifact-weight check (before routing to a full spec)

Not every change needs a full spec. Three tiers:

- **Full spec** (`/create-spec`): multi-file changes, new features, migrations, anything with blast radius, work that crosses subsystems.
- **Plan** (Plan Mode, written to `~/.claude/plans/`): multi-step but small scope, needs alignment before implementation. Example: 20-line `.claude/rules/` file, single-file refactor.
- **Inline**: single-file, obvious, user said "just do it." Example: typo, copy tweak.

Signal: if the spec's Done-When would have only 1-2 checkboxes, it doesn't need a full spec. A `/create-spec` for a 20-line rule file is overhead — propose Plan Mode or inline instead.

**Spec gate:** Does a P-number exist? If not, route to `/create-spec`, `/create-bug`, or `/change-request` first. Only test-only changes skip this.

**Redesign test:** Code broken → `/fix`. Design wrong → `/change-request`. Both → `/change-request` + separate `/create-spec` for new capability.

## Step 1: Name the risks (features and redesigns only)

Look at the spec, conversation, and code. Name 1-3 concrete risks — not categories, actual things that could go wrong. Then match each risk to the step that addresses it.

**How to reason (examples, not a lookup table):**

- "Users will see something new or different" → `/verify` (confirm in browser). Add `/ux` **only**
  when you can **write the unresolved design question as a sentence** — *"what does the empty state
  show?"*, *"which of the two layouts?"*, *"what does the user see after they submit?"* — and
  nobody in the thread has answered it. **If you cannot write that sentence, the design is settled
  and `/ux` does not go in.** Put the sentence in the Risks line so it can be checked; the other
  triggers here are countable, and this one has to produce an artifact instead.
- "DB schema changes or new data model" → `/architect` (structure review) + `/generate-tests` (lock behavior)
- "Auth, RLS, or permissions logic" → `/architect` (security review) + `/generate-tests`
- "Multiple viable approaches, trade-offs unclear" → research the options before `/architect`
- "PRD assumptions haven't been stress-tested" → `/challenge-prd`
- "Spec is stale (>14 days) or is a change-request" → `/spec-review` before `/dev`
- "5+ files or 3+ independent concerns" → `/decompose`
- "Conditional rendering, state changes, business logic" → `/generate-tests`
- "Spec has grown past 100 lines with pipeline residue" → `/spec-compact`
- "Feature is a new visual surface where polish will splinter across /dev iterations" → say so in
  the spec and let `/verify` catch it. **Do not recommend `/view`** — see "Retired from routing".

**If you cannot name a risk that a step addresses, don't include that step.**

## Step 1.5: Weigh cost against track record

Naming a risk is only half the case for a step. **A step must also be worth what it costs**, and
the honest measure of worth is whether it has ever actually been chosen.

Every step you recommend adds at least one approval turn before `/dev` can start. That is the cost,
and it is paid by the founder, every time, whether or not the step earns it.

**Track record (snapshot 2026-08-20 — regenerate before trusting it):**

```bash
python3 - <<'EOF'
import re, glob, collections
c = collections.Counter()
for f in glob.glob('features/**/*.md', recursive=True):
    m = re.search(r'^pipeline_ran:\s*\[(.*?)\]', open(f, errors='replace').read(), re.M)
    if m:
        for i in m.group(1).split(','):
            step = re.sub(r'\.\d+$', '', i.strip().strip('"\''))
            if step: c[step] += 1
for k, v in c.most_common(): print(f"{v:5d}  /{k}")
EOF
```

Parse the field — do **not** `grep -c` for step names. `grep -c` counts matching *lines*, not
occurrences, and bare step names collide with other words; that error put six of the ten numbers
below out by one or two when this section was first written.

| `/ship` 180 | `/fix` 168 | `/create-bug` 157 | `/create-spec` 154 | `/dev` 93 | `/reproduce` 80 |
|---|---|---|---|---|---|
| `/architect` 33 | `/challenge-prd` 27 | `/generate-tests` 21 | `/spec-review` 19 | `/verify` 15 | `/change-request` 15 |
| `/decompose` 8 | `/ux` **7** | `/ui` **4** | `/ascii-flows` 2 | `/spec-compact` 1 | `/view` **0** |

(375 specs carry the field, of 1040 scanned.)

**The rule:** a step in the bottom tier (`/ux`, `/ui`, and anything else under ~10 runs) is
**opt-in, not default**. Include it only when you can say what specific open decision it closes.
"It's a UI change" is not that. If the founder has already settled the design, the step closes
nothing and adding it is pure cost.

**A low count is a prompt to justify, not a ban — and it must be escapable.** Left alone, this
rule is a ratchet: an opt-in step gets recommended less, so it runs less, so it stays below the
threshold forever, and no step can ever earn its way back. Two things prevent that:

- **A count is not a verdict.** "Rarely needed" and "always struck out" look identical in the
  table and mean opposite things. `/decompose` at 8 is a step that genuinely applies to few
  specs; `/ux` at 7 is a step the founder actively removes. Before demoting on the number alone,
  check which one you are looking at — the founder's own words in the thread usually say.
- **Graduation.** If a step is opted into and *kept* (not struck) three times running, it is no
  longer bottom-tier — recommend it by default again and say why. Nothing else is needed; the
  count regenerates from `pipeline_ran` on its own.
- **No double-gating.** A low count and a trigger are **one** test, not two. If a bottom-tier
  step's trigger fired on a *named, written-down* open decision, it is in — the count does not
  demote it a second time. The count only argues against steps included on vague grounds
  ("it's a UI change"). Otherwise `/ux` at 7 runs would face a narrowed trigger *and* a demotion
  rule, and would go to zero without anyone deciding it should.

**Why this section exists:** the founder's push-back was measured — over the recent window he
removes steps far more often than he adds them, and `/ux`, `/ui` and `/view` are the ones he names
(`decisions.md` 2026-08-20). The router had no cost side to its ledger at all: it reasoned only
about risk, so every named risk produced a step and nothing ever argued the other way.

### Retired from routing

- **`/view`** — created 2026-04-14, recommended in flows, and **run zero times in four months**
  while `/dev` ran 92. Not new, not untested-because-recent: never once chosen. Removed from
  routing. The skill file is kept, not deleted, because retiring costs nothing to reverse and the
  open question is whether a design-artifact pass beats it. **What would settle it:** run both on
  the same feature and compare. Until someone does, do not put it back in a recommended flow.

## Step 2: Output

```
## Flow for: [task name, ≤8 words]

### Risks
1. [concrete risk] → [step(s) that address it]
2. [concrete risk] → [step(s)]
3. [concrete risk] → [step(s)] (if applicable)

### Recommended flow
/cmd1 → /cmd2 → ... → /dev

### What this costs
[one line per non-/dev step: the gate or turn it adds, and its track record —
 e.g. "/ux: one approval turn before /dev. Has run 8x against /dev's 92."]

### Model + effort
[e.g. Opus/xhigh through /architect → switch to Sonnet/low for /dev]

### Safe to skip
- /[cmd]: [why risk is low enough]. Accepting: [what could go wrong].
- (none — all steps address real risks)

→ Proceed? Or "skip [step]" / "light flow" to adjust.
```

**Light flow:** When user says "light flow", "quick", or "just do it" — collapse to minimal flow. State what was removed: "Light flow: /dev only. Skipped: /architect (would catch X), /verify (would catch Y). Add any step back by name."

## Model + effort

Every flow runs at a model + effort tier. Recommend it explicitly — the user toggles `/model` and `/effort`; you cannot set them yourself, so recommend and let them flip.

| Work in the flow | Model | Effort |
|---|---|---|
| Planning, `/create-spec`, `/challenge-prd`, `/ux`, `/architect`, `/spec-review`, `/falsify`, `/adversarial-review`, strategy, ambiguous root-cause, value judgment | **Opus** | high / xhigh |
| Executing a detailed spec or plan — `/dev`, `/fix`, `/generate-tests`, `/decompose`, `/verify`, `/kdd`, `/finish`, code review, mechanical edits | **Sonnet** | low / medium |
| Status, cleanup, lookups, frontmatter fixes | Sonnet / Haiku | low |

Most flows split: **Opus to plan, Sonnet to execute.** Name the switch point in the output, e.g. "Opus/xhigh through `/architect`, then Sonnet/low for `/dev`." This table is for the **session** model only — subagents spawned inside skills are already pinned to `sonnet`.

## Firewalls

1. **Spec gate:** Work needs a P-number before building. Route to creation skill first.
2. **Infrastructure gate:** Changes to `.claude/commands/`, `.claude/rules/`, `.claude/hooks/`, `CLAUDE.md`, or `scripts/` → draft → adversarial subagent → `decisions.md` → implement. Skip only for purely additive single-file changes with no shared state.
3. **`/finish` is inside `/dev`:** Never list it as a separate step.
4. **`flow:` frontmatter:** Write exactly one of: `fix`, `dev`, `inline`. (`quick-feature` is a legacy value — read/resume it on old specs, never assign it to a new one; `/quick-feature` was absorbed into `/create-spec`.)
5. **Resume from pipeline trail:** If spec has `pipeline_plan` and `pipeline_ran`, diff them — first item in plan not in ran = resume point. Present remaining pipeline. If spec has old-format `delivery_stage` (numbered: `1-prd`, `2-ux-review`, etc.) without `pipeline_plan`, use legacy resume table below.

### Legacy resume table (old-format specs only)

| `delivery_stage` value | Resume from |
|----------------------|-------------|
| `5-decomposed` | `/dev` |
| `4-tests-ready` | `/spec-review` → `/spec-compact` → `/decompose`* → `/dev` |
| `3.5-ui-review` | `/generate-tests` → ... → `/dev` |
| `3-arch-review` | `/ui` (if UI) → `/generate-tests` → ... → `/dev` |
| `2-ux-done` or `2-ux-review` | `/architect` → ... → `/dev` |
| `1-prd` or `1-prd-review` | `/ux` (if UI) or `/architect` → ... → `/dev` |

## After user confirms

- Set `flow:` in spec frontmatter if spec exists (values: `fix|dev|inline` — `quick-feature` is legacy, never newly assigned; see `.claude/rules/features.md`)
- **Set `pipeline_plan:`** — ordered inline list of all tracked skills in the confirmed flow. Example: `pipeline_plan: [create-spec, challenge-prd, architect, generate-tests, dev, verify]`
- **Set `pipeline_skipped:`** — inline list of skipped skills with reasons. **Quote every element**, always: `pipeline_skipped: ["ux -- no net-new visual component", "decompose -- under 5 files"]`. Omit if nothing skipped.
  - **Why the quotes are not optional.** This is a YAML *flow sequence*, where an unquoted comma is the element separator. A reason containing a comma therefore splits into two entries — `["challenge-prd -- founder declined, see Pipeline note"]` silently parses as `["challenge-prd -- founder declined", "see Pipeline note"]`, and the kanban, the validators and every later reader see a fragment that reads like a skipped skill named "see Pipeline note". The file *looks* right on disk, which is why it survived: nothing renders frontmatter until something parses it. Found 2026-08-28 in 4 specs during a `/slava:maintain:prioritize` run. Quoting makes the comma inert, so reasons can be written as prose.
- **Initialize `pipeline_ran: []`** (empty — skills fill this as they run)
- Do NOT write skip info to `## Next Steps` (it goes to `pipeline_skipped` in frontmatter)
- If in a worktree: remind user that spec creation must happen from main repo

## Available commands (sequence order)

`/create-spec` · `/challenge-prd` · `/ux` · `/architect` · `/ui` · `/generate-tests` · `/spec-review` · `/spec-compact` † · `/decompose` · `/dev` · `/verify` · `/park` · `/kdd` †

Also: `/reproduce` (bug confirmation + failing test) · `/fix` (bugs) · `/change-request` (redesigns) · `/create-bug` (bug without P-number) · `/slava:dd:frame-analyze` (unclear root cause) · `/park` (done on branch, merge later)

† **Non-stamping — never put these in `pipeline_plan`.** `/spec-compact` and `/kdd` do not write
`pipeline_ran`. Every tracked skill's predecessor check is an **exact string match** against
`pipeline_ran`, so a plan naming a non-stamping skill deadlocks whatever step follows it —
permanently, with no way to satisfy the check. (Live instance: `p686`'s plan carries
`spec-compact`, which hard-stops `/decompose` on that spec.)

**Rule when editing these two lines:** before adding a name, grep its skill file for
`pipeline_ran`. No hit → mark it `†` here, or leave it out. This list is the plan vocabulary;
anything in it must be a name some skill will stamp.
