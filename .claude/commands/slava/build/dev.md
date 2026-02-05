# /dev

Execute a development task with TDD discipline and production thinking.

> **Principle:** Write code you'd be proud to debug at 3am. Today's shortcut is tomorrow's incident.

## Usage

```bash
/dev fix the login button
/dev features/p99.md
/dev refactor the auth module
```

---

## How to Think

You're not just writing code — you're building something that will run in production, be maintained by others, and fail in ways you haven't imagined.

**Two lenses to apply constantly:**

### The Sustainability Lens
> "Will we regret this in 6 months?"

- Long-term over short-term. A "quick fix" that creates a 2-week cleanup wasn't quick.
- Patterns exist for reasons. Violating them might be right, but understand why the pattern exists first.
- Production is different. Happy path demos don't prove robustness.

### The Skeptic's Lens
> "Why will this fail?" (not "might" — "will")

- Assumptions are hypotheses. Every assumption is something that could be wrong.
- Plans survive until contact with reality. What real-world conditions could break this?
- Hand-waving hides risk. When something is glossed over, that's where bugs live.

**Apply both before you ship:**
- What shortcuts might hurt later?
- What happens when this fails? (not "if")
- What assumptions are we making?
- Is this testable? Debuggable by someone else?

---

## Workflow

1. **Understand** — Read spec, find `[ ]` tasks (skip `[x]` done)
2. **TDD** — For each task: test → implement → verify
3. **Skeptic check** — What could break? What did I assume?
4. **Mark** — Change `[ ]` to `[x]` after task passes
5. **Check** — Run `./scripts/pre-commit-checks.sh`
6. **Done** — Report results

---

## TDD Flow

```
1. Write failing test first
2. Run test, confirm it fails for RIGHT reason
3. Implement MINIMAL code to pass
4. Run npm test — MUST paste output
5. If tests fail → fix before proceeding
```

**Skip TDD only for:**
- Pure refactoring (tests exist)
- UI-only with no logic
- Trivial changes (typos)

---

## When Stuck

If 3+ attempts fail or you're fighting the architecture:

**1. STOP** — Don't keep trying the same thing

**2. Root cause first**
```
- Read error messages COMPLETELY
- Reproduce consistently
- Trace backward to source
- Hypothesis: "X is root cause because Y"
```

**3. If still stuck, present options:**
```
Problem: [what's blocking]

Options:
A) Quick fix: [hacky, note tech debt]
B) Local refactor: [fix area, ~N files]
C) Needs discussion: [architecture issue]

Which approach?
```

---

## Definition of Done

**Prod ready. Proud to ship it.**

- Tests pass, pre-commit passes
- It actually works (you tried it)
- You applied both lenses (sustainability + skeptic)
- You'd be proud to debug this at 3am

If you're hesitating — that's a signal. Fix what's causing it.

---

## Resume Support

If spec has checkboxes, they track progress:
- `[ ]` = pending — do this task
- `[x]` = done — skip

After each task passes tests, mark `[x]` in spec file. If interrupted, re-run `/dev` and it picks up where you left off.

---

## Output

```markdown
## Done

**Task:** [description]

**Test Evidence:**
[PASTE npm test output]

**Files Changed:**
- src/...
- src/...

**Sustainability/Skeptic Notes:**
- [Any concerns, assumptions, or things to watch]

**Status:** DONE / BLOCKED [reason]
```

---

## Related

- `/slava:ux` — User experience review
- `/slava:lean` — Challenge scope, find the MVP
