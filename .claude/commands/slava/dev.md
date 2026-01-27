# /dev

Execute a development task with TDD discipline.

## Usage

```bash
/dev fix the login button
/dev features/p99.md
/dev refactor the auth module
```

---

## Workflow

1. **Understand** — Read spec, find `[ ]` tasks (skip `[x]` done)
2. **TDD** — For each task: test → implement → verify
3. **Mark** — Change `[ ]` to `[x]` after task passes
4. **Check** — Run `./scripts/pre-commit-checks.sh`
5. **Done** — Report results

---

## TDD Flow (Non-Negotiable)

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
- You'd be proud to show this code

If you're hesitating — fix what's causing it.

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

**Status:** DONE / BLOCKED [reason]
```

---

## Related

Run these separately if needed:
- `/slava:design-audit` — UI review
- `/slava:generate-uat` — Generate acceptance tests
- `/slava:ux` — User experience check
